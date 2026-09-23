// Диалог «Добавить / редактировать тренера»: имя, код ссылки, телефон, кабинет (логин + пароль), заметки.
import { adminPost, ApiError } from '../api'
import { esc } from '../format'
import { toast } from '../components/toast'
import { META } from '../state'

export type TrainerRow = { id: number; created_at: string; code: string; name: string; phone: string; active: boolean; notes: string; login: string | null; has_password: boolean; last_login_at: string | null }

const ERR: Record<string, string> = { code: 'Код: 2–32 символа, латиница/цифры/дефис/подчёркивание', code_taken: 'Такой код уже занят', login_taken: 'Такой логин уже занят', login: 'Логин: 3–64 символа, латиница/цифры/точка/@', fields: 'Заполните имя и код', password: 'Пароль — минимум 6 символов' }

export function openTrainerDialog(t: TrainerRow | null, onDone: () => void) {
  const bg = document.createElement('div'); bg.className = 'drawer-bg'
  const dr = document.createElement('div'); dr.className = 'drawer'
  const lbl = (s: string) => `<label style="font-size:12.5px;font-weight:600;color:var(--a-text-2)">${s}</label>`
  dr.innerHTML = `
    <div class="drawer-head"><h2>${t ? 'Тренер' : 'Новый тренер'}</h2><button class="close" id="t-close">×</button></div>
    <div class="drawer-body">
      <div>${lbl('Имя')}<input class="input" id="t-name" value="${esc(t?.name || '')}" placeholder="Айгерім Сериккызы" /></div>
      <div>${lbl('Код ссылки')}<input class="input" id="t-code" value="${esc(t?.code || '')}" placeholder="aigerim" /><div class="muted" style="font-size:12px;margin-top:4px">Ссылка: <code id="t-link">${esc(META.site)}/t/${esc(t?.code || '…')}</code></div></div>
      <div>${lbl('Телефон')}<input class="input" id="t-phone" type="tel" value="${esc(t?.phone || '')}" placeholder="+7 7__ ___ __ __" /></div>
      <div class="card" style="box-shadow:none"><div class="card-head"><h2>Кабинет тренера</h2></div><div class="card-body" style="display:flex;flex-direction:column;gap:10px">
        <div class="muted" style="font-size:12.5px">Тренер входит на <code>${esc(META.site)}/admin</code> и видит только своих клиентов.</div>
        <div>${lbl('Логин')}<input class="input" id="t-login" value="${esc(t?.login || '')}" placeholder="aigerim" autocomplete="off" /></div>
        <div>${lbl(t?.has_password ? 'Новый пароль (пусто — не менять)' : 'Пароль')}<input class="input" id="t-pass" type="text" autocomplete="new-password" placeholder="минимум 6 символов" /></div>
      </div></div>
      <div>${lbl('Заметки')}<textarea class="input" id="t-notes" placeholder="город, условия, договорённости…">${esc(t?.notes || '')}</textarea></div>
      ${t ? `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="t-active" ${t.active ? 'checked' : ''} /> Ссылка активна (клиенты засчитываются тренеру)</label>` : ''}
      <div class="field-error" id="t-err" style="display:none;color:var(--a-red);font-weight:600"></div>
      <div class="row-actions"><button class="btn btn-primary" id="t-save">${t ? 'Сохранить' : 'Создать'}</button></div>
    </div>`
  document.body.append(bg, dr)
  requestAnimationFrame(() => { bg.classList.add('show'); dr.classList.add('show') })
  const close = () => { bg.classList.remove('show'); dr.classList.remove('show'); setTimeout(() => { bg.remove(); dr.remove() }, 250) }
  bg.addEventListener('click', close)
  dr.querySelector('#t-close')!.addEventListener('click', close)
  const v = (id: string) => (dr.querySelector(id) as HTMLInputElement).value
  dr.querySelector('#t-code')!.addEventListener('input', () => { dr.querySelector('#t-link')!.textContent = `${META.site}/t/${v('#t-code').trim().toLowerCase() || '…'}` })
  const err = dr.querySelector<HTMLElement>('#t-err')!

  dr.querySelector('#t-save')!.addEventListener('click', async () => {
    err.style.display = 'none'
    const btn = dr.querySelector<HTMLButtonElement>('#t-save')!
    btn.disabled = true
    const body: Record<string, unknown> = { name: v('#t-name').trim(), code: v('#t-code').trim().toLowerCase(), phone: v('#t-phone').trim(), notes: v('#t-notes'), login: v('#t-login').trim().toLowerCase() }
    const pass = v('#t-pass')
    try {
      let id = t?.id
      if (t) {
        body.id = t.id
        body.active = (dr.querySelector('#t-active') as HTMLInputElement).checked
        await adminPost('trainer-update', body)
      } else {
        if (pass) body.password = pass
        id = (await adminPost<{ trainer: TrainerRow }>('trainer-create', body)).trainer.id
      }
      if (t && pass) await adminPost('trainer-password', { id, password: pass })
      toast(t ? 'Сохранено' : 'Тренер добавлен')
      close()
      onDone()
    } catch (e) {
      err.style.display = 'block'
      err.textContent = e instanceof ApiError ? (ERR[e.code] || 'Не удалось сохранить') : 'Не удалось сохранить'
      btn.disabled = false
    }
  })
  setTimeout(() => (dr.querySelector('#t-name') as HTMLInputElement).focus(), 300)
}
