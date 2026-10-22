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
    // без превью ссылок: иначе Telegram подставляет карточку первой ссылки (сайта или ролика YouTube из источника)
    await tgCall('sendMessage', { chat_id: process.env.TG_CHAT_ID, text: lines.filter(Boolean).join('\n'), parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
  } catch (e) {
    console.error('tg_notify_failed', e)
  }
}

export const tgEsc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

export const YT_ID = /^[A-Za-z0-9_-]{11}$/
const ytCache = new Map<string, string>()

/** «Название ролика» — Канал по ID видео YouTube (oEmbed, без ключа API); не нашли — null. */
export async function youtubeTitle(id: string): Promise<string | null> {
  if (!YT_ID.test(id)) return null
  const hit = ytCache.get(id)
  if (hit) return hit
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(3000) })
    if (!r.ok) return null
    const d = (await r.json()) as { title?: string; author_name?: string }
    if (!d.title) return null
    const t = `«${d.title}»${d.author_name ? ` — ${d.author_name}` : ''}`
    ytCache.set(id, t)
    return t
  } catch {
    return null
  }
}

/** ID видео YouTube в метках (braverman.kz/yt/<id> или utm_content подкаста) — если источник YouTube. */
export function youtubeIdOf(utm: Record<string, string> | null | undefined): string | null {
  if (!utm || !/youtu/i.test(utm.utm_source || '')) return null
  return [utm.utm_campaign, utm.utm_content].find(v => !!v && YT_ID.test(v)) ?? null
}

type SourceOf = { utm?: Record<string, string> | null; referrer?: string | null; trainer_code?: string | null }

/** Платная реклама (таргет): utm_medium = target / paid / cpc / ads … — показываем кампанию, группу, объявление. */
export const isAdMedium = (m: string | undefined) => !!m && /^(target|таргет|paid|cpc|cpm|cpa|ads?|paid[_-]?social|ppc)/i.test(m)

/** Старый адрес narikbi.github.io/braverman-test перенаправляет сюда и метит ссылки без меток utm_source=old_link. */
export const OLD_SITE = 'narikbi.github.io'

/** Источник для Telegram: заголовок и строки-подробности (всё уже экранировано для HTML). */
export type SourceParts = { head: string; rows: string[] }

/**
 * Раскладываем UTM по строкам: у рекламы — кампания / группа / объявление / плейсмент,
 * у подкаста — подкаст / выпуск, у канала — канал, у ролика YouTube — название ссылкой на видео.
 * ytTitle — «Название» — Канал (если уже узнали), иначе показываем ID видео.
 */
export function utmParts(u: Record<string, string>, ytTitle: string | null = null): SourceParts {
  const rows: string[] = []
  const add = (k: string, v: string | undefined) => { if (v) rows.push(`${k}: ${tgEsc(v)}`) }
  if (u.utm_source === 'old_link') {
    const from = !u.utm_medium || u.utm_medium === 'direct' ? 'мессенджер или закладка' : u.utm_medium
    return { head: tgEsc(`старая ссылка (${OLD_SITE})`), rows: [`откуда: ${tgEsc(from)}`] }
  }
  const head = tgEsc([u.utm_source, u.utm_medium].filter(Boolean).join(' / ') || '(без источника)')
  if (isAdMedium(u.utm_medium)) {
    add('кампания', u.utm_campaign); add('группа', u.utm_term); add('объявление', u.utm_content); add('плейсмент', u.utm_placement)
    if (!rows.length) rows.push('<i>названий кампании и объявления в ссылке нет</i>')
    return { head, rows }
  }
  const m = (u.utm_medium || '').toLowerCase()
  const yt = youtubeIdOf(u)
  if (u.utm_campaign !== yt) add(m === 'channel' ? 'канал' : m === 'podcast' ? 'подкаст' : 'кампания', u.utm_campaign)
  add('группа', u.utm_term)
  if (u.utm_content !== yt) add(m === 'podcast' ? 'выпуск' : 'контент', u.utm_content)
  add('плейсмент', u.utm_placement)
  if (yt) rows.push(`видео: <a href="https://youtu.be/${yt}">${tgEsc(ytTitle || yt)}</a>`) // yt проверен регуляркой YT_ID
  return { head, rows }
}

/** Откуда пришёл клиент: UTM → сайт по рефереру → «прямой заход»; по ссылке тренера — null (тренер в отдельной строке). */
export async function sourceParts(a: SourceOf): Promise<SourceParts | null> {
  const u = a.utm || {}
  if (u.utm_source || u.utm_medium || u.utm_campaign) {
    const yt = youtubeIdOf(u)
    return utmParts(u, yt ? await youtubeTitle(yt) : null)
  }
  if (a.referrer) {
    try {
      const host = new URL(a.referrer).host.replace(/^www\./, '')
      if (host === OLD_SITE) return { head: tgEsc(`старая ссылка (${OLD_SITE})`), rows: ['откуда: не видно'] }
      return { head: tgEsc(host), rows: ['ссылка без метки — какое видео или пост, не видно'] }
    } catch { /* битый реферер */ }
  }
  return a.trainer_code ? null : { head: 'прямой заход', rows: [] }
}

/** Источник по строкам: «📣 заголовок», под ним «   ▸ подробность». */
export const formatSource = (p: SourceParts | null, icon = '📣', indent = '   ▸ ') =>
  p ? [`${icon} ${p.head}`, ...p.rows.map(r => indent + r)].join('\n') : ''

/** Для уведомлений о счёте и оплате. */
export async function sourceLine(a: SourceOf): Promise<string> {
  return formatSource(await sourceParts(a))
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
