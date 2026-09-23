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
