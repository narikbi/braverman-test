// Подписанные токены без сессий и паролей (HMAC-SHA256 на ACCESS_SECRET).
// Токен: base64url("<вид>|<id попытки>|<ts выдачи>") + "." + HMAC(payload).
//  a — токен попытки: выдаётся при старте теста, подтверждает право менять/оплачивать попытку.
//  r — токен результата: выдаётся только после оплаты; ссылка /?r=<токен> бессрочная.
// Виды разделены в payload, поэтому токен попытки нельзя подсунуть вместо токена результата.
import crypto from 'node:crypto'

const secret = () => process.env.ACCESS_SECRET || ''

function hmac(data: string): string {
  return crypto.createHmac('sha256', secret()).update(data, 'utf8').digest('base64url')
}

export function accessConfigured(): boolean {
  return !!secret()
}

type Kind = 'a' | 'r'

function sign(kind: Kind, id: number): string {
  const payload = Buffer.from(`${kind}|${id}|${Date.now()}`, 'utf8').toString('base64url')
  return `${payload}.${hmac(payload)}`
}

/** id попытки из валидного токена нужного вида, иначе null. */
function verify(kind: Kind, token: string | undefined | null): number | null {
  if (!token || !secret()) return null
  const [payload, sig] = String(token).split('.')
  if (!payload || !sig) return null
  const a = Buffer.from(hmac(payload))
  const b = Buffer.from(sig)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const [k, id] = Buffer.from(payload, 'base64url').toString('utf8').split('|')
    return k === kind && /^\d{1,12}$/.test(id) ? Number(id) : null
  } catch {
    return null
  }
}

export const makeAttemptToken = (attemptId: number) => sign('a', attemptId)
export const verifyAttemptToken = (attemptId: number, token: string | undefined | null) =>
  attemptId > 0 && verify('a', token) === attemptId

export const makeResultToken = (attemptId: number) => sign('r', attemptId)
/** id оплаченной попытки (проверку оплаты делает вызывающий) или null. */
export const verifyResultToken = (token: string | undefined | null) => verify('r', token)

// ── Одноразовый код (WhatsApp) для восстановления результата по номеру ──
// Stateless: код = 6 цифр из HMAC(phone|слот времени). Слот 5 минут,
// при проверке принимаем текущий и предыдущий слот (код живёт 5–10 минут).
function otpForSlot(digits: string, slot: number): string {
  const h = crypto.createHmac('sha256', secret()).update(`otp|${digits}|${slot}`).digest()
  return String(h.readUInt32BE(0) % 1000000).padStart(6, '0')
}

export function makeOtp(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return otpForSlot(digits, Math.floor(Date.now() / 300000))
}

export function verifyOtp(phone: string, code: string): boolean {
  const digits = phone.replace(/\D/g, '')
  const slot = Math.floor(Date.now() / 300000)
  const clean = String(code).replace(/\D/g, '')
  return clean.length === 6 && (clean === otpForSlot(digits, slot) || clean === otpForSlot(digits, slot - 1))
}
