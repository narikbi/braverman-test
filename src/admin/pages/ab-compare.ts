// A/B-эксперимент, страница 2: сравнение варианта А (обычный сайт) и варианта Б (/b) за период.
// Таблица метрик и конверсий, вывод о значимости разницы, две воронки рядом и сравнение по одинаковым источникам.
import { esc, fmtMoney, fmtNum, fmtPct } from '../format'
import { funnelHtml } from './dashboard'
import { abTabs, loadAb, share, AB_NOTE, type AbSide } from './ab-panel'

// ── значимость: двусторонний z-тест для двух долей ──
/** Φ(z) — функция стандартного нормального распределения (приближение Абрамовица — Стиган). */
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}
/** x — сколько оплатили, n — сколько было всего. null — данных мало для вывода. */
export function zTest(x1: number, n1: number, x2: number, n2: number): { p: number; significant: boolean } | null {
  if (n1 < 100 || n2 < 100 || x1 + x2 < 10) return null
  const pool = (x1 + x2) / (n1 + n2)
  const se = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2))
  if (!se) return null
  const z = (x2 / n2 - x1 / n1) / se
  const p = 2 * (1 - normCdf(Math.abs(z)))
  return { p, significant: p < 0.05 }
}

function verdict(label: string, a: [number, number], b: [number, number]): string {
  const ra = a[1] ? (a[0] / a[1]) * 100 : 0
  const rb = b[1] ? (b[0] / b[1]) * 100 : 0
  const t = zTest(a[0], a[1], b[0], b[1])
  const head = `<b>${esc(label)}:</b> А ${fmtPct(ra, 2)} · Б ${fmtPct(rb, 2)}`
  if (!t) return `<div class="ab-verdict">${head}<span class="chip">мало данных — вывод делать рано</span></div>`
  const better = rb > ra ? 'Б лучше' : rb < ra ? 'А лучше' : 'поровну'
  return `<div class="ab-verdict">${head}<span class="chip ${t.significant ? 'chip-ok' : ''}">${t.significant ? `${better}, разница значима` : 'разница может быть случайной'} · p = ${t.p < 0.001 ? '< 0,001' : t.p.toFixed(3).replace('.', ',')}</span></div>`
}

/** Разница в процентных пунктах между Б и А. */
function ppDelta(xa: number, na: number, xb: number, nb: number): string {
  if (!na || !nb) return '<span class="muted">—</span>'
  const d = (xb / nb) * 100 - (xa / na) * 100
  const cls = d > 0.05 ? 'up' : d < -0.05 ? 'down' : 'flat'
  return `<span class="delta ${cls}">${d > 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')} п.п.</span>`
}

