// Сырое тело запроса — нужно вебхукам для проверки HMAC-подписи.
// Vercel парсит body заранее, тогда поток пуст и берём JSON.stringify(req.body).
export type RawReq = { body?: unknown; on: (event: string, cb: (chunk?: unknown) => void) => void }

export async function readRawBody(req: RawReq): Promise<string> {
  const chunks: Buffer[] = []
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = () => { if (!settled) { settled = true; resolve() } }
      req.on('data', (c?: unknown) => { if (c) chunks.push(Buffer.from(c as Buffer)) })
      req.on('end', finish)
      req.on('error', (e?: unknown) => { if (!settled) { settled = true; reject(e) } })
      setTimeout(finish, 1000) // поток уже прочитан рантаймом — не ждём
    })
  } catch { /* ниже сработает fallback */ }
  if (chunks.length) return Buffer.concat(chunks).toString('utf8')
  return req.body !== undefined ? JSON.stringify(req.body) : ''
}
