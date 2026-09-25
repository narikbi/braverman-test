// Состояние прохождения — в localStorage, чтобы не терять ответы при перезагрузке.
import { setAttemptRef } from './analytics'
import type { Teaser } from './api'

const KEY = 'braverman_v2'

export type State = {
  name: string
  answers: number[]
  index: number
  attemptId: number
  attemptToken: string
  teaser: Teaser | null
  phone: string
  invoiceId: string
  resultToken: string
  /** токен результата, который пересдаём бесплатно (заблокированность отделов) */
  retakeOf: string
}

const empty = (): State => ({ name: '', answers: [], index: 0, attemptId: 0, attemptToken: '', teaser: null, phone: '', invoiceId: '', resultToken: '', retakeOf: '' })

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '')
    return { ...empty(), ...s, answers: Array.isArray(s.answers) ? s.answers : [] }
  } catch {
    return empty()
  }
}

export const state: State = load()
setAttemptRef({ id: state.attemptId, token: state.attemptToken })

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* noop */ }
}

export function setAttempt(id: number, token: string) {
  state.attemptId = id
  state.attemptToken = token
  setAttemptRef({ id, token })
  save()
}

/** Новый тест: всё с нуля, кроме имени. */
export function resetForNewTest(name: string) {
  Object.assign(state, empty(), { name })
  setAttemptRef(null)
  save()
}

export function clearAll() {
  Object.assign(state, empty())
  setAttemptRef(null)
  try { localStorage.removeItem(KEY) } catch { /* noop */ }
}

/** Есть незавершённый тест (есть хотя бы один ответ, результат ещё не получен). */
export const hasProgress = () => state.answers.length > 0 && state.answers.length < 200 && !state.resultToken
export const isFinished = () => state.answers.length === 200 && !state.resultToken
