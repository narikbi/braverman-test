// Диалог «Оплата вне сайта»: клиент оплатил через менеджера (Halyk, перевод, наличные).
// Создаёт уже оплаченное прохождение и даёт личную ссылку на тест (/?p=…): скопировать или отправить в WhatsApp.
import { adminGet, adminPost, ApiError } from '../api'
import { esc } from '../format'
import { toast } from '../components/toast'
import { META } from '../state'
import { navigate } from '../router'

const METHODS = ['Halyk', 'Kaspi перевод', 'Наличные', 'Другое']
const ERR: Record<string, string> = { phone: 'Проверьте номер: нужен казахстанский мобильный, +7 7XX XXX XX XX', amount: 'Проверьте сумму' }

export function openPrepaidDialog(onDone: () => void) {
  const bg = document.createElement('div'); bg.className = 'drawer-bg'
  const dr = document.createElement('div'); dr.className = 'drawer'
  const lbl = (s: string) => `<label style="font-size:12.5px;font-weight:600;color:var(--a-text-2)">${s}</label>`
  dr.innerHTML = `
    <div class="drawer-head"><h2>Оплата вне сайта</h2><button class="close" id="p-close">×</button></div>
    <div class="drawer-body" id="p-body">
      <div class="muted" style="font-size:13px">Клиент оплатил через менеджера (Halyk, перевод, наличные). Создадим оплаченное прохождение и личную ссылку на тест — после теста результат откроется сразу, без оплаты.</div>
      <div>${lbl('Телефон клиента (WhatsApp)')}<input class="input" id="p-phone" type="tel" inputmode="tel" placeholder="+7 7__ ___ __ __" /></div>
      <div>${lbl('Имя (необязательно — клиент впишет сам)')}<input class="input" id="p-name" placeholder="Айгерім" /></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>${lbl('Способ оплаты')}<select class="input" id="p-method">${METHODS.map(m => `<option>${esc(m)}</option>`).join('')}</select></div>
        <div>${lbl('Сумма, ₸')}<input class="input" id="p-amount" type="number" inputmode="numeric" min="0" value="${META.price || 5000}" /></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>${lbl('Язык теста')}<select class="input" id="p-lang"><option value="kk">Қазақша</option><option value="ru">Русский</option></select></div>
        <div>${lbl('Тренер')}<select class="input" id="p-trainer"><option value="">—</option></select></div>
      </div>
      <div>${lbl('Комментарий')}<textarea class="input" id="p-note" placeholder="кто из менеджеров, чек, договорённости…"></textarea></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="p-send" checked /> Сразу отправить ссылку клиенту в WhatsApp</label>
      <div class="field-error" id="p-err" style="display:none;color:var(--a-red);font-weight:600"></div>
      <div class="row-actions"><button class="btn btn-primary" id="p-save">Создать ссылку на тест</button></div>
    </div>`
  document.body.append(bg, dr)
  requestAnimationFrame(() => { bg.classList.add('show'); dr.classList.add('show') })
  const close = () => { bg.classList.remove('show'); dr.classList.remove('show'); setTimeout(() => { bg.remove(); dr.remove() }, 250) }
  bg.addEventListener('click', close)
  dr.querySelector('#p-close')!.addEventListener('click', close)
  const $ = <T extends HTMLElement>(sel: string) => dr.querySelector(sel) as T
  const err = $('#p-err')

  adminGet<{ items: { code: string; name: string; active: boolean }[] }>('trainers').then(r => {
    $('#p-trainer').innerHTML = '<option value="">—</option>' + r.items.filter(t => t.active).map(t => `<option value="${esc(t.code)}">${esc(t.name)} (${esc(t.code)})</option>`).join('')
  }).catch(() => {})

  $('#p-save').addEventListener('click', async () => {
    err.style.display = 'none'
    const btn = $<HTMLButtonElement>('#p-save'); btn.disabled = true
    try {
      const r = await adminPost<{ id: number; link: string; waSent: boolean }>('prepaid-create', {
        phone: $<HTMLInputElement>('#p-phone').value,
        name: $<HTMLInputElement>('#p-name').value,
        method: $<HTMLSelectElement>('#p-method').value,
        amount: Number($<HTMLInputElement>('#p-amount').value),
        lang: $<HTMLSelectElement>('#p-lang').value,
        trainerCode: $<HTMLSelectElement>('#p-trainer').value,
        note: $<HTMLTextAreaElement>('#p-note').value,
        send: $<HTMLInputElement>('#p-send').checked
      })
      const sendWanted = $<HTMLInputElement>('#p-send').checked
      $('#p-body').innerHTML = `
        <div style="font-weight:700;font-size:16px">Ссылка на тест готова ✅</div>
        <div class="muted" style="font-size:13px">${sendWanted ? (r.waSent ? 'Ссылка отправлена клиенту в WhatsApp.' : '<span style="color:var(--a-red)">WhatsApp не доставлен</span> — скопируйте ссылку и отправьте клиенту сами.') : 'Скопируйте ссылку и отправьте клиенту.'} После теста результат откроется сразу и тоже придёт в WhatsApp.</div>
        <div class="copy-box"><span>🔗</span><code>${esc(r.link)}</code><button class="btn btn-sm" id="p-copy">Копировать</button></div>
        <div class="row-actions">
          <button class="btn btn-sm" id="p-copy-msg">Копировать с текстом</button>
          <button class="btn btn-sm" id="p-open">Открыть карточку клиента</button>
          <button class="btn btn-sm btn-primary" id="p-more">Добавить ещё</button>
        </div>`
      const lang = $<HTMLSelectElement>('#p-lang')?.value
      $('#p-copy').addEventListener('click', () => navigator.clipboard.writeText(r.link).then(() => toast('Ссылка скопирована')))
      $('#p-copy-msg').addEventListener('click', () => navigator.clipboard.writeText(inviteText(r.link, lang)).then(() => toast('Текст со ссылкой скопирован')))
      $('#p-open').addEventListener('click', () => { close(); navigate(`#/attempts/${r.id}`) })
      $('#p-more').addEventListener('click', () => { close(); openPrepaidDialog(onDone) })
      onDone()
    } catch (e) {
      btn.disabled = false
      err.textContent = e instanceof ApiError ? (ERR[e.code] || `Ошибка: ${e.code}`) : 'Не удалось создать'
      err.style.display = 'block'
    }
  })
}

/** Текст для ручной отправки (WhatsApp/Telegram менеджера) — на казахском и русском. */
export function inviteText(link: string, lang = 'kk'): string {
  const kk = `Сәлеметсіз бе! Тұлғаның биохимиялық типін анықтау тестінің төлемі қабылданды. Тестті осы сілтеме арқылы өтіңіз:\n${link}\nТест 20 минуттай алады, соңында нәтиже мен видео-талдау бірден ашылады.`
  const ru = `Здравствуйте! Оплата теста на биохимический тип личности получена. Пройдите тест по ссылке:\n${link}\nТест займёт около 20 минут, в конце сразу откроются результат и видео-разбор.`
  return lang === 'ru' ? ru : kk
}