export async function renderAbCompare(page: HTMLElement) {
  page.innerHTML = `${abTabs('compare')}<div class="card"><div class="card-body"><div class="skel" style="height:220px"></div></div></div>`
  const d = await loadAb(page)
  if (!d) return
  const { a, b } = d

  // Шаг воронки: число и рядом доля от открывших сайт (от исходного трафика), в «Разнице» — на сколько п.п. доля Б выше или ниже.
  const NO_PCT = '<span class="ab-pct"></span>'
  const step = (s: AbSide, k: keyof AbSide) => `${fmtNum(s[k])}<span class="ab-pct">${share(s[k], s.visits)}</span>`
  const count = (label: string, k: keyof AbSide) =>
    `<tr><td>${esc(label)}</td><td class="num">${step(a, k)}</td><td class="num">${step(b, k)}</td><td class="num">${k === 'visits' ? '<span class="muted">—</span>' : ppDelta(a[k], a.visits, b[k], b.visits)}</td></tr>`
  const money = (label: string, va: string, vb: string) =>
    `<tr><td>${esc(label)}</td><td class="num">${va}${NO_PCT}</td><td class="num">${vb}${NO_PCT}</td><td class="num muted">—</td></tr>`
  const rate = (label: string, x: keyof AbSide, of: keyof AbSide, strong = false) =>
    `<tr${strong ? ' class="strong"' : ''}><td>${esc(label)}</td><td class="num">${share(a[x], a[of], strong ? 2 : 1)}</td><td class="num">${share(b[x], b[of], strong ? 2 : 1)}</td><td class="num">${ppDelta(a[x], a[of], b[x], b[of])}</td></tr>`
  const per100 = (s: AbSide) => (s.visits ? fmtMoney((s.revenue / s.visits) * 100) : '—')
  const stages = (s: AbSide) => [
    { label: 'Открыли сайт', count: s.visits }, { label: 'Начали тест', count: s.started }, { label: 'Закончили тест', count: s.finished },
    { label: 'Экран оплаты', count: s.checkouts }, { label: 'Счёт выставлен', count: s.invoices }, { label: 'Оплатили', count: s.paid }
  ]

  page.innerHTML = `
    ${abTabs('compare')}
    <div class="section"><div class="card"><div class="card-head"><h2>Итог</h2><span class="hint">А — обычный сайт, Б — новая воронка на /b</span></div><div class="card-body">
      ${verdict('Сайт → оплата', [a.paid, a.visits], [b.paid, b.visits])}
      ${verdict('Закончили тест → оплата', [a.paid, a.finished], [b.paid, b.finished])}
      <div class="muted" style="font-size:12.5px;margin-top:10px">Вывод о значимости появляется, когда в каждом варианте не меньше 100 человек и есть хотя бы 10 оплат на двоих. Пока данных мало, разница может быть случайной.</div>
    </div></div></div>

    <div class="section"><div class="card"><div class="card-head"><h2>Метрики</h2><span class="hint">рядом с числом — доля от открывших сайт</span></div><div class="card-body"><div class="table-wrap"><table class="tbl ab-table">
      <thead><tr><th>Метрика</th><th class="num">Вариант А</th><th class="num">Вариант Б</th><th class="num">Разница</th></tr></thead>
      <tbody>
        ${count('Открыли сайт', 'visits')}
        ${count('Начали тест', 'started')}
        ${count('Дошли до 50-го вопроса', 'q50')}
        ${count('Дошли до 100-го вопроса', 'q100')}
        ${count('Дошли до 150-го вопроса', 'q150')}
        ${count('Закончили тест', 'finished')}
        ${count('Экран оплаты (в Б — свой тип)', 'checkouts')}
        ${count('Счёт выставлен', 'invoices')}
        ${count('Оплатили', 'paid')}
        ${money('Выручка', fmtMoney(a.revenue), fmtMoney(b.revenue))}
        ${money('Выручка на 100 посетителей', per100(a), per100(b))}
        <tr class="sep"><td colspan="4">Конверсии по шагам</td></tr>
        ${rate('Открыли → начали тест', 'started', 'visits')}
        ${rate('Начали → дошли до 100-го', 'q100', 'started')}
        ${rate('Начали → закончили тест', 'finished', 'started')}
        ${rate('Экран оплаты → счёт', 'invoices', 'checkouts')}
        ${rate('Счёт → оплата', 'paid', 'invoices')}
        ${rate('Закончили тест → оплата', 'paid', 'finished')}
        ${rate('Сайт → оплата', 'paid', 'visits', true)}
      </tbody></table></div></div></div></div>

    <div class="section grid grid-2 ab-funnels">
      <div class="card"><div class="card-head"><h2>Воронка А</h2><span class="hint">обычный сайт</span></div><div class="card-body"><div class="funnel">${funnelHtml(stages(a))}</div></div></div>
      <div class="card"><div class="card-head"><h2>Воронка Б</h2><span class="hint">braverman.kz/b</span></div><div class="card-body"><div class="funnel">${funnelHtml(stages(b))}</div></div></div>
    </div>

    <div class="section"><div class="card"><div class="card-head"><h2>По одинаковым источникам</h2><span class="hint">сравнение честное, когда трафик одинаковый</span></div><div class="card-body"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Источник</th><th class="num">А: открыли</th><th class="num">А: оплаты</th><th class="num">А: конверсия</th><th class="num">Б: открыли</th><th class="num">Б: оплаты</th><th class="num">Б: конверсия</th></tr></thead>
      <tbody>${d.sources.length ? d.sources.map(s => `<tr><td><b>${esc(s.source)}</b></td><td class="num">${fmtNum(s.a.visits)}</td><td class="num">${fmtNum(s.a.paid)}</td><td class="num">${share(s.a.paid, s.a.visits, 2)}</td><td class="num">${fmtNum(s.b.visits)}</td><td class="num">${fmtNum(s.b.paid)}</td><td class="num">${share(s.b.paid, s.b.visits, 2)}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty">Нет данных за период</div></td></tr>'}</tbody>
    </table></div></div></div></div>
    <p class="muted" style="font-size:12.5px">${esc(AB_NOTE)}</p>`
}
