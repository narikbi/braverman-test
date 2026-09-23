// Обёртки Chart.js: динамика и источники. Воронка рисуется CSS-полосами (см. dashboard.ts).
import { Chart, type ChartConfiguration, LineController, BarController, LineElement, PointElement, BarElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js'
import { bucketLabel } from '../format'

Chart.register(LineController, BarController, LineElement, PointElement, BarElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)
Chart.defaults.font.family = "'Inter', system-ui, sans-serif"
Chart.defaults.color = '#5b6478'

const charts = new Map<HTMLCanvasElement, Chart>()
function mount(canvas: HTMLCanvasElement, cfg: ChartConfiguration) {
  charts.get(canvas)?.destroy()
  const c = new Chart(canvas, cfg)
  charts.set(canvas, c)
  return c
}

export type Point = { t: string; views: number; started: number; finished: number; paid: number; revenue: number }

export function timelineChart(canvas: HTMLCanvasElement, points: Point[], bucket: 'hour' | 'day') {
  const labels = points.map(p => bucketLabel(p.t, bucket))
  mount(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Открыли сайт', data: points.map(p => p.views), borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,.12)', fill: true, tension: 0.35, pointRadius: 2, yAxisID: 'y' },
        { label: 'Начали', data: points.map(p => p.started), borderColor: '#2f5cff', backgroundColor: 'rgba(47,92,255,.10)', fill: true, tension: 0.35, pointRadius: 2, yAxisID: 'y' },
        { label: 'Закончили', data: points.map(p => p.finished), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.10)', fill: true, tension: 0.35, pointRadius: 2, yAxisID: 'y' },
        { label: 'Оплаты', data: points.map(p => p.paid), borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.15)', fill: true, tension: 0.35, pointRadius: 3, yAxisID: 'y' },
        { label: 'Выручка, ₸', data: points.map(p => p.revenue), borderColor: '#7c3aed', borderDash: [4, 4], tension: 0.35, pointRadius: 0, yAxisID: 'y2' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef0f6' } },
        y2: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => `${Number(v).toLocaleString('ru-RU')}` } },
        x: { grid: { display: false } }
      }
    }
  })
}

export function sourcesChart(canvas: HTMLCanvasElement, rows: { source: string; views: number; finished: number; paid: number }[]) {
  const top = rows.slice(0, 8)
  mount(canvas, {
    type: 'bar',
    data: {
      labels: top.map(r => r.source),
      datasets: [
        { label: 'Открыли', data: top.map(r => r.views), backgroundColor: '#cbd5e1', borderRadius: 6 },
        { label: 'Закончили', data: top.map(r => r.finished), backgroundColor: '#2f5cff', borderRadius: 6 },
        { label: 'Оплатили', data: top.map(r => r.paid), backgroundColor: '#16a34a', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef0f6' } }, x: { grid: { display: false } } }
    }
  })
}
