// Профиль тренера: личная ссылка для клиентов (копировать / WhatsApp / Telegram), свой бесплатный тест и его результаты.
// Тексты на русском и казахском (L). Казахский пишется сразу по-казахски: в каждой фразе есть глагол.
import { adminGet, adminPost, ApiError } from '../api'
import { esc, fmtCombo, fmtNeuro, fmtBlocked, fmtDateFull, NEURO_COLORS } from '../format'
import { toast } from '../components/toast'
import { CONTENT } from '../../content'
import { NEURO_ORDER, QUESTIONS_PER_BLOCK, type NeuroKey } from '../../../shared/scoring'
import { L, adminLang } from '../i18n'

type SelfResult = {
  id: number; finished_at: string; scores: Record<NeuroKey, number | null>; dominant: NeuroKey; lowest: NeuroKey; combo: string
  lang: 'ru' | 'kk'; blocked: [NeuroKey, NeuroKey][]; resultLink: string
}
type Profile = {
  trainer: { id: number; name: string; code: string }
  clientLink: string
  results: SelfResult[]
  pending: { id: number; answered: number; link: string } | null
}

/** Текст-приглашение клиенту со ссылкой тренера (казахский и русский — клиент выберет сам). */
export function clientInviteText(link: string): string {
  return `Сәлеметсіз бе! Тұлғаның биохимиялық типін анықтайтын тестті өтіп көріңіз. Тест 200 сұрақтан тұрады, 20 минуттай уақыт алады. ` +
    `Соңында төрт нейромедиатор бойынша профиліңізді көресіз және видео-талдау аласыз:\n${link}\n\n` +
    `Здравствуйте! Пройдите тест на биохимический тип личности — 200 вопросов, около 20 минут. ` +
    `В результате — профиль по четырём нейромедиаторам и видео-разбор:\n${link}`
}

/** Карточка «Ваша ссылка для клиентов» — на профиле и (компактно) на дашборде тренера. */
export function clientLinkCard(link: string, compact = false): string {
  const text = clientInviteText(link)
  return `
    <div class="card"><div class="card-head"><h2>${L('Ваша ссылка для клиентов', 'Клиенттерге жіберетін сілтемеңіз')}</h2><span class="hint">${L('все, кто пришёл по ней, — ваши клиенты', 'осы сілтемемен келгендердің бәрі сіздің клиентіңіз болып саналады')}</span></div><div class="card-body">
      <div class="copy-box"><span>🔗</span><code>${esc(link)}</code><button class="btn btn-sm" data-copy="${esc(link)}">${L('Копировать', 'Көшіру')}</button></div>
      <div class="row-actions" style="margin-top:8px">
        ${compact ? '' : `<button class="btn btn-sm" data-copy="${esc(text)}" data-copy-msg="1">${L('Копировать с текстом', 'Мәтінімен бірге көшіру')}</button>`}
        <a class="btn btn-sm" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${L('Отправить в WhatsApp', 'WhatsApp-қа жіберу')}</a>
        ${compact ? '' : `<a class="btn btn-sm" href="https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Тұлғаның биохимиялық типін анықтайтын тест · Тест на биохимический тип личности')}" target="_blank" rel="noopener">Telegram</a>`}
      </div>
      ${compact ? '' : `<div class="muted" style="font-size:12.5px;margin-top:10px">${L('Клиенты оплачивают тест на сайте. Их результаты появятся у вас в «Клиентах» после оплаты.', 'Клиенттер тестті сайтта төлейді. Олар төлегеннен кейін нәтижесі «Клиенттер» бөлімінде көрінеді.')}</div>`}
    </div></div>`
}

/** Обработчики кнопок «Копировать» внутри контейнера. */
export function bindCopyButtons(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(b => b.addEventListener('click', () => {
    navigator.clipboard.writeText(b.dataset.copy || '').then(() => toast(b.dataset.copyMsg ? L('Текст со ссылкой скопирован', 'Мәтін сілтемесімен бірге көшірілді') : L('Ссылка скопирована', 'Сілтеме көшірілді')))
  }))
}

function scoresHtml(s: SelfResult): string {
  return `<div class="scores">${NEURO_ORDER.map(k => `<div class="score-row"><span class="lbl">${esc(fmtNeuro(k))}</span><div class="bar"><i style="width:${((s.scores[k] ?? 0) / QUESTIONS_PER_BLOCK) * 100}%;background:${NEURO_COLORS[k]}"></i></div><span class="num">${s.scores[k] ?? '—'} / ${QUESTIONS_PER_BLOCK}</span></div>`).join('')}</div>`
}

