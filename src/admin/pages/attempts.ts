import { adminGet, ApiError } from '../api'
import { rangeParams, META, isAdmin, statusLabel } from '../state'
import { esc, fmtDate, fmtPhone, fmtLang, fmtNeuro, fmtCombo } from '../format'
import { renderTable, type TableState } from '../components/table'
import { navigate } from '../router'
import { toast } from '../components/toast'
import { dbMissing } from './shared'

export type Attempt = Record<string, unknown> & {
  id: number; name: string; phone: string | null; lang: string; status: string; answered: number; dominant: string | null; combo: string | null
  source: string | null; campaign: string | null; created_at: string; paid_at: string | null; test_amount: number | null; trainer_name: string | null; trainer_code: string | null; trainer_id: number | null
}
type List = { items: Attempt[]; total: number }
type Trainer = { id: number; name: string; code: string }

const st: TableState & { q: string; status: string; trainer: string; lang: string } = { sort: 'created_at', dir: 'desc', page: 1, limit: 25, q: '', status: '', trainer: '', lang: '' }
let debounce: number | undefined

export const badge = (s: string) => `<span class="badge badge-${esc(s)}">${esc(statusLabel(s))}</span>`

export async function renderAttempts(page: HTMLElement, fixedTrainer?: number) {
  if (fixedTrainer) st.trainer = String(fixedTrainer)
  const trainers = isAdmin() && !fixedTrainer ? await adminGet<{ items: Trainer[] }>('trainers').then(r => r.items).catch(() => [] as Trainer[]) : []
  page.innerHTML = `
    <div class="card" id="attempts-page"><div class="card-body">
      <div class="toolbar">
        <input class="input search" id="q" placeholder="Поиск по имени или телефону" value="${esc(st.q)}" />
        <select class="input" id="status">
          <option value="">Все статусы</option>
          ${META.statuses.map(s => `<option value="${s.key}" ${st.status === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
        </select>
        <select class="input" id="lang"><option value="">Любой язык</option><option value="ru" ${st.lang === 'ru' ? 'selected' : ''}>Русский</option><option value="kk" ${st.lang === 'kk' ? 'selected' : ''}>Қазақша</option></select>
        ${trainers.length ? `<select class="input" id="trainer"><option value="">Все тренеры</option>${trainers.map(t => `<option value="${t.id}" ${st.trainer === String(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : ''}
        <button class="btn" id="export">⬇ CSV</button>
      </div>
      <div id="tbl"><div class="skel" style="height:120px"></div></div>
    </div></div>`
  const tbl = page.querySelector<HTMLElement>('#tbl')!
  const load = async () => {
    try {
      const data = await adminGet<List>('attempts', { ...rangeParams(), q: st.q, status: st.status, trainer: st.trainer, lang: st.lang, sort: st.sort, dir: st.dir, page: st.page, limit: st.limit })
      renderTable<Attempt>(tbl, [
        { key: 'created_at', label: 'Дата', sortable: true, render: r => `<span class="muted">${fmtDate(r.created_at)}</span>` },
        { key: 'name', label: 'Имя', sortable: true, render: r => `<b>${esc(r.name || '—')}</b><br /><span class="muted" style="font-size:12px">${fmtLang(r.lang)}</span>` },
        { key: 'phone', label: 'Телефон', render: r => fmtPhone(r.phone) },
        { key: 'status', label: 'Статус', sortable: true, render: r => badge(r.status) + (r.status === 'started' ? ` <span class="muted" style="font-size:12px">${r.answered}/200</span>` : '') + (r.test_amount ? ' <span class="chip">тест</span>' : '') },
        { key: 'dominant', label: 'Доминанты', sortable: true, render: r => r.dominant ? `<b>${esc(r.combo ? fmtCombo(r.combo) : fmtNeuro(r.dominant))}</b>` : '<span class="muted">—</span>' },
        ...(isAdmin() && !fixedTrainer ? [{ key: 'trainer_name', label: 'Тренер', render: (r: Attempt) => r.trainer_name ? esc(r.trainer_name) : r.trainer_code ? `<span class="muted">${esc(r.trainer_code)}?</span>` : '<span class="muted">—</span>' }] : []),
        { key: 'source', label: 'Источник', render: r => `<span class="muted">${esc(r.source || (r.trainer_code ? 'тренер' : '—'))}${r.campaign ? ` · ${esc(r.campaign)}` : ''}</span>` },
        { key: 'paid_at', label: 'Оплата', sortable: true, render: r => r.paid_at ? `<span style="color:var(--a-green);font-weight:700">${fmtDate(r.paid_at)}</span>` : '<span class="muted">—</span>' }
      ], data.items, data.total, st, s => { Object.assign(st, s); load() }, r => navigate(`#/attempts/${r.id}`), 'Прохождений за период нет')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'db_not_configured') return dbMissing(page)
      throw e
    }
  }
  page.querySelector<HTMLInputElement>('#q')!.addEventListener('input', e => {
    clearTimeout(debounce)
    debounce = window.setTimeout(() => { st.q = (e.target as HTMLInputElement).value.trim(); st.page = 1; load() }, 300)
  })
  page.querySelector<HTMLSelectElement>('#status')!.addEventListener('change', e => { st.status = (e.target as HTMLSelectElement).value; st.page = 1; load() })
  page.querySelector<HTMLSelectElement>('#lang')!.addEventListener('change', e => { st.lang = (e.target as HTMLSelectElement).value; st.page = 1; load() })
  page.querySelector<HTMLSelectElement>('#trainer')?.addEventListener('change', e => { st.trainer = (e.target as HTMLSelectElement).value; st.page = 1; load() })
  page.querySelector('#export')!.addEventListener('click', async () => {
    try {
      const r = await adminGet<{ filename: string; csv: string }>('export', { ...rangeParams(), q: st.q, status: st.status, trainer: st.trainer, lang: st.lang })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }))
      a.download = r.filename
      a.click()
      URL.revokeObjectURL(a.href)
    } catch { toast('Не удалось выгрузить', 'err') }
  })
  await load()
}
