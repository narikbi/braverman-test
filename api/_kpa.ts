// Интеграция с собственным Kaspi-шлюзом braverman-kaspi на Fly.io (код — MindQuiz/kaspi-gateway,
// форк tapter-dev/kaspi-pos-automation). Шлюз эмулирует приложение Kaspi Pay кассира; сессия
// кассира хранится на шлюзе, нам нужен только токен. У этого сайта свой шлюз и свой кассир.
// env: KASPI_GW_URL, KASPI_GW_TOKEN, KASPI_GW_WEBHOOK_SECRET, PRICE_KZT, INVOICE_DESCRIPTION, ACCESS_SECRET
import crypto from 'node:crypto'

export function kpaConfigured(): boolean {
  return !!(process.env.KASPI_GW_URL && process.env.KASPI_GW_TOKEN)
}

type KaspiResp<T> = { StatusCode?: number; Message?: string; Data?: T; error?: string }

async function gw<T>(method: string, path: string, body?: object): Promise<KaspiResp<T>> {
  const res = await fetch(process.env.KASPI_GW_URL!.replace(/\/$/, '') + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.KASPI_GW_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`kpa ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : {}) as KaspiResp<T>
}

/** Kaspi ждёт 77XXXXXXXXX (наш формат: +77XXXXXXXXX). */
function kpaPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return d.startsWith('8') ? '7' + d.slice(1) : d
}

// ── Подписанная ссылка на счёт ──
// Фронт поллит статус по id счёта. Телефон покупателя нужен при paid для выдачи токена курса,
// а полагаться на поля ответа Kaspi не хотим — кладём телефон в id и подписываем ACCESS_SECRET.
const REF_PREFIX = 'kpa.'

function refSig(opId: string, digits: string): string {
  return crypto.createHmac('sha256', process.env.ACCESS_SECRET || '').update(`${opId}|${digits}`).digest('base64url').slice(0, 22)
}

export function isKpaRef(id: string): boolean {
  return id.startsWith(REF_PREFIX)
}

function parseRef(ref: string): { opId: string; digits: string } {
  const [, opId, digits, sig] = ref.split('.')
  if (!opId || !digits || !sig) throw new Error('kpa_bad_ref')
  const a = Buffer.from(refSig(opId, digits))
  const b = Buffer.from(sig)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('kpa_bad_ref_sig')
  return { opId, digits }
}

/** Есть ли у номера Kaspi. При сбое шлюза/сессии не блокируем оплату — вернём true. */
export async function isKaspiClient(phone: string): Promise<boolean> {
  try {
    const r = await gw<{ ClientName?: string }>('GET', `/api/invoice/client-info?phoneNumber=${kpaPhone(phone)}`)
    if (r.StatusCode !== 0) {
      console.error('kpa_client_check_status', r.StatusCode, r.Message)
      return true
    }
    return !!r.Data?.ClientName
  } catch (e) {
    console.error('kpa_client_check_failed', e)
    return true
  }
}

/** phone — на кого счёт (плательщик); accessPhone — кому доступ (по умолчанию тот же). */
export async function createInvoice(input: { phone: string; accessPhone?: string; amount?: number }): Promise<{ id: string }> {
  const digits = kpaPhone(input.accessPhone || input.phone)
  const r = await gw<{ QrOperationId?: number; Id?: number }>('POST', '/api/invoice/create', {
    phoneNumber: kpaPhone(input.phone),
    amount: input.amount ?? Number(process.env.PRICE_KZT || 5000),
    comment: process.env.INVOICE_DESCRIPTION || 'Тест Бравермана'
  })
  const opId = r.Data?.QrOperationId ?? r.Data?.Id
  if (r.StatusCode !== 0 || !opId) throw new Error(`kpa create → ${r.StatusCode}: ${r.Message || r.error || 'no id'}`)
  return { id: `${REF_PREFIX}${opId}.${digits}.${refSig(String(opId), digits)}` }
}

export type KpaStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'unknown'
const STATUS: Record<string, KpaStatus> = {
  RemotePaymentCreated: 'pending',
  Processed: 'paid',
  RemotePaymentCanceled: 'cancelled',
  RemotePaymentRejected: 'cancelled',
  Expired: 'expired'
}

export async function getInvoiceState(ref: string): Promise<{ id: string; status: KpaStatus; phone: string; amount?: string }> {
  const { opId, digits } = parseRef(ref)
  const r = await gw<{ Status?: string; Amount?: number }>('GET', `/api/invoice/details?operationId=${opId}`)
  if (r.StatusCode !== 0 || !r.Data) console.error('kpa_details_status', opId, r.StatusCode, r.Message)
  return {
    id: opId,
    status: STATUS[r.Data?.Status || ''] || 'unknown',
    phone: '+' + digits,
    amount: r.Data?.Amount != null ? String(r.Data.Amount) : undefined
  }
}

/** Оплаты с этого номера — из журнала шлюза (paid.json). */
export async function hasPaidInvoice(phone: string): Promise<boolean> {
  const r = await gw<never>('GET', `/api/paid?phone=${kpaPhone(phone)}`) as unknown as { paid?: unknown[] }
  return Array.isArray(r.paid) && r.paid.length > 0
}

/** Подпись вебхука шлюза: X-Webhook-Signature: sha256=<hmac_sha256(raw_body, KASPI_GW_WEBHOOK_SECRET)>. */
export function verifyWebhookSignature(rawBody: string, header: string | undefined): boolean {
  const secret = process.env.KASPI_GW_WEBHOOK_SECRET
  if (!secret || !header) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(header)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
