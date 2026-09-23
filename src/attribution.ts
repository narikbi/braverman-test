// Атрибуция визита: UTM и код тренера (?t=) — last-touch, реферер и лендинг — first-touch.
// Живёт в localStorage (bt_attr), уходит на сервер с каждым событием и с попыткой.
const KEY = 'bt_attr'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

export type Attr = { utm: Record<string, string>; t: string | null; referrer: string | null; landing: string | null }

function load(): Attr {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '')
    return { utm: a.utm || {}, t: a.t || null, referrer: a.referrer || null, landing: a.landing || null }
  } catch {
    return { utm: {}, t: null, referrer: null, landing: null }
  }
}

let attr: Attr = load()

export function captureAttribution(): Attr {
  try {
    const qs = new URLSearchParams(location.search)
    const utm: Record<string, string> = {}
    for (const k of UTM_KEYS) {
      const v = qs.get(k)
      if (v) utm[k] = v.slice(0, 100)
    }
    if (Object.keys(utm).length) attr.utm = utm
    const t = (qs.get('t') || '').trim().toLowerCase()
    if (/^[a-z0-9_-]{2,32}$/.test(t)) attr.t = t
    if (!attr.referrer && document.referrer) {
      try { if (new URL(document.referrer).host !== location.host) attr.referrer = document.referrer.slice(0, 300) } catch { /* noop */ }
    }
    if (!attr.landing) attr.landing = (location.pathname + location.search).slice(0, 300)
    localStorage.setItem(KEY, JSON.stringify(attr))
  } catch { /* noop */ }
  return attr
}

export const getAttr = (): Attr => attr
