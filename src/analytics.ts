// Пиксели Meta/TikTok + серверная воронка (beacon → /api/track).
// ID пикселей — из env при сборке: VITE_META_PIXEL_ID, VITE_TIKTOK_PIXEL_ID (пусто — не грузим).
import { getAttr } from './attribution'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    ttq?: { track: (e: string, p?: object) => void; page: () => void; load: (id: string) => void }
  }
}

const META_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined
const TT_ID = import.meta.env.VITE_TIKTOK_PIXEL_ID as string | undefined

let attemptRef: { id: number; token: string } | null = null
/** Попытка, к которой привязывать события (сервер проверит токен). */
export function setAttemptRef(ref: { id: number; token: string } | null) {
  attemptRef = ref && ref.id > 0 && ref.token ? ref : null
}

export function initAnalytics() {
  if (META_ID) initMeta(META_ID)
  if (TT_ID) initTikTok(TT_ID)
  beacon({ type: 'page_view', path: location.pathname + location.search })
}

// ── sid связывает анонимные шаги с будущей попыткой ──
export function getSid(): string {
  try {
    let sid = localStorage.getItem('bt_sid')
    if (!sid) {
      sid = crypto.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 3) | 8).toString(16)
      })
      localStorage.setItem('bt_sid', sid)
    }
    return sid
  } catch {
    return '00000000-0000-4000-8000-000000000000'
  }
}

const SERVER_EVENTS: Record<string, string> = {
  InitiateCheckout: 'checkout_view',
  CheckoutSubmit: 'checkout_submit',
  VideoPlay: 'video_play',
  RecoverView: 'recover_view'
}

function beacon(e: { type: string; step?: number; path?: string }) {
  try {
    const body = JSON.stringify({ ...e, sid: getSid(), attr: getAttr(), attempt: attemptRef })
    const blob = new Blob([body], { type: 'application/json' })
    if (!navigator.sendBeacon?.('/api/track', blob)) {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
    }
  } catch { /* noop */ }
}

// Стандартные события — нативные имена пикселей, остальное — trackCustom.
const META_STANDARD = new Set(['Lead', 'Purchase', 'InitiateCheckout'])

export function track(event: string, params?: Record<string, unknown>) {
  if (window.fbq) {
    META_STANDARD.has(event) ? window.fbq('track', event, params) : window.fbq('trackCustom', event, params)
  }
  if (window.ttq) {
    const ttMap: Record<string, string> = { Lead: 'SubmitForm', Purchase: 'CompletePayment', InitiateCheckout: 'InitiateCheckout' }
    window.ttq.track(ttMap[event] || event, params)
  }
  if (import.meta.env.DEV) console.log('[track]', event, params ?? '')

  const m = /^QuizStep_(\d+)$/.exec(event)
  if (m) beacon({ type: 'quiz_step', step: Number(m[1]) })
  else if (SERVER_EVENTS[event]) beacon({ type: SERVER_EVENTS[event] })
}

// ── Загрузчики пикселей ──
function initMeta(id: string) {
  const w = window as unknown as Record<string, unknown>
  if (w.fbq) return
  const n = function (...args: unknown[]) {
    const self = n as unknown as { callMethod?: { apply: (t: unknown, a: unknown[]) => void }; queue: unknown[] }
    self.callMethod ? self.callMethod.apply(n, args) : self.queue.push(args)
  } as unknown as { queue: unknown[]; push: unknown; loaded: boolean; version: string } & ((...a: unknown[]) => void)
  if (!w._fbq) w._fbq = n
  n.push = n
  n.loaded = true
  n.version = '2.0'
  n.queue = []
  w.fbq = n
  const s = document.createElement('script')
  s.async = true
  s.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(s)
  window.fbq!('init', id)
  window.fbq!('track', 'PageView')
}

function initTikTok(id: string) {
  const w = window as unknown as Record<string, unknown>
  const ttq: Record<string, unknown> & { methods: string[]; setAndDefer: (o: object, m: string) => void; _i: Record<string, unknown[]>; _t: Record<string, number>; _o: Record<string, object> } = {
    methods: ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'],
    setAndDefer(t: object, e: string) {
      ;(t as Record<string, unknown>)[e] = function (...args: unknown[]) {
        ;(t as { push: (a: unknown[]) => void }).push([e, ...args])
      }
    },
    _i: {}, _t: {}, _o: {}
  }
  const queue: unknown[] = []
  ;(ttq as unknown as { push: (a: unknown) => void }).push = (a: unknown) => queue.push(a)
  for (const m of ttq.methods) ttq.setAndDefer(ttq, m)
  ;(ttq as unknown as { load: (id: string) => void }).load = (pixelId: string) => {
    ttq._i[pixelId] = []
    const s = document.createElement('script')
    s.async = true
    s.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${pixelId}&lib=ttq`
    document.head.appendChild(s)
  }
  w.ttq = ttq
  window.ttq!.load(id)
  window.ttq!.page()
}
