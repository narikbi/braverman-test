// Вебхук Kaspi-шлюза braverman-kaspi: события payment.success/failed/expired/lost.
// Подпись: X-Webhook-Signature: sha256=<hmac_sha256(raw_body, KASPI_GW_WEBHOOK_SECRET)>.
// Чужие/неизвестные счета игнорируем (ownership-guard). Потеря сессии кассира → тревога в Telegram.
import { verifyWebhookSignature } from './_kpa.js'
import { fulfillPaidInvoice } from './_fulfill.js'
import { readRawBody, type RawReq } from './_http.js'
import { tgNotify } from './_lib.js'
import { logEvent, findPaymentByInvoice, setPaymentStatus } from './_db.js'

type Req = RawReq & { method?: string; headers: Record<string, string | string[] | undefined> }
type Res = { status: (code: number) => { json: (o: object) => void } }

type Payload = {
  event?: string
  paymentId?: string | number
  type?: string
  status?: string
  statusDesc?: string
  amount?: number | string | null
  clientMobile?: string | null
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false })

  const raw = await readRawBody(req)
  const signature = req.headers['x-webhook-signature']
  if (!verifyWebhookSignature(raw, Array.isArray(signature) ? signature[0] : signature)) {
    console.error('kpa_webhook_bad_signature')
    return res.status(401).json({ ok: false })
  }

  let p: Payload
  try {
    p = raw ? JSON.parse(raw) : {}
  } catch {
    return res.status(400).json({ ok: false })
  }
  if (!p.paymentId) return res.status(200).json({ ok: true })
  const invoiceId = String(p.paymentId)

  // Сессия кассира вытеснена/истекла — владелец должен перелогиниться в шлюзе
  if (p.status === 'SessionExpired') {
    await logEvent({ type: 'webhook_kpa', props: { event: p.event, paymentId: invoiceId, status: p.status } })
    await tgNotify([
      '🚨 <b>Kaspi-шлюз braverman-kaspi потерял сессию кассира</b>', p.statusDesc || '',
      `🧾 Счёт #${invoiceId} (${p.clientMobile || '—'}) — проверь оплату вручную в Kaspi Pay.`,
      `Войди заново: ${process.env.KASPI_GW_URL || ''}`
    ])
    return res.status(200).json({ ok: true })
  }

  // Ownership-guard: только счета, которые выставил этот сайт
  const own = await findPaymentByInvoice(invoiceId)
  if (!own) {
    await logEvent({ type: 'webhook_kpa_ignored', props: { event: p.event, paymentId: invoiceId, status: p.status } })
    return res.status(200).json({ ok: true, ignored: true })
  }
  await logEvent({ type: 'webhook_kpa', attemptId: own.attempt_id, props: { event: p.event, paymentId: invoiceId, status: p.status, amount: p.amount } })

  if (p.event === 'payment.success' && p.type === 'invoice') {
    try {
      await fulfillPaidInvoice({
        invoiceId,
        source: 'webhook',
        phone: own.phone,
        amount: p.amount != null ? String(p.amount).replace(/[^\d.]/g, '') : undefined
      })
    } catch (e) {
      console.error('fulfill_failed', e)
    }
  } else if (p.event === 'payment.expired') {
    await setPaymentStatus(invoiceId, 'expired')
  } else if (p.event === 'payment.failed') {
    await setPaymentStatus(invoiceId, 'cancelled')
  }
  return res.status(200).json({ ok: true })
}
