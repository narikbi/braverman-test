import { adminGet } from '../api'
import { esc, fmtDateFull } from '../format'

type Health = {
  checks: {
    db: { configured: boolean; ok: boolean; ms: number }
    kaspiGw: { configured: boolean; ok: boolean; ms: number | null; hasSession: boolean; cashier: string | null; sessionSavedAt: string | null; url: string | null }
    wa: { configured: boolean; ok: boolean; ms: number | null; connected: boolean; url: string | null; numbers: { number: string; connected: boolean; hasQr: boolean; sentToday: number; limit: number }[] }
    telegram: { configured: boolean; ok: boolean }
  }
  last: Record<string, string | null>
  env: { siteUrl: string; price: number; simulate: boolean; testToken: boolean }
}

const dot = (state: 'ok' | 'warn' | 'bad' | 'off') => `<span class="dot-st dot-${state}"></span>`
const kv = (rows: [string, string][]) => `<div class="kv">${rows.map(([k, v]) => `<span class="k">${esc(k)}</span><span class="v">${v}</span>`).join('')}</div>`

export async function renderHealth(page: HTMLElement) {
  page.innerHTML = `<div class="health">${Array.from({ length: 5 }, () => '<div class="card hcard"><div class="skel" style="width:50%"></div><div class="skel"></div><div class="skel" style="width:70%"></div></div>').join('')}</div>`
  const h = await adminGet<Health>('health')
  const c = h.checks
  const gwState = !c.kaspiGw.configured ? 'off' : !c.kaspiGw.ok ? 'bad' : c.kaspiGw.hasSession ? 'ok' : 'warn'
  const waState = !c.wa.configured ? 'off' : !c.wa.ok ? 'bad' : c.wa.connected ? 'ok' : 'warn'
  page.innerHTML = `
    <div class="health">
      <div class="card hcard"><div class="title">Kaspi-шлюз ${dot(gwState)}</div>${kv([
        ['Шлюз', c.kaspiGw.configured ? 'braverman-kaspi (свой)' : 'не настроен'],
        ['Сессия кассира', c.kaspiGw.hasSession ? `есть · ${esc(c.kaspiGw.cashier || '')}` : '<span style="color:var(--a-red)">нет — войди заново</span>'],
        ['Вход выполнен', fmtDateFull(c.kaspiGw.sessionSavedAt)],
        ['Ответ', c.kaspiGw.ms != null ? `${c.kaspiGw.ms} мс` : '—'],
        ['Последний вебхук', fmtDateFull(h.last.webhook_kpa)],
        ['Потеря сессии', h.last.sessionExpired ? `<span style="color:var(--a-amber)">${fmtDateFull(h.last.sessionExpired)}</span>` : 'не было']
      ])}${c.kaspiGw.url ? `<a class="btn btn-sm" href="${esc(c.kaspiGw.url)}" target="_blank" rel="noopener">Открыть шлюз</a>` : ''}</div>

      <div class="card hcard"><div class="title">WhatsApp ${dot(waState)}</div>${kv([
        ['Подключение', !c.wa.configured ? 'не настроен — ссылки и коды не отправляются' : c.wa.connected ? 'есть номер с лимитом' : '<span style="color:var(--a-red)">нет доступного номера</span>'],
        ['Ответ', c.wa.ms != null ? `${c.wa.ms} мс` : '—'],
        ...c.wa.numbers.map(n => [`+${n.number}`, `${n.connected ? '<span style="color:var(--a-green)">подключён</span>' : n.hasQr ? '<span style="color:var(--a-amber)">ждёт QR</span>' : '<span style="color:var(--a-red)">нет связи</span>'} · ${n.sentToday}/${n.limit}`] as [string, string])
      ])}${c.wa.url ? `<a class="btn btn-sm" href="${esc(c.wa.url)}/health" target="_blank" rel="noopener">Статус шлюза</a>` : ''}</div>

      <div class="card hcard"><div class="title">База данных ${dot(!c.db.configured ? 'off' : c.db.ok ? 'ok' : 'bad')}</div>${kv([
        ['Neon', c.db.configured ? (c.db.ok ? 'работает' : '<span style="color:var(--a-red)">нет ответа</span>') : 'не подключена'],
        ['Ответ', `${c.db.ms} мс`],
        ['Последний визит', fmtDateFull(h.last.page_view)],
        ['Последний старт теста', fmtDateFull(h.last.quiz_start)],
        ['Последний счёт', fmtDateFull(h.last.invoice_created)],
        ['Последняя оплата', fmtDateFull(h.last.paid)]
      ])}</div>

      <div class="card hcard"><div class="title">Telegram ${dot(!c.telegram.configured ? 'off' : c.telegram.ok ? 'ok' : 'bad')}</div>${kv([
        ['Бот', !c.telegram.configured ? 'не настроен' : c.telegram.ok ? 'отвечает' : 'не отвечает'],
        ['Уведомления', 'новые счета, оплаты, запросы ссылок, потеря сессии Kaspi']
      ])}</div>

      <div class="card hcard"><div class="title">Настройки</div>${kv([
        ['Сайт', `<a href="${esc(h.env.siteUrl)}" target="_blank" rel="noopener">${esc(h.env.siteUrl)}</a>`],
        ['Цена теста', `${h.env.price.toLocaleString('ru-RU')} ₸`],
        ['Тестовый счёт (1 ₸)', h.env.testToken ? 'включён — ?test=&lt;TEST_TOKEN&gt;' : 'выключен'],
        ['Демо без оплаты', h.env.simulate ? '<span style="color:var(--a-red)">ВКЛЮЧЕНО — результат выдаётся без оплаты!</span>' : 'выключено']
      ])}<button class="btn btn-sm" id="refresh">Обновить</button></div>
    </div>`
  page.querySelector('#refresh')!.addEventListener('click', () => renderHealth(page))
}
