// Тренеры: список со статистикой за период, карточка тренера (KPI, воронка, ссылка, клиенты).
import { adminGet, ApiError } from '../api'
import { rangeParams, META } from '../state'
import { esc, fmtMoney, fmtNum, fmtDateFull, fmtPhone } from '../format'
import { toast } from '../components/toast'
import { kpiSkeleton } from '../components/kpi'
import { openTrainerDialog, type TrainerRow } from './trainer-dialog'
import { kpiCards, funnelHtml, type Kpi } from './dashboard'
import { renderAttempts } from './attempts'
import { dbMissing } from './shared'

type Stats = { rows: { id: number; code: string; name: string; active: boolean; visits: number; started: number; finished: number; paid: number; revenue: number }[]; unknown: { code: string; visits: number; started: number }[] }
type Detail = { trainer: TrainerRow; link: string; kpi: Kpi; prev: Kpi; funnel: { key: string; label: string; count: number }[] }

export async function renderTrainers(page: HTMLElement) {
  page.innerHTML = `<div class="card"><div class="card-body">
    <div class="toolbar"><span class="muted" style="font-size:13px">Ссылка тренера: <code>${esc(META.site)}/t/&lt;код&gt;</code></span><button class="btn btn-primary" id="add">＋ Добавить тренера</button></div>
    <div id="tbl"><div class="skel" style="height:120px"></div></div></div></div>`
  page.querySelector('#add')!.addEventListener('click', () => openTrainerDialog(null, () => load()))
  const load = async () => {
    try {
      const [list, stats] = await Promise.all([adminGet<{ items: TrainerRow[] }>('trainers'), adminGet<Stats>('trainers-stats', rangeParams())])
      const byId = new Map(stats.rows.map(r => [r.id, r]))
      const rows = list.items
      page.querySelector('#tbl')!.innerHTML = `<div class="table-wrap"><table class="tbl cards">
        <thead><tr><th>Тренер</th><th>Код / ссылка</th><th>Кабинет</th><th class="num">Открыли</th><th class="num">Начали</th><th class="num">Закончили</th><th class="num">Оплаты</th><th class="num">Выручка</th></tr></thead>
        <tbody>${rows.length ? rows.map(t => { const s = byId.get(t.id); return `<tr class="row" data-id="${t.id}">
          <td data-l="Тренер"><b>${esc(t.name)}</b>${t.active ? '' : ' <span class="chip">выкл</span>'}<br /><span class="muted" style="font-size:12px">${fmtPhone(t.phone)}</span></td>
          <td data-l="Код"><code>${esc(t.code)}</code> <button class="btn btn-sm copy" data-link="${esc(META.site)}/t/${esc(t.code)}">Копировать ссылку</button></td>
          <td data-l="Кабинет">${t.login ? `${esc(t.login)}${t.has_password ? '' : ' <span class="chip">без пароля</span>'}` : '<span class="muted">нет</span>'}</td>
          <td class="num" data-l="Открыли">${fmtNum(s?.visits ?? 0)}</td><td class="num" data-l="Начали">${fmtNum(s?.started ?? 0)}</td><td class="num" data-l="Закончили">${fmtNum(s?.finished ?? 0)}</td>
          <td class="num" data-l="Оплаты"><b>${fmtNum(s?.paid ?? 0)}</b></td><td class="num" data-l="Выручка">${fmtMoney(s?.revenue ?? 0)}</td></tr>` }).join('') : `<tr><td colspan="8"><div class="empty">Тренеров пока нет — добавьте первого</div></td></tr>`}
        ${stats.unknown.length ? `<tr><td colspan="8" class="muted" style="font-size:12.5px">Неизвестные коды в ссылках за период: ${stats.unknown.map(u => `<code>${esc(u.code)}</code> (${u.visits})`).join(', ')}</td></tr>` : ''}</tbody></table></div>`
      page.querySelectorAll<HTMLElement>('tr.row').forEach(tr => tr.addEventListener('click', e => { if ((e.target as HTMLElement).closest('.copy')) return; location.hash = `#/trainers/${tr.dataset.id}` }))
      page.querySelectorAll<HTMLElement>('.copy').forEach(b => b.addEventListener('click', () => navigator.clipboard.writeText(b.dataset.link!).then(() => toast('Ссылка скопирована'))))
    } catch (e) {
      if (e instanceof ApiError && e.code === 'db_not_configured') return dbMissing(page)
      throw e
    }
  }
  await load()
}

export async function renderTrainer(page: HTMLElement, id: number) {
  page.innerHTML = `<div class="section grid grid-kpi" id="kpis">${kpiSkeleton(6)}</div>`
  let d: Detail
  try { d = await adminGet<Detail>('trainer', { id, ...rangeParams() }) } catch { page.innerHTML = '<div class="card"><div class="empty">Тренер не найден</div></div>'; return }
  const t = d.trainer
  document.querySelector('.head h1')!.textContent = t.name
  document.querySelector('.head .sub')?.remove()
  page.innerHTML = `
    <div class="section"><div class="card"><div class="card-body">
      <div class="row-actions" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div><b style="font-size:16px">${esc(t.name)}</b>${t.active ? '' : ' <span class="chip">выключен</span>'} <span class="muted">· ${fmtPhone(t.phone)} · с ${fmtDateFull(t.created_at)}</span>${t.login ? `<br /><span class="muted" style="font-size:12.5px">кабинет: ${esc(t.login)} · последний вход ${fmtDateFull(t.last_login_at)}</span>` : '<br /><span class="muted" style="font-size:12.5px">кабинет не настроен</span>'}</div>
        <button class="btn btn-sm" id="edit">Редактировать</button>
      </div>
      <div class="copy-box" style="margin-top:12px"><span>🔗</span><code>${esc(d.link)}</code><button class="btn btn-sm" id="copy">Копировать</button></div>
      ${t.notes ? `<div class="muted" style="font-size:13px;margin-top:8px">${esc(t.notes)}</div>` : ''}
    </div></div></div>
    <div class="section grid grid-kpi" id="kpis">${kpiCards(d.kpi, d.prev)}</div>
    <div class="section grid grid-2">
      <div class="card"><div class="card-head"><h2>Воронка</h2></div><div class="card-body"><div class="funnel">${funnelHtml(d.funnel)}</div></div></div>
    </div>
    <div class="section" id="clients"></div>`
  page.querySelector('#copy')!.addEventListener('click', () => navigator.clipboard.writeText(d.link).then(() => toast('Ссылка скопирована')))
  page.querySelector('#edit')!.addEventListener('click', () => openTrainerDialog(t, () => renderTrainer(page, id)))
  await renderAttempts(page.querySelector('#clients')!, id)
}
