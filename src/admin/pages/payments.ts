import { adminGet, ApiError } from '../api'
import { rangeParams } from '../state'
import { esc, fmtDate, fmtMoney, fmtPhone } from '../format'
import { renderTable, type TableState } from '../components/table'
import { navigate } from '../router'
import { dbMissing } from './shared'

type Pay = Record<string, unknown> & { id: number; invoice_id: string; provider: string; phone: string; amount: string | null; status: string; source: string | null; link_sent: boolean | null; created_at: string; paid_at: string | null; attempt_id: number | null; attempt_name: string | null }
const st: TableState & { status: string } = { sort: 'created_at', dir: 'desc', page: 1, limit: 25, status: '' }
const PAY_ST: Record<string, string> = { pending: 'Ожидает', paid: 'Оплачен', cancelled: 'Отменён', expired: 'Истёк', error: 'Ошибка' }
const PROVIDER: Record<string, string> = { kpa: 'Kaspi', manual: 'вручную', sim: 'демо' }

export async function renderPayments(page: HTMLElement) {
  page.innerHTML = `<div class="card"><div class="card-body">
    <div class="toolbar"><select class="input" id="status"><option value="">Все счета</option>${Object.entries(PAY_ST).map(([k, v]) => `<option value="${k}" ${st.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div id="tbl"><div class="skel" style="height:120px"></div></div></div></div>`
  const tbl = page.querySelector<HTMLElement>('#tbl')!
  const load = async () => {
    try {
      const data = await adminGet<{ items: Pay[]; total: number }>('payments', { ...rangeParams(), status: st.status, page: st.page, limit: st.limit })
      renderTable<Pay>(tbl, [
        { key: 'created_at', label: 'Создан', render: r => `<span class="muted">${fmtDate(r.created_at)}</span>` },
        { key: 'invoice_id', label: 'Счёт', render: r => `<span class="chip">${esc(PROVIDER[r.provider] || r.provider)}</span> #${esc(r.invoice_id)}` },
        { key: 'attempt_name', label: 'Клиент', render: r => `<b>${esc(r.attempt_name || '—')}</b><br /><span class="muted">${fmtPhone(r.phone)}</span>` },
        { key: 'amount', label: 'Сумма', num: true, render: r => `<b>${fmtMoney(r.amount)}</b>` },
        { key: 'status', label: 'Статус', render: r => `<span class="badge badge-${esc(r.status)}">${esc(PAY_ST[r.status] || r.status)}</span>` },
        { key: 'paid_at', label: 'Оплачен', render: r => r.paid_at ? `${fmtDate(r.paid_at)} <span class="muted">${esc(r.source || '')}${r.link_sent === false ? ' · WA ✗' : r.link_sent ? ' · WA ✓' : ''}</span>` : '<span class="muted">—</span>' }
      ], data.items, data.total, st, s => { Object.assign(st, s); load() }, r => { if (r.attempt_id) navigate(`#/attempts/${r.attempt_id}`) }, 'Счетов за период нет')
    } catch (e) {
      if (e instanceof ApiError && e.code === 'db_not_configured') return dbMissing(page)
      throw e
    }
  }
  page.querySelector<HTMLSelectElement>('#status')!.addEventListener('change', e => { st.status = (e.target as HTMLSelectElement).value; st.page = 1; load() })
  await load()
}
