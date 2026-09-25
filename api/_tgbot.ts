// Telegram-бот Braverman: команды с финансовыми отчётами в группе заявок.
// Цифры — те же, что в админке (api/_stats.ts). Бот отвечает только в чате TG_CHAT_ID.
// Подключение: админка → Система → «Подключить команды бота» (setWebhook + setMyCommands).
import crypto from 'node:crypto'
import { tgCall, SITE } from './_lib.js'
import { rangeFor, kpi, funnelCounts, sourcesStats, trainersStats, recentPaid, ALL, FUNNEL_TYPES, FUNNEL_LABELS, type Kpi } from './_stats.js'

// ── вебхук ──
/** Секрет заголовка X-Telegram-Bot-Api-Secret-Token: TG_WEBHOOK_SECRET или производный от ACCESS_SECRET. */
export function tgWebhookSecret(): string {
  if (process.env.TG_WEBHOOK_SECRET) return process.env.TG_WEBHOOK_SECRET
  const base = process.env.ACCESS_SECRET || ''
  return base ? crypto.createHmac('sha256', base).update('tg-webhook|braverman').digest('hex').slice(0, 48) : ''
}
export const tgWebhookUrl = () => `${SITE()}/api/tg-webhook`

export const BOT_COMMANDS = [
  { command: 'report', description: 'Сводка: сегодня, 7 и 30 дней, всё время' },
  { command: 'today', description: 'Отчёт за сегодня' },
  { command: 'week', description: 'Отчёт за 7 дней' },
  { command: 'month', description: 'Отчёт за 30 дней' },
  { command: 'all', description: 'Отчёт за всё время' },
  { command: 'payments', description: 'Последние оплаты' },
  { command: 'trainers', description: 'Тренеры за 30 дней' }
]

type TgResult<T> = { ok: boolean; result?: T; description?: string }

/** Регистрирует вебхук и меню команд. Вызывается из админки (POST action=tg-setup). */
export async function tgSetup(): Promise<{ bot: string; webhook: string; commands: number }> {
  const secret = tgWebhookSecret()
  if (!secret) throw new Error('no_secret')
  const me = (await tgCall('getMe', {})) as TgResult<{ username: string }>
  await tgCall('setWebhook', { url: tgWebhookUrl(), secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true })
  await tgCall('setMyCommands', { commands: BOT_COMMANDS, scope: { type: 'chat', chat_id: process.env.TG_CHAT_ID } })
  return { bot: me.result?.username ?? '', webhook: tgWebhookUrl(), commands: BOT_COMMANDS.length }
}

/** Для страницы «Система»: какой бот и куда смотрит его вебхук. */
export async function tgStatus(): Promise<{ ok: boolean; bot: string | null; webhookUrl: string | null; commandsOn: boolean; lastError: string | null }> {
  try {
    const [me, wh] = await Promise.all([
      tgCall('getMe', {}) as Promise<TgResult<{ username: string }>>,
      tgCall('getWebhookInfo', {}) as Promise<TgResult<{ url: string; last_error_message?: string }>>
    ])
    const url = wh.result?.url || null
    return { ok: true, bot: me.result?.username ?? null, webhookUrl: url, commandsOn: url === tgWebhookUrl(), lastError: wh.result?.last_error_message ?? null }
  } catch {
    return { ok: false, bot: null, webhookUrl: null, commandsOn: false, lastError: null }
  }
}

// ── форматирование ──
const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
const num = (n: number) => Math.round(n).toLocaleString('ru-RU')
const money = (n: number) => `${num(n)} ₸`
const almaty = (d: Date | string) => new Date(new Date(d).getTime() + 5 * 3600000)
const dm = (d: Date | string) => { const x = almaty(d); return `${String(x.getUTCDate()).padStart(2, '0')}.${String(x.getUTCMonth() + 1).padStart(2, '0')}` }
const dmt = (d: Date | string) => { const x = almaty(d); return `${dm(d)} ${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')}` }
const pct = (a: number, b: number, digits = 1) => (b ? `${+((a / b) * 100).toFixed(digits)}%` : '—')

