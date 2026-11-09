// Общие элементы страницы варианта Б: цвета нейромедиаторов, прогресс из четырёх отрезков, переключатель языка, вывод экрана.
import { NEURO_ORDER, QUESTIONS_PER_BLOCK, type NeuroKey } from '../../shared/scoring'
import { fmtPrice } from '../dom'
import { lang, setLang } from './lang'

/** Палитра варианта Б — четыре цвета как главный образ. */
export const COLORS: Record<NeuroKey, string> = { dopamine: '#FF5A4F', acetylcholine: '#6A4DFF', gaba: '#12A77E', serotonin: '#FFB020' }
/** Цвет текста поверх цвета нейромедиатора. */
export const onColor = (k: NeuroKey) => (k === 'acetylcholine' ? '#FDFDFF' : '#14122B')

export const PRICE_KZT = Number(import.meta.env.VITE_PRICE_KZT || 5000)
export const price = () => fmtPrice(PRICE_KZT)

const root = () => document.getElementById('app')!

/**
 * Прогресс теста: четыре отрезка по 50 вопросов (по числу нейромедиаторов).
 * mono — одним цветом (на цветном экране промежуточного вывода).
 */
export function seg(done: number, mono = false): string {
  return `<div class="seg ${mono ? 'mono' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="200" aria-valuenow="${done}">${NEURO_ORDER.map((k, i) => {
    const w = Math.max(0, Math.min(1, (done - i * QUESTIONS_PER_BLOCK) / QUESTIONS_PER_BLOCK)) * 100
    return `<span><i style="width:${w}%${mono ? '' : `;background:${COLORS[k]}`}"></i></span>`
  }).join('')}</div>`
}

export const langSwitch = () =>
  `<div class="lang" role="group" aria-label="Тіл / Язык"><button type="button" data-lang="ru" class="${lang === 'ru' ? 'on' : ''}">Рус</button><button type="button" data-lang="kk" class="${lang === 'kk' ? 'on' : ''}">Қаз</button></div>`

export const LOCK_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'

/**
 * Вывести экран. moved — это новый экран (анимация появления, прокрутка наверх), а не перерисовка того же.
 * fit — экран в высоту окна без прокрутки страницы (полный результат).
 */
export function mount(html: string, o: { moved?: boolean; fit?: boolean; fast?: boolean } = {}): HTMLElement {
  const el = root()
  document.documentElement.lang = lang
  document.body.classList.toggle('fit', !!o.fit)
  el.innerHTML = html
  if (o.moved !== false) {
    const first = el.firstElementChild
    first?.classList.add('enter')
    if (o.fast) first?.classList.add('fast')
    window.scrollTo(0, 0)
  }
  return el
}

/** Клики по переключателю языка — один обработчик на всю страницу. */
export function initLangSwitch() {
  root().addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-lang]')
    if (b) setLang(b.dataset.lang === 'ru' ? 'ru' : 'kk')
  })
}

export const q = <T extends HTMLElement = HTMLElement>(sel: string): T => root().querySelector(sel) as T
