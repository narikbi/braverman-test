// Общие утилиты serverless-функций: Telegram-уведомления, ссылки, зеркало в Google-таблицу.

export const SITE = () => (process.env.SITE_URL || 'https://braverman.kz').replace(/\/$/, '')
export const PRICE = () => Number(process.env.PRICE_KZT || 5000)

// ── Telegram ──
// env: TG_BOT_TOKEN, TG_CHAT_ID (id чата владельца/группы)
export function tgConfigured(): boolean {
  return !!(process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID)
}

export async function tgCall(method: string, payload: object): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000)
  })
  if (!res.ok) throw new Error(`tg_${method}_failed: ` + (await res.text()))
  return res.json()
}

/** Сообщение владельцу; ошибки глотаем — уведомление не должно ломать оплату. */
export async function tgNotify(lines: (string | false | null | undefined)[]): Promise<void> {
  if (!tgConfigured()) return
  try {
    await tgCall('sendMessage', { chat_id: process.env.TG_CHAT_ID, text: lines.filter(Boolean).join('\n'), parse_mode: 'HTML' })
  } catch (e) {
    console.error('tg_notify_failed', e)
  }
}

export const adminAttemptLink = (id: number | null | undefined) => (id ? `🛠 ${SITE()}/admin#/attempts/${id}` : '')

// ── Google-таблица: необязательное зеркало через Apps Script (SHEET_ENDPOINT). Основной источник — админка. ──
export async function sheetMirror(row: object): Promise<void> {
  const url = process.env.SHEET_ENDPOINT
  if (!url) return
  try {
    await fetch(url, { method: 'POST', body: JSON.stringify(row), signal: AbortSignal.timeout(3000) })
  } catch (e) {
    console.error('sheet_mirror_failed', e instanceof Error ? e.message : e)
  }
}

/** Из «+7 (777) 123-45-67» / «87771234567» → «+77771234567», иначе null. */
export function normalizePhone(input: unknown): string | null {
  let d = String(input ?? '').replace(/\D/g, '')
  if (d.length === 10 && d.startsWith('7')) d = '7' + d
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1)
  return /^77\d{9}$/.test(d) ? '+' + d : null
}

/** Читает JSON-тело (Vercel парсит сам, dev-шим — тоже; строку разбираем на всякий случай). */
export function bodyOf(req: { body?: unknown }): Record<string, unknown> {
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  return (req.body as Record<string, unknown>) || {}
}

/** Параметры запроса: Vercel даёт req.query, dev-шим — только url. */
export function queryOf(req: { url?: string; query?: Record<string, string | string[] | undefined> }): URLSearchParams {
  const p = new URL(req.url || '', 'http://x').searchParams
  if (req.query) for (const [k, v] of Object.entries(req.query)) if (v != null && !p.has(k)) p.set(k, Array.isArray(v) ? v[0] : v)
  return p
}
