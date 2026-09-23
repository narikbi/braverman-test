// Мелкие DOM-утилиты и переключение экранов.
export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export type Screen = 'intro' | 'quiz' | 'checkout' | 'waiting' | 'result' | 'recover'
const SCREENS: Screen[] = ['intro', 'quiz', 'checkout', 'waiting', 'result', 'recover']
let current: Screen = 'intro'

export function showScreen(name: Screen) {
  for (const s of SCREENS) $(s).classList.toggle('active', s === name)
  current = name
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

export const currentScreen = () => current

/** Маска +7 (7XX) XXX-XX-XX; 8XXX → 7XXX. Национальная часть в data-n. */
export function attachPhoneMask(phone: HTMLInputElement, onInput?: () => void) {
  phone.addEventListener('input', e => {
    onInput?.()
    let n = phone.value.replace(/^\+7/, '').replace(/\D/g, '')
    if (n.startsWith('8')) n = n.slice(1)
    if (n.length === 11 && n.startsWith('7')) n = n.slice(1)
    n = n.slice(0, 10)
    // backspace стёр разделитель, а не цифру — убираем последнюю цифру, иначе поле «залипает»
    if ((e as InputEvent).inputType === 'deleteContentBackward' && n === phone.dataset.n) n = n.slice(0, -1)
    phone.dataset.n = n
    let out = '+7'
    if (n.length) out += ' (' + n.slice(0, 3)
    if (n.length > 3) out += ') ' + n.slice(3, 6)
    if (n.length > 6) out += '-' + n.slice(6, 8)
    if (n.length > 8) out += '-' + n.slice(8, 10)
    phone.value = out
  })
}

export const phoneDigits = (phone: HTMLInputElement) => phone.value.replace(/\D/g, '')

export const fmtPrice = (n: number) => `${n.toLocaleString('ru-RU')} ₸`
