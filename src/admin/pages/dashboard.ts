import { adminGet, ApiError } from '../api'
import { rangeParams, isAdmin } from '../state'
import { esc, fmtMoney, fmtNum, fmtPct } from '../format'
import { kpiCard, kpiSkeleton } from '../components/kpi'
import { timelineChart, sourcesChart, type Point } from '../components/charts'
import { dbMissing } from './shared'

export type Kpi = { visits: number; started: number; finished: number; checkouts: number; invoices: number; paid: number; revenue: number; results: number; convVisitPaid: number; convFinishPaid: number; convStartFinish: number }
type Overview = { kpi: Kpi; prev: Kpi; range: { bucket: 'hour' | 'day' } }
type Funnel = { stages: { key: string; label: string; count: number }[] }
type Timeline = { bucket: 'hour' | 'day'; points: Point[] }
type Sources = { rows: { source: string; medium: string; campaign: string; content: string; views: number; started: number; finished: number; invoices: number; paid: number; revenue: number }[] }
type TrainersStats = { rows: { id: number; code: string; name: string; active: boolean; visits: number; started: number; finished: number; paid: number; revenue: number }[]; unknown: { code: string; visits: number; started: number }[] }

export function kpiCards(k: Kpi, p: Kpi): string {
  return [
    kpiCard('Выручка', fmtMoney(k.revenue), k.revenue, p.revenue, `${k.paid} оплат`),
    kpiCard('Оплаты', fmtNum(k.paid), k.paid, p.paid, `${fmtPct(k.convFinishPaid)} из закончивших`),
    kpiCard('Закончили тест', fmtNum(k.finished), k.finished, p.finished, `${fmtPct(k.convStartFinish)} из начавших`),
    kpiCard('Начали тест', fmtNum(k.started), k.started, p.started, `${k.invoices} счетов выставлено`),
    kpiCard('Открыли сайт', fmtNum(k.visits), k.visits, p.visits, `${k.results} открыли результат`),
    kpiCard('Конверсия в оплату', fmtPct(k.convVisitPaid, 2), k.convVisitPaid, p.convVisitPaid, 'от открывших сайт')
  ].join('')
}

export function funnelHtml(stages: { label: string; count: number }[]): string {
  const max = Math.max(1, ...stages.map(s => s.count))
  return stages.map((s, i) => {
    const prev = i ? stages[i - 1].count : 0
    const pct = i && prev ? Math.round((s.count / prev) * 100) : null
    return `<div class="funnel-row"><span class="lbl">${esc(s.label)}</span><div class="bar"><i style="width:${(s.count / max) * 100}%"></i></div><span class="num">${fmtNum(s.count)}${pct !== null ? `<small>${pct}%</small>` : ''}</span></div>`
  }).join('')
}

export async function renderDashboard(page: HTMLElement) {
  page.innerHTML = `
    <div class="section grid grid-kpi" id="kpis">${kpiSkeleton(6)}</div>
    <div class="section grid grid-2">
      <div class="card"><div class="card-head"><h2>Динамика</h2><span class="hint">открыли · начали · закончили · оплаты · выручка</span></div><div class="card-body"><div class="chart-wrap"><canvas id="c-timeline"></canvas></div></div></div>
      <div class="card"><div class="card-head"><h2>Воронка</h2><span class="hint">уникальные сессии</span></div><div class="card-body"><div class="funnel" id="funnel"></div></div></div>
    </div>
    <div class="section grid grid-2">
      <div class="card"><div class="card-head"><h2>Источники</h2><span class="hint">UTM и ссылки тренеров</span></div><div class="card-body"><div class="table-wrap"><table class="tbl" id="src-table"></table></div></div></div>
      <div class="card"><div class="card-head"><h2>Топ источников</h2></div><div class="card-body"><div class="chart-wrap"><canvas id="c-sources"></canvas></div></div></div>
    </div>
    ${isAdmin() ? `<div class="section"><div class="card"><div class="card-head"><h2>Тренеры</h2><a href="#/trainers" class="hint">все тренеры →</a></div><div class="card-body"><div class="table-wrap"><table class="tbl" id="tr-table"></table></div></div></div></div>` : ''}`
  const rp = rangeParams()
  try {
    const [ov, fn, tl, src, tr] = await Promise.all([
      adminGet<Overview>('overview', rp), adminGet<Funnel>('funnel', rp), adminGet<Timeline>('timeline', rp), adminGet<Sources>('sources', rp),
      isAdmin() ? adminGet<TrainersStats>('trainers-stats', rp) : Promise.resolve(null)
    ])
    page.querySelector('#kpis')!.innerHTML = kpiCards(ov.kpi, ov.prev)
    page.querySelector('#funnel')!.innerHTML = funnelHtml(fn.stages)
    timelineChart(page.querySelector('#c-timeline')!, tl.points, tl.bucket)
    sourcesChart(page.querySelector('#c-sources')!, src.rows)
    page.querySelector('#src-table')!.innerHTML = `
      <thead><tr><th>Источник</th><th>Кампания</th><th class="num">Открыли</th><th class="num">Начали</th><th class="num">Закончили</th><th class="num">Оплаты</th><th class="num">Выручка</th></tr></thead>
      <tbody>${src.rows.length ? src.rows.map(r => `<tr><td><b>${esc(r.source)}</b>${r.medium ? ` <span class="chip">${esc(r.medium)}</span>` : ''}</td><td class="muted">${esc(r.campaign || '—')}${r.content ? ` · ${esc(r.content)}` : ''}</td><td class="num">${fmtNum(r.views)}</td><td class="num">${fmtNum(r.started)}</td><td class="num">${fmtNum(r.finished)}</td><td class="num"><b>${fmtNum(r.paid)}</b></td><td class="num">${fmtMoney(r.revenue)}</td></tr>`).join('') : `<tr><td colspan="7"><div class="empty">Нет данных за период</div></td></tr>`}</tbody>`
    if (tr) {
      const rows = tr.rows.filter(t => t.visits || t.started || t.paid).slice(0, 10)
      page.querySelector('#tr-table')!.innerHTML = `
        <thead><tr><th>Тренер</th><th>Код</th><th class="num">Открыли</th><th class="num">Начали</th><th class="num">Закончили</th><th class="num">Оплаты</th><th class="num">Выручка</th></tr></thead>
        <tbody>${rows.length ? rows.map(t => `<tr class="row" data-h="#/trainers/${t.id}"><td><b>${esc(t.name)}</b>${t.active ? '' : ' <span class="chip">выкл</span>'}</td><td class="muted">${esc(t.code)}</td><td class="num">${fmtNum(t.visits)}</td><td class="num">${fmtNum(t.started)}</td><td class="num">${fmtNum(t.finished)}</td><td class="num"><b>${fmtNum(t.paid)}</b></td><td class="num">${fmtMoney(t.revenue)}</td></tr>`).join('') : `<tr><td colspan="7"><div class="empty">По ссылкам тренеров за период никто не приходил</div></td></tr>`}
        ${tr.unknown.length ? tr.unknown.map(u => `<tr><td class="muted">неизвестный код</td><td class="muted">${esc(u.code)}</td><td class="num">${fmtNum(u.visits)}</td><td class="num">${fmtNum(u.started)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>`).join('') : ''}</tbody>`
      page.querySelectorAll<HTMLElement>('#tr-table tr.row').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.h! }))
    }
  } catch (e) {
    if (e instanceof ApiError && e.code === 'db_not_configured') return dbMissing(page)
    throw e
  }
}
