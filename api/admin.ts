// /api/admin?action=<...> — единый роутер админки и кабинета тренера (лимит функций Vercel).
// GET: me, health, overview, funnel, timeline, sources, trainers-stats, attempts, attempt, payments, export, trainers, trainer
// POST (JSON, заголовок X-Requested-With: admin): login, logout, attempt-update, attempt-grant, attempt-resend,
//       trainer-create, trainer-update, trainer-password, tg-setup
// Роль trainer видит только свои попытки (scope по trainer_id / trainer_code); POST-действия ей запрещены.
import { adminConfigured, checkCredentials, makeSession, sessionFromReq, sessionCookie, clearCookie, hashPassword, verifyPassword, type Session } from './_admin-auth.js'
import {
  dbConfigured, q, ipHash, logEvent, ATTEMPT_STATUSES, type AttemptRow, getAttempt, setAttemptNotes, grantManualPaid, setPaymentLinkSent,
  listTrainers, getTrainer, createTrainer, updateTrainer, setTrainerPassword, findTrainerByLogin, touchTrainerLogin
} from './_db.js'
import { sendWhatsApp, whatsappConfigured } from './_whatsapp.js'
import { resultLinkMessage } from './_wa-text.js'
import { resultLink } from './_fulfill.js'
import { kpaConfigured } from './_kpa.js'
import { tgConfigured, SITE, PRICE, bodyOf, queryOf } from './_lib.js'
import { tgSetup, tgStatus } from './_tgbot.js'
import { almatyDate, parseRange, funnelCounts, kpi, sourcesStats, trainersStats, FUNNEL_TYPES, FUNNEL_LABELS, type Scope } from './_stats.js'

type Req = { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined>; body?: unknown }
type Res = { status: (code: number) => { json: (o: object) => void }; setHeader: (k: string, v: string) => void }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const ATTEMPT_SORT: Record<string, string> = { created_at: 'a.created_at', name: 'a.name', status: 'a.status', paid_at: 'a.paid_at', dominant: 'a.dominant', answered: 'a.answered' }

const maskPhone = (p: string | null) => (p ? p.slice(0, 5) + '•••••' + p.slice(-2) : p)
const seesPhone = (s: Session) => s.role === 'admin' || process.env.TRAINER_SEES_PHONE !== '0'

