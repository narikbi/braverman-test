// Тест варианта Б: те же 200 вопросов по одному. Крупный номер, большие «Да/Нет», прогресс из четырёх отрезков,
// подсказка, когда будет следующий промежуточный вывод. После 50/100/150 ответов — экран вывода (mile.ts).
import { neuroAt, questionIndexAt } from '../../../shared/scoring'
import { esc } from '../../dom'
import { track } from '../../analytics'
import { startAttempt } from '../../api'
import { T, lang } from '../lang'
import { B } from '../text'
import { state, save, setAttempt, variantOf, TOTAL, MILES } from '../state'
import { go, show } from '../nav'
import { seg, mount, q } from '../ui'

let onScreen = false
let lastAnswer = 0

export function initQuiz() {
  // клавиши 1 / 2 — для тех, кто проходит с компьютера
  document.addEventListener('keydown', e => {
    if (!onScreen || !document.getElementById('qtext')) return
    if (e.key === '1') answer(1)
    else if (e.key === '2') answer(0)
  })
}

/** Показать текущий вопрос. Попытки на сервере ещё нет — создаём её в фоне, тест не ждёт. */
export function showQuiz() {
  onScreen = true
  show(() => render(true))
  if (!state.attemptId) {
    startAttempt({ name: state.name, lang, variant: variantOf() })
      .then(r => { if (r.id) setAttempt(r.id, r.token) })
      .catch(() => {})
  }
}

function render(moved: boolean) {
  const b = B()
  const u = T().ui
  const i = state.index
  const n = i + 1
  const nextMile = MILES.find(m => m >= n)
  mount(`
    <div>
      ${seg(i)}
      <div class="qtop"><button type="button" id="qback">${esc(u.back)}</button><span>${esc(u.counter(n, TOTAL))}</span></div>
      <div class="card qz">
        <p class="qnum">${n}</p>
        <h1 class="qtext" id="qtext">${esc(T().questions[neuroAt(i)][questionIndexAt(i)])}</h1>
        <p class="nextm">${esc(nextMile ? b.next(nextMile) : b.nextEnd)}</p>
        <div class="yn"><button type="button" class="no" data-a="0">${esc(u.no)}</button><button type="button" class="yes" data-a="1">${esc(u.yes)}</button></div>
      </div>
    </div>`, { moved, fast: true })
  q('#qback').addEventListener('click', back)
  q('.yn .no').addEventListener('click', () => answer(0))
  q('.yn .yes').addEventListener('click', () => answer(1))
}

function answer(value: 0 | 1) {
  // двойное касание не должно ответить сразу на два вопроса
  const now = Date.now()
  if (now - lastAnswer < 180) return
  lastAnswer = now
  state.answers[state.index] = value
  const done = state.index + 1
  if (done % 25 === 0 && done < TOTAL) track(`QuizStep_${done}`)
  if (done >= TOTAL) {
    state.answers.length = TOTAL
    save()
    onScreen = false
    return go.finish()
  }
  state.index = done
  save()
  if (MILES.includes(done) && !state.milesSeen.includes(done)) {
    onScreen = false
    return go.mile(done)
  }
  render(true)
}

function back() {
  if (state.index === 0) { onScreen = false; return go.intro() }
  state.index--
  save()
  render(true)
}
