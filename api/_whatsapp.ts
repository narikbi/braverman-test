// Отправка WhatsApp-сообщений через наш wa-gateway (Baileys, отдельный сервис на Fly.io).
// env: WA_API_URL (https://mindquiz-wa.fly.dev), WA_TOKEN (тот же секрет, что у сервиса).
// Пока не заданы — функции тихо выключены (whatsappConfigured()=false).

export function whatsappConfigured(): boolean {
  return !!(process.env.WA_API_URL && process.env.WA_TOKEN)
}

export type WaResult = { sent: boolean; from?: string } // from — номер пула, с которого ушло (77XXXXXXXXX)

/** +7 775 258 86 00 — для уведомлений */
export const fmtWaNumber = (n: string | null | undefined) => (n ? `+${n[0]} ${n.slice(1, 4)} ${n.slice(4, 7)} ${n.slice(7, 9)} ${n.slice(9)}` : '')

export function sendWhatsApp(phone: string, message: string): Promise<WaResult> {
  return post({ phone, message })
}

/**
 * Шаблон WhatsApp Cloud API через WA Hub (официальный канал, не зависит от банов пула).
 * Не ушло (шаблон не утверждён / Cloud API не настроен) — { sent:false }, вызывающий откатывается на текст через пул.
 */
export async function sendWhatsAppTemplate(phone: string, name: string, template: {
  name: string; lang?: string; params?: string[]; buttonUrl?: string; text?: string
}): Promise<WaResult> {
  if (!(process.env.WA_API_URL && process.env.WA_TOKEN)) return { sent: false }
  try {
    const res = await fetch(`${process.env.WA_API_URL.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WA_TOKEN}` },
      body: JSON.stringify({ phone, name, template: { lang: 'ru', ...template } }),
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

/** Код восстановления: шаблон authentication, иначе текст через пул. */
export async function sendWhatsAppOtp(phone: string, otp: string, lang: string, fallbackText: string): Promise<WaResult> {
  const t = await sendWhatsAppTemplate(phone, '', { name: 'braverman_code', lang: tplLang(lang), params: [otp], buttonUrl: otp, text: `Код: ${otp}` })
  return t.sent ? t : whatsappConfigured() ? sendWhatsApp(phone, fallbackText) : { sent: false }
}

/** Ссылка на результат / на тест: шаблон с кнопкой (?r= → braverman_result, ?p= → braverman_prepaid), иначе текст через пул. */
export async function sendLinkTemplate(phone: string, name: string, link: string, lang: string, fallbackText: string): Promise<WaResult> {
  const m = link.match(/[?&]([rp])=([^&]+)/)
  const t = m ? await sendWhatsAppTemplate(phone, name, { name: m[1] === 'r' ? 'braverman_result' : 'braverman_prepaid', lang: tplLang(lang), params: [name || (lang === 'kk' ? 'дос' : 'друг')], buttonUrl: m[2], text: `${name ? name + ', ' : ''}${m[1] === 'r' ? (lang === 'kk' ? 'нәтижең дайын' : 'результат готов') : (lang === 'kk' ? 'тестке сілтеме' : 'ссылка на тест')}: ${link}` }) : { sent: false }
  return t.sent ? t : whatsappConfigured() ? sendWhatsApp(phone, fallbackText) : { sent: false }
}

/** Файл (PDF) по публичному URL — шлюз скачивает и отправляет как документ, а не ссылку. */
export function sendWhatsAppDocument(phone: string, doc: { url: string; fileName: string; caption?: string }): Promise<WaResult> {
  return post({ phone, document: { url: doc.url, fileName: doc.fileName, mimetype: 'application/pdf' }, caption: doc.caption }, 40000)
}

async function post(body: object, timeoutMs = 20000): Promise<WaResult> {
  if (!whatsappConfigured()) return { sent: false }
  try {
    const res = await fetch(`${process.env.WA_API_URL!.replace(/\/$/, '')}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WA_TOKEN}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) {
      console.error('whatsapp_send_failed', res.status, (await res.text()).slice(0, 200))
      return { sent: false }
    }
    const data = (await res.json().catch(() => ({}))) as { from?: string }
    return { sent: true, from: data.from }
  } catch (e) {
    console.error('whatsapp_send_error', e)
    return { sent: false }
  }
}
