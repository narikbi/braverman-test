// Экран 1: имя + язык → старт теста.
import { $, showScreen, currentScreen } from '../dom'
import { setNameExample, setLang } from '../i18n'
import { EXAMPLE_NAMES } from '../content'
import { state, save, resetForNewTest, setAttempt, hasProgress } from '../state'
import { openPrepaid } from '../api'
import { startQuiz, resumeQuiz } from './quiz'
import { openResult } from './result'
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
    if (state.prepaid && state.attemptId) {
      // оплата вне сайта: попытка уже создана и оплачена — сохраняем её, сбрасываем только ответы
      state.name = name
      state.answers = []
      state.index = 0
      save()
    } else {
      resetForNewTest(name)
    }
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
  $('prepaidNote').hidden = !state.prepaid
  showScreen('intro')
}

/** Ссылка /?p=… (оплатил через менеджера): подставляем его попытку, после теста — сразу результат. */
export async function startPrepaid(p: string) {
  try {
    const res = await openPrepaid(p)
    if (res.lang) setLang(res.lang)
    if (res.done && res.r) {
      state.resultToken = res.r
      save()
      history.replaceState(null, '', `/?r=${res.r}`)
      return openResult(res.r)
    }
    history.replaceState(null, '', '/')
    if (state.prepaid && state.attemptId === res.id && hasProgress()) return resumeQuiz() // уже начал на этом устройстве
    resetForNewTest(res.name || '')
    setAttempt(res.id!, res.token!)
    state.prepaid = true
    save()
    showIntro()
  } catch {
    history.replaceState(null, '', '/')
    showIntro()
  }
}
