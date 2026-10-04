// Вход в админку и кабинет тренера: по логину или (тумблер) по номеру телефона + пароль.
// Позже, когда подключим официальный WhatsApp API, вход по номеру будет по коду из WhatsApp.
import { adminPost, ApiError } from '../api'
import { navigate } from '../router'
import { L, langToggle, bindLangToggle } from '../i18n'

const MODE_KEY = 'bt_login_mode' // 'phone' | 'login' — запоминаем выбор

function loadMode(): boolean {
  try { return localStorage.getItem(MODE_KEY) === 'phone' } catch { return false }
}

/** Маска +7 (7XX) XXX-XX-XX: принимает 8…, 7…, +7… и просто 10 цифр. */
function formatPhone(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('8')) d = '7' + d.slice(1)
  if (d.length === 10 && d.startsWith('7')) d = '7' + d
  if (!d.startsWith('7')) d = '7' + d
  d = d.slice(0, 11)
  const p = d.slice(1)
  let out = '+7'
  if (p.length) out += ' (' + p.slice(0, 3)
  if (p.length >= 3) out += ')'
  if (p.length > 3) out += ' ' + p.slice(3, 6)
  if (p.length > 6) out += '-' + p.slice(6, 8)
  if (p.length > 8) out += '-' + p.slice(8, 10)
  return out
}

export function renderLogin() {
  const app = document.getElementById('app')!
  let byPhone = loadMode()
  app.innerHTML = `
    <div class="login-wrap">
      <form class="card login" id="login-form" autocomplete="on">
        ${langToggle()}
        <div class="brand"><span class="dot">🧠</span> Braverman · ${L('вход', 'кіру')}</div>
        <div>
          <label for="lg" id="lg-label"></label>
          <input class="input" id="lg" autofocus />
          <label class="switch-row"><input type="checkbox" id="by-phone" ${byPhone ? 'checked' : ''} /><span class="switch"></span>${L('Войти по номеру телефона', 'Телефон нөмірімен кіру')}</label>
        </div>
        <div><label for="pw">${L('Пароль', 'Құпиясөз')}</label><input class="input" id="pw" name="password" type="password" autocomplete="current-password" /></div>
        <div class="err" id="err"></div>
        <button class="btn btn-primary" id="btn" type="submit" style="padding:11px">${L('Войти', 'Кіру')}</button>
      </form>
    </div>`
  bindLangToggle(app)
  const form = app.querySelector<HTMLFormElement>('#login-form')!
  const err = app.querySelector<HTMLElement>('#err')!
  const btn = app.querySelector<HTMLButtonElement>('#btn')!
  const input = app.querySelector<HTMLInputElement>('#lg')!
  const label = app.querySelector<HTMLElement>('#lg-label')!

  // переключение «логин ↔ номер телефона»
  const applyMode = () => {
    label.textContent = byPhone ? L('Номер телефона', 'Телефон нөмірі') : L('Логин', 'Логин')
    input.type = byPhone ? 'tel' : 'text'
    input.name = byPhone ? 'tel' : 'username'
    input.autocomplete = byPhone ? 'tel' : 'username'
    input.inputMode = byPhone ? 'tel' : 'text'
    input.placeholder = byPhone ? '+7 (7__) ___-__-__' : ''
    input.value = ''
    err.textContent = ''
  }
  applyMode()
  app.querySelector<HTMLInputElement>('#by-phone')!.addEventListener('change', e => {
    byPhone = (e.target as HTMLInputElement).checked
    try { localStorage.setItem(MODE_KEY, byPhone ? 'phone' : 'login') } catch { /* noop */ }
    applyMode()
    input.focus()
  })
  input.addEventListener('input', () => { if (byPhone) input.value = input.value.trim() ? formatPhone(input.value) : '' })

  form.addEventListener('submit', async e => {
    e.preventDefault()
    err.textContent = ''
    const value = input.value.trim()
    if (byPhone && value.replace(/\D/g, '').length !== 11) { err.textContent = L('Введите номер полностью.', 'Нөмірді толық жазыңыз.'); return }
    btn.disabled = true
    try {
      await adminPost('login', {
        ...(byPhone ? { phone: value } : { login: value }),
        password: (form.querySelector('#pw') as HTMLInputElement).value
      })
      navigate('#/')
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      err.textContent = code === 'locked' ? L('Слишком много попыток. Подожди 15 минут.', 'Тым көп рет қате енгіздіңіз. 15 минуттан кейін қайта көріңіз.')
        : code === 'admin_not_configured' ? 'Админка не настроена (ADMIN_LOGIN / ADMIN_PASSWORD / ADMIN_SECRET).'
        : code === 'phone' ? L('Введите номер полностью.', 'Нөмірді толық жазыңыз.')
        : byPhone ? L('Неверный номер или пароль.', 'Нөмір немесе құпиясөз дұрыс емес.')
        : L('Неверный логин или пароль.', 'Логин немесе құпиясөз дұрыс емес.')
    }
    btn.disabled = false
  })
}
