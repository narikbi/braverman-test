// POST /api/recover — восстановление ссылки на результат по номеру телефона.
// С WhatsApp: код в WhatsApp → {need_code}; код верный → {r}. Без WhatsApp: запрос владельцу в Telegram,
// ссылку он пересылает вручную (результат по одному лишь номеру не раскрываем). RECOVER_DIRECT=1 — отдать сразу.
import { dbConfigured, findPaidAttemptsByPhone, logEvent, ipHash, countRecent } from './_db.js'
import { makeOtp, verifyOtp, makeResultToken } from './_access.js'
import { sendWhatsApp, whatsappConfigured } from './_whatsapp.js'
import { otpMessage } from './_wa-text.js'
import { bodyOf, normalizePhone, tgNotify, adminAttemptLink } from './_lib.js'
import { resultLink } from './_fulfill.js'

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
type Res = { status: (code: number) => { json: (o: object) => void }; setHeader: (k: string, v: string) => void }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  const b = bodyOf(req)
  if (b.hp) return res.status(200).json({ ok: true, need_code: true })
  if (!dbConfigured()) return res.status(503).json({ ok: false, error: 'db' })

  const phone = normalizePhone(b.phone)
  if (!phone) return res.status(400).json({ ok: false, error: 'phone' })
  const ip = ipHash(req.headers)
  const sid = typeof b.sid === 'string' && /^[0-9a-f-]{36}$/.test(b.sid) ? b.sid : null

  // Лимиты: 10 попыток с IP и 5 на номер за 15 минут
  const [byIp, byPhone] = await Promise.all([countRecent('recover_attempt', 'ip_hash', ip, 15), countRecent('recover_attempt', 'props', phone, 15, 'phone')])
  if (byIp >= 10 || byPhone >= 5) return res.status(429).json({ ok: false, error: 'too_many' })
  await logEvent({ type: 'recover_attempt', sid, ipHash: ip, props: { phone, withCode: !!b.code } })

  const paid = await findPaidAttemptsByPhone(phone)
  if (!paid.length) {
    await sleep(300) // не выдаём по времени ответа, есть ли номер в базе
    return res.status(404).json({ ok: false, error: 'not_found' })
  }
  const latest = paid[0]

  if (b.code) {
    if (!verifyOtp(phone, String(b.code))) return res.status(400).json({ ok: false, error: 'bad_code' })
    await logEvent({ type: 'access_recovered', attemptId: latest.id, sid, ipHash: ip, props: { phone } })
    return res.status(200).json({ ok: true, r: makeResultToken(latest.id) })
  }

  if (process.env.RECOVER_DIRECT === '1') {
    await logEvent({ type: 'access_recovered', attemptId: latest.id, sid, ipHash: ip, props: { phone, direct: true } })
    return res.status(200).json({ ok: true, r: makeResultToken(latest.id) })
  }

  if (whatsappConfigured()) {
    const w = await sendWhatsApp(phone, otpMessage(makeOtp(phone), latest.lang))
    if (w.sent) return res.status(200).json({ ok: true, need_code: true })
  }

  // WhatsApp недоступен — просим владельца переслать ссылку вручную
  await logEvent({ type: 'recover_requested', attemptId: latest.id, sid, ipHash: ip, props: { phone } })
  await tgNotify([
    '🔑 <b>Запрос ссылки на результат</b>', `📱 <code>${phone}</code> · ${latest.name || '—'}`,
    `🔗 ${resultLink(latest.id)}`, adminAttemptLink(latest.id), 'Перешли ссылку клиенту в WhatsApp.'
  ])
  return res.status(200).json({ ok: true, manual: true })
}
