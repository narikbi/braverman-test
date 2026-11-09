// Полный результат варианта Б — на один экран телефона: цветной блок с типом и комбинацией, видео-разбор,
// четыре шкалы N/50, зона внимания, «Отправить себе в WhatsApp» и три маленькие кнопки (ссылка, график, заново).
// При «заблокированности отделов» (равные баллы в паре) — карточка бесплатной пересдачи, как на основном сайте.
import { NEURO_ORDER, type NeuroKey } from '../../../shared/scoring'
import { esc } from '../../dom'
import { track } from '../../analytics'
import { getResult, ApiError, type ResultPayload } from '../../api'
import { attachVideoSource } from '../../video-source'
import { renderProfileChart, chartImage } from '../../chart'
import { T, lang } from '../lang'
import { B } from '../text'
import { state, save, clearAll, resetForNewTest, isFinished } from '../state'
import { go, show, onLeave } from '../nav'
import { COLORS, onColor, langSwitch, mount, q } from '../ui'

let token = ''
let data: ResultPayload | null = null
let playTracked = false

export async function showResult(r: string) {
  token = r
  data = null
  show(() => mount(`<div class="card center"><span class="spin big"></span><p class="lead">${esc(B().loading)}</p></div>`))
  try {
    data = await getResult(r)
    state.resultToken = r
    save()
    playTracked = false
    show(render)
  } catch (e) {
    const code = e instanceof ApiError ? e.code : ''
    if (code === 'not_found' || code === 'unpaid') { state.resultToken = ''; save() }
    // оплата ещё не подтверждена, а тест наш и пройден — обратно к оплате
    if (code === 'unpaid' && state.attemptToken && isFinished()) return go.offer()
    show(() => renderError(code === 'network' ? T().ui.errors.network : T().ui.errors.generic))
  }
}

function renderError(msg: string) {
  mount(`<div class="card center"><p class="warn">${esc(msg)}</p><a class="btn ghost" href="/b">${esc(B().toIntro)}</a></div>`)
}

const resultUrl = () => `${location.origin}/b?r=${token}`

