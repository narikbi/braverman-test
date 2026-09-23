// GET /api/invoice-status?id=kpa.<opId>.<digits>.<sig> — статус счёта для поллинга со страницы ожидания.
// Принимаем только подписанные ссылки на счёт (HMAC проверяется в parseRef) — перебрать чужие счета нельзя.
// При paid страхуем вебхук: fulfillPaidInvoice идемпотентен.
import { kpaConfigured, isKpaRef, getInvoiceState } from './_kpa.js'
import { setPaymentStatus } from './_db.js'
import { fulfillPaidInvoice } from './_fulfill.js'
import { queryOf } from './_lib.js'

type Req = { method?: string; url?: string; query?: Record<string, string | string[] | undefined> }
type Res = { status: (code: number) => { json: (o: object) => void }; setHeader: (k: string, v: string) => void }

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ ok: false })
  if (!kpaConfigured()) return res.status(200).json({ ok: true, status: 'unknown' })

  const id = queryOf(req).get('id') || ''
  if (!id || !isKpaRef(id)) return res.status(400).json({ ok: false, error: 'id' })

  try {
    const inv = await getInvoiceState(id) // бросает kpa_bad_ref* при подделке
    if (inv.status === 'cancelled' || inv.status === 'expired') await setPaymentStatus(inv.id, inv.status)
    if (inv.status !== 'paid') return res.status(200).json({ ok: true, status: inv.status })

    const f = await fulfillPaidInvoice({ invoiceId: inv.id, source: 'poll', phone: inv.phone, amount: inv.amount })
    if (!f.r) return res.status(200).json({ ok: true, status: 'unknown' }) // счёт не наш
    return res.status(200).json({ ok: true, status: 'paid', r: f.r })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.startsWith('kpa_bad_ref')) return res.status(400).json({ ok: false, error: 'id' })
    console.error('invoice_status_failed', msg)
    return res.status(200).json({ ok: true, status: 'unknown' })
  }
}
