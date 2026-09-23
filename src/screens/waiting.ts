// Экран 4: ждём оплату Kaspi-счёта — поллинг статуса, пока не оплатят (или счёт не отменят).
import { $, esc, showScreen, currentScreen } from '../dom'
import { state, save } from '../state'
import { T, onLangChange } from '../i18n'
import { track } from '../analytics'
import { checkInvoice } from '../api'
import { renderCheckout, PRICE_KZT } from './checkout'
import { openResult } from './result'

let pollRun = 0 // номер запуска: старый поллинг останавливается, когда стартует новый или экран сменился

export function initWaiting() {
  onLangChange(() => { if (currentScreen() === 'waiting') renderWaiting(false) })
}

export function renderWaiting(startPolling = true) {
  const u = T().ui.waiting
  $('waiting').innerHTML = `
    <div class="card waiting-card">
      <div class="big-icon">📲</div>
      <h2 class="dominant-title">${esc(u.title)}</h2>
      <p class="lead">${esc(u.lead)}</p>
      <ol class="steps">${u.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      <div class="pay-waiting"><span class="pay-spinner"></span> ${esc(u.waiting)}</div>
      <p class="hint subtle">${esc(u.note)}</p>
      <button id="changePhone" class="btn btn-secondary btn-block">${esc(u.changePhone)}</button>
    </div>`
  showScreen('waiting')
  $('changePhone').addEventListener('click', () => { pollRun++; renderCheckout({ keepPhone: false }) })
  if (startPolling) poll()
}

function renderFailed() {
  const u = T().ui.waiting
  $('waiting').innerHTML = `
    <div class="card waiting-card">
      <div class="big-icon">⚠️</div>
      <h2 class="dominant-title">${esc(u.failedTitle)}</h2>
      <p class="lead">${esc(u.failedBody)}</p>
      <button id="retryPay" class="btn btn-primary btn-block">${esc(u.retry)}</button>
    </div>`
  $('retryPay').addEventListener('click', () => { state.invoiceId = ''; save(); renderCheckout({ keepPhone: false }) })
}

function poll() {
  const run = ++pollRun
  const ref = state.invoiceId
  const startedAt = Date.now()
  const tick = async () => {
    if (run !== pollRun || currentScreen() !== 'waiting' || state.invoiceId !== ref) return
    const elapsed = Date.now() - startedAt
    if (elapsed > 30 * 60 * 1000) return
    try {
      const r = await checkInvoice(ref)
      if (run !== pollRun) return
      if (r.status === 'paid' && r.r) {
        track('Purchase', { value: PRICE_KZT, currency: 'KZT' })
        state.resultToken = r.r
        state.invoiceId = ''
        save()
        history.replaceState(null, '', `/?r=${r.r}`)
        return openResult(r.r)
      }
      if (r.status === 'cancelled' || r.status === 'expired') return renderFailed()
    } catch { /* сеть моргнула — пробуем снова */ }
    // первые 2 минуты — каждые 3 с, дальше реже; всего ждём 30 минут
    setTimeout(tick, elapsed < 120000 ? 3000 : 8000)
  }
  setTimeout(tick, 2500)
}
