// Универсальная таблица: колонки, сортировка, пагинация; на мобильном — карточки.
import { esc } from '../format'

export type Column<T> = { key: string; label: string; num?: boolean; sortable?: boolean; render?: (row: T) => string }
export type TableState = { sort: string; dir: 'asc' | 'desc'; page: number; limit: number }

export function renderTable<T extends Record<string, unknown>>(
  el: HTMLElement,
  cols: Column<T>[],
  rows: T[],
  total: number,
  st: TableState,
  onChange: (st: TableState) => void,
  onRow?: (row: T) => void,
  emptyText = 'Пока пусто'
) {
  const pages = Math.max(1, Math.ceil(total / st.limit))
  el.innerHTML = `
    <div class="table-wrap"><table class="tbl cards">
      <thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''} ${c.sortable ? 'sortable' : ''}" data-k="${c.key}">${esc(c.label)}${st.sort === c.key ? `<span class="arrow">${st.dir === 'asc' ? '↑' : '↓'}</span>` : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.length ? rows.map((r, i) => `<tr class="row" data-i="${i}">${cols.map(c => `<td class="${c.num ? 'num' : ''}" data-l="${esc(c.label)}">${c.render ? c.render(r) : esc(r[c.key] as string)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}"><div class="empty">${esc(emptyText)}</div></td></tr>`}</tbody>
    </table></div>
    <div class="pager">
      <span>${total ? `${(st.page - 1) * st.limit + 1}–${Math.min(total, st.page * st.limit)} из ${total}` : ''}</span>
      <div class="btns">
        <button class="btn btn-sm" id="pg-prev" ${st.page <= 1 ? 'disabled' : ''}>←</button>
        <span style="padding:6px 4px">${st.page} / ${pages}</span>
        <button class="btn btn-sm" id="pg-next" ${st.page >= pages ? 'disabled' : ''}>→</button>
      </div>
    </div>`
  el.querySelectorAll<HTMLElement>('th.sortable').forEach(th => th.addEventListener('click', () => {
    const k = th.dataset.k!
    onChange({ ...st, sort: k, dir: st.sort === k && st.dir === 'desc' ? 'asc' : 'desc', page: 1 })
  }))
  el.querySelector('#pg-prev')!.addEventListener('click', () => onChange({ ...st, page: st.page - 1 }))
  el.querySelector('#pg-next')!.addEventListener('click', () => onChange({ ...st, page: st.page + 1 }))
  if (onRow) el.querySelectorAll<HTMLElement>('tr.row').forEach(tr => tr.addEventListener('click', () => onRow(rows[Number(tr.dataset.i)])))
}
