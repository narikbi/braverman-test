// После 200-го вопроса: отправляем ответы на сервер и показываем настоящий тип бесплатно —
// название, нейромедиатор, доля мозга, описание, превью 35 с. Сразу под видео — оплата полного разбора
// (счёт Kaspi на номер) и промокод. Ниже — что откроется в разборе.
import { NEURO_ORDER, QUESTIONS_PER_BLOCK, computeScores, scoreAttempt } from '../../../shared/scoring'
import { esc, attachPhoneMask, phoneDigits } from '../../dom'
import { authorRow } from '../../author'
import { track } from '../../analytics'
import { finishAttempt, checkout, checkoutPromo, ApiError } from '../../api'
import { T, lang } from '../lang'
import { B } from '../text'
import { state, save, setAttempt, variantOf } from '../state'
import { go, show, onLeave } from '../nav'
import { COLORS, onColor, langSwitch, mount, price, q, PRICE_KZT, LOCK_SVG } from '../ui'
import { mountTeaser } from '../teaser'
import { saveContact } from '../api'

let viewTracked = false
let sendFailed = false // ответы не дошли до сервера — показываем «Повторить»
let promoNote = '' // промокод из ссылки не сработал
let promoOpen = false
let sending = false

/** 200 ответов готовы. Тип считаем сразу на месте, сервер подтверждает и сохраняет. */
export function finish() {
  state.teaser = scoreAttempt(state.answers)
  save()
  send()
  // по промокоду и при бесплатной пересдаче оплаты нет — ждём результат
  if (state.retakeOf || state.promo) show(renderLoading)
  else showOffer()
}

async function send() {
  if (sending) return
  sending = true
  sendFailed = false
  try {
    const r = await finishAttempt({
      id: state.attemptId, token: state.attemptToken, answers: state.answers, name: state.name, lang,
      retake: state.retakeOf || undefined, promo: state.promo || undefined, variant: variantOf()
    })
    sending = false
    if (r.id) setAttempt(r.id, r.token)
    if (r.teaser) state.teaser = r.teaser
    state.finishedOnServer = true
    if (r.r) {
      // промокод или пересдача — сразу полный результат
      state.retakeOf = ''
      state.promo = ''
      state.resultToken = r.r
      save()
      history.replaceState(null, '', `/b?r=${r.r}`)
      return go.result(r.r)
    }
    if (r.promoError) promoNote = T().ui.checkout.promoLinkUsed
    state.promo = ''
    state.retakeOf = ''
    save()
    // номер с 100-го вопроса не успел записаться (попытки ещё не было) — дописываем
    if (state.waPhone && !state.waSaved) saveContact({ phone: state.waPhone, consent: true }).then(ok => { if (ok) { state.waSaved = true; save() } })
  } catch {
    sending = false
    sendFailed = true
  }
  // экран с типом уже открыт и всё прошло гладко — только включаем кнопку оплаты, превью не перезапускаем
  const btn = document.getElementById('payBtn') as HTMLButtonElement | null
  if (btn && !sendFailed && !promoNote) {
    btn.disabled = false
    btn.textContent = B().cta(price())
    return
  }
  showOffer()
}

function renderLoading() {
  mount(`<div class="card center"><span class="spin big"></span><p class="lead">${esc(B().loading)}</p></div>`)
}

export function showOffer() {
  show(render)
}

