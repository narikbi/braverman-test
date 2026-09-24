// График-профиль нейромедиаторов (Chart.js, линия с маркерами). Регистрируем только нужное.
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip } from 'chart.js'
import { NEURO_ORDER, NEURO_COLOR, type NeuroKey } from '../shared/scoring'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip)
Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const instances = new WeakMap<HTMLCanvasElement, Chart>()

export function renderProfileChart(
  canvas: HTMLCanvasElement,
  scores: Record<NeuroKey, number>,
  max: number,
  dominant: NeuroKey | null, // null — без выделения (тизер до оплаты)
  labels: string[],
  opts: { tooltip?: (v: number, m: number) => string; minimal?: boolean } = {}
) {
  instances.get(canvas)?.destroy()
  const c = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: NEURO_ORDER.map(k => scores[k]),
        borderColor: '#C7CBDA',
        borderWidth: 2,
        tension: 0.3,
        fill: false,
        pointBackgroundColor: NEURO_ORDER.map(k => NEURO_COLOR[k]),
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: NEURO_ORDER.map(k => (k === dominant ? 10 : 6)),
        pointHoverRadius: NEURO_ORDER.map(k => (k === dominant ? 12 : 8))
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: opts.minimal ? false : undefined,
      events: opts.minimal ? [] : undefined,
      plugins: {
        tooltip: { enabled: !opts.minimal, callbacks: { label: ctx => (opts.tooltip ? opts.tooltip(ctx.parsed.y ?? 0, max) : `${ctx.parsed.y ?? 0} / ${max}`) } }
      },
      scales: {
        y: { min: 0, max, ticks: { stepSize: Math.max(1, Math.round(max / 5)), color: '#9AA0AE', display: !opts.minimal }, grid: { color: '#EEF0F4' } },
        x: { ticks: { color: '#4B5563', font: { size: 13, weight: 600 }, display: !opts.minimal }, grid: { display: false } }
      }
    }
  })
  instances.set(canvas, c)
  return c
}

export function chartImage(canvas: HTMLCanvasElement): string | null {
  return instances.get(canvas)?.toBase64Image('image/png', 1) ?? null
}
