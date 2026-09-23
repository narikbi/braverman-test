import { esc, fmtDelta } from '../format'

export function kpiCard(label: string, value: string, cur: number, prev: number, sub = ''): string {
  const d = fmtDelta(cur, prev)
  const arrow = d.dir === 'up' ? '↑' : d.dir === 'down' ? '↓' : '·'
  return `<div class="card kpi">
    <div class="label">${esc(label)}</div>
    <div class="value">${esc(value)}</div>
    <span class="delta ${d.dir}">${arrow} ${esc(d.text)}</span>
    ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
  </div>`
}

export function kpiSkeleton(n = 6): string {
  return Array.from({ length: n }, () => `<div class="card kpi"><div class="skel" style="width:60%"></div><div class="skel" style="width:40%;height:28px;margin-top:10px"></div></div>`).join('')
}
