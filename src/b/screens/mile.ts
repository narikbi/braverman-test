// Промежуточные выводы после 50, 100 и 150 ответов: экран в цвете типа, который пока впереди (по настоящим ответам).
// На 100-м — просьба оставить номер WhatsApp с согласием (можно пропустить; сообщений пока не шлём).
// На 150-м — «мы почти у цели» и имя (обязательно; при пересдаче имя уже известно и поле не показываем).
import { computeScores, dominantOf } from '../../../shared/scoring'
import { esc, attachPhoneMask, phoneDigits } from '../../dom'
import { T } from '../lang'
import { B } from '../text'
import { state, save } from '../state'
import { go, show } from '../nav'
import { COLORS, onColor, seg, mount, q } from '../ui'
import { saveContact } from '../api'

export function showMile(n: number) {
  show(() => render(n))
}

function proceed(n: number) {
  if (!state.milesSeen.includes(n)) state.milesSeen.push(n)
  save()
  go.quiz()
}

function render(n: number) {
  const b = B()
  const t = T()
  const leader = dominantOf(computeScores(state.answers.slice(0, n)))
  // номер уже есть (оставлял раньше или платил с него — при пересдаче) — второй раз не спрашиваем
  const askPhone = n === 100 && !state.waPhone && !state.phone
  const askName = n === 150 && !state.name
  mount(`
    <div class="mile" style="background:${COLORS[leader]};color:${onColor(leader)}">
      ${seg(n, true)}
      <p class="mlead">${esc(b.mile[n as 50 | 100 | 150])}</p>
      <h1>${esc(t.neuro[leader].title)}</h1>
      <p class="sub">${esc(b.leadNote)}</p>
      ${askPhone ? `
        <div class="mform">
          <h2>${esc(b.saveH)}</h2>
          <p class="sub">${esc(b.saveB)}</p>
          <label class="f" for="waph">${esc(b.waLabel)}</label>
          <input class="input" id="waph" type="tel" inputmode="tel" autocomplete="tel" placeholder="${esc(t.ui.checkout.phonePlaceholder)}" />
          <label class="check"><input type="checkbox" id="waok" /><span>${esc(b.consent)}</span></label>
          <p class="err" id="merr" role="alert" hidden></p>
        </div>
        <button type="button" class="btn" id="mgo">${esc(b.saveBtn)}</button>
        <button type="button" class="link" id="mskip">${esc(b.skip)}</button>`
      : askName ? `
        <div class="mform">
          <h2>${esc(b.nameH)}</h2>
          <p class="sub">${esc(b.nameB)}</p>
          <input class="input" id="mname" type="text" autocomplete="given-name" maxlength="60" placeholder="${esc(b.namePh)}" />
          <p class="err" id="merr" role="alert" hidden></p>
        </div>
        <button type="button" class="btn" id="mgo">${esc(b.go)}</button>`
      : `<button type="button" class="btn" id="mgo">${esc(b.go)}</button>`}
    </div>`)

  const err = (msg: string, focus: HTMLElement) => {
    const el = q('#merr')
    el.textContent = msg
    el.hidden = false
    focus.focus()
  }

  if (askPhone) {
    const phone = q<HTMLInputElement>('#waph')
    attachPhoneMask(phone, () => { q('#merr').hidden = true })
    q('#mskip').addEventListener('click', () => proceed(n))
    q('#mgo').addEventListener('click', () => {
      const digits = phoneDigits(phone)
      if (!/^77\d{9}$/.test(digits)) return err(t.ui.checkout.phoneError, phone)
      if (!q<HTMLInputElement>('#waok').checked) return err(b.consentErr, q('#waok'))
      state.waPhone = '+' + digits
      state.phone = state.phone || state.waPhone // на экране оплаты номер уже будет подставлен
      state.waSaved = false
      save()
      // сервер запишет номер в фоне; не вышло (попытка ещё не создана) — повторим на экране оплаты
      saveContact({ phone: state.waPhone, consent: true }).then(ok => { if (ok) { state.waSaved = true; save() } })
      proceed(n)
    })
    return
  }

  if (askName) {
    const name = q<HTMLInputElement>('#mname')
    const submit = () => {
      const v = name.value.trim().slice(0, 60)
      if (!v) return err(b.nameErr, name)
      state.name = v
      save()
      saveContact({ name: v }) // имя ещё раз уйдёт вместе с ответами в конце теста
      proceed(n)
    }
    name.addEventListener('input', () => { q('#merr').hidden = true })
    name.addEventListener('keydown', e => { if (e.key === 'Enter') submit() })
    q('#mgo').addEventListener('click', submit)
    return
  }

  q('#mgo').addEventListener('click', () => proceed(n))
}
