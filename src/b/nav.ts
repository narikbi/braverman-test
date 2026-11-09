// Переходы между экранами варианта Б. Экраны регистрируются в main.ts — так модули экранов не импортируют друг друга по кругу.
export type Go = {
  intro(): void
  quiz(): void
  /** промежуточный вывод после n ответов (50 / 100 / 150) */
  mile(n: number): void
  /** 200 ответов: отправить на сервер и показать тип (или сразу результат — промокод, пересдача) */
  finish(): void
  offer(): void
  invoice(): void
  result(r: string): void
}
export const go = {} as Go

let current: (() => void) | null = null
let cleanup: (() => void) | null = null

/** Показать экран: render вызывается сразу и повторно при смене языка. */
export function show(render: () => void) {
  cleanup?.()
  cleanup = null
  current = render
  render()
}
/** Что убрать при уходе с экрана или перед его перерисовкой (видео, таймеры). */
export function onLeave(fn: () => void) { cleanup = fn }
export function rerender() {
  cleanup?.()
  cleanup = null
  current?.()
}
