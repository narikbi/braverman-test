// POST /api/checkout — номер телефона → Kaspi-счёт на номер (через шлюз braverman-kaspi).
// Результат открывается ТОЛЬКО после оплаты (вебхук шлюза / поллинг invoice-status).
import { dbConfigured, getAttempt, setAttemptInvoice, findPendingInvoice, createPayment, logEvent, ipHash } from './_db.js'
import { verifyAttemptToken, makeResultToken } from './_access.js'
import { kpaConfigured, createInvoice, isKaspiClient } from './_kpa.js'
import { fulfillPaidInvoice } from './_fulfill.js'
import { bodyOf, normalizePhone, tgNotify, adminAttemptLink, PRICE } from './_lib.js'

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
type Res = { status: (code: number) => { json: (o: object) => void }; setHeader: (k: string, v: string) => void }

/** kpa.<opId>.<digits>.<sig> → opId (короткий id счёта для базы и вебхука) */
const shortId = (ref: string) => ref.split('.')[1] || ref

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' })
  const b = bodyOf(req)

  // honeypot: боты заполняют скрытое поле — молча принимаем и выбрасываем
  if (b.hp) return res.status(200).json({ ok: true })

  const id = Number(b.id) || 0
  if (!verifyAttemptToken(id, String(b.token || ''))) return res.status(403).json({ ok: false, error: 'token' })
  if (!dbConfigured()) return res.status(503).json({ ok: false, error: 'db' })

  const attempt = await getAttempt(id)
  if (!attempt) return res.status(404).json({ ok: false, error: 'not_found' })
  if (attempt.status === 'paid') return res.status(200).json({ ok: true, paid: true, r: makeResultToken(id) })
  if (attempt.status === 'started') return res.status(400).json({ ok: false, error: 'not_finished' })

  const phone = normalizePhone(b.phone)
  if (!phone) return res.status(400).json({ ok: false, error: 'phone' })

  // Тестовый счёт на TEST_AMOUNT (1 ₸) — только по секретной ссылке ?test=<TEST_TOKEN>
  const testAmount = b.testToken && process.env.TEST_TOKEN && b.testToken === process.env.TEST_TOKEN ? Number(process.env.TEST_AMOUNT || 1) : undefined
  const amount = testAmount ?? PRICE()
  const base = { sid: attempt.sid, attemptId: id, trainerCode: attempt.trainer_code, utm: attempt.utm, ipHash: ipHash(req.headers) }

  // Повторное нажатие / обновление страницы — отдаём уже открытый счёт, не плодим новые
  const pending = await findPendingInvoice(id, phone)
  if (pending) return res.status(200).json({ ok: true, invoiceId: pending })

  // Демо без оплаты (SIMULATE_PAYMENT=1) — только для разработки
  if (process.env.SIMULATE_PAYMENT === '1') {
    const inv = `sim-${id}`
    await setAttemptInvoice(id, { phone, invoiceId: inv, testAmount })
    await createPayment({ invoiceId: inv, provider: 'sim', attemptId: id, phone, amount })
    const f = await fulfillPaidInvoice({ invoiceId: inv, source: 'poll', phone, amount, provider: 'sim' })
    return res.status(200).json({ ok: true, paid: true, r: f.r })
  }

  if (!kpaConfigured()) return res.status(503).json({ ok: false, error: 'kaspi' })

  // Счёт можно выставить только на номер с приложением Kaspi — проверяем заранее
  if (!(await isKaspiClient(phone))) {
    await logEvent({ type: 'invoice_failed', ...base, props: { reason: 'no_kaspi', phone } })
    return res.status(400).json({ ok: false, error: 'no_kaspi' })
  }

  try {
    const inv = await createInvoice({ phone, amount })
    const short = shortId(inv.id)
    await setAttemptInvoice(id, { phone, invoiceId: short, invoiceRef: inv.id, testAmount })
    await createPayment({ invoiceId: short, provider: 'kpa', attemptId: id, phone, amount })
    await logEvent({ type: 'invoice_created', ...base, props: { amount, invoiceId: short } })
    await tgNotify([
      '🧾 <b>Новый счёт — тест Бравермана</b>',
      `👤 ${attempt.name || '—'}`, `📱 <code>${phone}</code>`, `💵 ${amount} ₸${testAmount ? ' (тест)' : ''}`,
      attempt.trainer_code ? `🎓 ${attempt.trainer_code}` : '', adminAttemptLink(id)
    ])
    return res.status(200).json({ ok: true, invoiceId: inv.id })
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    console.error('kaspi_create_failed', err)
    await setAttemptInvoice(id, { phone, invoiceError: err.slice(0, 300), testAmount }).catch(() => {})
    await logEvent({ type: 'invoice_failed', ...base, props: { error: err.slice(0, 200), amount } })
    return res.status(502).json({ ok: false, error: 'invoice' })
  }
}
