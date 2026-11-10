// Первый экран варианта Б: автор на самом верху, заголовок под нарезку, четыре типа, что человек получит, цена сразу, закреплённая кнопка.
// Имени здесь не спрашиваем — тест начинается одним нажатием.
import { NEURO_ORDER } from '../../../shared/scoring'
import { esc } from '../../dom'
import { authorRow } from '../../author'
import { T } from '../lang'
import { B } from '../text'
import { state, resetForNewTest } from '../state'
import { go, show } from '../nav'
import { COLORS, onColor, langSwitch, mount, price, q } from '../ui'
import { publicStats } from '../api'

let finishedCount = 0 // счётчик «уже прошли тест» — запрашиваем один раз
let promoBad = false // ссылка с недействительным промокодом — поясняем на первом экране

export function setPromoBad(v: boolean) { promoBad = v }

export function showIntro() {
  show(render)
  if (!finishedCount) {
    publicStats().then(r => {
      finishedCount = Number(r.finished) || 0
      paintCounter()
    }).catch(() => {})
  }
}

function paintCounter() {
  const el = document.getElementById('fomo')
  if (!el) return
  // на маленьких числах счётчик не убеждает — показываем от сотни
  el.hidden = finishedCount < 100
  el.textContent = B().fomo(finishedCount.toLocaleString('ru-RU'))
}

function render() {
  const b = B()
  const t = T()
  mount(`
    <div class="card">
      <div class="top"><span class="brand">${esc(t.ui.badge)}</span>${langSwitch()}</div>
      ${authorRow('author.webp', t.ui.authorRole)}
      <h1 class="title">${esc(b.hooks[state.hook])}</h1>
      <p class="lead">${esc(b.lead)}</p>
      <div class="tiles">${NEURO_ORDER.map(k => `<div class="tile" style="background:${COLORS[k]};color:${onColor(k)}">${esc(t.neuro[k].title)}</div>`).join('')}<div class="q" aria-hidden="true">?</div></div>
      <p class="ask">${esc(b.typesH)}</p>
      <div class="facts"><div><b>≈20</b>${esc(t.ui.factMinutes)}</div><div><b>200</b>${esc(t.ui.factQuestions)}</div><div><b>4</b>${esc(t.ui.factNeuro)}</div></div>
      <h2>${esc(b.valueH)}</h2>
      <ul class="value">${b.value.map((v, i) => `<li>${esc(v)}<span class="${i ? '' : 'fr'}">${esc(i ? b.tagPaid : b.tagFree)}</span></li>`).join('')}</ul>
      <p class="offer2">${esc(b.offerLine(price()))}</p>
      ${state.promo ? `<p class="gift">${esc(t.ui.promoNote)}</p>` : ''}
      ${promoBad ? `<p class="warn">${esc(t.ui.promoBad)}</p>` : ''}
      <a class="link" href="/?recover=1">${esc(t.ui.recoverLink)}</a>
      <p class="legal">${esc(t.ui.disclaimer)}</p>
      <a class="legal-link" href="/privacy">${esc(t.ui.privacyLink)}</a>
    </div>
    <div class="sticky"><p class="fomo" id="fomo" hidden></p><button class="btn" id="start">${esc(b.startBtn)}</button></div>`)
  paintCounter()
  q('#start').addEventListener('click', () => {
    resetForNewTest({ promo: state.promo })
    go.quiz()
  })
}
