// Подсчёт теста Бравермана. Общий модуль для фронта (src/) и функций (api/):
// обе стороны считают одинаково, сервер — источник истины для результата.
//
// Порядок вопросов: 4 блока по 50 вопросов переплетены round-robin —
// вопрос с индексом i принадлежит нейромедиатору NEURO_ORDER[i % 4], а внутри
// блока это вопрос номер floor(i / 4). Проходящий деления на блоки не видит.

export type NeuroKey = 'dopamine' | 'acetylcholine' | 'gaba' | 'serotonin'

/** Порядок задаёт и чередование вопросов, и оси графика, и приоритет при ничьей. */
export const NEURO_ORDER: NeuroKey[] = ['dopamine', 'acetylcholine', 'gaba', 'serotonin']

export const NEURO_COLOR: Record<NeuroKey, string> = {
  dopamine: '#FF6B6B',
  acetylcholine: '#7C5CFC',
  gaba: '#2DB58A',
  serotonin: '#F4A93D'
}

export const QUESTIONS_PER_BLOCK = 50
export const TOTAL_QUESTIONS = QUESTIONS_PER_BLOCK * NEURO_ORDER.length // 200

export type Scores = Record<NeuroKey, number>

export function neuroAt(i: number): NeuroKey {
  return NEURO_ORDER[i % NEURO_ORDER.length]
}

export function questionIndexAt(i: number): number {
  return Math.floor(i / NEURO_ORDER.length)
}

/** Да = 1, Нет = 0. Возвращает абсолютные баллы 0–50 по каждому нейромедиатору. */
export function computeScores(answers: ArrayLike<number>): Scores {
  const s: Scores = { dopamine: 0, acetylcholine: 0, gaba: 0, serotonin: 0 }
  for (let i = 0; i < answers.length; i++) {
    if (answers[i] === 1) s[neuroAt(i)]++
  }
  return s
}

/** Максимум; при равенстве — тот, кто раньше в NEURO_ORDER. */
export function dominantOf(val: Record<NeuroKey, number>): NeuroKey {
  return NEURO_ORDER.reduce((best, k) => (val[k] > val[best] ? k : best), NEURO_ORDER[0])
}

/** Минимум; при равенстве — тот, кто раньше в NEURO_ORDER. */
export function lowestOf(val: Record<NeuroKey, number>): NeuroKey {
  return NEURO_ORDER.reduce((low, k) => (val[k] < val[low] ? k : low), NEURO_ORDER[0])
}

// Видео-разбор: доминанта + кто выше из противоположной группы.
// Группа A (возбуждающие): дофамин, ацетилхолин. Группа B (тормозящие): ГАМК, серотонин.
export const VIDEO_GROUP_A: NeuroKey[] = ['dopamine', 'acetylcholine']
export const VIDEO_GROUP_B: NeuroKey[] = ['gaba', 'serotonin']

export type VideoKey =
  | 'dopamine-gaba' | 'dopamine-serotonin'
  | 'acetylcholine-gaba' | 'acetylcholine-serotonin'
  | 'gaba-dopamine' | 'gaba-acetylcholine'
  | 'serotonin-dopamine' | 'serotonin-acetylcholine'

export function videoKeyFor(dominant: NeuroKey, scores: Record<NeuroKey, number>): VideoKey {
  const other = VIDEO_GROUP_A.includes(dominant) ? VIDEO_GROUP_B : VIDEO_GROUP_A
  const partner = other.reduce((best, k) => (scores[k] > scores[best] ? k : best), other[0])
  return `${dominant}-${partner}` as VideoKey
}

/** Полный результат по массиву ответов. */
export function scoreAttempt(answers: ArrayLike<number>) {
  const scores = computeScores(answers)
  const dominant = dominantOf(scores)
  const lowest = lowestOf(scores)
  const combo = videoKeyFor(dominant, scores)
  return { scores, dominant, lowest, combo }
}

/** Ровно 200 значений 0|1. */
export function isValidAnswers(a: unknown): a is number[] {
  return Array.isArray(a) && a.length === TOTAL_QUESTIONS && a.every((v) => v === 0 || v === 1)
}