function delta(cur: number, prev: number): string {
  if (!prev) return cur ? ' <i>(раньше 0)</i>' : ''
  const d = Math.round(((cur - prev) / prev) * 100)
  return ` <i>(было ${num(prev)}, ${d > 0 ? '▲ +' : d < 0 ? '▼ ' : '= '}${d}%)</i>`
}

type Preset = 'today' | '7d' | '30d' | 'all'
const PERIOD_NAME: Record<Preset, string> = { today: 'сегодня', '7d': '7 дней', '30d': '30 дней', all: 'всё время' }

function periodDates(p: Preset, from: Date, to: Date): string {
  if (p === 'all') return 'с начала работы'
  const last = new Date(to.getTime() - 1)
  return p === 'today' ? dm(from) : `${dm(from)} – ${dm(last)}`
}

export const KEYBOARD = {
  inline_keyboard: [
    [{ text: 'Сегодня', callback_data: 'r:today' }, { text: '7 дней', callback_data: 'r:7d' }],
    [{ text: '30 дней', callback_data: 'r:30d' }, { text: 'Всё время', callback_data: 'r:all' }],
    [{ text: 'Последние оплаты', callback_data: 'pay' }, { text: 'Тренеры', callback_data: 'tr' }]
  ]
}

// ── отчёты ──
/** /report — сводная таблица по четырём периодам */
export async function summaryReport(): Promise<string> {
  const presets: Preset[] = ['today', '7d', '30d', 'all']
  const rows = await Promise.all(presets.map(async p => { const r = rangeFor(p); return { p, k: await kpi(r.from, r.to, ALL) } }))
  const pad = (s: string, n: number, left = false) => (left ? s.padStart(n) : s.padEnd(n))
  const lines = rows.map(({ p, k }) => `${pad(PERIOD_NAME[p][0].toUpperCase() + PERIOD_NAME[p].slice(1), 10)}${pad(String(k.paid), 6, true)}${pad(money(k.revenue), 13, true)}`)
  return [
    '📊 <b>Финансы · braverman.kz</b>',
    `<pre>${esc(`${pad('Период', 10)}${pad('Оплат', 6, true)}${pad('Выручка', 13, true)}\n${lines.join('\n')}`)}</pre>`,
    'Подробный отчёт — кнопками ниже.'
  ].join('\n')
}

