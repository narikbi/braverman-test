// Промокоды на бесплатный тест: список со статусами, создание (кому, сколько раз, свой код), отключение.
// Код вводят на странице оплаты; по ссылке /promo/<код> тест проходят без оплаты — результат сразу.
import { adminGet, adminPost, ApiError } from '../api'
import { esc, fmtDateFull } from '../format'
import { toast } from '../components/toast'
import { dbMissing } from './shared'

type Promo = {
  id: number; code: string; note: string; max_uses: number; used: number; active: boolean
  created_by: string; created_at: string; last_used_at: string | null
  status: 'active' | 'used' | 'off'; link: string
  attempts: { id: number; name: string; paid_at: string }[]
}

const STATUS: Record<Promo['status'], { label: string; cls: string }> = {
  active: { label: 'Активен', cls: 'badge-paid' },
  used: { label: 'Использован', cls: 'badge-new' },
  off: { label: 'Отключён', cls: 'badge-refused' }
}
const ERR: Record<string, string> = {
  code: 'Код: 3–32 символа, латиница, цифры и дефис',
  code_taken: 'Такой код уже есть — придумайте другой',
  uses: 'Сколько раз: от 1 до 1000'
}

/** Подарочный текст со ссылкой — на казахском и русском (клиент выберет язык на сайте). */
export function promoGiftText(p: Pick<Promo, 'code' | 'link'>): string {
  return `Сәлеметсіз бе! Сізге тұлғаның биохимиялық типін анықтайтын тест сыйлаймыз 🎁 Тестті осы сілтеме арқылы тегін өтіңіз:\n${p.link}\n` +
    `Тест 20 минуттай алады, соңында нәтиже мен видео-талдау бірден ашылады.\n\n` +
    `Здравствуйте! Дарим вам тест на биохимический тип личности 🎁 Пройдите его бесплатно по ссылке:\n${p.link}\n` +
    `Тест займёт около 20 минут, в конце сразу откроются результат и видео-разбор.\n\n` +
    `Промокод: ${p.code}`
}

const timesRu = (n: number) => { const d = n % 10, h = n % 100; return `${n} ${d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'раза' : 'раз'}` }
const copy = (text: string, msg: string) => navigator.clipboard.writeText(text).then(() => toast(msg))

export async function renderPromos(page: HTMLElement) {
  page.innerHTML = `<div class="card"><div class="card-body">
    <div class="toolbar">
      <span class="muted" style="font-size:13px">Код вводят на странице оплаты, а по ссылке тест проходят без оплаты. Создать код можно и в Telegram-боте: <code>/promo</code></span>
      <button class="btn btn-primary" id="add">＋ Промокод</button>
    </div>
    <div id="tbl"><div class="skel" style="height:120px"></div></div></div></div>`
  page.querySelector('#add')!.addEventListener('click', () => openPromoDialog(() => load()))

  const load = async () => {
    let items: Promo[]
    try {
      items = (await adminGet<{ items: Promo[] }>('promos')).items
    } catch (e) {
      if (e instanceof ApiError && e.code === 'db_not_configured') return dbMissing(page)
      throw e
    }
    page.querySelector('#tbl')!.innerHTML = `<div class="table-wrap"><table class="tbl cards">
      <thead><tr><th>Промокод</th><th class="num">Использован</th><th>Статус</th><th>Кто прошёл</th><th>Создан</th><th>Скопировать</th></tr></thead>
      <tbody>${items.length ? items.map(p => `<tr data-id="${p.id}">
        <td data-l="Промокод"><div><code style="font-weight:700;white-space:nowrap">${esc(p.code)}</code>${p.note ? `<div class="muted" style="font-size:12.5px">${esc(p.note)}</div>` : ''}</div></td>
        <td class="num" data-l="Использован"><span><b>${p.used}</b> из ${p.max_uses}</span></td>
        <td data-l="Статус"><div><span class="badge ${STATUS[p.status].cls}">${STATUS[p.status].label}</span><div><button class="link-btn" data-toggle="${p.id}" data-active="${p.active ? '0' : '1'}" style="margin-top:6px">${p.active ? 'Отключить' : 'Включить'}</button></div></div></td>
        <td data-l="Кто прошёл"><span>${p.attempts.length ? p.attempts.map(a => `<a href="#/attempts/${a.id}">${esc(a.name || `#${a.id}`)}</a>`).join(', ') : '<span class="muted">пока никто</span>'}</span></td>
        <td data-l="Создан" class="muted" style="font-size:12.5px;white-space:nowrap"><div>${esc(fmtDateFull(p.created_at))}<div>${p.created_by === 'bot' ? 'в Telegram-боте' : 'в админке'}</div></div></td>
        <td data-l="Скопировать"><div class="row-actions" style="flex-wrap:wrap"><button class="btn btn-sm" data-copy="${esc(p.code)}" data-msg="Код скопирован">Код</button><button class="btn btn-sm" data-copy="${esc(p.link)}" data-msg="Ссылка скопирована">Ссылка</button><button class="btn btn-sm" data-gift="${p.id}">С текстом</button></div></td>
      </tr>`).join('') : '<tr><td colspan="6"><div class="empty">Промокодов пока нет — создайте первый</div></td></tr>'}</tbody></table></div>`

    const byId = new Map(items.map(p => [p.id, p]))
    page.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(b => b.addEventListener('click', () => copy(b.dataset.copy!, b.dataset.msg!)))
    page.querySelectorAll<HTMLButtonElement>('[data-gift]').forEach(b => b.addEventListener('click', () => copy(promoGiftText(byId.get(Number(b.dataset.gift))!), 'Текст со ссылкой скопирован')))
    page.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true
      try {
        await adminPost('promo-toggle', { id: Number(b.dataset.toggle), active: b.dataset.active === '1' })
        toast(b.dataset.active === '1' ? 'Промокод снова действует' : 'Промокод отключён')
        await load()
      } catch (e) {
        b.disabled = false
        toast(e instanceof ApiError ? `Ошибка: ${e.code}` : 'Не удалось', 'err')
      }
    }))
  }
  await load()
}