function render() {
  const b = B()
  const t = T()
  const c = t.ui.checkout
  const teaser = state.teaser ?? scoreAttempt(state.answers)
  const dk = teaser.dominant
  const x = t.neuro[dk]
  const sc = computeScores(state.answers)
  const ready = state.finishedOnServer
  mount(`
    <div class="card">
      <div class="top end">${langSwitch()}</div>
      <div class="hero" style="background:${COLORS[dk]};color:${onColor(dk)}">
        <p>${esc(b.eyebrow)} · ${esc(b.free)}</p>
        <h1>${esc(x.title)}</h1>
        <p>${esc(x.name)} · ${esc(x.lobe)}</p>
      </div>
      <p class="lead after">${esc(x.description)}</p>

      <h2>${esc(b.videoH)}</h2>
      <div id="teaserBox"></div>

      <div class="pay" id="pay">
        ${promoNote ? `<p class="warn">${esc(promoNote)}</p>` : ''}
        ${sendFailed ? `<p class="warn">${esc(t.ui.errors.network)} <button type="button" class="inline" id="resend">${esc(b.retry)}</button></p>` : ''}
        <label class="f" for="ph">${esc(c.phoneLabel)}</label>
        <input class="input" id="ph" type="tel" inputmode="tel" autocomplete="tel" placeholder="${esc(c.phonePlaceholder)}" />
        <input id="hp" name="website" class="hp" type="text" tabindex="-1" autocomplete="off" />
        <p class="err" id="phErr" role="alert" hidden></p>
        <button type="button" class="btn" id="payBtn" ${ready ? '' : 'disabled'}>${esc(ready ? b.cta(price()) : b.saving)}</button>
        <p class="note">${esc(c.priceNote)}</p>
        <button type="button" class="link" id="promoToggle" ${promoOpen ? 'hidden' : ''}>${esc(c.promoToggle)}</button>
        <div class="promo" id="promoBox" ${promoOpen ? '' : 'hidden'}>
          <input class="input" id="promoInput" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(c.promoPlaceholder)}" />
          <p class="err" id="promoErr" role="alert" hidden></p>
          <button type="button" class="btn ghost" id="promoBtn">${esc(c.promoApply)}</button>
          <p class="note">${esc(c.promoHint)}</p>
        </div>
      </div>

      <h2>${esc(b.lockH)}</h2>
      <ul class="locks">${b.locks.map((l, i) => `<li>${LOCK_SVG}<div>${esc(l[0])}<small>${esc(l[1])}</small></div>${i === 0
        ? `<span class="bars" aria-hidden="true">${NEURO_ORDER.map(k => `<i style="height:${Math.max(4, (sc[k] / QUESTIONS_PER_BLOCK) * 30)}px;background:${COLORS[k]}"></i>`).join('')}</span>` : ''}</li>`).join('')}</ul>
      ${authorRow('author-laugh.webp', t.ui.authorVideoRole)}
      <p class="legal">${esc(t.ui.disclaimer)}</p>
      <a class="legal-link" href="/privacy">${esc(t.ui.privacyLink)}</a>
    </div>`)

  const tz = mountTeaser(q('#teaserBox'), teaser.combo, lang, { cap: b.videoCap, end: b.videoEnd, error: t.ui.videoError })
  onLeave(() => tz.destroy())

  if (!viewTracked) { viewTracked = true; track('InitiateCheckout', { value: PRICE_KZT, currency: 'KZT' }) }

  document.getElementById('resend')?.addEventListener('click', () => { send(); showOffer() })

  // ── оплата: счёт Kaspi на номер ──
  const phone = q<HTMLInputElement>('#ph')
  const phErr = q('#phErr')
  attachPhoneMask(phone, () => { phErr.hidden = true; state.phone = '+' + phoneDigits(phone) })
  const known = state.phone || state.waPhone
  if (/^\+77\d{9}$/.test(known)) { phone.value = known; phone.dispatchEvent(new InputEvent('input')) }
  const btn = q<HTMLButtonElement>('#payBtn')
  const showErr = (msg: string) => { phErr.textContent = msg; phErr.hidden = false; phone.focus() }

  const pay = async () => {
    const digits = phoneDigits(phone)
    if (!/^77\d{9}$/.test(digits)) return showErr(c.phoneError)
    btn.disabled = true
    btn.textContent = c.sending
    track('CheckoutSubmit')
    const testToken = new URLSearchParams(location.search).get('test') || undefined
    try {
      const res = await checkout({ id: state.attemptId, token: state.attemptToken, phone: '+' + digits, hp: q<HTMLInputElement>('#hp').value, testToken })
      state.phone = '+' + digits
      if (res.paid && res.r) {
        track('Purchase', { value: PRICE_KZT, currency: 'KZT' })
        return opened(res.r)
      }
      if (res.invoiceId) {
        track('Lead')
        state.invoiceId = res.invoiceId
        save()
        return go.invoice()
      }
      throw new ApiError('invoice', 500)
    } catch (e) {
      btn.disabled = false
      btn.textContent = b.cta(price())
      const code = e instanceof ApiError ? e.code : ''
      if (code === 'no_kaspi') return showErr(c.noKaspi)
      if (code === 'phone') return showErr(c.phoneError)
      if (code === 'network') return showErr(t.ui.errors.network)
      showErr(c.error)
    }
  }
  btn.addEventListener('click', pay)
  phone.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) pay() })

  // ── промокод вместо оплаты (номер нужен: туда уходит ссылка на результат) ──
  const promoInput = q<HTMLInputElement>('#promoInput')
  const promoErr = q('#promoErr')
  const promoBtn = q<HTMLButtonElement>('#promoBtn')
  q('#promoToggle').addEventListener('click', () => {
    promoOpen = true
    q('#promoToggle').hidden = true
    q('#promoBox').hidden = false
    promoInput.focus()
  })
  const showPromoErr = (msg: string) => { promoErr.textContent = msg; promoErr.hidden = false; promoInput.focus() }
  promoInput.addEventListener('input', () => { promoErr.hidden = true })
  const applyPromo = async () => {
    const code = promoInput.value.trim()
    if (!code) return showPromoErr(c.promoEmpty)
    const digits = phoneDigits(phone)
    if (!/^77\d{9}$/.test(digits)) return showErr(c.phoneError)
    promoBtn.disabled = true
    promoBtn.textContent = c.sending
    try {
      const res = await checkoutPromo({ id: state.attemptId, token: state.attemptToken, phone: '+' + digits, code, hp: q<HTMLInputElement>('#hp').value })
      state.phone = '+' + digits
      if (res.paid && res.r) return opened(res.r)
      throw new ApiError('promo', 500)
    } catch (e) {
      promoBtn.disabled = false
      promoBtn.textContent = c.promoApply
      const k = e instanceof ApiError ? e.code : ''
      if (k === 'phone') return showErr(c.phoneError)
      if (k === 'promo_not_found') return showPromoErr(c.promoNotFound)
      if (k === 'promo_used') return showPromoErr(c.promoUsed)
      if (k === 'too_many') return showPromoErr(c.promoTooMany)
      showPromoErr(t.ui.errors.network)
    }
  }
  promoBtn.addEventListener('click', applyPromo)
  promoInput.addEventListener('keydown', e => { if (e.key === 'Enter') applyPromo() })
}

/** Результат открыт (оплата или промокод): запоминаем ссылку и показываем полный разбор. */
function opened(r: string) {
  state.resultToken = r
  state.invoiceId = ''
  save()
  history.replaceState(null, '', `/b?r=${r}`)
  go.result(r)
}
