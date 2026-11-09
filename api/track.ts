// POST /api/track — события воронки с сайта (sendBeacon). Всегда отвечает {ok:true}.
// Пишем только whitelist-типы; попытка привязывается только при валидном токене.
import { dbConfigured, logEvent, ipHash, bumpAnswered, cleanAttribution } from './_db.js'
import { parseVariant, ensureAbSchema, logEventB } from './_ab.js'
import { verifyAttemptToken } from './_access.js'
import { bodyOf } from './_lib.js'
import { TOTAL_QUESTIONS } from '../shared/scoring.js'

const TYPES = new Set(['page_view', 'quiz_step', 'checkout_view', 'checkout_submit', 'video_play', 'recover_view', 'teaser_play'])

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
type Res = { status: (code: number) => { json: (o: object) => void }; setHeader: (k: string, v: string) => void }

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  if (!dbConfigured()) return res.status(200).json({ ok: true })

  const b = bodyOf(req)
  const sid = typeof b.sid === 'string' && /^[0-9a-f-]{36}$/.test(b.sid) ? b.sid : ''
  const type = String(b.type || '')
  if (!sid || !TYPES.has(type)) return res.status(200).json({ ok: true })

  const attr = cleanAttribution(b.attr)
  const step = Number(b.step)
  const okStep = Number.isInteger(step) && step > 0 && step <= TOTAL_QUESTIONS ? step : null

  const at = (b.attempt && typeof b.attempt === 'object' ? b.attempt : {}) as { id?: unknown; token?: unknown }
  const attemptId = Number(at.id) || 0
  const bound = attemptId > 0 && verifyAttemptToken(attemptId, String(at.token || '')) ? attemptId : null

  const ua = req.headers['user-agent']
  const ev = {
    type, sid, attemptId: bound, trainerCode: attr.t, step: okStep,
    utm: attr.utm, referrer: attr.referrer,
    path: typeof b.path === 'string' ? b.path.slice(0, 200) : null,
    ua: (Array.isArray(ua) ? ua[0] : ua)?.slice(0, 200) ?? null,
    ipHash: ipHash(req.headers)
  }
  // A/B-эксперимент: события со страницы /b несут метку варианта
  const variant = parseVariant(b.variant)
  if (variant) {
    await ensureAbSchema().catch(() => {})
    await logEventB({ ...ev, variant })
  } else await logEvent(ev)
  if (type === 'quiz_step' && bound && okStep) await bumpAnswered(bound, okStep)
  return res.status(200).json({ ok: true })
}
