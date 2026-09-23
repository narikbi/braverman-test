// POST /api/attempt — {action:'start'} создаёт попытку при старте теста (не блокирует тест),
// {action:'finish'} принимает 200 ответов, считает баллы на сервере и возвращает тизер.
// Без DATABASE_URL тест работает, но ничего не сохраняется (id=0).
import { dbConfigured, createAttempt, finishAttempt, logEvent, ipHash, cleanAttribution, type AttemptMeta } from './_db.js'
import { makeAttemptToken, verifyAttemptToken } from './_access.js'
import { bodyOf } from './_lib.js'
import { scoreAttempt, isValidAnswers } from '../shared/scoring.js'

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
type Res = { status: (code: number) => { json: (o: object) => void }; setHeader: (k: string, v: string) => void }

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' })
  const b = bodyOf(req)
  const action = String(b.action || '')
  const sid = typeof b.sid === 'string' && /^[0-9a-f-]{36}$/.test(b.sid) ? b.sid : null
  const meta: AttemptMeta = {
    sid,
    name: typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '',
    lang: b.lang === 'kk' ? 'kk' : 'ru',
    attr: cleanAttribution(b.attr)
  }
  const ua = req.headers['user-agent']
  const common = { sid, trainerCode: meta.attr?.t ?? null, utm: meta.attr?.utm, referrer: meta.attr?.referrer, path: meta.attr?.landing, ua: (Array.isArray(ua) ? ua[0] : ua)?.slice(0, 200) ?? null, ipHash: ipHash(req.headers) }

  if (!dbConfigured()) return res.status(200).json({ ok: true, id: 0, token: '', offline: true })

  try {
    if (action === 'start') {
      const { id } = await createAttempt(meta)
      await logEvent({ type: 'quiz_start', attemptId: id, ...common })
      return res.status(200).json({ ok: true, id, token: makeAttemptToken(id) })
    }

    if (action === 'finish') {
      if (!isValidAnswers(b.answers)) return res.status(400).json({ ok: false, error: 'answers' })
      let id = Number(b.id) || 0
      if (!id || !verifyAttemptToken(id, String(b.token || ''))) {
        // старт не успел (или его не было) — создаём попытку сейчас
        id = (await createAttempt(meta)).id
        await logEvent({ type: 'quiz_start', attemptId: id, ...common, props: { late: true } })
      }
      const r = scoreAttempt(b.answers)
      await finishAttempt(id, { answers: b.answers, ...r }, meta)
      await logEvent({ type: 'quiz_finish', attemptId: id, ...common, props: { dominant: r.dominant, lowest: r.lowest, combo: r.combo } })
      return res.status(200).json({ ok: true, id, token: makeAttemptToken(id), teaser: { dominant: r.dominant, lowest: r.lowest, combo: r.combo } })
    }

    return res.status(400).json({ ok: false, error: 'action' })
  } catch (e) {
    console.error('attempt_failed', action, e)
    return res.status(503).json({ ok: false, error: 'db' })
  }
}
