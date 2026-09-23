import { adminPost, ApiError } from '../api'
import { navigate } from '../router'

export function renderLogin() {
  const app = document.getElementById('app')!
  app.innerHTML = `
    <div class="login-wrap">
      <form class="card login" id="login-form" autocomplete="on">
        <div class="brand"><span class="dot">🧠</span> Braverman · вход</div>
        <div class="muted" style="font-size:12.5px;margin-top:-6px">Админ или тренер — один и тот же вход</div>
        <div><label for="lg">Логин</label><input class="input" id="lg" name="username" autocomplete="username" autofocus /></div>
        <div><label for="pw">Пароль</label><input class="input" id="pw" name="password" type="password" autocomplete="current-password" /></div>
        <div class="err" id="err"></div>
        <button class="btn btn-primary" id="btn" type="submit" style="padding:11px">Войти</button>
      </form>
    </div>`
  const form = app.querySelector<HTMLFormElement>('#login-form')!
  const err = app.querySelector<HTMLElement>('#err')!
  const btn = app.querySelector<HTMLButtonElement>('#btn')!
  form.addEventListener('submit', async e => {
    e.preventDefault()
    btn.disabled = true
    err.textContent = ''
    try {
      await adminPost('login', {
        login: (form.querySelector('#lg') as HTMLInputElement).value.trim(),
        password: (form.querySelector('#pw') as HTMLInputElement).value
      })
      navigate('#/')
    } catch (e) {
      const code = e instanceof ApiError ? e.code : ''
      err.textContent = code === 'locked' ? 'Слишком много попыток. Подожди 15 минут.'
        : code === 'admin_not_configured' ? 'Админка не настроена (ADMIN_LOGIN / ADMIN_PASSWORD / ADMIN_SECRET).'
        : 'Неверный логин или пароль.'
    }
    btn.disabled = false
  })
}
