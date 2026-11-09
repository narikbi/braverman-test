// Язык страницы варианта Б. Выбор общий с основным сайтом (localStorage braverman_lang), по умолчанию казахский.
import { CONTENT, type Lang, type Content } from '../content'

const KEY = 'braverman_lang'

function initial(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'kk' || v === 'ru') return v
  } catch { /* noop */ }
  return 'kk'
}

export let lang: Lang = initial()
/** Общие тексты сайта (вопросы, описания типов, оплата, пересдача). */
export const T = (): Content => CONTENT[lang]

let onChange: () => void = () => {}
export function onLangChange(fn: () => void) { onChange = fn }

export function setLang(code: Lang) {
  if (code === lang) return
  lang = code
  try { localStorage.setItem(KEY, code) } catch { /* noop */ }
  onChange()
}
