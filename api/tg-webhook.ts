// POST /api/tg-webhook — входящие обновления Telegram-бота: команды, кнопки отчётов и инструкция.
// Защита: заголовок X-Telegram-Bot-Api-Secret-Token (см. tgWebhookSecret) и ответы только в чате TG_CHAT_ID.
import crypto from 'node:crypto'
import { tgCall, tgConfigured, bodyOf } from './_lib.js'
import { dbConfigured } from './_db.js'
import { tgWebhookSecret, summaryReport, periodReport, paymentsReport, trainersReport, promoCommand, promosReport, KEYBOARD } from './_tgbot.js'
import { helpPage, HELP_KEYS, type BotReply } from './_tghelp.js'

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
type Res = { status: (code: number) => { json: (o: object) => void }; setHeader: (k: string, v: string) => void }

type Update = {
  message?: { chat: { id: number }; text?: string }
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } }
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}

type Make = (args: string) => Promise<string | BotReply>
const help = (key: string): Make => async () => helpPage(key)

// args — текст после команды («/promo amway1411 150 Мастер-класс» → «amway1411 150 Мастер-класс»); отчётам он не нужен
const COMMANDS: Record<string, Make> = {
  help: help('main'),
  start: help('main'),
  report: summaryReport,
  today: () => periodReport('today'),
  yesterday: () => periodReport('yesterday'),
  week: () => periodReport('7d'),
  month: () => periodReport('30d'),
  all: () => periodReport('all'),
  payments: () => paymentsReport(10),
  trainers: trainersReport,
  promo: promoCommand,
  promos: promosReport
}
// Кнопки, которые присылают новое сообщение. Страницы инструкции (h:<раздел>) листаются на месте — см. ниже.
const BUTTONS: Record<string, Make> = {
  sum: summaryReport,
  'r:today': () => periodReport('today'),
  'r:yesterday': () => periodReport('yesterday'),
  'r:7d': () => periodReport('7d'),
  'r:30d': () => periodReport('30d'),
  'r:all': () => periodReport('all'),
  pay: () => paymentsReport(10),
  tr: trainersReport,
  'p:1': () => promoCommand(''),
  pl: promosReport,
  'H:main': help('main'),
  'H:promo': help('promo')
}
/** Команды и кнопки, которым база не нужна: инструкция должна открываться всегда. */
const NO_DB = new Set(['help', 'start', 'H:main', 'H:promo'])

const payload = (chatId: number, r: BotReply) =>
  ({ chat_id: chatId, text: r.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: r.keyboard ?? KEYBOARD })

async function reply(chatId: number, r: string | BotReply) {
  await tgCall('sendMessage', payload(chatId, typeof r === 'string' ? { text: r } : r))
}

/** Перелистнуть инструкцию в том же сообщении. Не вышло (сообщение уже нельзя менять) — присылаем страницу новым. */
async function turnPage(chatId: number, messageId: number, r: BotReply) {
  try {
    await tgCall('editMessageText', { ...payload(chatId, r), message_id: messageId })
  } catch (e) {
    if (String(e).includes('message is not modified')) return // нажали кнопку страницы, которая уже открыта
    await reply(chatId, r)
  }
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  const header = String(req.headers['x-telegram-bot-api-secret-token'] || '')
  if (!tgConfigured() || !safeEqual(header, tgWebhookSecret())) return res.status(401).json({ ok: false })

  const u = bodyOf(req) as Update
  const allowed = (id: number | undefined) => id != null && String(id) === String(process.env.TG_CHAT_ID)
  const run = (key: string, make: Make, args = '') => (NO_DB.has(key) || dbConfigured() ? make(args) : Promise.resolve('База данных не подключена.'))
  try {
    if (u.callback_query) {
      const cq = u.callback_query
      await tgCall('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {})
      const data = cq.data || ''
      const chat = cq.message?.chat.id
      if (allowed(chat)) {
        const page = data.startsWith('h:') ? data.slice(2) : ''
        if (page && HELP_KEYS.includes(page)) await turnPage(chat!, cq.message!.message_id, helpPage(page))
        else if (BUTTONS[data]) await reply(chat!, await run(data, BUTTONS[data]))
      }
    } else if (u.message?.text?.startsWith('/') && allowed(u.message.chat.id)) {
      const cmd = u.message.text.slice(1).split(/[\s@]/)[0].toLowerCase()
      const args = u.message.text.replace(/^\/\S+\s*/, '')
      const make = COMMANDS[cmd]
      if (make) await reply(u.message.chat.id, await run(cmd, make, args))
    }
  } catch (e) {
    console.error('tg_update_failed', e)
  }
  // Telegram повторяет доставку при не-200 — после проверки подписи всегда отвечаем 200
  return res.status(200).json({ ok: true })
}
