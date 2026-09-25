// Экран 5: результат (только после оплаты). Данные — с сервера по токену ?r=.
import { $, esc, showScreen, currentScreen } from '../dom'
import { state, save, clearAll, resetForNewTest } from '../state'
import { T, lang, onLangChange } from '../i18n'
import { getResult, ApiError, type ResultPayload } from '../api'
import { renderProfileChart, chartImage } from '../chart'
import { renderVideo, relabelVideo, stopVideo } from '../video'
import { NEURO_ORDER, NEURO_COLOR, type NeuroKey } from '../../shared/scoring'
import { showIntro } from './intro'
import { authorRow } from '../author'
import { startQuiz } from './quiz'
import { renderCheckout } from './checkout'

let last: ResultPayload | null = null
let lastToken = ''

export function initResult() {
  $('downloadBtn').addEventListener('click', () => {
    const img = chartImage($<HTMLCanvasElement>('chart'))
    if (!img) return
    const a = document.createElement('a')
    a.download = `${T().ui.fileName}-${last?.name || 'result'}.png`
    a.href = img
    a.click()
  })
  $('restartBtn').addEventListener('click', () => {
    stopVideo()
    clearAll()
    last = null
    history.replaceState(null, '', '/')
    $<HTMLInputElement>('nameInput').value = ''
    showIntro()
  })
  $('copyLinkBtn').addEventListener('click', () => {
    const url = resultUrl()
    navigator.clipboard?.writeText(url).then(() => {
      $('copyLinkBtn').textContent = T().ui.resultLink.copied
      setTimeout(() => { $('copyLinkBtn').textContent = T().ui.resultLink.copy }, 2000)
    })
  })
  onLangChange(() => { if (currentScreen() === 'result' && last) { render(last); relabelVideo() } })
}

const resultUrl = () => `${location.origin}/?r=${lastToken}`

/** Экран результата в состоянии загрузки (в т.ч. пока засчитывается бесплатная пересдача). */
export function showResultLoading() {
  showScreen('result')
  $('resultBody').hidden = true
  $('resultLoading').hidden = false
  $('resultError').hidden = true
}

export async function openResult(r: string) {
  lastToken = r
  showResultLoading()
  try {
    const data = await getResult(r)
    last = data
    state.resultToken = r
    save()
    render(data)
    renderVideo(data.combo, lang)
    $('resultLoading').hidden = true
    $('resultBody').hidden = false
  } catch (e) {
    $('resultLoading').hidden = true
    const code = e instanceof ApiError ? e.code : ''
    if (code === 'unpaid') {
      // оплата ещё не подтверждена — обратно к оплате (если это наша попытка)
      state.resultToken = ''
      save()
      if (state.attemptToken && state.answers.length === 200) return renderCheckout({})
    }
    if (code === 'not_found' || code === 'unpaid') { state.resultToken = ''; save() }
    $('resultError').textContent = code === 'network' ? T().ui.errors.network : T().ui.errors.generic
    $('resultError').hidden = false
  }
}

function render(d: ResultPayload) {
  const N = T().neuro
  const dom = N[d.dominant]
  // Две доминанты — та же пара, что и в видео-разборе: доминанта + сильнейший из противоположной пары
  const partner = String(d.combo || '').split('-')[1] as NeuroKey | undefined
  const pair: NeuroKey[] = partner && partner !== d.dominant && N[partner] ? [d.dominant, partner] : [d.dominant]
  $('comboLine').innerHTML = pair
    .map(k => `<span class="combo-chip" style="background:${NEURO_COLOR[k]}1f"><span class="combo-dot" style="background:${NEURO_COLOR[k]}"></span>${esc(N[k].name)}</span>`)
    .join('<span class="combo-plus">+</span>')
  renderRetake(d)
  $('videoAuthor').innerHTML = authorRow('author-mic.webp', T().ui.authorVideoRole)
  $('dominantTitle').textContent = dom.title
  $('dominantMeta').textContent = `${dom.lobe} · ${dom.func}`
  $('dominantDesc').textContent = dom.description

  const list = $('scoreList')
  list.innerHTML = ''
  NEURO_ORDER.forEach(k => {
    const fillW = Math.round((d.scores[k] / d.max) * 100)
    const li = document.createElement('li')
    li.innerHTML =
      `<span class="dot" style="background:${NEURO_COLOR[k]}"></span>` +
      `<span class="label">${esc(N[k].name)}</span>` +
      `<span class="track"><span class="fill" style="width:${fillW}%;background:${NEURO_COLOR[k]}"></span></span>` +
      `<span class="pct">${d.scores[k]} / ${d.max}</span>`
    list.appendChild(li)
  })
  const low = N[d.lowest]
  $('lowNote').innerHTML = `<b>${esc(T().ui.lowPrefix)} — ${esc(low.name)} (${d.scores[d.lowest]} / ${d.max}):</b> ${esc(low.lowNote)}`

  renderProfileChart($<HTMLCanvasElement>('chart'), d.scores, d.max, d.dominant, NEURO_ORDER.map(k => N[k].name), { tooltip: T().ui.tooltip })

  const url = resultUrl()
  $('resultLinkText').textContent = url
  $<HTMLAnchorElement>('shareWaBtn').href = `https://wa.me/?text=${encodeURIComponent(T().ui.resultLink.waText(url))}`
}

/** «Заблокированность отделов»: предупреждение сверху и бесплатная пересдача (или ссылка на уже пройденную). */
function renderRetake(d: ResultPayload) {
  const card = $('retakeCard')
  const pairs = d.blocked ?? []
  if (!pairs.length || !d.retake) { card.hidden = true; card.innerHTML = ''; return }
  const u = T().ui.retake
  const pairText = pairs
    .map(([a, b]) => `${u.pairs[`${a}_${b}` as keyof typeof u.pairs]} (${d.scores[a]} = ${d.scores[b]})`)
    .join(', ')
  const action = d.retake.newResult
    ? `<p class="retake-note">${esc(u.done)}</p><a class="btn btn-primary btn-block" href="/?r=${esc(d.retake.newResult)}" id="retakeOpenNew">${esc(u.openNew)}</a>`
    : d.retake.allowed
      ? `<button class="btn btn-primary btn-block" id="retakeBtn">${esc(u.btn)}</button><p class="retake-note">${esc(u.free)}</p>`
      : `<p class="retake-note">${esc(u.limit)}</p>`
  card.innerHTML = `
    <div class="retake-title">⚠️ ${esc(u.title)}</div>
    <p class="retake-text">${esc(u.text(pairText))}</p>
    ${action}`
  card.hidden = false
  card.querySelector('#retakeBtn')?.addEventListener('click', () => {
    stopVideo()
    const name = last?.name || state.name
    resetForNewTest(name)
    state.retakeOf = lastToken
    save()
    last = null
    history.replaceState(null, '', '/')
    window.scrollTo(0, 0)
    startQuiz()
  })
  card.querySelector<HTMLAnchorElement>('#retakeOpenNew')?.addEventListener('click', e => {
    e.preventDefault()
    const r = d.retake!.newResult!
    history.replaceState(null, '', `/?r=${r}`)
    window.scrollTo(0, 0)
    openResult(r)
  })
}
