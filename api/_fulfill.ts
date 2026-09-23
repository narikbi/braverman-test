// Подтверждение оплаты: попытка → «оплачено», токен результата, ссылка клиенту в WhatsApp,
// уведомление владельцу в Telegram. Вызывается из вебхука шлюза и (страховкой) из поллинга статуса.
// Идемпотентно: markPaid отмечает счёт оплаченным ровно один раз; неизвестный счёт игнорируется.
import { markPaid, logEvent, setPaymentLinkSent, getAttempt, q } from './_db.js'
import { makeResultToken } from './_access.js'
import { sendWhatsApp, whatsappConfigured, fmtWaNumber } from './_whatsapp.js'
import { resultLinkMessage } from './_wa-text.js'
import { tgNotify, adminAttemptLink, SITE, sheetMirror } from './_lib.js'

export function resultLink(attemptId: number): string {
  return `${SITE()}/?r=${makeResultToken(attemptId)}`
}

const RU_NAME: Record<string, string> = { dopamine: 'Дофамин', acetylcholine: 'Ацетилхолин', gaba: 'ГАМК', serotonin: 'Серотонин' }
const RU_LOBE: Record<string, string> = { dopamine: 'Лобная доля', acetylcholine: 'Теменная доля', gaba: 'Височная доля', serotonin: 'Затылочная доля' }

/** «ГАМК + Ацетилхолин» — доминанта и пара из видео-разбора (combo = '<доминанта>-<пара>') */
function comboLabel(dominant: string, combo: string | null | undefined): string {
  const partner = combo ? combo.split('-')[1] : ''
  return [dominant, partner].filter(Boolean).map(k => RU_NAME[k] || k).join(' + ')
}

export async function fulfillPaidInvoice(i: {
  invoiceId: string
  source: 'webhook' | 'poll'
  phone?: string
  amount?: string | number
  provider?: 'kpa' | 'sim'
}): Promise<{ first: boolean; attemptId: number | null; r: string | null }> {
  const { first, attempt } = await markPaid({ invoiceId: i.invoiceId, source: i.source, amount: i.amount, provider: i.provider === 'sim' ? 'demo' : 'kaspi' })
  if (!attempt) {
    console.error('fulfill_unknown_invoice', i.invoiceId)
    return { first: false, attemptId: null, r: null }
  }
  const r = makeResultToken(attempt.id)
  if (!first) return { first: false, attemptId: attempt.id, r }

  const amount = i.amount != null ? String(i.amount).replace(/[^\d.]/g, '') : String(attempt.test_amount ?? process.env.PRICE_KZT ?? '')
  await logEvent({
    type: 'paid', attemptId: attempt.id, sid: attempt.sid, utm: attempt.utm, trainerCode: attempt.trainer_code,
    props: { amount, provider: i.provider ?? 'kpa', source: i.source, invoiceId: i.invoiceId }
  })

  const link = resultLink(attempt.id)
  const phone = attempt.phone || i.phone || ''

  // Ссылка клиенту в WhatsApp — остаётся в чате навсегда
  let waSent = false
  let waFrom = '' // номер пула wa-gateway, с которого ушло сообщение (номера чередуются)
  if (phone && whatsappConfigured()) {
    const w = await sendWhatsApp(phone, resultLinkMessage(attempt.name, link, attempt.lang))
    waSent = w.sent
    waFrom = w.from || ''
    await setPaymentLinkSent(i.invoiceId, waSent)
  }

  const full = await getAttempt(attempt.id)
  const trainer = attempt.trainer_id
    ? (await q<{ name: string; code: string }>('fulfill_trainer', 'SELECT name, code FROM trainers WHERE id = $1', [attempt.trainer_id]))[0]
    : null

  await tgNotify([
    '💰 <b>ОПЛАЧЕНО — тест Бравермана</b>',
    `👤 ${attempt.name || '—'}`,
    `📱 <code>${phone || '—'}</code>`,
    amount ? `💵 ${amount} ₸` : '',
    full?.dominant ? `🧠 ${comboLabel(full.dominant, full.combo)}` : '',
    trainer ? `🎓 Тренер: ${trainer.name} (${trainer.code})` : attempt.trainer_code ? `🎓 Код тренера: ${attempt.trainer_code} (неизвестен)` : '',
    `🧾 Счёт #${i.invoiceId} · ${i.source}`,
    `🔗 ${link}`,
    adminAttemptLink(attempt.id),
    whatsappConfigured()
      ? (waSent
        ? `📲 Ссылка отправлена клиенту в WhatsApp ✅${waFrom ? `\n📤 С номера: <code>${fmtWaNumber(waFrom)}</code>` : ''}`
        : '📲 ❗️WhatsApp не доставлен — перешли ссылку клиенту')
      : ''
  ])

  // Необязательное зеркало в Google-таблицу (формат старого Apps Script)
  if (full) {
    await sheetMirror({
      name: full.name, dopamine: full.dopamine, acetylcholine: full.acetylcholine, gaba: full.gaba, serotonin: full.serotonin,
      dominant: full.dominant ? RU_NAME[full.dominant] : '', lobe: full.dominant ? RU_LOBE[full.dominant] : '', lang: full.lang,
      phone, trainer: trainer?.code ?? full.trainer_code ?? '', amount
    })
  }

  return { first: true, attemptId: attempt.id, r }
}
