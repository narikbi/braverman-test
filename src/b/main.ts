// Точка входа варианта Б (braverman.kz/b) — новая воронка для A/B-эксперимента.
// Те же вопросы, подсчёт, оплата и промокоды, что на основном сайте; свои экраны и своё состояние.
// Порядок запуска важен: нарезка и метка варианта выставляются до первого события (визит должен нести вариант).
import './b.css'
import { captureAttribution } from '../attribution'
import { initAnalytics, setVariant } from '../analytics'
import { checkPromo } from '../api'
import { state, save, clearAll, variantOf, isFinished, MILES, type Hook } from './state'
import { onLangChange } from './lang'
import { go, rerender } from './nav'
import { initLangSwitch } from './ui'
import { showIntro, setPromoBad } from './screens/intro'
import { showQuiz, initQuiz } from './screens/quiz'
import { showMile } from './screens/mile'
import { finish, showOffer } from './screens/offer'
import { showInvoice, showKaspiTest } from './screens/invoice'
import { showResult } from './screens/result'

captureAttribution()

const qs = new URLSearchParams(location.search)
if (qs.get('reset') === '1') { clearAll(); history.replaceState(null, '', '/b') }

// Нарезка из ссылки (/b/work → ?h=work) — только для нового посетителя. Если тест уже начат или пройден
// на этом устройстве, нарезка остаётся прежней: события одного человека не должны «переезжать» между нарезками.
if (state.answers.length === 0 && !state.attemptId && !state.resultToken) {
  const h = qs.get('h')
  state.hook = (h === 'work' || h === 'love' ? h : 'all') as Hook
  save()
}

setVariant(variantOf())
initAnalytics()

Object.assign(go, {
  intro: showIntro,
  quiz: showQuiz,
  mile: showMile,
  finish,
  offer: showOffer,
  invoice: showInvoice,
  result: showResult
})
initLangSwitch()
initQuiz()
onLangChange(rerender)

/** Куда вести по сохранённому состоянию. */
function route() {
  if (state.resultToken) return go.result(state.resultToken)
  if (isFinished()) {
    if (state.invoiceId) return go.invoice()
    // ответы ещё не дошли до сервера (или ждём результат по промокоду / пересдаче) — отправляем
    return state.finishedOnServer && !state.promo && !state.retakeOf ? go.offer() : go.finish()
  }
  // остановились на промежуточном выводе — показываем его снова (имя на 150-м обязательно)
  if (MILES.includes(state.index) && !state.milesSeen.includes(state.index)) return go.mile(state.index)
  if (state.answers.length > 0) return go.quiz()
  go.intro()
}

/** Ссылка /b?promo=КОД: код запоминаем и убираем из адреса; погасится в конце теста. */
async function startPromo(raw: string) {
  qs.delete('promo')
  history.replaceState(null, '', `/b${qs.toString() ? `?${qs}` : ''}`)
  try {
    const res = await checkPromo(raw)
    if (!res.valid) return setPromoBad(true)
    // уже есть результат на этом устройстве — подарок значит новый тест
    if (state.resultToken) clearAll()
    state.promo = res.code || raw.trim().toUpperCase()
  } catch {
    state.promo = raw.trim().toUpperCase() // сеть — сервер проверит код при завершении теста
  }
  save()
}

const r = qs.get('r')
const p = qs.get('p')
const promo = qs.get('promo')
if (qs.get('kaspitest') === '1') showKaspiTest()
else if (p) location.replace(`/?p=${encodeURIComponent(p)}`) // оплата вне сайта живёт на основном сайте
else if (r) go.result(r)
else if (promo) startPromo(promo).then(route)
else route()
