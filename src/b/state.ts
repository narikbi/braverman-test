// Состояние прохождения варианта Б — в localStorage (свой ключ, с основным сайтом не пересекается).
import { setAttemptRef } from '../analytics'
import type { Teaser } from '../api'

const KEY = 'braverman_b'

/** Нарезка, по которой пришёл человек: меняет заголовок первого экрана (/b, /b/work, /b/love). */
export type Hook = 'all' | 'work' | 'love'

export type BState = {
  hook: Hook
  name: string
  answers: number[]
  index: number
  attemptId: number
  attemptToken: string
  /** промежуточные выводы (50/100/150), которые человек уже прошёл кнопкой «Продолжить» */
  milesSeen: number[]
  /** номер WhatsApp с 100-го вопроса (+77XXXXXXXXX); waSaved — сервер его записал */
  waPhone: string
  waSaved: boolean
  teaser: Teaser | null
  /** сервер принял 200 ответов — можно выставлять счёт */
  finishedOnServer: boolean
  phone: string
  invoiceId: string
  resultToken: string
  /** токен результата, который пересдаём бесплатно (заблокированность отделов) */
  retakeOf: string
  /** промокод из ссылки /b?promo=… — гасится при завершении теста */
  promo: string
}

const empty = (): BState => ({
  hook: 'all', name: '', answers: [], index: 0, attemptId: 0, attemptToken: '', milesSeen: [], waPhone: '', waSaved: false,
  teaser: null, finishedOnServer: false, phone: '', invoiceId: '', resultToken: '', retakeOf: '', promo: ''
})

function load(): BState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '')
    return { ...empty(), ...s, answers: Array.isArray(s.answers) ? s.answers : [], milesSeen: Array.isArray(s.milesSeen) ? s.milesSeen : [] }
  } catch {
    return empty()
  }
}

export const state: BState = load()
setAttemptRef({ id: state.attemptId, token: state.attemptToken })

/** Метка варианта для сервера: 'b' или 'b:<нарезка>'. */
export const variantOf = (): string => (state.hook === 'all' ? 'b' : `b:${state.hook}`)

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* noop */ }
}

export function setAttempt(id: number, token: string) {
  state.attemptId = id
  state.attemptToken = token
  setAttemptRef({ id, token })
  save()
}

/** Новый тест: всё с нуля, кроме нарезки и того, что передали в keep (имя и номер при пересдаче, промокод). */
export function resetForNewTest(keep: Partial<BState> = {}) {
  Object.assign(state, empty(), { hook: state.hook }, keep)
  setAttemptRef(null)
  save()
}

export function clearAll() {
  Object.assign(state, empty(), { hook: state.hook })
  setAttemptRef(null)
  try { localStorage.removeItem(KEY) } catch { /* noop */ }
}

export const TOTAL = 200
export const MILES = [50, 100, 150]
export const isFinished = () => state.answers.length === TOTAL