/** /today /week /month /all — как дашборд админки: KPI, воронка, конверсии, источники, тренеры */
export async function periodReport(p: Preset): Promise<string> {
  const r = rangeFor(p)
  const [k, prev, f, src, tr] = await Promise.all([
    kpi(r.from, r.to, ALL),
    p === 'all' ? Promise.resolve(null as Kpi | null) : kpi(r.prevFrom, r.prevTo, ALL),
    funnelCounts(r.from, r.to, ALL),
    sourcesStats(r.from, r.to, null),
    trainersStats(r.from, r.to)
  ])
  const avg = k.paid ? k.revenue / k.paid : 0
  const out: string[] = [
    `📊 <b>Отчёт · ${PERIOD_NAME[p]}</b> <i>(${periodDates(p, r.from, r.to)})</i>`,
    '',
    `💰 Выручка: <b>${money(k.revenue)}</b>${prev ? delta(k.revenue, prev.revenue) : ''}`,
    `🧾 Оплат: <b>${num(k.paid)}</b>${prev ? delta(k.paid, prev.paid) : ''}${k.paid ? ` · средний чек ${money(avg)}` : ''}`,
    `👀 Открыли сайт: ${num(k.visits)}${prev ? delta(k.visits, prev.visits) : ''}`,
    `✅ Прошли тест: ${num(k.finished)} из ${num(k.started)} начавших`,
    '',
    '<b>Воронка</b>'
  ]
  let top = 0
  for (const t of FUNNEL_TYPES) {
    const n = f[t]
    if (t === 'page_view') top = n
    out.push(`${esc(FUNNEL_LABELS[t])} — <b>${num(n)}</b>${t !== 'page_view' && top ? ` <i>(${pct(n, top)})</i>` : ''}`)
  }
  out.push('', '<b>Конверсии</b>',
    `визит → оплата: ${k.convVisitPaid}%`,
    `прошли тест → оплата: ${k.convFinishPaid}%`,
    `начали → прошли тест: ${k.convStartFinish}%`)

  // источники: сворачиваем utm_content, сортируем по выручке
  const agg = new Map<string, { views: number; paid: number; revenue: number }>()
  for (const s of src) {
    const key = [s.source, s.medium].filter(Boolean).join(' / ') + (s.campaign ? ` · ${s.campaign}` : '')
    const a = agg.get(key) ?? { views: 0, paid: 0, revenue: 0 }
    a.views += s.views; a.paid += s.paid; a.revenue += s.revenue
    agg.set(key, a)
  }
  const srcTop = [...agg.entries()].filter(([, a]) => a.views || a.paid).sort((a, b) => b[1].revenue - a[1].revenue || b[1].paid - a[1].paid || b[1].views - a[1].views).slice(0, 6)
  if (srcTop.length) {
    out.push('', '<b>Источники</b>')
    for (const [key, a] of srcTop) out.push(`${esc(key)} — ${num(a.views)} виз. · ${num(a.paid)} опл. · ${money(a.revenue)}`)
  }
  const trTop = tr.rows.filter(t => t.paid || t.started || t.visits).slice(0, 6)
  if (trTop.length) {
    out.push('', '<b>Тренеры</b>')
    for (const t of trTop) out.push(`${esc(t.name)} <i>(${esc(t.code)})</i> — ${num(t.paid)} опл. · ${money(t.revenue)} · начали ${num(t.started)}`)
  }
  out.push('', `🛠 ${SITE()}/admin`)
  return out.join('\n')
}

/** /payments — последние оплаты */
export async function paymentsReport(limit = 10): Promise<string> {
  const rows = await recentPaid(limit)
  if (!rows.length) return '🧾 Оплат пока нет.'
  const out = [`🧾 <b>Последние оплаты</b> <i>(${rows.length})</i>`, '']
  for (const r of rows) {
    const from = r.trainer_code ? `тренер ${r.trainer_code}` : r.source || (r.provider === 'manual' ? 'выдано вручную' : 'прямой')
    out.push(`${dmt(r.paid_at)} · <b>${money(r.amount)}</b>${r.test_amount ? ' <i>(тест)</i>' : ''} · ${esc(r.name || '—')} · <code>${esc(r.phone)}</code> · ${esc(from)}`)
  }
  out.push('', `🛠 ${SITE()}/admin#/payments`)
  return out.join('\n')
}

/** /trainers — тренеры за 30 дней */
export async function trainersReport(): Promise<string> {
  const r = rangeFor('30d')
  const { rows, unknown } = await trainersStats(r.from, r.to)
  if (!rows.length && !unknown.length) return '🎓 Тренеров пока нет — их добавляют в админке, раздел «Тренеры».'
  const out = [`🎓 <b>Тренеры · 30 дней</b> <i>(${periodDates('30d', r.from, r.to)})</i>`, '']
  for (const t of rows) {
    out.push(`${t.active ? '' : '⏸ '}<b>${esc(t.name)}</b> <i>(${esc(t.code)})</i>`)
    out.push(`   визиты ${num(t.visits)} · начали ${num(t.started)} · прошли ${num(t.finished)} · оплат ${num(t.paid)} · ${money(t.revenue)}`)
  }
  if (unknown.length) {
    out.push('', '<b>Неизвестные коды в ссылках</b>')
    for (const u of unknown) out.push(`${esc(u.code)} — визиты ${num(u.visits)} · начали ${num(u.started)}`)
  }
  return out.join('\n')
}

export const HELP_TEXT = [
  '🤖 <b>Команды</b>',
  ...BOT_COMMANDS.map(c => `/${c.command} — ${c.description}`)
].join('\n')
