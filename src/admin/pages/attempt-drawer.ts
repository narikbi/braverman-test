// Карточка прохождения: баллы, ответы по блокам, оплаты, события, действия (только админ).
import { adminGet, adminPost } from '../api'
import { isAdmin } from '../state'
import { esc, fmtDateFull, fmtPhone, fmtMoney, fmtLang, fmtNeuro, fmtCombo, NEURO_COLORS, EVENT_LABELS } from '../format'
import { toast } from '../components/toast'
import { badge } from './attempts'
import { CONTENT, type Lang } from '../../content'
import { fmtBlocked } from '../format'
import { NEURO_ORDER, neuroAt, questionIndexAt, QUESTIONS_PER_BLOCK } from '../../../shared/scoring'

type Attempt = {
  id: number; name: string; phone: string | null; lang: Lang; status: string; answered: number; notes?: string
  answers: number[] | null; dopamine: number | null; acetylcholine: number | null; gaba: number | null; serotonin: number | null
  dominant: string | null; lowest: string | null; combo: string | null; paid_by: string | null
  utm: Record<string, string>; referrer: string | null; landing: string | null; trainer_code: string | null
  created_at: string; finished_at: string | null; checkout_at: string | null; paid_at: string | null
  invoice_id: string | null; invoice_error?: string | null; test_amount: number | null; retake_of?: number | null
}
type Payment = { invoice_id: string; provider: string; amount: string | null; status: string; source: string | null; link_sent: boolean | null; created_at: string; paid_at: string | null }
type Ev = { ts: string; type: string; step: number | null; props: Record<string, unknown> }
type Detail = { attempt: Attempt; payments: Payment[]; events: Ev[]; trainer: { id: number; name: string; code: string } | null; resultLink: string | null }

