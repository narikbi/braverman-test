// Чаты WhatsApp — виджет из WA Hub. Скрипт и стили грузятся с хаба, сессию выдаёт наш бэкенд (action=wa-session).
import { adminGet } from '../api'

type WaSession = { hub: string; token: string }
declare global { interface Window { WaHub?: { mount: (el: HTMLElement, o: object) => { open: (phone: string) => void; destroy: () => void } } } }

let widget: { destroy: () => void } | null = null

function loadWidget(hub: string): Promise<void> {
  if (window.WaHub) return Promise.resolve()
  if (!document.querySelector('link[data-wahub]')) {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = `${hub}/widget.css`; css.dataset.wahub = '1'
    document.head.appendChild(css)
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = `${hub}/widget.js`; s.onload = () => resolve(); s.onerror = () => reject(new Error('widget_load_failed'))
    document.head.appendChild(s)
  })
}

export async function renderChats(page: HTMLElement, phone?: string) {
  widget?.destroy(); widget = null
  page.innerHTML = `<div class="card" style="padding:0;height:calc(100vh - 150px);min-height:480px"><div id="wa-chats" style="height:100%"></div></div>`
  let first: WaSession
  try { first = await adminGet<WaSession>('wa-session') } catch {
    page.innerHTML = `<div class="card"><b>Чаты недоступны</b><div class="sub">WA Hub не настроен (WA_API_URL / WA_TOKEN) или не отвечает.</div></div>`
    return
  }
  await loadWidget(first.hub)
  let cached: string | null = first.token
  widget = window.WaHub!.mount(page.querySelector('#wa-chats')!, {
    hub: first.hub,
    openPhone: phone,
    session: async () => { if (cached) { const t = cached; cached = null; return t } return (await adminGet<WaSession>('wa-session')).token }
  })
}