export async function renderProfile(page: HTMLElement) {
  page.innerHTML = '<div class="card"><div class="card-body"><div class="skel" style="height:140px"></div></div></div>'
  const d = await adminGet<Profile>('me-profile')
  const last = d.results[0]
  const rest = d.results.slice(1)
  const type = last ? CONTENT[adminLang()].neuro[last.dominant] : null
  const startLabel = d.pending
    ? (d.pending.answered ? L(`Продолжить тест (${d.pending.answered}/200)`, `Тестті жалғастыру (${d.pending.answered}/200)`) : L('Продолжить тест', 'Тестті жалғастыру'))
    : last ? L('Пройти тест заново', 'Тестті қайта өту') : L('Пройти тест бесплатно', 'Тестті тегін өту')

  page.innerHTML = `
    <div class="section">${clientLinkCard(d.clientLink)}</div>

    <div class="section"><div class="card"><div class="card-head"><h2>${L('Мой результат', 'Менің нәтижем')}</h2><span class="hint">${L('ваш тест — бесплатно, сколько угодно раз', 'тестті тегін әрі қанша рет болса да өте аласыз')}</span></div><div class="card-body">
      ${last ? `
        <div style="font-size:20px;font-weight:800">${esc(type?.title || '')}</div>
        <div style="color:var(--a-accent);font-weight:700;margin:2px 0 12px">${esc(fmtCombo(last.combo))} <span class="muted" style="font-weight:500">· ${esc(type?.lobe || '')}</span></div>
        ${scoresHtml(last)}
        ${fmtBlocked(last.scores) ? `<div class="warn-box">⚠️ <b>${L('Заблокированность отделов', 'Ми бөліктерінің бұғатталуы')}</b>: ${esc(fmtBlocked(last.scores))}. ${L('Результат может быть неточным — лучше пройти тест заново, спокойно и без спешки.', 'Нәтиже дәл шықпауы мүмкін. Тынығып алып, тестті асықпай қайта өткеніңіз дұрыс.')}</div>` : ''}
        <div class="muted" style="font-size:12.5px;margin-top:10px">${L(`Пройден ${esc(fmtDateFull(last.finished_at))}`, `Тестті ${esc(fmtDateFull(last.finished_at))} өттіңіз`)}</div>
        <div class="row-actions" style="margin-top:12px">
          <a class="btn btn-primary" href="${esc(last.resultLink)}" target="_blank" rel="noopener">${L('Открыть полный результат с видео', 'Толық нәтиже мен видеоны ашу')}</a>
          <button class="btn" id="self-test">${esc(startLabel)}</button>
        </div>`
      : `
        <div style="font-weight:700;font-size:16px">${L('Пройдите тест сами — бесплатно', 'Тестті өзіңіз тегін өтіп көріңіз')}</div>
        <div class="muted" style="font-size:13.5px;margin:6px 0 12px">${L('200 вопросов, около 20 минут. Тест откроется в новой вкладке, оплата не нужна. Результат и видео-разбор сохранятся здесь, в вашем профиле.', 'Тест 200 сұрақтан тұрады, 20 минуттай уақыт алады. Ол жаңа бетте ашылады, төлеудің қажеті жоқ. Нәтиже мен видео-талдау осы профильде сақталады.')}</div>
        <button class="btn btn-primary" id="self-test">${esc(startLabel)}</button>`}
    </div></div></div>

    ${rest.length ? `<div class="section"><div class="card"><div class="card-head"><h2>${L('Прошлые результаты', 'Бұрынғы нәтижелерім')}</h2></div><div class="card-body">
      <div class="table-wrap"><table class="tbl"><thead><tr><th>${L('Дата', 'Күні')}</th><th>${L('Доминанты', 'Басым жұбы')}</th><th></th></tr></thead><tbody>
        ${rest.map(r => `<tr><td class="muted">${esc(fmtDateFull(r.finished_at))}</td><td><b>${esc(fmtCombo(r.combo))}</b>${r.blocked.length ? ` <span class="chip chip-warn">${L('блок', 'бұғат')}</span>` : ''}</td><td><a href="${esc(r.resultLink)}" target="_blank" rel="noopener">${L('открыть', 'ашу')}</a></td></tr>`).join('')}
      </tbody></table></div>
    </div></div></div>` : ''}`

  bindCopyButtons(page)
  page.querySelector<HTMLButtonElement>('#self-test')?.addEventListener('click', async e => {
    const btn = e.currentTarget as HTMLButtonElement
    // вкладку открываем сразу по клику (иначе браузер заблокирует всплывающее окно), адрес подставим после ответа
    const tab = window.open('about:blank', '_blank')
    btn.disabled = true
    try {
      const r = await adminPost<{ link: string }>('self-test')
      if (tab) tab.location.href = r.link
      else location.href = r.link
      toast(L('Тест открыт в новой вкладке. После теста обновите эту страницу — результат появится здесь.', 'Тест жаңа бетте ашылды. Тестті бітірген соң осы бетті жаңартыңыз, нәтижеңіз осында шығады.'))
    } catch (err) {
      tab?.close()
      toast(err instanceof ApiError ? `${L('Не удалось', 'Болмады')}: ${err.code}` : L('Не удалось открыть тест', 'Тест ашылмады'), 'err')
    }
    btn.disabled = false
  })
}
