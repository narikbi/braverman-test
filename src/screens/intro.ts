// Экран 1: имя + язык → старт теста.
import { $, showScreen, currentScreen } from '../dom'
import { setNameExample } from '../i18n'
import { EXAMPLE_NAMES } from '../content'
import { state, resetForNewTest } from '../state'
import { startQuiz } from './quiz'
import { renderRecover } from './recover'

export function initIntro() {
  const start = () => {
    const name = $<HTMLInputElement>('nameInput').value.trim()
    if (!name) {
      $('nameError').hidden = false
      $('nameInput').focus()
      return
    }
    $('nameError').hidden = true
    resetForNewTest(name)
    startQuiz()
  }
  $('startBtn').addEventListener('click', start)
  $('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') start() })
  $('recoverLink').addEventListener('click', e => { e.preventDefault(); renderRecover() })

  animateNameExamples()
}

// Примеры имён в подсказке: имя держится, стирается по буквам и печатается следующее.
// Работает, только пока открыт первый экран и поле пустое; при reduced motion — простая смена.
const HOLD_MS = 2000, ERASE_MS = 35, TYPE_MS = 70, GAP_MS = 300
function animateNameExamples() {
  const input = $<HTMLInputElement>('nameInput')
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  let idx = 0
  let shown = EXAMPLE_NAMES[0]
  let phase: 'hold' | 'erase' | 'type' = 'hold'
  const active = () => currentScreen() === 'intro' && !input.value && !document.hidden
  const next = (ms: number) => { window.setTimeout(step, ms) }

  function step() {
    if (!active()) return next(500)
    const target = EXAMPLE_NAMES[idx]
    if (phase === 'hold') {
      if (reduceMotion) {
        idx = (idx + 1) % EXAMPLE_NAMES.length
        shown = EXAMPLE_NAMES[idx]
        setNameExample(shown)
        return next(2500)
      }
      phase = 'erase'
      return next(ERASE_MS)
    }
    if (phase === 'erase') {
      shown = shown.slice(0, -1)
      setNameExample(shown)
      if (shown) return next(ERASE_MS)
      idx = (idx + 1) % EXAMPLE_NAMES.length
      phase = 'type'
      return next(GAP_MS)
    }
    shown = target.slice(0, shown.length + 1)
    setNameExample(shown)
    if (shown === target) { phase = 'hold'; return next(HOLD_MS) }
    next(TYPE_MS)
  }
  next(HOLD_MS)
}

export function showIntro() {
  if (state.name) $<HTMLInputElement>('nameInput').value = state.name
  showScreen('intro')
}
