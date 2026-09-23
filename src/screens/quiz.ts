// Экран 2: 200 вопросов по одному. Проходящий не видит деления на блоки —
// вопросы чередуются round-robin (см. shared/scoring.ts: neuroAt / questionIndexAt).
import { $, showScreen, currentScreen } from '../dom'
import { state, save, setAttempt } from '../state'
import { T, lang, onLangChange } from '../i18n'
import { track } from '../analytics'
import { startAttempt, finishAttempt } from '../api'
import { neuroAt, questionIndexAt, TOTAL_QUESTIONS, scoreAttempt } from '../../shared/scoring'
import { renderCheckout } from './checkout'

const questionText = (i: number) => T().questions[neuroAt(i)][questionIndexAt(i)]

export function initQuiz() {
  $('yesBtn').addEventListener('click', () => answer(1))
  $('noBtn').addEventListener('click', () => answer(0))
  $('backBtn').addEventListener('click', goBack)
  document.addEventListener('keydown', e => {
    if (currentScreen() !== 'quiz') return
    if (e.key === '1') answer(1)
    else if (e.key === '2') answer(0)
    else if (e.key === 'Backspace' || e.key === 'ArrowLeft') { e.preventDefault(); goBack() }
  })
  onLangChange(() => { if (currentScreen() === 'quiz') renderQuestion() })
}

/** Новый тест: экран сразу, попытка на сервере — в фоне (не блокирует). */
export function startQuiz() {
  state.index = 0
  showScreen('quiz')
  renderQuestion()
  startAttempt({ name: state.name, lang }).then(r => { if (r.id) setAttempt(r.id, r.token) }).catch(() => {})
}

/** Продолжить незавершённый тест после перезагрузки. */
export function resumeQuiz() {
  state.index = Math.min(state.answers.length, TOTAL_QUESTIONS - 1)
  showScreen('quiz')
  renderQuestion()
}

function renderQuestion() {
  const i = state.index
  $('qIndex').textContent = String(i + 1).padStart(2, '0')
  $('questionText').textContent = questionText(i)
  $('counter').textContent = T().ui.counter(i + 1, TOTAL_QUESTIONS)
  $('progressBar').style.width = `${(i / TOTAL_QUESTIONS) * 100}%`
  ;($('backBtn') as HTMLButtonElement).disabled = i === 0
  const card = $('quizCard')
  card.classList.remove('swap')
  void card.offsetWidth // перезапуск анимации
  card.classList.add('swap')
}

let finishing = false

function answer(value: 0 | 1) {
  if (finishing) return
  state.answers[state.index] = value
  const step = state.index + 1
  if (step % 25 === 0 && step < TOTAL_QUESTIONS) track(`QuizStep_${step}`)
  if (state.index < TOTAL_QUESTIONS - 1) {
    state.index++
    save()
    renderQuestion()
  } else {
    state.answers.length = TOTAL_QUESTIONS
    save()
    finish()
  }
}

function goBack() {
  if (state.index === 0) return
  state.index--
  save()
  renderQuestion()
}

async function finish() {
  finishing = true
  $('progressBar').style.width = '100%'
  // тизер считаем локально сразу — сервер подтвердит и сохранит
  state.teaser = scoreAttempt(state.answers)
  save()
  renderCheckout({ loading: true })
  try {
    const r = await finishAttempt({ id: state.attemptId, token: state.attemptToken, answers: state.answers, name: state.name, lang })
    if (r.id) setAttempt(r.id, r.token)
    if (r.teaser) { state.teaser = r.teaser; save() }
  } catch (e) {
    console.error('finish_failed', e)
  }
  finishing = false
  renderCheckout({})
}
