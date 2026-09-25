// POST /api/tg-webhook — входящие обновления Telegram-бота (команды и кнопки отчётов).
// Защита: заголовок X-Telegram-Bot-Api-Secret-Token (см. tgWebhookSecret) и ответы только в чате TG_CHAT_ID.
import crypto from 'node:crypto'
import { tgCall, tgConfigured, bodyOf } from './_lib.js'
import { dbConfigured } from './_db.js'
import { tgWebhookSecret, summaryReport, periodReport, paymentsReport, trainersReport, HELP_TEXT, KEYBOARD } from './_tgbot.js'

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
type Res = { status: (code: number) => { json: (o: object) => void }; setHeader: (k: string, v: string) => void }

type Update = {
  message?: { chat: { id: number }; text?: string }
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } }
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}

const COMMANDS: Record<string, () => Promise<string>> = {
  report: summaryReport,
  start: summaryReport,
  today: () => periodReport('today'),
  week: () => periodReport('7d'),
  month: () => periodReport('30d'),
  all: () => periodReport('all'),
  payments: () => paymentsReport(10),
  trainers: trainersReport,
  help: async () => HELP_TEXT
}
const BUTTONS: Record<string, () => Promise<string>> = {
  'r:today': () => periodReport('today'),
  'r:7d': () => periodReport('7d'),
  'r:30d': () => periodReport('30d'),
  'r:all': () => periodReport('all'),
  pay: () => paymentsReport(10),
  tr: trainersReport
}

async function reply(chatId: number, text: string) {
  await tgCall('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: KEYBOARD })
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  const header = String(req.headers['x-telegram-bot-api-secret-token'] || '')
  if (!tgConfigured() || !safeEqual(header, tgWebhookSecret())) return res.status(401).json({ ok: false })

  const u = bodyOf(req) as Update
  const allowed = (id: number | undefined) => id != null && String(id) === String(process.env.TG_CHAT_ID)
  try {
    if (u.callback_query) {
      const cq = u.callback_query
      await tgCall('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {})
      const make = cq.data ? BUTTONS[cq.data] : undefined
      if (make && allowed(cq.message?.chat.id) && dbConfigured()) await reply(cq.message!.chat.id, await make())
    } else if (u.message?.text?.startsWith('/') && allowed(u.message.chat.id)) {
      const cmd = u.message.text.slice(1).split(/[\s@]/)[0].toLowerCase()
      const make = COMMANDS[cmd]
      if (make) await reply(u.message.chat.id, dbConfigured() ? await make() : 'База данных не подключена.')
    }
  } catch (e) {
    console.error('tg_update_failed', e)
  }
  // Telegram повторяет доставку при не-200 — после проверки подписи всегда отвечаем 200
  return res.status(200).json({ ok: true })
}
