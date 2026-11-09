// Счёт отправлен в Kaspi: три шага, кнопка «Открыть Kaspi», ожидание оплаты (опрос статуса).
// Счёт отменён или истёк — экран «не оплачен»: результат сохранён, на кнопке повторного счёта стоит сумма.
import { esc } from '../../dom'
import { track } from '../../analytics'
import { checkInvoice } from '../../api'
import { T } from '../lang'
import { B } from '../text'
import { state, save } from '../state'
import { go, show } from '../nav'
import { mount, price, q, PRICE_KZT } from '../ui'

/**
 * Ссылка, которая открывает приложение Kaspi. Официальной ссылки на приложение у Kaspi нет, поэтому:
 * Android — по имени пакета (если приложения нет, откроется Google Play); iPhone — пусто, кнопку не показываем,
 * пока не подтвердим рабочую схему. Проверить кандидатов на телефоне: /b?kaspitest=1
 */
function kaspiAppUrl(): string {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'intent://#Intent;package=kz.kaspi.mobile;end'
  return ''
}

let pollRun = 0 // номер запуска: старый опрос останавливается, когда стартует новый или экран сменился

export function showInvoice() {
  show(renderWaiting)
  poll()
}

function renderWaiting() {
  const b = B()
  const w = T().ui.waiting
  const app = kaspiAppUrl()
  mount(`
    <div class="card">
      <h1 class="h-md">${esc(w.title)}</h1>
      <p class="lead">${esc(state.phone)}</p>
      <ol class="steps">${w.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      ${app ? `<a class="btn" id="kaspi" href="${esc(app)}">${esc(b.openKaspi)}</a>` : ''}
      <div class="wait" role="status"><span class="spin"></span>${esc(w.waiting)}</div>
      <p class="note">${esc(w.note)}</p>
      <button type="button" class="link" id="change">${esc(w.changePhone)}</button>
    </div>`)
  // опрос останавливается сам: счёт сброшен (смена номера), оплачен или запущен новый опрос
  q('#change').addEventListener('click', () => { state.invoiceId = ''; save(); go.offer() })
}

function renderFailed() {
  const b = B()
  const w = T().ui.waiting
  mount(`
    <div class="card">
      <h1 class="h-md">${esc(w.failedTitle)}</h1>
      <p class="lead">${esc(b.failedBody)}</p>
      <button type="button" class="btn" id="retry">${esc(b.retryPay(price()))}</button>
      <button type="button" class="link" id="change">${esc(w.changePhone)}</button>
    </div>`)
  const back = () => { state.invoiceId = ''; save(); go.offer() }
  q('#retry').addEventListener('click', back)
  q('#change').addEventListener('click', back)
}

function poll() {
  const run = ++pollRun
  const ref = state.invoiceId
  const startedAt = Date.now()
  const tick = async () => {
    if (run !== pollRun || state.invoiceId !== ref) return
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
        history.replaceState(null, '', `/b?r=${r.r}`)
        return go.result(r.r)
      }
      if (r.status === 'cancelled' || r.status === 'expired') return show(renderFailed)
    } catch { /* сеть моргнула — пробуем снова */ }
    // первые 2 минуты — каждые 3 с, дальше реже; всего ждём 30 минут
    setTimeout(tick, elapsed < 120000 ? 3000 : 8000)
  }
  setTimeout(tick, 2500)
}

/** Служебная страница /b?kaspitest=1: кандидаты ссылки на приложение Kaspi — проверить на своём телефоне. */
export function showKaspiTest() {
  const links = ['kaspi://', 'kaspikz://', 'kaspibank://', 'https://kaspi.kz/', 'intent://#Intent;package=kz.kaspi.mobile;end']
  mount(`
    <div class="card">
      <h1 class="h-md">Проверка кнопки «Открыть Kaspi»</h1>
      <p class="lead">Нажмите каждую ссылку на телефоне и запомните, какая открыла приложение Kaspi.</p>
      ${links.map((l, i) => `<a class="btn ghost" href="${esc(l)}">${i + 1}. ${esc(l)}</a>`).join('')}
    </div>`)
}