function render() {
  const d = data!
  const b = B()
  const t = T()
  const dom = d.dominant
  const x = t.neuro[dom]
  const low = d.lowest
  const partner = String(d.combo || '').split('-')[1] as NeuroKey | undefined
  const pair = partner && partner !== dom && t.neuro[partner] ? `${t.neuro[partner].title} (${t.neuro[partner].name})` : ''
  const retake = renderRetake(d)
  const url = resultUrl()
  mount(`
    <div class="rcard">
      <div class="rhero" style="background:${COLORS[dom]};color:${onColor(dom)}">
        <div class="rtop"><span>${esc(t.ui.resultEyebrow)}</span>${langSwitch()}</div>
        <h1>${esc(x.title)}</h1>
        <p>${esc(x.name)} · ${esc(x.lobe)}</p>
        ${pair ? `<p>${esc(b.pairH)}: ${esc(pair)}</p>` : ''}
      </div>
      ${retake}
      <div class="rvid"><video id="rvideo" controls playsinline preload="metadata" controlslist="nodownload"></video><p class="warn" id="rvErr" hidden></p></div>
      <div class="rbars" role="img" aria-label="${esc(t.ui.chartTitle)}: ${NEURO_ORDER.map(k => `${t.neuro[k].name} ${d.scores[k]} / ${d.max}`).join(', ')}">
        ${NEURO_ORDER.map(k => `<div class="${k === dom ? 'lead-row' : ''}"><span>${esc(t.neuro[k].name)}</span><span class="rt"><i style="width:${(d.scores[k] / d.max) * 100}%;background:${COLORS[k]}"></i></span><b>${d.scores[k]}/${d.max}</b></div>`).join('')}
      </div>
      <div class="rattn" style="background:${COLORS[low]};color:${onColor(low)}"><b>${esc(t.ui.lowPrefix)}: ${esc(t.neuro[low].name)}.</b> ${esc(t.neuro[low].lowNote)}</div>
      <p class="rdesc">${esc(x.description)}</p>
      <a class="btn rwa" id="wa" href="https://wa.me/?text=${encodeURIComponent(t.ui.resultLink.waText(url))}" target="_blank" rel="noopener">${esc(t.ui.resultLink.shareWa)}</a>
      <div class="ract"><button type="button" id="copy">${esc(b.copyLink)}</button><button type="button" id="dl">${esc(b.chartBtn)}</button><button type="button" id="restart">${esc(t.ui.restart)}</button></div>
      <p class="rlegal">${esc(t.ui.disclaimer)}</p>
    </div>`, { fit: !retake })

  // ── видео-разбор комбинации (HLS с выбором качества, запасной mp4) ──
  const v = q<HTMLVideoElement>('#rvideo')
  const showVideoErr = () => {
    const el = q('#rvErr')
    el.innerHTML = `${esc(t.ui.videoError)} <button type="button" class="inline" id="rvRetry">${esc(t.ui.videoRetry)}</button>`
    el.hidden = false
    q('#rvRetry').addEventListener('click', () => show(render))
  }
  const handle = attachVideoSource(v, d.combo, lang, showVideoErr)
  v.onplay = () => { if (!playTracked) { playTracked = true; track('VideoPlay') } }
  onLeave(() => { v.pause(); handle.destroy() })

  // ── ссылка, график, заново ──
  const copyBtn = q<HTMLButtonElement>('#copy')
  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(url).then(() => {
      copyBtn.textContent = t.ui.resultLink.copied
      setTimeout(() => { if (copyBtn.isConnected) copyBtn.textContent = b.copyLink }, 1600)
    }).catch(() => {})
  })
  q('#dl').addEventListener('click', () => downloadChart(d))
  q('#restart').addEventListener('click', () => {
    clearAll()
    history.replaceState(null, '', '/b')
    go.intro()
  })

  // ── бесплатная пересдача ──
  document.getElementById('retakeBtn')?.addEventListener('click', () => {
    resetForNewTest({ name: d.name || state.name, phone: state.phone, waPhone: state.waPhone, waSaved: state.waSaved, retakeOf: token })
    history.replaceState(null, '', '/b')
    go.quiz()
  })
}

/** «Заблокированность отделов»: предупреждение и бесплатная пересдача (или ссылка на уже пройденную). */
function renderRetake(d: ResultPayload): string {
  const pairs = d.blocked ?? []
  if (!pairs.length || !d.retake) return ''
  const u = T().ui.retake
  const pairText = pairs.map(([a, b]) => `${u.pairs[`${a}_${b}` as keyof typeof u.pairs]} (${d.scores[a]} = ${d.scores[b]})`).join(', ')
  const action = d.retake.newResult
    ? `<p class="note">${esc(u.done)}</p><a class="btn" href="/b?r=${esc(d.retake.newResult)}">${esc(u.openNew)}</a>`
    : d.retake.allowed
      ? `<button type="button" class="btn" id="retakeBtn">${esc(u.btn)}</button><p class="note">${esc(u.free)}</p>`
      : `<p class="note">${esc(u.limit)}</p>`
  return `<div class="retake"><b>⚠️ ${esc(u.title)}</b><p>${esc(u.text(pairText))}</p>${action}</div>`
}

/** График профиля по парам — тот же, что на основном сайте: рисуем за экраном и сохраняем картинкой. */
function downloadChart(d: ResultPayload) {
  const t = T()
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px;height:320px'
  const canvas = document.createElement('canvas')
  box.appendChild(canvas)
  document.body.appendChild(box)
  renderProfileChart(canvas, d.scores, d.max, d.dominant, NEURO_ORDER.map(k => t.neuro[k].name), { text: { lead: t.ui.pairLead, tie: t.ui.pairTie } })
  const img = chartImage(canvas)
  box.remove()
  if (!img) return
  const a = document.createElement('a')
  a.href = img
  a.download = `${t.ui.fileName}-${d.name || 'result'}.png`
  a.click()
}