export async function openAttemptDrawer(id: number, onClose: () => void) {
  const bg = document.createElement('div'); bg.className = 'drawer-bg'
  const dr = document.createElement('div'); dr.className = 'drawer'
  dr.innerHTML = `<div class="drawer-head"><h2>Прохождение #${id}</h2><button class="close" id="dr-close">×</button></div><div class="drawer-body"><div class="skel" style="height:60px"></div><div class="skel"></div><div class="skel" style="width:70%"></div></div>`
  document.body.append(bg, dr)
  requestAnimationFrame(() => { bg.classList.add('show'); dr.classList.add('show') })
  const close = () => { bg.classList.remove('show'); dr.classList.remove('show'); setTimeout(() => { bg.remove(); dr.remove() }, 250); onClose() }
  bg.addEventListener('click', close)
  dr.querySelector('#dr-close')!.addEventListener('click', close)
  const esc_ = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc_) } }
  document.addEventListener('keydown', esc_)

  let d: Detail
  try { d = await adminGet<Detail>('attempt', { id }) } catch { dr.querySelector('.drawer-body')!.innerHTML = `<div class="empty">Прохождение не найдено</div>`; return }
  const a = d.attempt
  const body = dr.querySelector<HTMLElement>('.drawer-body')!
  const max = QUESTIONS_PER_BLOCK
  const scores = NEURO_ORDER.map(k => ({ k, v: a[k] as number | null }))
  const digits = (a.phone || '').replace(/\D/g, '')

  body.innerHTML = `
    <div>
      <div style="font-size:20px;font-weight:800">${esc(a.name || 'Без имени')}</div>
      <div class="row-actions" style="margin-top:6px">${badge(a.status)}${a.status === 'started' ? `<span class="chip">${a.answered}/200</span>` : ''}${a.test_amount ? '<span class="chip">тестовый счёт</span>' : ''}${a.paid_by === 'admin' ? '<span class="chip">выдано вручную</span>' : ''}
        ${digits && !a.phone!.includes('•') ? `<a class="btn btn-sm" href="https://wa.me/${digits}" target="_blank" rel="noopener">WhatsApp</a><a class="btn btn-sm" href="tel:+${digits}">Позвонить</a>` : ''}</div>
    </div>
    <div class="kv">
      <span class="k">Телефон</span><span class="v">${fmtPhone(a.phone)}</span>
      <span class="k">Язык</span><span class="v">${fmtLang(a.lang)}</span>
      <span class="k">Тренер</span><span class="v">${d.trainer ? `<a href="#/trainers/${d.trainer.id}">${esc(d.trainer.name)}</a> <span class="muted">(${esc(d.trainer.code)})</span>` : a.trainer_code ? `<span class="muted">неизвестный код: ${esc(a.trainer_code)}</span>` : '—'}</span>
      <span class="k">Источник</span><span class="v">${esc(a.utm?.utm_source || '(прямой)')}${a.utm?.utm_medium ? ` · ${esc(a.utm.utm_medium)}` : ''}${a.utm?.utm_campaign ? ` · ${esc(a.utm.utm_campaign)}` : ''}${a.utm?.utm_content ? ` · ${esc(a.utm.utm_content)}` : ''}</span>
      ${a.referrer ? `<span class="k">Реферер</span><span class="v muted" style="word-break:break-all">${esc(a.referrer)}</span>` : ''}
      ${a.landing ? `<span class="k">Лендинг</span><span class="v muted" style="word-break:break-all">${esc(a.landing)}</span>` : ''}
      <span class="k">Начал</span><span class="v">${fmtDateFull(a.created_at)}</span>
      <span class="k">Закончил</span><span class="v">${fmtDateFull(a.finished_at)}</span>
      <span class="k">Чекаут</span><span class="v">${fmtDateFull(a.checkout_at)}</span>
      ${isAdmin() ? `<span class="k">Счёт</span><span class="v">${a.invoice_id ? `Kaspi #${esc(a.invoice_id)}` : (a.invoice_error ? `<span style="color:var(--a-red)">не выставлен: ${esc(a.invoice_error.slice(0, 80))}</span>` : '—')}</span>` : ''}
      <span class="k">Оплата</span><span class="v">${a.paid_at ? `<span style="color:var(--a-green)">${fmtDateFull(a.paid_at)}</span>` : '—'}</span>
    </div>

    ${a.dominant ? `<div class="card" style="box-shadow:none"><div class="card-head"><h2>Результат</h2><span class="hint">${esc(fmtCombo(a.combo))}</span></div><div class="card-body">
      <div class="scores">${scores.map(s => `<div class="score-row"><span class="lbl">${esc(fmtNeuro(s.k))}</span><div class="bar"><i style="width:${((s.v ?? 0) / max) * 100}%;background:${NEURO_COLORS[s.k]}"></i></div><span class="num">${s.v ?? '—'} / ${max}</span></div>`).join('')}</div>
      ${fmtBlocked(a) ? `<div class="warn-box">⚠️ <b>Заблокированность отделов</b>: ${esc(fmtBlocked(a))}. Клиенту на странице результата предложена бесплатная пересдача.</div>` : ''}
      ${a.retake_of ? `<div class="muted" style="margin-top:8px;font-size:13px">🔁 Бесплатная пересдача прохождения <a href="#/attempts/${a.retake_of}">#${a.retake_of}</a></div>` : ''}
      <div class="kv" style="margin-top:12px"><span class="k">Доминанта</span><span class="v"><b>${esc(fmtNeuro(a.dominant))}</b></span><span class="k">Минимум</span><span class="v">${esc(fmtNeuro(a.lowest))}</span><span class="k">Видео</span><span class="v">${esc(fmtCombo(a.combo))}</span></div>
      <div id="access-box" style="margin-top:12px">
        ${d.resultLink ? `<div class="copy-box"><span>🔗</span><code>${esc(d.resultLink)}</code><button class="btn btn-sm" id="copy-link">Копировать</button></div>
          <div class="row-actions" style="margin-top:8px"><a class="btn btn-sm" href="${esc(d.resultLink)}" target="_blank" rel="noopener">Открыть результат</a>${isAdmin() && a.phone ? '<button class="btn btn-sm" id="resend-link">Отправить ссылку в WhatsApp ещё раз</button>' : ''}</div>`
        : isAdmin() ? `<div class="card" style="box-shadow:none;border-style:dashed"><div class="card-body">
            <div style="font-weight:700;margin-bottom:6px">Оплата вне сайта?</div>
            <div class="muted" style="font-size:13px;margin-bottom:10px">Выдать результат вручную: прохождение станет «Оплачено», появится ссылка.</div>
            <div class="row-actions"><button class="btn btn-primary btn-sm" id="grant-send">Выдать и отправить в WhatsApp</button><button class="btn btn-sm" id="grant-only">Только ссылка</button></div>
          </div></div>` : '<div class="muted" style="font-size:13px">Результат не оплачен</div>'}
      </div>
    </div></div>` : ''}

    ${isAdmin() ? `<div class="card" style="box-shadow:none"><div class="card-head"><h2>Заметки</h2></div><div class="card-body" style="display:flex;flex-direction:column;gap:10px">
      <textarea class="input" id="notes" placeholder="Заметка: о чём говорили, договорённости…">${esc(a.notes || '')}</textarea>
      <div class="row-actions"><button class="btn btn-primary" id="save">Сохранить</button><span class="muted" id="saved" style="font-size:12.5px"></span></div>
    </div></div>` : ''}

    ${a.answers?.length ? `<div class="card" style="box-shadow:none"><div class="card-head"><h2>Ответы</h2><span class="hint">Да = 1</span></div><div class="card-body">${answersHtml(a)}</div></div>` : ''}

    ${d.payments.length ? `<div class="card" style="box-shadow:none"><div class="card-head"><h2>Счета</h2></div><div class="card-body" style="display:flex;flex-direction:column;gap:8px">${d.payments.map(p => `<div class="row-actions" style="justify-content:space-between"><span><b>${fmtMoney(p.amount)}</b> <span class="muted">${esc(p.provider === 'kpa' ? 'Kaspi' : p.provider)} #${esc(p.invoice_id)}</span></span><span class="badge badge-${esc(p.status)}">${esc(p.status)}</span><span class="muted" style="font-size:12px">${fmtDateFull(p.paid_at || p.created_at)}${p.source ? ` · ${esc(p.source)}` : ''}${p.link_sent === false ? ' · WA ✗' : p.link_sent ? ' · WA ✓' : ''}</span></div>`).join('')}</div></div>` : ''}

    <div class="card" style="box-shadow:none"><div class="card-head"><h2>История</h2><span class="hint">${d.events.length} событий</span></div><div class="card-body"><div class="timeline">
      ${d.events.length ? d.events.map(e => `<div class="tl ${e.type === 'paid' ? 'paid' : e.type.includes('fail') ? 'warn' : ''}"><b>${esc(EVENT_LABELS[e.type] || e.type)}${e.step ? ` ${e.step}` : ''}</b><span class="t">${fmtDateFull(e.ts)}</span>${evDetail(e)}</div>`).join('') : '<div class="muted">Событий пока нет</div>'}
    </div></div></div>`

  body.querySelector('#copy-link')?.addEventListener('click', () => { navigator.clipboard.writeText(d.resultLink!).then(() => toast('Ссылка скопирована')) })
  const grant = async (action: 'attempt-grant' | 'attempt-resend', send: boolean) => {
    if (action === 'attempt-grant' && !confirm(send ? 'Выдать результат и отправить ссылку в WhatsApp?' : 'Выдать результат (без отправки)?')) return
    try {
      const r = await adminPost<{ link: string; waSent: boolean }>(action, { id, send })
      body.querySelector('#access-box')!.innerHTML = `<div class="copy-box"><span>🔗</span><code>${esc(r.link)}</code><button class="btn btn-sm" id="copy-link2">Копировать</button></div>
        <div class="muted" style="font-size:12.5px;margin-top:6px">${send ? (r.waSent ? 'Отправлено в WhatsApp ✓' : '<span style="color:var(--a-red)">WhatsApp не доставлен — перешли ссылку вручную</span>') : 'Ссылка готова — перешли клиенту.'}</div>`
      body.querySelector('#copy-link2')!.addEventListener('click', () => { navigator.clipboard.writeText(r.link).then(() => toast('Ссылка скопирована')) })
      toast(action === 'attempt-grant' ? 'Результат выдан' : 'Ссылка отправлена')
    } catch { toast('Не получилось', 'err') }
  }
  body.querySelector('#grant-send')?.addEventListener('click', () => grant('attempt-grant', true))
  body.querySelector('#grant-only')?.addEventListener('click', () => grant('attempt-grant', false))
  body.querySelector('#resend-link')?.addEventListener('click', () => grant('attempt-resend', true))
  body.querySelector('#save')?.addEventListener('click', async () => {
    const btn = body.querySelector<HTMLButtonElement>('#save')!
    btn.disabled = true
    try {
      await adminPost('attempt-update', { id, notes: (body.querySelector('#notes') as HTMLTextAreaElement).value })
      toast('Сохранено')
      body.querySelector('#saved')!.textContent = 'сохранено ✓'
    } catch { toast('Не удалось сохранить', 'err') }
    btn.disabled = false
  })
}

