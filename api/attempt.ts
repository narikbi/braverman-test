// POST /api/attempt — {action:'start'} создаёт попытку при старте теста (не блокирует тест),
// {action:'finish'} принимает 200 ответов, считает баллы на сервере и возвращает тизер.
// Без DATABASE_URL тест работает, но ничего не сохраняется (id=0).
import { dbConfigured, createAttempt, finishAttempt, logEvent, ipHash, cleanAttribution, getAttempt, retakeInfo, grantRetake, type AttemptMeta } from './_db.js'
import { makeAttemptToken, verifyAttemptToken, verifyResultToken, makeResultToken, verifyPrepaidToken } from './_access.js'
import { fulfillRetake, fulfillPrepaid, fulfillTrainerSelf } from './_fulfill.js'
import { bodyOf } from './_lib.js'
import { scoreAttempt, isValidAnswers, blockedPairs, MAX_FREE_RETAKES } from '../shared/scoring.js'

const PREPAID_KINDS = ['prepaid', 'trainer']

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
    // Оплата вне сайта: клиент открыл ссылку /?p=… — отдаём его попытку (или готовый результат)
    if (action === 'prepaid') {
      const pid = verifyPrepaidToken(typeof b.p === 'string' ? b.p : '')
      const a = pid ? await getAttempt(pid) : null
      // ссылка /?p=…: оплата вне сайта (prepaid) или свой бесплатный тест тренера (trainer)
      if (!a || !PREPAID_KINDS.includes(String(a.paid_by))) return res.status(404).json({ ok: false, error: 'not_found' })
      if (a.dominant != null) return res.status(200).json({ ok: true, done: true, r: makeResultToken(Number(a.id)), lang: a.lang })
      await logEvent({ type: 'prepaid_open', attemptId: a.id, ...common, trainerCode: a.self_trainer_id ? null : a.trainer_code })
      const aid = Number(a.id) // bigint из Neon приходит строкой
      return res.status(200).json({ ok: true, id: aid, token: makeAttemptToken(aid), name: a.name, lang: a.lang })
    }

    if (action === 'start') {
      // предоплаченная попытка уже создана — новую не заводим, только отмечаем старт
      const existing = Number(b.id) || 0
      if (existing && verifyAttemptToken(existing, String(b.token || ''))) {
        const own = await getAttempt(existing)
        await logEvent({ type: 'quiz_start', attemptId: existing, ...common, ...(own?.self_trainer_id ? { trainerCode: null } : {}) })
        return res.status(200).json({ ok: true, id: existing, token: makeAttemptToken(existing) })
      }
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
      // уже оплаченный и пройденный тест не перезаписываем (ссылку /?p=… нельзя использовать повторно)
      const before = await getAttempt(id)
      if (before?.status === 'paid' && before.dominant != null) {
        return res.status(200).json({ ok: true, id, token: makeAttemptToken(id), r: makeResultToken(id) })
      }
      const r = scoreAttempt(b.answers)
      const done = await finishAttempt(id, { answers: b.answers, ...r }, meta)
      await logEvent({ type: 'quiz_finish', attemptId: id, ...common, ...(done.self_trainer_id ? { trainerCode: null } : {}), props: { dominant: r.dominant, lowest: r.lowest, combo: r.combo } })
      const teaser = { dominant: r.dominant, lowest: r.lowest, combo: r.combo }

      // Оплата вне сайта / свой тест тренера: результат сразу, без экрана оплаты
      if (done.status === 'paid' && done.paid_by === 'trainer') {
        await fulfillTrainerSelf({ ...done, id })
        return res.status(200).json({ ok: true, id, token: makeAttemptToken(id), teaser, r: makeResultToken(id) })
      }
      if (done.status === 'paid' && done.paid_by === 'prepaid') {
        await fulfillPrepaid({ ...done, id })
        return res.status(200).json({ ok: true, id, token: makeAttemptToken(id), teaser, r: makeResultToken(id) })
      }

      // Бесплатная пересдача: клиент пришёл по кнопке из заблокированного результата (b.retake = его токен результата)
      const originalId = typeof b.retake === 'string' ? verifyResultToken(b.retake) : null
      if (originalId && originalId !== id && await retakeAllowed(originalId)) {
        const granted = await grantRetake(id, originalId)
        if (granted) {
          await fulfillRetake(granted, originalId)
          return res.status(200).json({ ok: true, id, token: makeAttemptToken(id), teaser, r: makeResultToken(id) })
        }
      }
      return res.status(200).json({ ok: true, id, token: makeAttemptToken(id), teaser })
    }

    return res.status(400).json({ ok: false, error: 'action' })
  } catch (e) {
    console.error('attempt_failed', action, e)
    return res.status(503).json({ ok: false, error: 'db' })
  }
}

/** Пересдача бесплатна, если исходная попытка оплачена, «заблокирована», её ещё не пересдавали и цепочка не длиннее лимита. */
async function retakeAllowed(originalId: number): Promise<boolean> {
  const o = await getAttempt(originalId)
  if (!o || o.status !== 'paid') return false
  if (!blockedPairs({ dopamine: o.dopamine, acetylcholine: o.acetylcholine, gaba: o.gaba, serotonin: o.serotonin }).length) return false
  const info = await retakeInfo(originalId)
  return !info.paidChild && info.depth < MAX_FREE_RETAKES
}
