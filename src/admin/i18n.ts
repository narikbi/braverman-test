// Язык кабинета: русский / казахский. Тренер выбирает сам (по умолчанию казахский),
// у владельца (роль admin) интерфейс всегда русский — его страницы не переведены.
// Казахские тексты пишутся сразу по-казахски, не переводом: глагол в конце, без канцелярских калек.
export type ALang = 'ru' | 'kk'
const KEY = 'bt_admin_lang'
let forced: ALang | null = null

export function adminLang(): ALang {
  if (forced) return forced
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'ru' || v === 'kk') return v
  } catch { /* noop */ }
  return 'kk'
}

/** Текст на языке кабинета: L('Клиенты', 'Клиенттер') */
export const L = (ru: string, kk: string): string => (adminLang() === 'kk' ? kk : ru)

/** Для роли admin язык фиксирован (русский); null — по выбору пользователя. */
export function forceAdminLang(l: ALang | null) { forced = l }

export function setAdminLang(l: ALang) {
  try { localStorage.setItem(KEY, l) } catch { /* noop */ }
  window.dispatchEvent(new HashChangeEvent('hashchange')) // перерисовать текущий экран
}

/** Переключатель «Рус / Қаз» (показываем на входе и в кабинете тренера). */
export function langToggle(): string {
  const cur = adminLang()
  return `<div class="lang-tg">${(['ru', 'kk'] as const).map(l => `<button type="button" data-alang="${l}" class="${l === cur ? 'active' : ''}">${l === 'ru' ? 'Рус' : 'Қаз'}</button>`).join('')}</div>`
}
export function bindLangToggle(root: ParentNode) {
  root.querySelectorAll<HTMLButtonElement>('[data-alang]').forEach(b => b.addEventListener('click', () => setAdminLang(b.dataset.alang as ALang)))
}

// ── словари, которые используются в нескольких местах ──
const STATUS_KK: Record<string, string> = { started: 'Бастады', finished: 'Аяқтады', invoice: 'Шот жіберілді', paid: 'Төледі' }
export const statusKk = (key: string): string | undefined => STATUS_KK[key]

const FUNNEL_KK: Record<string, string> = {
  page_view: 'Сайтты ашты', quiz_start: 'Тестті бастады', quiz_finish: 'Тестті аяқтады', checkout_view: 'Төлем бетіне өтті',
  invoice_created: 'Шот жіберілді', paid: 'Төледі', result_view: 'Нәтижесін ашты'
}
export const funnelLabel = (key: string, ru: string): string => L(ru, FUNNEL_KK[key] ?? ru)

const EVENT_KK: Record<string, string> = {
  page_view: 'Сайтты ашты', quiz_start: 'Тестті бастады', quiz_finish: 'Тестті аяқтады',
  checkout_view: 'Төлем бетіне өтті', checkout_submit: '«Төлеу» батырмасын басты', invoice_created: 'Шот жіберілді', invoice_failed: 'Шот жіберілмеді',
  paid: 'Төледі', result_view: 'Нәтижесін ашты', video_play: 'Видеоны қосты',
  recover_view: 'Нәтижені қайта ашпақ болды', recover_attempt: 'Нәтижені қайта ашуды сұрады', access_recovered: 'Нәтижесін қайта ашты',
  recover_requested: 'Сілтемені қайта сұрады', access_granted: 'Нәтиже қолмен берілді', link_resent: 'Сілтеме қайта жіберілді',
  retake_granted: 'Тестті тегін қайта өтті', prepaid_open: 'Тест сілтемесін ашты', prepaid_done: 'Тестті аяқтады',
  prepaid_created: 'Сайттан тыс төледі', prepaid_link_sent: 'Тест сілтемесі жіберілді'
}
/** Подпись события в истории; quiz_step — «50-сұраққа жетті» / «Вопрос 50». */
export function eventLabel(type: string, ru: string, step?: number | null): string {
  if (type === 'quiz_step' && step) return L(`Вопрос ${step}`, `${step}-сұраққа жетті`)
  return L(ru, EVENT_KK[type] ?? ru)
}