async function fetchJson(url: string, init: RequestInit = {}, ms = 5000): Promise<{ ok: boolean; ms: number; data: Record<string, unknown> | null }> {
  const t0 = Date.now()
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
    const text = await res.text()
    let data: Record<string, unknown> | null = null
    try { data = JSON.parse(text) } catch { /* not json */ }
    return { ok: res.ok, ms: Date.now() - t0, data }
  } catch {
    return { ok: false, ms: Date.now() - t0, data: null }
  }
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CODE_RE = /^[a-z0-9_-]{2,32}$/

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  const p = queryOf(req)
  const action = p.get('action') || ''
  const isPost = req.method === 'POST'

  if (!adminConfigured()) return res.status(503).json({ ok: false, error: 'admin_not_configured' })

  // ── вход/выход (без сессии) ──
  if (action === 'login') {
    if (!isPost) return res.status(405).json({ ok: false })
    if (req.headers['x-requested-with'] !== 'admin') return res.status(403).json({ ok: false, error: 'csrf' })
    const ip = ipHash(req.headers)
    const fails = await q<{ n: string }>('login_fails',
      `SELECT count(*) AS n FROM events WHERE type IN ('admin_login_fail','trainer_login_fail') AND ip_hash = $1 AND ts > now() - interval '15 minutes'`, [ip])
    if (Number(fails[0]?.n ?? 0) >= 10) return res.status(429).json({ ok: false, error: 'locked' })
    const { login = '', password = '' } = bodyOf(req) as { login?: string; password?: string }

    if (checkCredentials(String(login), String(password))) {
      await logEvent({ type: 'admin_login_ok', ipHash: ip })
      res.setHeader('Set-Cookie', sessionCookie(makeSession('admin')))
      return res.status(200).json({ ok: true, role: 'admin' })
    }
    const tr = await findTrainerByLogin(String(login).trim().toLowerCase())
    if (tr && tr.active && verifyPassword(String(password), tr.password_hash)) {
      await logEvent({ type: 'trainer_login_ok', ipHash: ip, props: { trainerId: tr.id } })
      await touchTrainerLogin(tr.id)
      res.setHeader('Set-Cookie', sessionCookie(makeSession('trainer', tr.id)))
      return res.status(200).json({ ok: true, role: 'trainer' })
    }
    await logEvent({ type: tr ? 'trainer_login_fail' : 'admin_login_fail', ipHash: ip })
    await sleep(300)
    return res.status(401).json({ ok: false, error: 'bad_credentials' })
  }
  if (action === 'logout') {
    res.setHeader('Set-Cookie', clearCookie())
    return res.status(200).json({ ok: true })
  }

  // ── всё остальное — только с сессией ──
  const session = sessionFromReq(req.headers)
  if (!session) return res.status(401).json({ ok: false, error: 'unauthorized' })
  if (isPost && req.headers['x-requested-with'] !== 'admin') return res.status(403).json({ ok: false, error: 'csrf' })
  const isAdmin = session.role === 'admin'

  let scope: Scope = { trainerId: null, trainerCode: null }
  let trainerMe: { id: number; name: string; code: string } | null = null
  if (!isAdmin) {
    const t = await getTrainer(session.tid!)
    if (!t || !t.active) { res.setHeader('Set-Cookie', clearCookie()); return res.status(401).json({ ok: false, error: 'unauthorized' }) }
    scope = { trainerId: Number(t.id), trainerCode: t.code }
    trainerMe = { id: Number(t.id), name: t.name, code: t.code }
    if (isPost) return res.status(403).json({ ok: false, error: 'forbidden' })
  }

  if (action === 'me') {
    return res.status(200).json({ ok: true, role: session.role, trainer: trainerMe, statuses: ATTEMPT_STATUSES, db: dbConfigured(), site: SITE(), price: PRICE(), seesPhone: seesPhone(session) })
  }

  if (action === 'health') {
    if (!isAdmin) return res.status(403).json({ ok: false, error: 'forbidden' })
    const gw = process.env.KASPI_GW_URL?.replace(/\/$/, '')
    const wa = process.env.WA_API_URL?.replace(/\/$/, '')
    const t0 = Date.now()
    const [dbPing, kaspi, whatsapp, tg, last] = await Promise.all([
      q<{ one: number }>('ping', 'SELECT 1 AS one'),
      gw ? fetchJson(`${gw}/health`) : null,
      wa ? fetchJson(`${wa}/health`) : null,
      tgConfigured() ? tgStatus() : null,
      q<{ type: string; ts: string }>('last_events', `SELECT type, max(ts) AS ts FROM events WHERE type IN ('webhook_kpa','paid','invoice_created','quiz_start','page_view') GROUP BY type`)
    ])
    const lastMap: Record<string, string> = {}
    for (const r of last) lastMap[r.type] = r.ts
    const sessionLost = await q<{ ts: string }>('last_session_lost', `SELECT max(ts) AS ts FROM events WHERE type = 'webhook_kpa' AND props->>'status' = 'SessionExpired'`)
    return res.status(200).json({
      ok: true,
      checks: {
        db: { configured: dbConfigured(), ok: dbPing.length > 0, ms: Date.now() - t0 },
        kaspiGw: { configured: !!gw && kpaConfigured(), ok: !!kaspi?.ok, ms: kaspi?.ms ?? null, hasSession: !!kaspi?.data?.hasSession, cashier: kaspi?.data?.cashier ?? null, sessionSavedAt: kaspi?.data?.sessionSavedAt ?? null, url: gw ?? null },
        wa: { configured: whatsappConfigured(), ok: !!whatsapp?.ok, ms: whatsapp?.ms ?? null, connected: !!whatsapp?.data?.connected, url: wa ?? null, numbers: (whatsapp?.data?.numbers as unknown[] | undefined) ?? [] },
        telegram: { configured: tgConfigured(), ok: !!tg?.ok, bot: tg?.bot ?? null, commandsOn: !!tg?.commandsOn, webhookUrl: tg?.webhookUrl ?? null, lastError: tg?.lastError ?? null }
      },
      last: { ...lastMap, sessionExpired: sessionLost[0]?.ts ?? null },
      env: { siteUrl: SITE(), price: PRICE(), simulate: process.env.SIMULATE_PAYMENT === '1', testToken: !!process.env.TEST_TOKEN }
    })
  }

  if (!dbConfigured()) return res.status(503).json({ ok: false, error: 'db_not_configured' })
  const r = parseRange(p)

  if (action === 'overview') {
    const [cur, prev] = await Promise.all([kpi(r.from, r.to, scope), kpi(r.prevFrom, r.prevTo, scope)])
    return res.status(200).json({ ok: true, range: { from: r.from, to: r.to, bucket: r.bucket, label: r.label }, kpi: cur, prev })
  }

  if (action === 'funnel') {
    const f = await funnelCounts(r.from, r.to, scope)
    return res.status(200).json({ ok: true, stages: FUNNEL_TYPES.map(t => ({ key: t, label: FUNNEL_LABELS[t], count: f[t] })) })
  }

  if (action === 'timeline') {
    const rows = await q<{ t: string; views: string; started: string; finished: string; paid: string; revenue: string }>('timeline', `
      SELECT date_trunc($3, ts AT TIME ZONE 'Asia/Almaty') AS t,
        count(DISTINCT sid) FILTER (WHERE type = 'page_view')   AS views,
        count(*) FILTER (WHERE type = 'quiz_start')              AS started,
        count(*) FILTER (WHERE type = 'quiz_finish')             AS finished,
        count(*) FILTER (WHERE type = 'paid')                    AS paid,
        COALESCE(sum((props->>'amount')::numeric) FILTER (WHERE type = 'paid' AND props->>'amount' ~ '^[0-9.]+$'), 0) AS revenue
      FROM events WHERE ts >= $1 AND ts < $2 AND ($4::text IS NULL OR trainer_code = $4) GROUP BY 1 ORDER BY 1`, [r.from, r.to, r.bucket, scope.trainerCode])
    return res.status(200).json({
      ok: true, bucket: r.bucket, from: r.from, to: r.to,
      points: rows.map(x => ({ t: x.t, views: +x.views, started: +x.started, finished: +x.finished, paid: +x.paid, revenue: +x.revenue }))
    })
  }

  if (action === 'sources') {
    return res.status(200).json({ ok: true, rows: await sourcesStats(r.from, r.to, scope.trainerCode) })
  }

  if (action === 'trainers-stats') {
    if (!isAdmin) return res.status(403).json({ ok: false, error: 'forbidden' })
    const { rows, unknown } = await trainersStats(r.from, r.to)
    return res.status(200).json({ ok: true, rows, unknown })
  }

  if (action === 'attempts' || action === 'export') {
    const status = p.get('status') || null
    const lang = p.get('lang') === 'kk' || p.get('lang') === 'ru' ? p.get('lang') : null
    // фильтр по тренеру — по коду ссылки (см. kpi)
    let trainerCode: string | null = scope.trainerCode
    if (isAdmin && Number(p.get('trainer'))) trainerCode = (await getTrainer(Number(p.get('trainer'))))?.code ?? '__none__'
    const search = (p.get('q') || '').trim().slice(0, 60) || null
    const sort = ATTEMPT_SORT[p.get('sort') || ''] || 'a.created_at'
    const dir = p.get('dir') === 'asc' ? 'ASC' : 'DESC'
    const limit = action === 'export' ? 5000 : Math.min(100, Math.max(1, Number(p.get('limit') || 25)))
    const page = Math.max(1, Number(p.get('page') || 1))
    const rows = await q<Record<string, unknown> & { total: string; phone: string | null }>('attempts', `
      SELECT a.id, a.created_at, a.name, a.phone, a.lang, a.status, a.answered, a.dominant, a.combo, a.paid_by,
             a.dopamine, a.acetylcholine, a.gaba, a.serotonin, a.finished_at, a.paid_at, a.test_amount, a.invoice_id, a.trainer_code,
             a.utm->>'utm_source' AS source, a.utm->>'utm_campaign' AS campaign, t.name AS trainer_name, t.id AS trainer_id,
             count(*) OVER () AS total
      FROM attempts a LEFT JOIN trainers t ON t.id = a.trainer_id
      WHERE a.created_at >= $1 AND a.created_at < $2
        AND ($3::text IS NULL OR a.status = $3)
        AND ($4::text IS NULL OR a.phone ILIKE '%' || $4 || '%' OR a.name ILIKE '%' || $4 || '%')
        AND ($5::text IS NULL OR a.trainer_code = $5)
        AND ($6::text IS NULL OR a.lang = $6)
      ORDER BY ${sort} ${dir} NULLS LAST, a.id DESC LIMIT $7 OFFSET $8`, [r.from, r.to, status, search, trainerCode, lang, limit, (page - 1) * limit])
    const total = Number(rows[0]?.total ?? 0)
    const items = rows.map(({ total: _t, ...x }) => (seesPhone(session) ? x : { ...x, phone: maskPhone(x.phone) }))
    if (action === 'export') {
      const head = ['id', 'created_at', 'name', 'phone', 'lang', 'status', 'answered', 'dopamine', 'acetylcholine', 'gaba', 'serotonin', 'dominant', 'combo', 'trainer_name', 'trainer_code', 'source', 'campaign', 'invoice_id', 'paid_at', 'paid_by']
      const cell = (v: unknown) => csvEscape(v instanceof Date ? v.toISOString() : v)
      const csv = [head.join(';'), ...items.map(x => head.map(h => cell((x as Record<string, unknown>)[h])).join(';'))].join('\n')
      return res.status(200).json({ ok: true, filename: `braverman_${r.label}_${almatyDate(new Date())}.csv`, csv: '﻿' + csv })
    }
    return res.status(200).json({ ok: true, items, total, page, limit })
  }

  if (action === 'attempt') {
    const id = Number(p.get('id'))
    if (!id) return res.status(400).json({ ok: false, error: 'id' })
    const a = await getAttempt(id)
    if (!a || (!isAdmin && a.trainer_code !== scope.trainerCode)) return res.status(404).json({ ok: false, error: 'not_found' })
    const [payments, events, trainer] = await Promise.all([
      isAdmin ? q('attempt_payments', 'SELECT invoice_id, provider, amount, status, source, link_sent, created_at, paid_at FROM payments WHERE attempt_id = $1 ORDER BY created_at DESC', [id]) : Promise.resolve([]),
      q('attempt_events', `SELECT ts, type, step, props FROM events WHERE attempt_id = $1 OR ($2::text IS NOT NULL AND sid = $2 AND ts >= $3::timestamptz - interval '1 hour' AND ts <= COALESCE($4::timestamptz, now()) + interval '1 day') ORDER BY ts DESC LIMIT 300`, [id, a.sid, a.created_at, a.paid_at]),
      a.trainer_id ? getTrainer(a.trainer_id) : Promise.resolve(null)
    ])
    const attempt: Partial<AttemptRow> = { ...a }
    if (!isAdmin) { delete attempt.notes; delete attempt.invoice_error; delete attempt.invoice_ref; if (!seesPhone(session)) attempt.phone = maskPhone(a.phone) }
    return res.status(200).json({ ok: true, attempt, payments, events, trainer: trainer ? { id: trainer.id, name: trainer.name, code: trainer.code } : null, resultLink: a.status === 'paid' ? resultLink(a.id) : null })
  }

  if (action === 'payments') {
    if (!isAdmin) return res.status(403).json({ ok: false, error: 'forbidden' })
    const status = p.get('status') || null
    const limit = Math.min(100, Math.max(1, Number(p.get('limit') || 25)))
    const page = Math.max(1, Number(p.get('page') || 1))
    const rows = await q<Record<string, unknown> & { total: string }>('payments', `
      SELECT p.id, p.invoice_id, p.provider, p.phone, p.amount, p.status, p.source, p.link_sent, p.created_at, p.paid_at, p.attempt_id,
             a.name AS attempt_name, count(*) OVER () AS total
      FROM payments p LEFT JOIN attempts a ON a.id = p.attempt_id
      WHERE p.created_at >= $1 AND p.created_at < $2 AND ($3::text IS NULL OR p.status = $3)
      ORDER BY p.created_at DESC LIMIT $4 OFFSET $5`, [r.from, r.to, status, limit, (page - 1) * limit])
    return res.status(200).json({ ok: true, items: rows.map(({ total: _t, ...x }) => x), total: Number(rows[0]?.total ?? 0), page, limit })
  }

  if (action === 'trainers') {
    if (!isAdmin) return res.status(403).json({ ok: false, error: 'forbidden' })
    return res.status(200).json({ ok: true, items: await listTrainers() })
  }

  if (action === 'trainer') {
    if (!isAdmin) return res.status(403).json({ ok: false, error: 'forbidden' })
    const id = Number(p.get('id'))
    const t = id ? await getTrainer(id) : null
    if (!t) return res.status(404).json({ ok: false, error: 'not_found' })
    const s: Scope = { trainerId: t.id, trainerCode: t.code }
    const [k, prev, f] = await Promise.all([kpi(r.from, r.to, s), kpi(r.prevFrom, r.prevTo, s), funnelCounts(r.from, r.to, s)])
    return res.status(200).json({ ok: true, trainer: t, link: `${SITE()}/t/${t.code}`, kpi: k, prev, funnel: FUNNEL_TYPES.map(x => ({ key: x, label: FUNNEL_LABELS[x], count: f[x] })) })
  }

  // ── POST-действия (только админ) ──
  if (action === 'attempt-update') {
    if (!isPost) return res.status(405).json({ ok: false })
    const b = bodyOf(req) as { id?: number; notes?: string }
    const id = Number(b.id)
    if (!id || typeof b.notes !== 'string') return res.status(400).json({ ok: false, error: 'id' })
    return res.status(200).json({ ok: true, attempt: await setAttemptNotes(id, b.notes) })
  }

  // Ручная выдача результата (оплата вне сайта); send=true — ещё и отправить ссылку в WhatsApp
  if (action === 'attempt-grant' || action === 'attempt-resend') {
    if (!isPost) return res.status(405).json({ ok: false })
    const b = bodyOf(req) as { id?: number; send?: boolean }
    const id = Number(b.id)
    if (!id) return res.status(400).json({ ok: false, error: 'id' })
    let a = await getAttempt(id)
    if (!a) return res.status(404).json({ ok: false, error: 'not_found' })
    if (action === 'attempt-grant') {
      if (a.dominant == null) return res.status(400).json({ ok: false, error: 'not_finished' })
      a = (await grantManualPaid(id)) ?? a
    }
    if (a.status !== 'paid') return res.status(400).json({ ok: false, error: 'unpaid' })
    const link = resultLink(id)
    let waSent = false
    if ((b.send || action === 'attempt-resend') && a.phone) {
      waSent = (await sendWhatsApp(a.phone, resultLinkMessage(a.name, link, a.lang))).sent
      if (a.invoice_id) await setPaymentLinkSent(a.invoice_id, waSent)
    }
    await logEvent({ type: action === 'attempt-grant' ? 'access_granted' : 'link_resent', attemptId: id, props: { by: 'admin', waSent } })
    return res.status(200).json({ ok: true, link, waSent })
  }

  // Подключить команды Telegram-бота: вебхук на /api/tg-webhook + меню команд в группе TG_CHAT_ID
  if (action === 'tg-setup') {
    if (!isPost) return res.status(405).json({ ok: false })
    if (!tgConfigured()) return res.status(400).json({ ok: false, error: 'tg_not_configured' })
    try {
      const r = await tgSetup()
      await logEvent({ type: 'tg_setup', props: r })
      return res.status(200).json({ ok: true, ...r })
    } catch (e) {
      return res.status(502).json({ ok: false, error: 'tg_setup_failed', detail: String((e as Error)?.message || e).slice(0, 300) })
    }
  }

  if (action === 'trainer-create' || action === 'trainer-update') {
    if (!isPost) return res.status(405).json({ ok: false })
    const b = bodyOf(req) as { id?: number; code?: string; name?: string; phone?: string; notes?: string; active?: boolean; login?: string; password?: string }
    const code = b.code !== undefined ? String(b.code).trim().toLowerCase() : undefined
    if (code !== undefined && !CODE_RE.test(code)) return res.status(400).json({ ok: false, error: 'code' })
    const login = b.login !== undefined ? String(b.login).trim().toLowerCase() || null : undefined
    if (login && !/^[a-z0-9_.@-]{3,64}$/.test(login)) return res.status(400).json({ ok: false, error: 'login' })
    try {
      if (action === 'trainer-create') {
        if (!code || !b.name?.trim()) return res.status(400).json({ ok: false, error: 'fields' })
        const t = await createTrainer({ code, name: String(b.name).trim(), phone: b.phone ? String(b.phone) : '', notes: b.notes ? String(b.notes) : '', login, passwordHash: b.password ? hashPassword(String(b.password)) : null })
        await logEvent({ type: 'trainer_created', props: { trainerId: t.id, code } })
        return res.status(200).json({ ok: true, trainer: t, link: `${SITE()}/t/${t.code}` })
      }
      const id = Number(b.id)
      if (!id) return res.status(400).json({ ok: false, error: 'id' })
      const t = await updateTrainer(id, { code, name: b.name?.trim() || undefined, phone: b.phone !== undefined ? String(b.phone) : undefined, notes: b.notes !== undefined ? String(b.notes) : undefined, active: typeof b.active === 'boolean' ? b.active : undefined, login })
      if (!t) return res.status(404).json({ ok: false, error: 'not_found' })
      return res.status(200).json({ ok: true, trainer: t, link: `${SITE()}/t/${t.code}` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/unique|duplicate/i.test(msg)) return res.status(409).json({ ok: false, error: /login/.test(msg) ? 'login_taken' : 'code_taken' })
      throw e
    }
  }

  if (action === 'trainer-password') {
    if (!isPost) return res.status(405).json({ ok: false })
    const b = bodyOf(req) as { id?: number; password?: string }
    const id = Number(b.id)
    if (!id || !b.password || String(b.password).length < 6) return res.status(400).json({ ok: false, error: 'password' })
    await setTrainerPassword(id, hashPassword(String(b.password)))
    await logEvent({ type: 'trainer_password_set', props: { trainerId: id } })
    return res.status(200).json({ ok: true })
  }

  return res.status(404).json({ ok: false, error: 'unknown_action' })
}