/** Диалог «Новый промокод»: кому, сколько раз, свой код (пусто — сгенерируем). */
export function openPromoDialog(onDone: () => void) {
  const bg = document.createElement('div'); bg.className = 'drawer-bg'
  const dr = document.createElement('div'); dr.className = 'drawer'
  const lbl = (s: string) => `<label style="font-size:12.5px;font-weight:600;color:var(--a-text-2)">${s}</label>`
  dr.innerHTML = `
    <div class="drawer-head"><h2>Новый промокод</h2><button class="close" id="pr-close">×</button></div>
    <div class="drawer-body" id="pr-body">
      <div class="muted" style="font-size:13px">Бесплатный тест в подарок. Человек вводит код на странице оплаты или проходит тест по ссылке — в конце результат откроется сразу, без оплаты.</div>
      <div>${lbl('Кому / зачем (необязательно)')}<input class="input" id="pr-note" placeholder="Айгерім, тренинг 21 октября…" /></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>${lbl('Сколько раз можно использовать')}<input class="input" id="pr-uses" type="number" inputmode="numeric" min="1" max="1000" value="1" /></div>
        <div>${lbl('Свой код (необязательно)')}<input class="input" id="pr-code" placeholder="сгенерируем" autocapitalize="characters" style="text-transform:uppercase" /></div>
      </div>
      <div class="field-error" id="pr-err" style="display:none;color:var(--a-red);font-weight:600"></div>
      <div class="row-actions"><button class="btn btn-primary" id="pr-save">Создать промокод</button></div>
    </div>`
  document.body.append(bg, dr)
  requestAnimationFrame(() => { bg.classList.add('show'); dr.classList.add('show') })
  const close = () => { bg.classList.remove('show'); dr.classList.remove('show'); setTimeout(() => { bg.remove(); dr.remove() }, 250) }
  bg.addEventListener('click', close)
  dr.querySelector('#pr-close')!.addEventListener('click', close)
  const $ = <T extends HTMLElement>(sel: string) => dr.querySelector(sel) as T
  $<HTMLInputElement>('#pr-note').focus()

  $('#pr-save').addEventListener('click', async () => {
    const err = $('#pr-err'); err.style.display = 'none'
    const btn = $<HTMLButtonElement>('#pr-save'); btn.disabled = true
    try {
      const r = await adminPost<{ promo: Promo }>('promo-create', {
        note: $<HTMLInputElement>('#pr-note').value,
        uses: Number($<HTMLInputElement>('#pr-uses').value) || 1,
        code: $<HTMLInputElement>('#pr-code').value
      })
      showDone(r.promo)
      onDone()
    } catch (e) {
      btn.disabled = false
      err.textContent = e instanceof ApiError ? (ERR[e.code] || `Ошибка: ${e.code}`) : 'Не удалось создать'
      err.style.display = 'block'
    }
  })

  const showDone = (p: Promo) => {
    const gift = promoGiftText(p)
    $('#pr-body').innerHTML = `
      <div style="font-weight:700;font-size:16px">Промокод готов 🎁</div>
      <div class="muted" style="font-size:13px">Можно использовать: ${timesRu(p.max_uses)}${p.note ? ` · кому: ${esc(p.note)}` : ''}</div>
      <div class="copy-box"><span>🏷</span><code style="font-weight:700">${esc(p.code)}</code><button class="btn btn-sm" id="pr-copy-code">Копировать</button></div>
      <div class="copy-box"><span>🔗</span><code>${esc(p.link)}</code><button class="btn btn-sm" id="pr-copy-link">Копировать</button></div>
      <div class="row-actions">
        <button class="btn btn-sm" id="pr-copy-gift">Копировать с текстом</button>
        <a class="btn btn-sm" href="https://wa.me/?text=${encodeURIComponent(gift)}" target="_blank" rel="noopener">Отправить в WhatsApp</a>
        <button class="btn btn-sm btn-primary" id="pr-more">Создать ещё</button>
      </div>`
    $('#pr-copy-code').addEventListener('click', () => copy(p.code, 'Код скопирован'))
    $('#pr-copy-link').addEventListener('click', () => copy(p.link, 'Ссылка скопирована'))
    $('#pr-copy-gift').addEventListener('click', () => copy(gift, 'Текст со ссылкой скопирован'))
    $('#pr-more').addEventListener('click', () => { close(); openPromoDialog(onDone) })
  }
}

