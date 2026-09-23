// Экран 3: тизер (доминирующий тип + размытый график под замком) и оплата Kaspi-счётом на номер.
import { $, esc, showScreen, currentScreen, attachPhoneMask, phoneDigits, fmtPrice } from '../dom'
import { state, save } from '../state'
import { T, onLangChange } from '../i18n'
import { track } from '../analytics'
import { checkout, ApiError } from '../api'
import { renderProfileChart } from '../chart'
import { NEURO_ORDER, QUESTIONS_PER_BLOCK, scoreAttempt } from '../../shared/scoring'
import { renderWaiting } from './waiting'
import { openResult } from './result'

export const PRICE_KZT = Number(import.meta.env.VITE_PRICE_KZT || 5000)

let viewTracked = false

export function initCheckout() {
  onLangChange(() => { if (currentScreen() === 'checkout') renderCheckout({ keepPhone: true }) })
}

export function renderCheckout(opts: { loading?: boolean; keepPhone?: boolean } = {}) {
  const u = T().ui.checkout
  const teaser = state.teaser ?? scoreAttempt(state.answers)
  const dom = T().neuro[teaser.dominant]
  const scores = scoreAttempt(state.answers).scores
  const prevPhone = opts.keepPhone ? $<HTMLInputElement>('phoneInput')?.value : ''
  const el = $('checkout')
  el.innerHTML = `
    <div class="card checkout-card">
      <p class="result-eyebrow">${esc(u.title)}</p>
      <p class="lead">${esc(u.lead)}</p>

      <div class="teaser">
        <div class="teaser-label">${esc(u.teaserLabel)}</div>
        <div class="teaser-type">${esc(dom.title)}</div>
        <div class="teaser-meta">${esc(dom.name)} · ${esc(dom.lobe)}</div>
        <div class="teaser-chart">
          <div class="chart-wrap blurred"><canvas id="teaserChart"></canvas></div>
          <div class="lock">🔒</div>
        </div>
      </div>

      <ul class="benefits">${u.benefits.map(b => `<li>${esc(b)}</li>`).join('')}</ul>

      <label class="field">
        <span>${esc(u.phoneLabel)}</span>
        <input id="phoneInput" type="tel" inputmode="tel" autocomplete="tel" placeholder="${esc(u.phonePlaceholder)}" value="${esc(prevPhone || '')}" ${opts.loading ? 'disabled' : ''} />
      </label>
      <input id="hp" name="website" class="hp" type="text" tabindex="-1" autocomplete="off" />
      <p id="phoneError" class="error" hidden></p>
      <button id="payBtn" class="btn btn-primary btn-block" ${opts.loading ? 'disabled' : ''}>${esc(opts.loading ? u.sending : u.payBtn(fmtPrice(PRICE_KZT)))}</button>
      <p class="hint subtle">${esc(u.priceNote)}</p>
    </div>`
  showScreen('checkout')
  renderProfileChart($<HTMLCanvasElement>('teaserChart'), scores, QUESTIONS_PER_BLOCK, teaser.dominant, NEURO_ORDER.map(k => T().neuro[k].name), { minimal: true })

  if (!viewTracked) { viewTracked = true; track('InitiateCheckout', { value: PRICE_KZT, currency: 'KZT' }) }
  if (opts.loading) return

  const phone = $<HTMLInputElement>('phoneInput')
  const err = $('phoneError')
  attachPhoneMask(phone, () => { err.hidden = true })
  if (state.phone && !prevPhone) { phone.value = state.phone; phone.dispatchEvent(new InputEvent('input')) }
  const btn = $<HTMLButtonElement>('payBtn')
  const showErr = (msg: string) => { err.textContent = msg; err.hidden = false; phone.focus() }

  const submit = async () => {
    const digits = phoneDigits(phone)
    if (!/^77\d{9}$/.test(digits)) return showErr(u.phoneError)
    btn.disabled = true
    btn.textContent = u.sending
    track('CheckoutSubmit')
    const testToken = new URLSearchParams(location.search).get('test') || undefined
    try {
      const res = await checkout({ id: state.attemptId, token: state.attemptToken, phone: '+' + digits, hp: $<HTMLInputElement>('hp').value, testToken })
      state.phone = '+' + digits
      if (res.paid && res.r) {
        track('Purchase', { value: PRICE_KZT, currency: 'KZT' })
        state.resultToken = res.r
        state.invoiceId = ''
        save()
        history.replaceState(null, '', `/?r=${res.r}`)
        return openResult(res.r)
      }
      if (res.invoiceId) {
        track('Lead')
        state.invoiceId = res.invoiceId
        save()
        return renderWaiting()
      }
      throw new ApiError('invoice', 500)
    } catch (e) {
      btn.disabled = false
      btn.textContent = u.payBtn(fmtPrice(PRICE_KZT))
      const code = e instanceof ApiError ? e.code : ''
      if (code === 'no_kaspi') return showErr(u.noKaspi)
      if (code === 'phone') return showErr(u.phoneError)
      if (code === 'network') return showErr(T().ui.errors.network)
      showErr(u.error)
    }
  }
  btn.addEventListener('click', submit)
  phone.addEventListener('keydown', e => { if (e.key === 'Enter') submit() })
}
