// A/B-эксперимент, страница 1: панель варианта Б (braverman.kz/b) — все метрики новой воронки за период.
// Вторая страница — сравнение А/Б (ab-compare.ts). Данные — действие `ab` (api/_ab.ts) и общие timeline/sources с variant=b.
// Считается «чистая» воронка сайта: без открытий готового результата, оплат вне сайта, тестов тренеров,
// бесплатных пересдач и тестовых счетов на 1 ₸ — одинаково для обоих вариантов.
import { adminGet, ApiError } from '../api'
import { rangeParams } from '../state'
import { esc, fmtMoney, fmtNum, fmtPct, fmtDate, fmtPhone, fmtCombo } from '../format'
import { kpiCard, kpiSkeleton } from '../components/kpi'
import { timelineChart, type Point } from '../components/charts'
import { dbMissing } from './shared'
import { badge } from './attempts'

export type AbSide = {
  visits: number; started: number; q50: number; q100: number; optins: number; q150: number; names: number; finished: number
  checkouts: number; teasers: number; submits: number; invoices: number; paid: number; revenue: number; results: number; videos: number; promo: number
}
export type AbData = {
  a: AbSide; b: AbSide; prevA: AbSide; prevB: AbSide
  hooks: (AbSide & { hook: 'all' | 'work' | 'love' })[]
  sources: { source: string; a: { visits: number; finished: number; paid: number }; b: { visits: number; finished: number; paid: number } }[]
  recent: { id: number; created_at: string; name: string; phone: string | null; status: string; answered: number; dominant: string | null; combo: string | null; variant: string; paid_by: string | null; test_amount: number | null; wa_optin: boolean }[]
}
type Timeline = { bucket: 'hour' | 'day'; points: Point[] }
type Sources = { rows: { source: string; medium: string; campaign: string; content: string; views: number; started: number; finished: number; paid: number; revenue: number }[] }

export const HOOK_LABEL: Record<string, string> = { all: 'Общая (/b)', work: 'Про работу (/b/work)', love: 'Про отношения (/b/love)' }
/** Доля в процентах; делить не на что — «—». */
export const share = (x: number, of: number, digits = 1) => (of ? fmtPct((x / of) * 100, digits) : '—')

/** Вкладки эксперимента: панель Б и сравнение. */
export function abTabs(active: 'panel' | 'compare'): string {
  return `<div class="tabs"><a class="tab ${active === 'panel' ? 'active' : ''}" href="#/ab">Вариант Б</a><a class="tab ${active === 'compare' ? 'active' : ''}" href="#/ab/compare">Сравнение А/Б</a></div>`
}

export const AB_NOTE = 'Считаем одинаково для обоих вариантов: визит — человек, открывший сайт не по ссылке на готовый результат; без оплат вне сайта, тестов тренеров, бесплатных пересдач и тестовых счетов на 1 ₸.'

/** Данные эксперимента за выбранный период; схема ещё не создана или база не подключена — понятное сообщение. */
export async function loadAb(page: HTMLElement): Promise<AbData | null> {
  try {
    return await adminGet<AbData>('ab', rangeParams())
  } catch (e) {
    if (e instanceof ApiError && e.code === 'db_not_configured') { dbMissing(page); return null }
    throw e
  }
}

/** Шаги воронки Б: у каждого своя база для процента (не всегда предыдущая строка). side — необязательный шаг в стороне. */
function steps(b: AbSide): { label: string; n: number; of: number; ofLabel: string; side?: boolean }[] {
  return [
    { label: 'Открыли /b', n: b.visits, of: 0, ofLabel: '' },
    { label: 'Начали тест', n: b.started, of: b.visits, ofLabel: 'от открывших' },
    { label: 'Дошли до 50-го вопроса', n: b.q50, of: b.started, ofLabel: 'от начавших' },
    { label: 'Дошли до 100-го', n: b.q100, of: b.q50, ofLabel: 'от 50-го' },
    { label: 'Оставили номер WhatsApp', n: b.optins, of: b.q100, ofLabel: 'от дошедших до 100-го', side: true },
    { label: 'Дошли до 150-го', n: b.q150, of: b.q100, ofLabel: 'от 100-го' },
    { label: 'Назвали имя', n: b.names, of: b.q150, ofLabel: 'от дошедших до 150-го', side: true },
    { label: 'Закончили тест', n: b.finished, of: b.q150, ofLabel: 'от 150-го' },
    { label: 'Увидели свой тип', n: b.checkouts, of: b.finished, ofLabel: 'от закончивших' },
    { label: 'Включили превью 35 с', n: b.teasers, of: b.checkouts, ofLabel: 'от увидевших тип', side: true },
    { label: 'Нажали «Открыть разбор»', n: b.submits, of: b.checkouts, ofLabel: 'от увидевших тип' },
    { label: 'Счёт выставлен', n: b.invoices, of: b.submits, ofLabel: 'от нажавших' },
    { label: 'Оплатили', n: b.paid, of: b.invoices, ofLabel: 'от счетов' },
    { label: 'Открыли результат', n: b.results, of: 0, ofLabel: '' },
    { label: 'Включили видео-разбор', n: b.videos, of: b.results, ofLabel: 'от открывших результат', side: true }
  ]
}

