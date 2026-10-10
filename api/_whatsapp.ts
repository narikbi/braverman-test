// Отправка WhatsApp только через официальный WhatsApp Cloud API (Meta) — шаблонами через наш WA Hub.
// Неофициальный пул (Baileys, POST /send) не используем: шаблоны хаб всегда шлёт с cloud-номера.
// env: WA_API_URL (https://wa-hub.fly.dev), WA_TOKEN (API-ключ проекта braverman в хабе).
// Пока не заданы — функции тихо выключены (whatsappConfigured()=false).

export function whatsappConfigured(): boolean {
  return !!(process.env.WA_API_URL && process.env.WA_TOKEN)
}

export type WaResult = { sent: boolean; from?: string } // from — наш номер, с которого ушло (77XXXXXXXXX)

/** +7 775 258 86 00 — для уведомлений */
export const fmtWaNumber = (n: string | null | undefined) => (n ? `+${n[0]} ${n.slice(1, 4)} ${n.slice(4, 7)} ${n.slice(7, 9)} ${n.slice(9)}` : '')

/**
 * Шаблон WhatsApp Cloud API через WA Hub. Не ушло (шаблон не утверждён, Cloud API недоступен) — { sent:false }:
 * вызывающий сообщает в Telegram «WhatsApp не доставлен», и менеджер пересылает ссылку сам.
 */
async function sendTemplate(phone: string, name: string, template: {
  name: string; lang: string; params?: string[]; buttonUrl?: string; text?: string
}): Promise<WaResult> {
  if (!whatsappConfigured()) return { sent: false }
  try {
    const res = await fetch(`${process.env.WA_API_URL!.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WA_TOKEN}` },
      body: JSON.stringify({ phone, name, template }),
      signal: AbortSignal.timeout(20000)
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; from?: string; error?: string }
    if (!res.ok || !data.ok) { console.error('whatsapp_template_failed', res.status, data.error); return { sent: false } }
    return { sent: true, from: data.from }
  } catch (e) {
    console.error('whatsapp_template_error', e)
    return { sent: false }
  }
}

const tplLang = (lang: string) => (lang === 'kk' ? 'kk' : 'ru')

/** Код восстановления доступа: шаблон authentication braverman_code. */
export function sendWhatsAppOtp(phone: string, otp: string, lang: string): Promise<WaResult> {
  return sendTemplate(phone, '', { name: 'braverman_code', lang: tplLang(lang), params: [otp], buttonUrl: otp, text: `Код: ${otp}` })
}

/** Ссылка на результат (?r= → braverman_result) или на тест (?p= → braverman_prepaid): шаблон с кнопкой-ссылкой. */
export async function sendLinkTemplate(phone: string, name: string, link: string, lang: string): Promise<WaResult> {
  const m = link.match(/[?&]([rp])=([^&]+)/)
  if (!m) return { sent: false }
  const kk = lang === 'kk'
  const what = m[1] === 'r' ? (kk ? 'нәтижең дайын' : 'результат готов') : (kk ? 'тестке сілтеме' : 'ссылка на тест')
  return sendTemplate(phone, name, {
    name: m[1] === 'r' ? 'braverman_result' : 'braverman_prepaid',
    lang: tplLang(lang),
    params: [name || (kk ? 'дос' : 'друг')],
    buttonUrl: m[2],
    text: `${name ? name + ', ' : ''}${what}: ${link}` // как сообщение выглядит в чатах хаба
  })
}
