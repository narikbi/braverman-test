// Язык интерфейса: ru | kk. Тексты — в content/. Смена языка не трогает ответы (индексы совпадают).
import { CONTENT, LANGS, type Lang, type Content } from './content'
import { $ } from './dom'

const LANG_KEY = 'braverman_lang'

function initial(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY)
    if (v === 'kk' || v === 'ru') return v
  } catch { /* noop */ }
  return 'kk' // по умолчанию казахский; выбор пользователя запоминается в localStorage
}

export let lang: Lang = initial()
export const T = (): Content => CONTENT[lang]

const listeners = new Set<() => void>()
export function onLangChange(fn: () => void) { listeners.add(fn) }

export function setLang(code: Lang) {
  if (code === lang || !CONTENT[code]) return
  lang = code
  try { localStorage.setItem(LANG_KEY, code) } catch { /* noop */ }
  applyStatic()
  listeners.forEach(fn => fn())
}

/** Статичные подписи (разметка в index.html). Динамические экраны перерисовывают себя сами. */
export function applyStatic() {
  const u = T().ui
  document.documentElement.lang = lang
  document.title = u.htmlTitle

  $('t-badge').textContent = u.badge
  $('t-h1').innerHTML = u.h1
  $('t-lead').textContent = u.lead
  $('t-factMinutes').textContent = u.factMinutes
  $('t-factQuestions').textContent = u.factQuestions
  $('t-factNeuro').textContent = u.factNeuro
  $('t-nameLabel').textContent = u.nameLabel
  $<HTMLInputElement>('nameInput').placeholder = u.namePlaceholder
  $('nameError').textContent = u.nameError
  $('startBtn').textContent = u.startBtn
  $('t-startHint').textContent = u.startHint
  $('recoverLink').textContent = u.recoverLink

  $('backBtn').textContent = u.back
  $('yesBtn').textContent = u.yes
  $('noBtn').textContent = u.no
  $('t-keyHint').innerHTML = u.keyHint

  $('t-resultEyebrow').textContent = u.resultEyebrow
  $('t-chartTitle').textContent = u.chartTitle
  $('downloadBtn').textContent = u.download
  $('restartBtn').textContent = u.restart
  $('t-linkTitle').textContent = u.resultLink.title
  $('t-linkHint').textContent = u.resultLink.hint
  $('copyLinkBtn').textContent = u.resultLink.copy
  $('shareWaBtn').textContent = u.resultLink.shareWa

  renderLangSwitch()
}

function renderLangSwitch() {
  const box = $('langSwitch')
  box.innerHTML = ''
  LANGS.forEach(l => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'lang-btn' + (l.code === lang ? ' active' : '')
    b.textContent = l.label
    b.addEventListener('click', () => setLang(l.code))
    box.appendChild(b)
  })
}
