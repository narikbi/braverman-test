// Сессии админки и кабинета тренера: подписанная cookie bt_admin (HMAC на ADMIN_SECRET), 30 дней.
// Payload сессии: {role: 'admin'|'trainer', tid?: id тренера, exp}.
// Админ: логин/пароль из env (ADMIN_LOGIN / ADMIN_PASSWORD), сравнение по sha256-дайджестам.
// Тренер: логин + scrypt-хеш пароля в таблице trainers.
import crypto from 'node:crypto'

const SESSION_DAYS = 30
const COOKIE = 'bt_admin'

export type Role = 'admin' | 'trainer'
export type Session = { role: Role; tid: number | null }

const secret = () => process.env.ADMIN_SECRET || ''
const hmac = (data: string) => crypto.createHmac('sha256', secret()).update(data, 'utf8').digest('base64url')

export function adminConfigured(): boolean {
  return !!(secret() && process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD)
}

export function checkCredentials(login: string, password: string): boolean {
  const d = (s: string) => crypto.createHash('sha256').update(String(s), 'utf8').digest()
  const a = crypto.timingSafeEqual(d(login), d(process.env.ADMIN_LOGIN || ''))
  const b = crypto.timingSafeEqual(d(password), d(process.env.ADMIN_PASSWORD || ''))
  return a && b
}

// ── Пароли тренеров: scrypt, формат "salt:hash" (hex) ──
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const a = crypto.scryptSync(String(password), salt, 32)
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function makeSession(role: Role, tid: number | null = null): string {
  const payload = Buffer.from(JSON.stringify({ role, tid, exp: Date.now() + SESSION_DAYS * 86400000 }), 'utf8').toString('base64url')
  return `${payload}.${hmac(payload)}`
}

export function verifySession(token: string | undefined): Session | null {
  if (!token || !secret()) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const a = Buffer.from(hmac(payload))
  const b = Buffer.from(sig)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const { role, tid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof exp !== 'number' || exp <= Date.now()) return null
    if (role === 'admin') return { role, tid: null }
    if (role === 'trainer' && Number.isInteger(tid) && tid > 0) return { role, tid }
    return null
  } catch {
    return null
  }
}

export function parseCookies(header: string | string[] | undefined): Record<string, string> {
  const h = Array.isArray(header) ? header.join(';') : header || ''
  const out: Record<string, string> = {}
  for (const part of h.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function sessionFromReq(headers: Record<string, string | string[] | undefined>): Session | null {
  return verifySession(parseCookies(headers.cookie)[COOKIE])
}

/** Secure только на Vercel: Safari не принимает Secure-cookie на http://localhost. */
export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${process.env.VERCEL ? '; Secure' : ''}`
}

export function clearCookie(): string {
  return `${COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Lax; Max-Age=0${process.env.VERCEL ? '; Secure' : ''}`
}
