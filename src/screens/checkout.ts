// Экран 3: тизер (доминирующий тип + размытый график под замком) и оплата Kaspi-счётом на номер.
// Или промокод: поле под кнопкой оплаты, номер нужен (туда уходит ссылка на результат).
import { $, esc, showScreen, currentScreen, attachPhoneMask, phoneDigits, fmtPrice } from '../dom'
import { state, save } from '../state'
import { T, onLangChange } from '../i18n'
import { track } from '../analytics'
import { checkout, checkoutPromo, ApiError } from '../api'
import { renderProfileChart } from '../chart'
import { NEURO_ORDER, QUESTIONS_PER_BLOCK, type NeuroKey } from '../../shared/scoring'

const PLACEHOLDER_SCORES: Record<NeuroKey, number> = { dopamine: 25, acetylcholine: 25, gaba: 25, serotonin: 25 }
import { renderWaiting } from './waiting'
import { authorRow } from '../author'
import { openResult } from './result'

export const PRICE_KZT = Number(import.meta.env.VITE_PRICE_KZT || 5000)

let viewTracked = false

export function initCheckout() {
  onLangChange(() => { if (currentScreen() === 'checkout') renderCheckout({ keepPhone: true, promoOpen: !$('promoBox')?.hidden }) })
}

export function renderCheckout(opts: { loading?: boolean; keepPhone?: boolean; promoError?: string; promoOpen?: boolean } = {}) {
  const u = T().ui.checkout
  const prevPhone = opts.keepPhone ? $<HTMLInputElement>('phoneInput')?.value : ''
  const prevPromo = opts.keepPhone ? $<HTMLInputElement>('promoInput')?.value || '' : ''
  const el = $('checkout')
  el.innerHTML = `
    <div class="card checkout-card">
      <p class="result-eyebrow">${esc(u.title)}</p>
      <p class="lead">${esc(u.lead)}</p>

      <div class="teaser">
        <div class="teaser-label">${esc(u.teaserLabel)}</div>
        <!-- до оплаты ничего настоящего не показываем: вместо типа — размытая заглушка -->
        <div class="teaser-type teaser-hidden" aria-hidden="true">Хххххххх ххххх</div>
        <div class="teaser-meta teaser-hidden" aria-hidden="true">Хххххххххх · Ххххх хххххх</div>
        <div class="teaser-chart">
          <div class="chart-wrap blurred"><canvas id="teaserChart"></canvas></div>
          <div class="lock">🔒</div>
        </div>
      </div>

      <!-- оплата сразу под графиком: на телефоне кнопка должна быть видна без прокрутки -->
      <div class="pay-block">
        ${opts.promoError ? `<p class="promo-bad" style="margin:0 0 12px">${esc(opts.promoError)}</p>` : ''}
        <label class="field">
          <span>${esc(u.phoneLabel)}</span>
          <input id="phoneInput" type="tel" inputmode="tel" autocomplete="tel" placeholder="${esc(u.phonePlaceholder)}" value="${esc(prevPhone || '')}" ${opts.loading ? 'disabled' : ''} />
        </label>
        <input id="hp" name="website" class="hp" type="text" tabindex="-1" autocomplete="off" />
        <p id="phoneError" class="error" hidden></p>
        <button id="payBtn" class="btn btn-primary btn-block" ${opts.loading ? 'disabled' : ''}>${esc(opts.loading ? u.sending : u.payBtn(fmtPrice(PRICE_KZT)))}</button>
        <p class="hint subtle">${esc(u.priceNote)}</p>
        ${opts.loading ? '' : `
        <button type="button" class="promo-toggle" id="promoToggle" ${opts.promoOpen ? 'hidden' : ''}>${esc(u.promoToggle)}</button>
        <div class="promo-box" id="promoBox" ${opts.promoOpen ? '' : 'hidden'}>
          <input id="promoInput" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(u.promoPlaceholder)}" value="${esc(prevPromo)}" />
          <p id="promoError" class="error" hidden></p>
          <button id="promoBtn" class="btn btn-block">${esc(u.promoApply)}</button>
          <p class="hint subtle">${esc(u.promoHint)}</p>
        </div>`}
      </div>

      <ul class="benefits">${u.benefits.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
      ${authorRow('author-laugh.webp', T().ui.authorVideoRole)}
      <a href="/privacy" class="privacy-link">${esc(T().ui.privacyLink)}</a>
    </div>`
  showScreen('checkout')
  // Условный ровный график (не баллы человека) под сильным размытием — форма ничего не выдаёт
  renderProfileChart($<HTMLCanvasElement>('teaserChart'), PLACEHOLDER_SCORES, QUESTIONS_PER_BLOCK, null, NEURO_ORDER.map(k => T().neuro[k].name), { minimal: true })

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

  // ── промокод вместо оплаты ──
  const promoBox = $('promoBox')
  const promoInput = $<HTMLInputElement>('promoInput')
  const promoErr = $('promoError')
  const promoBtn = $<HTMLButtonElement>('promoBtn')
  $('promoToggle').addEventListener('click', () => {
    $('promoToggle').hidden = true
    promoBox.hidden = false
    promoInput.focus()
  })
  const showPromoErr = (msg: string) => { promoErr.textContent = msg; promoErr.hidden = false; promoInput.focus() }
  promoInput.addEventListener('input', () => { promoErr.hidden = true })
  const applyPromo = async () => {
    const code = promoInput.value.trim()
    if (!code) return showPromoErr(u.promoEmpty)
    const digits = phoneDigits(phone)
    if (!/^77\d{9}$/.test(digits)) return showErr(u.phoneError) // ссылка на результат уходит на этот номер
    promoBtn.disabled = true
    promoBtn.textContent = u.sending
    try {
      const res = await checkoutPromo({ id: state.attemptId, token: state.attemptToken, phone: '+' + digits, code, hp: $<HTMLInputElement>('hp').value })
      state.phone = '+' + digits
      if (res.paid && res.r) {
        state.resultToken = res.r
        state.invoiceId = ''
        state.promo = ''
        save()
        history.replaceState(null, '', `/?r=${res.r}`)
        return openResult(res.r)
      }
      throw new ApiError('promo', 500)
    } catch (e) {
      promoBtn.disabled = false
      promoBtn.textContent = u.promoApply
      const c = e instanceof ApiError ? e.code : ''
      if (c === 'phone') return showErr(u.phoneError)
      if (c === 'promo_not_found') return showPromoErr(u.promoNotFound)
      if (c === 'promo_used') return showPromoErr(u.promoUsed)
      if (c === 'too_many') return showPromoErr(u.promoTooMany)
      if (c === 'network') return showPromoErr(T().ui.errors.network)
      showPromoErr(T().ui.errors.network)
    }
  }
  promoBtn.addEventListener('click', applyPromo)
  promoInput.addEventListener('keydown', e => { if (e.key === 'Enter') applyPromo() })
}