function answersHtml(a: Attempt): string {
  const c = CONTENT[a.lang] || CONTENT.ru
  const groups: Record<string, string[]> = { dopamine: [], acetylcholine: [], gaba: [], serotonin: [] }
  a.answers!.forEach((v, i) => {
    const k = neuroAt(i)
    groups[k].push(`<div class="a ${v ? 'yes' : ''}"><span>${esc(c.questions[k][questionIndexAt(i)])}</span><span>${v ? 'Да' : 'Нет'}</span></div>`)
  })
  return NEURO_ORDER.map(k => `<details class="ans-group"><summary><b style="color:${NEURO_COLORS[k]}">${esc(fmtNeuro(k))}</b> <span class="muted">${a[k] ?? 0} / ${QUESTIONS_PER_BLOCK}</span></summary><div class="answers">${groups[k].join('')}</div></details>`).join('')
}

function evDetail(e: Ev): string {
  const p = e.props || {}
  const parts: string[] = []
  if (p.amount) parts.push(`${p.amount} ₸`)
  if (p.provider) parts.push(String(p.provider))
  if (p.source) parts.push(String(p.source))
  if (p.dominant) parts.push(fmtNeuro(String(p.dominant)))
  if (p.reason) parts.push(String(p.reason))
  if (p.error) parts.push(String(p.error).slice(0, 80))
  if (p.waSent === false) parts.push('WhatsApp не доставлен')
  return parts.length ? `<div class="d">${parts.map(esc).join(' · ')}</div>` : ''
}
