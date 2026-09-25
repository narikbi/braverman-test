// GET /api/result?r=<токен результата> — данные оплаченного результата.
// Токен выдаётся только после оплаты (fulfill) или вручную из админки; бессрочный.
import { getAttempt, logEvent, q, ipHash, retakeInfo } from './_db.js'
import { verifyResultToken, makeResultToken } from './_access.js'
import { queryOf } from './_lib.js'
import { QUESTIONS_PER_BLOCK, blockedPairs, MAX_FREE_RETAKES } from '../shared/scoring.js'

type Req = { method?: string; url?: string; query?: Record<string, string | string[] | undefined>; headers: Record<string, string | string[] | undefined> }
type Res = { status: (code: number) => { json: (o: object) => void }; setHeader: (k: string, v: string) => void }

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ ok: false })
  const p = queryOf(req)
  const id = verifyResultToken(p.get('r'))
  if (!id) return res.status(404).json({ ok: false, error: 'not_found' })

  const a = await getAttempt(id)
  if (!a) return res.status(404).json({ ok: false, error: 'not_found' })
  if (a.status !== 'paid' || a.dominant == null) return res.status(402).json({ ok: false, error: 'unpaid' })

  // result_view — не чаще раза в 10 минут на сессию, чтобы обновления страницы не раздували воронку
  const sid = /^[0-9a-f-]{36}$/.test(p.get('sid') || '') ? p.get('sid') : null
  const recent = await q<{ n: string }>('result_view_recent',
    `SELECT count(*) AS n FROM events WHERE type = 'result_view' AND attempt_id = $1 AND ($2::text IS NULL OR sid = $2) AND ts > now() - interval '10 minutes'`, [id, sid])
  if (!Number(recent[0]?.n ?? 0)) {
    const ua = req.headers['user-agent']
    await logEvent({ type: 'result_view', attemptId: id, sid, trainerCode: a.trainer_code, utm: a.utm, ua: (Array.isArray(ua) ? ua[0] : ua)?.slice(0, 200) ?? null, ipHash: ipHash(req.headers) })
  }

  // «Заблокированность отделов» → предлагаем бесплатную пересдачу (или ссылку на уже пройденную)
  const scores = { dopamine: a.dopamine!, acetylcholine: a.acetylcholine!, gaba: a.gaba!, serotonin: a.serotonin! }
  const blocked = blockedPairs(scores)
  let retake: { allowed: boolean; newResult: string | null } | null = null
  if (blocked.length) {
    const info = await retakeInfo(a.id)
    retake = info.paidChild
      ? { allowed: false, newResult: makeResultToken(info.paidChild) }
      : { allowed: info.depth < MAX_FREE_RETAKES, newResult: null }
  }

  return res.status(200).json({
    ok: true,
    id: a.id,
    name: a.name,
    lang: a.lang,
    scores,
    blocked,
    retake,
    isRetake: a.retake_of != null,
    max: QUESTIONS_PER_BLOCK,
    dominant: a.dominant,
    lowest: a.lowest,
    combo: a.combo,
    paidAt: a.paid_at
  })
}
