// Экран 6: восстановление результата по номеру телефона (код в WhatsApp).
import { $, esc, showScreen, currentScreen, attachPhoneMask, phoneDigits } from '../dom'
import { T, onLangChange } from '../i18n'
import { track } from '../analytics'
import { recover, ApiError } from '../api'
import { openResult } from './result'
import { showIntro } from './intro'

let phase: 'phone' | 'code' | 'manual' = 'phone'
let phoneValue = ''

export function initRecover() {
  onLangChange(() => { if (currentScreen() === 'recover') render() })
}

export function renderRecover() {
  phase = 'phone'
  track('RecoverView')
  render()
}

function render() {
  const u = T().ui.recover
  const el = $('recover')
  el.innerHTML = `
    <div class="card recover-card">
      <p class="result-eyebrow">${esc(u.title)}</p>
      <p class="lead">${esc(phase === 'manual' ? u.manual : phase === 'code' ? u.sent : u.lead)}</p>
      ${phase === 'phone' ? `
        <label class="field"><span>${esc(T().ui.checkout.phoneLabel)}</span>
          <input id="rPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="${esc(T().ui.checkout.phonePlaceholder)}" value="${esc(phoneValue)}" /></label>
        <input id="rHp" name="website" class="hp" type="text" tabindex="-1" autocomplete="off" />
        <p id="rError" class="error" hidden></p>
        <button id="rBtn" class="btn btn-primary btn-block">${esc(u.btn)}</button>` : ''}
      ${phase === 'code' ? `
        <label class="field"><span>${esc(u.codeLabel)}</span>
          <input id="rCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" /></label>
        <p id="rError" class="error" hidden></p>
        <button id="rBtn" class="btn btn-primary btn-block">${esc(u.codeBtn)}</button>` : ''}
      <button id="rBack" class="btn-text" style="margin-top:14px">${esc(u.back)}</button>
    </div>`
  showScreen('recover')
  $('rBack').addEventListener('click', () => showIntro())
  if (phase === 'manual') return

  const err = $('rError')
  const btn = $<HTMLButtonElement>('rBtn')
  const fail = (code: string) => {
    err.textContent = code === 'not_found' ? u.notFound : code === 'bad_code' ? u.badCode : code === 'too_many' ? u.tooMany : code === 'network' ? T().ui.errors.network : T().ui.errors.generic
    err.hidden = false
    btn.disabled = false
  }

  if (phase === 'phone') {
    const phone = $<HTMLInputElement>('rPhone')
    attachPhoneMask(phone, () => { err.hidden = true })
    if (phoneValue) phone.dispatchEvent(new InputEvent('input'))
    const submit = async () => {
      const digits = phoneDigits(phone)
      if (!/^77\d{9}$/.test(digits)) return fail('phone_fmt'), (err.textContent = T().ui.checkout.phoneError)
      phoneValue = phone.value
      btn.disabled = true
      try {
        const r = await recover({ phone: '+' + digits, hp: $<HTMLInputElement>('rHp').value })
        if (r.r) return finish(r.r)
        phase = r.manual ? 'manual' : 'code'
        render()
      } catch (e) { fail(e instanceof ApiError ? e.code : '') }
    }
    btn.addEventListener('click', submit)
    phone.addEventListener('keydown', e => { if (e.key === 'Enter') submit() })
    setTimeout(() => phone.focus(), 100)
  } else {
    const codeEl = $<HTMLInputElement>('rCode')
    const submit = async () => {
      const code = codeEl.value.replace(/\D/g, '')
      if (code.length !== 6) return fail('bad_code')
      btn.disabled = true
      try {
        const r = await recover({ phone: '+' + phoneValue.replace(/\D/g, ''), code, hp: '' })
        if (r.r) return finish(r.r)
        fail('bad_code')
      } catch (e) { fail(e instanceof ApiError ? e.code : '') }
    }
    btn.addEventListener('click', submit)
    codeEl.addEventListener('keydown', e => { if (e.key === 'Enter') submit() })
    setTimeout(() => codeEl.focus(), 100)
  }
}

function finish(r: string) {
  history.replaceState(null, '', `/?r=${r}`)
  openResult(r)
}
