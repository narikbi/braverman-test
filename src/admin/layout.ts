// Оболочка: сайдбар (десктоп) / нижняя навигация (мобильный) + заголовок с переключателем периода.
// Тренер видит только Дашборд и Клиенты.
import { esc } from './format'
import { renderRange } from './components/range'
import { adminPost } from './api'
import { navigate } from './router'
import { META, isAdmin } from './state'

const NAV_ADMIN = [
  { hash: '#/', ic: '📊', label: 'Дашборд', match: 'dashboard' },
  { hash: '#/attempts', ic: '👥', label: 'Прохождения', match: 'attempts' },
  { hash: '#/payments', ic: '💳', label: 'Оплаты', match: 'payments' },
  { hash: '#/trainers', ic: '🎓', label: 'Тренеры', match: 'trainers' },
  { hash: '#/health', ic: '🩺', label: 'Система', match: 'health' }
]
const NAV_TRAINER = [
  { hash: '#/', ic: '📊', label: 'Дашборд', match: 'dashboard' },
  { hash: '#/attempts', ic: '👥', label: 'Клиенты', match: 'attempts' }
]

export function renderShell(active: string, title: string, sub = '', withRange = true): HTMLElement {
  const app = document.getElementById('app')!
  const nav = isAdmin() ? NAV_ADMIN : NAV_TRAINER
  const isActive = (m: string) => active === m || (m === 'attempts' && active === 'attempt') || (m === 'trainers' && active === 'trainer')
  const brand = isAdmin() ? 'Braverman' : `Braverman · ${esc(META.trainer?.name || 'тренер')}`
  app.innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="side-brand"><span class="dot">🧠</span> ${brand}</div>
        ${nav.map(n => `<a href="${n.hash}" class="${isActive(n.match) ? 'active' : ''}"><span class="ic">${n.ic}</span>${n.label}</a>`).join('')}
        <div class="spacer"></div>
        ${META.trainer ? `<a href="/t/${esc(META.trainer.code)}" target="_blank" rel="noopener"><span class="ic">🔗</span>Моя ссылка</a>` : ''}
        <a href="/" target="_blank" rel="noopener"><span class="ic">↗</span>Открыть сайт</a>
        <button class="logout" id="logout">Выйти</button>
      </aside>
      <main class="main">
        <div class="head">
          <div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
          <div id="range-slot"></div>
        </div>
        <div id="page"></div>
      </main>
      <nav class="bottom-nav">
        ${nav.map(n => `<a href="${n.hash}" class="${isActive(n.match) ? 'active' : ''}"><span class="ic">${n.ic}</span>${n.label}</a>`).join('')}
      </nav>
    </div>`
  if (withRange) renderRange(app.querySelector('#range-slot')!)
  app.querySelector('#logout')!.addEventListener('click', async () => {
    await adminPost('logout').catch(() => {})
    navigate('#/login')
  })
  return app.querySelector('#page')!
}
