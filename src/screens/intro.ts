// Экран 1: имя + язык → старт теста.
import { $, showScreen, currentScreen } from '../dom'
import { nextNameExample } from '../i18n'
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

  // Примеры имён в подсказке сменяются, пока поле пустое и открыт первый экран
  window.setInterval(() => {
    if (currentScreen() === 'intro' && !$<HTMLInputElement>('nameInput').value) nextNameExample()
  }, 2500)
}

export function showIntro() {
  if (state.name) $<HTMLInputElement>('nameInput').value = state.name
  showScreen('intro')
}
