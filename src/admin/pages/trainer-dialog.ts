// Диалог «Добавить / редактировать тренера»: имя, код ссылки, телефон, кабинет (логин + пароль), заметки.
import { adminGet, adminPost, ApiError } from '../api'
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
      <div>${lbl('Код ссылки')}<input class="input" id="t-code" value="${esc(t?.code || '')}" placeholder="aigerim" /><div class="muted" style="font-size:12px;margin-top:4px">Ссылка: <code id="t-link">${esc(META.site)}/t/${esc(t?.code || '…')}</code>${t ? '' : ' · код и логин заполняются из имени, можно изменить'}</div></div>
      <div>${lbl('Телефон')}<input class="input" id="t-phone" type="tel" value="${esc(t?.phone || '')}" placeholder="+7 7__ ___ __ __" /></div>
      <div class="card" style="box-shadow:none"><div class="card-head"><h2>Кабинет тренера</h2></div><div class="card-body" style="display:flex;flex-direction:column;gap:10px">
        <div class="muted" style="font-size:12.5px">Тренер входит на <code>${esc(META.site)}/admin</code> и видит только своих клиентов.</div>
        <div>${lbl('Логин')}<input class="input" id="t-login" value="${esc(t?.login || '')}" placeholder="aigerim" autocomplete="off" /></div>
        <div>${lbl(t?.has_password ? 'Новый пароль (пусто — не менять)' : 'Пароль')}<div style="display:flex;gap:8px"><input class="input" id="t-pass" type="text" autocomplete="new-password" placeholder="минимум 6 символов" style="flex:1" /><button class="btn" type="button" id="t-gen">Сгенерировать</button></div></div>
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
  const showLink = () => { dr.querySelector('#t-link')!.textContent = `${META.site}/t/${v('#t-code').trim().toLowerCase() || '…'}` }
  // ручная правка кода/логина отключает автозаполнение этого поля
  let codeTouched = !!t, loginTouched = !!t
  dr.querySelector('#t-code')!.addEventListener('input', () => { codeTouched = true; showLink() })
  dr.querySelector('#t-login')!.addEventListener('input', () => { loginTouched = true })

  // Новый тренер: код ссылки и логин из имени латиницей, с учётом уже занятых
  if (!t) {
    const taken = { codes: new Set<string>(), logins: new Set<string>() }
    adminGet<{ items: TrainerRow[] }>('trainers').then(r => {
      r.items.forEach(x => { taken.codes.add(x.code); if (x.login) taken.logins.add(x.login) })
    }).catch(() => {})
    dr.querySelector('#t-name')!.addEventListener('input', () => {
      const name = v('#t-name')
      if (!codeTouched) { (dr.querySelector('#t-code') as HTMLInputElement).value = suggestSlug(name, taken.codes, 2); showLink() }
      if (!loginTouched) (dr.querySelector('#t-login') as HTMLInputElement).value = suggestSlug(name, taken.logins, 3)
    })
  }
  const err = dr.querySelector<HTMLElement>('#t-err')!

  dr.querySelector('#t-gen')!.addEventListener('click', () => {
    const inp = dr.querySelector<HTMLInputElement>('#t-pass')!
    inp.value = genPassword()
    inp.focus(); inp.select()
  })

  // Готовый доступ для тренера: скопировать / отправить в WhatsApp, «Добавить ещё» — к следующему
  const showAccess = (a: { name: string; code: string; phone: string; login: string; pass: string }, isNew: boolean) => {
    const text = accessText(a)
    const digits = a.phone.replace(/\D/g, '').replace(/^8(?=\d{10}$)/, '7')
    dr.querySelector('.drawer-head h2')!.textContent = 'Доступ для тренера'
    dr.querySelector('.drawer-body')!.innerHTML = `
      <div style="font-weight:700;font-size:16px">${esc(a.name)} — ${isNew ? 'тренер добавлен' : 'пароль обновлён'} ✅</div>
      <div class="muted" style="font-size:13px">Отправьте тренеру доступ — пароль больше нигде не показывается. Тренер может сменить язык кабинета (Рус / Қаз).</div>
      <pre class="copy-pre">${esc(text)}</pre>
      <div class="row-actions">
        <button class="btn btn-primary" id="a-copy">Копировать доступ</button>
        ${digits.length === 11 ? `<a class="btn" href="https://wa.me/${digits}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Отправить в WhatsApp</a>` : ''}
      </div>
      <div class="row-actions">
        ${isNew ? '<button class="btn" id="a-more">＋ Добавить ещё тренера</button>' : ''}
        <button class="btn" id="a-done">Готово</button>
      </div>`
    dr.querySelector('#a-copy')!.addEventListener('click', () => navigator.clipboard.writeText(text).then(() => toast('Доступ скопирован')))
    dr.querySelector('#a-done')!.addEventListener('click', close)
    dr.querySelector('#a-more')?.addEventListener('click', () => { close(); setTimeout(() => openTrainerDialog(null, onDone), 260) })
  }

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
      onDone()
      // задан пароль — показываем готовый доступ, чтобы сразу отправить тренеру (пароль потом нигде не виден)
      const login = String(body.login || t?.login || '')
      if (pass && login) return showAccess({ name: String(body.name), code: String(body.code || t?.code || ''), phone: String(body.phone || ''), login, pass }, !t)
      close()
    } catch (e) {
      err.style.display = 'block'
      err.textContent = e instanceof ApiError ? (ERR[e.code] || 'Не удалось сохранить') : 'Не удалось сохранить'
      btn.disabled = false
    }
  })
  setTimeout(() => (dr.querySelector('#t-name') as HTMLInputElement).focus(), 300)
}

/** Пароль без похожих символов (0/O, 1/l/I): 10 знаков ≈ 49 бит — для кабинета тренера достаточно. */
export function genPassword(len = 10): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
}

/** Текст доступа для тренера (казахский и русский). */
function accessText(a: { code: string; login: string; pass: string }): string {
  const site = META.site || 'https://braverman.kz'
  return `Сәлеметсіз бе! Braverman тренер кабинетіне осы деректермен кіресіз:\n` +
    `Сайт: ${site}/admin\nЛогин: ${a.login}\nҚұпиясөз: ${a.pass}\n` +
    `Клиенттерге жіберетін сілтемеңіз: ${site}/t/${a.code}\n\n` +
    `Здравствуйте! Доступ в кабинет тренера Braverman:\n` +
    `Сайт: ${site}/admin\nЛогин: ${a.login}\nПароль: ${a.pass}\n` +
    `Ваша ссылка для клиентов: ${site}/t/${a.code}`
}

// Транслит казахского/русского имени в латиницу для кода ссылки и логина: «Айгерім» → aigerim, «Жеңіс» → zhenis.
const TRANSLIT: Record<string, string> = {
  а: 'a', ә: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'i', і: 'i',
  к: 'k', қ: 'k', л: 'l', м: 'm', н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ұ: 'u', ү: 'u',
  ф: 'f', х: 'kh', һ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
}
export function translit(s: string): string {
  return [...s.toLowerCase()].map(c => TRANSLIT[c] ?? c).join('').replace(/[^a-z0-9]/g, '')
}

/** Свободный код/логин из имени: aigerim → aigerim-s (буква фамилии) → aigerim2, aigerim3… */
export function suggestSlug(name: string, taken: Set<string>, minLen: number): string {
  const words = name.trim().split(/\s+/).map(translit).filter(Boolean)
  if (!words.length) return ''
  let base = words[0].slice(0, 24)
  if (base.length < minLen) base = words.join('').slice(0, 24) // короткое имя (Ли) — берём с фамилией
  if (base.length < minLen) base = base.padEnd(minLen, '1')
  const candidates = [base]
  if (words[1]) candidates.push(`${base}-${words[1][0]}`)
  for (const c of candidates) if (!taken.has(c)) return c
  for (let n = 2; n < 100; n++) if (!taken.has(`${base}${n}`)) return `${base}${n}`
  return `${base}${Date.now() % 1000}`
}