export async function renderAbPanel(page: HTMLElement) {
  page.innerHTML = `
    ${abTabs('panel')}
    <div class="section grid grid-kpi" id="kpis">${kpiSkeleton(8)}</div>
    <div class="section grid grid-2">
      <div class="card"><div class="card-head"><h2>Воронка варианта Б</h2><span class="hint">каждый шаг — от своего предыдущего</span></div><div class="card-body"><div class="funnel funnel-steps" id="steps"></div></div></div>
      <div class="card"><div class="card-head"><h2>Динамика</h2><span class="hint">открыли · начали · закончили · оплаты · выручка</span></div><div class="card-body"><div class="chart-wrap"><canvas id="c-timeline"></canvas></div></div></div>
    </div>
    <div class="section grid grid-2">
      <div class="card"><div class="card-head"><h2>По нарезкам</h2><span class="hint">с какой ссылки пришли</span></div><div class="card-body"><div class="table-wrap"><table class="tbl" id="hooks"></table></div></div></div>
      <div class="card"><div class="card-head"><h2>Источники</h2><span class="hint">UTM-метки трафика на /b</span></div><div class="card-body"><div class="table-wrap"><table class="tbl" id="src"></table></div></div></div>
    </div>
    <div class="section"><div class="card"><div class="card-head"><h2>Последние прохождения варианта Б</h2><span class="hint">до 30 за период</span></div><div class="card-body"><div class="table-wrap"><table class="tbl cards" id="recent"></table></div></div></div></div>
    <p class="muted" style="font-size:12.5px">${esc(AB_NOTE)}</p>`

  const rp = rangeParams()
  const [d, tl, src] = await Promise.all([
    loadAb(page),
    adminGet<Timeline>('timeline', { ...rp, variant: 'b' }).catch(() => null),
    adminGet<Sources>('sources', { ...rp, variant: 'b' }).catch(() => null)
  ])
  if (!d) return
  const b = d.b
  const p = d.prevB
  const conv = (s: AbSide) => (s.visits ? (s.paid / s.visits) * 100 : 0)

  page.querySelector('#kpis')!.innerHTML = [
    kpiCard('Выручка', fmtMoney(b.revenue), b.revenue, p.revenue, `${fmtNum(b.paid)} оплат`),
    kpiCard('Оплаты', fmtNum(b.paid), b.paid, p.paid, b.paid ? `средний чек ${fmtMoney(b.revenue / b.paid)}` : ''),
    kpiCard('Сайт → оплата', fmtPct(conv(b), 2), conv(b), conv(p), 'от открывших /b'),
    kpiCard('Открыли /b', fmtNum(b.visits), b.visits, p.visits, 'уникальные посетители'),
    kpiCard('Начали тест', fmtNum(b.started), b.started, p.started, `${share(b.started, b.visits)} от открывших`),
    kpiCard('Закончили тест', fmtNum(b.finished), b.finished, p.finished, `${share(b.finished, b.started)} от начавших`),
    kpiCard('Счёт выставлен', fmtNum(b.invoices), b.invoices, p.invoices, `${share(b.invoices, b.checkouts)} от увидевших тип`),
    kpiCard('По промокоду', fmtNum(b.promo), b.promo, p.promo, 'бесплатно, в оплаты не входят', false)
  ].join('')

  const max = Math.max(1, b.visits, ...steps(b).map(s => s.n))
  page.querySelector('#steps')!.innerHTML = steps(b).map((s, i) => `
    <div class="funnel-row ${s.side ? 'opt-step' : ''}">
      <span class="lbl">${i + 1}. ${esc(s.label)}</span>
      <div class="bar"><i style="width:${(s.n / max) * 100}%"></i></div>
      <span class="num" title="${esc(s.ofLabel)}">${fmtNum(s.n)}${s.of && s.n <= s.of ? `<small>${share(s.n, s.of, 0)}</small>` : ''}</span>
    </div>`).join('')

  if (tl) timelineChart(page.querySelector('#c-timeline')!, tl.points, tl.bucket, true)

  page.querySelector('#hooks')!.innerHTML = `
    <thead><tr><th>Нарезка</th><th class="num">Открыли</th><th class="num">Начали</th><th class="num">Закончили</th><th class="num">Оплаты</th><th class="num">Выручка</th><th class="num">Сайт → оплата</th></tr></thead>
    <tbody>${d.hooks.map(h => `<tr><td><b>${esc(HOOK_LABEL[h.hook] || h.hook)}</b></td><td class="num">${fmtNum(h.visits)}</td><td class="num">${fmtNum(h.started)}</td><td class="num">${fmtNum(h.finished)}</td><td class="num"><b>${fmtNum(h.paid)}</b></td><td class="num">${fmtMoney(h.revenue)}</td><td class="num">${share(h.paid, h.visits, 2)}</td></tr>`).join('')}</tbody>`

  const rows = (src?.rows ?? []).filter(r => r.views || r.paid)
  page.querySelector('#src')!.innerHTML = `
    <thead><tr><th>Источник</th><th>Кампания</th><th class="num">Открыли</th><th class="num">Закончили</th><th class="num">Оплаты</th><th class="num">Выручка</th></tr></thead>
    <tbody>${rows.length ? rows.map(r => `<tr><td><b>${esc(r.source)}</b>${r.medium ? ` <span class="chip">${esc(r.medium)}</span>` : ''}</td><td class="muted">${esc(r.campaign || '—')}${r.content ? ` · ${esc(r.content)}` : ''}</td><td class="num">${fmtNum(r.views)}</td><td class="num">${fmtNum(r.finished)}</td><td class="num"><b>${fmtNum(r.paid)}</b></td><td class="num">${fmtMoney(r.revenue)}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty">За период на /b никто не приходил</div></td></tr>'}</tbody>`

  page.querySelector('#recent')!.innerHTML = `
    <thead><tr><th>Дата</th><th>Имя</th><th>Телефон</th><th>Этап</th><th>Тип</th><th>Нарезка</th></tr></thead>
    <tbody>${d.recent.length ? d.recent.map(r => `<tr class="row" data-id="${r.id}">
      <td data-l="Дата" class="muted">${fmtDate(r.created_at)}</td>
      <td data-l="Имя"><b>${esc(r.name || '—')}</b></td>
      <td data-l="Телефон">${fmtPhone(r.phone)}${r.wa_optin ? ' <span class="chip" title="Оставил номер на 100-м вопросе и согласился на сообщения">WhatsApp ✓</span>' : ''}</td>
      <td data-l="Этап">${badge(r.status)}${r.status === 'started' ? ` <span class="muted" style="font-size:12px">${r.answered}/200</span>` : ''}${r.test_amount ? ' <span class="chip">тест</span>' : ''}${r.paid_by === 'promo' ? ' <span class="chip">🎁 промокод</span>' : ''}${r.paid_by === 'retake' ? ' <span class="chip">пересдача</span>' : ''}</td>
      <td data-l="Тип">${r.dominant ? `<b>${esc(fmtCombo(r.combo))}</b>` : '<span class="muted">—</span>'}</td>
      <td data-l="Нарезка" class="muted">${esc(HOOK_LABEL[r.variant.split(':')[1] || 'all'] || r.variant)}</td>
    </tr>`).join('') : '<tr><td colspan="6"><div class="empty">Прохождений варианта Б за период нет</div></td></tr>'}</tbody>`
  page.querySelectorAll<HTMLElement>('#recent tr.row').forEach(tr => tr.addEventListener('click', () => { location.hash = `#/attempts/${tr.dataset.id}` }))
}
