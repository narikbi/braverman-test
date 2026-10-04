// Оболочка: сайдбар (десктоп) / нижняя навигация (мобильный) + заголовок с переключателем периода.
// Тренер видит Шолу/Дашборд, Клиенты и Профиль; язык кабинета у тренера — по выбору (Рус/Қаз).
import { esc } from './format'
import { renderRange } from './components/range'
import { adminPost } from './api'
import { navigate } from './router'
import { toast } from './components/toast'
import { META, isAdmin } from './state'
import { L, langToggle, bindLangToggle } from './i18n'

const NAV_ADMIN = [
  { hash: '#/', ic: '📊', label: 'Дашборд', match: 'dashboard' },
  { hash: '#/attempts', ic: '👥', label: 'Прохождения', short: 'Клиенты', match: 'attempts' },
  { hash: '#/payments', ic: '💳', label: 'Оплаты', match: 'payments' },
  { hash: '#/trainers', ic: '🎓', label: 'Тренеры', match: 'trainers' },
  { hash: '#/health', ic: '🩺', label: 'Система', match: 'health' }
]
const navTrainer = () => [
  { hash: '#/', ic: '📊', label: L('Дашборд', 'Шолу'), match: 'dashboard' },
  { hash: '#/attempts', ic: '👥', label: L('Клиенты', 'Клиенттер'), match: 'attempts' },
  { hash: '#/me', ic: '🧠', label: L('Профиль', 'Профиль'), match: 'me' }
]

export function renderShell(active: string, title: string, sub = '', withRange = true): HTMLElement {
  const app = document.getElementById('app')!
  const nav = isAdmin() ? NAV_ADMIN : navTrainer()
  const isActive = (m: string) => active === m || (m === 'attempts' && active === 'attempt') || (m === 'trainers' && active === 'trainer')
  const brand = isAdmin() ? 'Braverman' : `Braverman · ${esc(META.trainer?.name || L('тренер', 'тренер'))}`
  app.innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="side-brand"><span class="dot">🧠</span> ${brand}</div>
        ${nav.map(n => `<a href="${n.hash}" class="${isActive(n.match) ? 'active' : ''}"><span class="ic">${n.ic}</span>${n.label}</a>`).join('')}
        <div class="spacer"></div>
        ${META.trainer ? `<a href="#" id="copy-my-link" title="${L('Скопировать ссылку для клиентов', 'Клиенттерге арналған сілтемені көшіру')}"><span class="ic">🔗</span>${L('Моя ссылка', 'Менің сілтемем')}</a>` : ''}
        <a href="/" target="_blank" rel="noopener"><span class="ic">↗</span>${L('Открыть сайт', 'Сайтты ашу')}</a>
        ${isAdmin() ? '' : `<div class="side-lang">${langToggle()}</div>`}
        <button class="logout" data-logout>${L('Выйти', 'Шығу')}</button>
      </aside>
      <main class="main">
        <div class="mtop">
          <div class="mtop-brand"><span class="dot">🧠</span><span>${brand}</span></div>
          <div class="mtop-actions">
            ${isAdmin() ? '' : langToggle()}
            <a href="/" target="_blank" rel="noopener">↗ ${L('Сайт', 'Сайт')}</a>
            <button data-logout>${L('Выйти', 'Шығу')}</button>
          </div>
        </div>
        <div class="head">
          <div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
          <div id="range-slot"></div>
        </div>
        <div id="page"></div>
      </main>
      <nav class="bottom-nav">
        ${nav.map(n => `<a href="${n.hash}" class="${isActive(n.match) ? 'active' : ''}"><span class="ic">${n.ic}</span><span class="lbl">${('short' in n && n.short) || n.label}</span></a>`).join('')}
      </nav>
    </div>`
  if (withRange) renderRange(app.querySelector('#range-slot')!)
  bindLangToggle(app)
  // «Моя ссылка» только копирует ссылку: если тренер откроет её сам, его визит засчитается как визит клиента
  app.querySelector('#copy-my-link')?.addEventListener('click', e => {
    e.preventDefault()
    const link = `${META.site || location.origin}/t/${META.trainer!.code}`
    navigator.clipboard.writeText(link).then(() => toast(L('Ссылка скопирована', 'Сілтеме көшірілді') + ': ' + link))
  })
  app.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', async () => {
    await adminPost('logout').catch(() => {})
    navigate('#/login')
  }))
  return app.querySelector('#page')!
}
