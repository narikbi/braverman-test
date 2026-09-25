// Слой БД (Neon Postgres). Модель attempt-centric: одна строка на прохождение теста.
// q()  — для аналитики/отчётности: таймаут 4 с, ошибки глотаются (тест не должен падать из-за базы).
// qx() — для критичных записей (попытка, счёт, оплата): ошибка пробрасывается, чтобы не выставить счёт без записи.
import crypto from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import type { NeuroKey, Scores, VideoKey } from '../shared/scoring.js'

export type AttemptStatus = 'started' | 'finished' | 'invoice' | 'paid'

export const ATTEMPT_STATUSES: { key: AttemptStatus; label: string }[] = [
  { key: 'started', label: 'Начал' },
  { key: 'finished', label: 'Закончил' },
  { key: 'invoice', label: 'Счёт выставлен' },
  { key: 'paid', label: 'Оплачено' }
]

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL
}

type Sql = ReturnType<typeof neon>
let client: Sql | null = null
function db(): Sql | null {
  if (!dbConfigured()) return null
  if (!client) client = neon(process.env.DATABASE_URL!)
  return client
}

async function run<T>(text: string, params: unknown[]): Promise<T[]> {
  const sql = db()
  if (!sql) throw new Error('db_not_configured')
  const rows = await Promise.race([
    sql.query(text, params) as Promise<unknown>,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('db_timeout')), 4000))
  ])
  return rows as T[]
}

/** Запрос с таймаутом 4 с; при ошибке — пустой массив. tag — для логов. */
export async function q<T = Record<string, unknown>>(tag: string, text: string, params: unknown[] = []): Promise<T[]> {
  if (!dbConfigured()) return []
  try {
    return await run<T>(text, params)
  } catch (e) {
    console.error('db_failed', tag, e instanceof Error ? e.message : e)
    return []
  }
}

/** То же, но ошибка пробрасывается (критичные записи). */
export async function qx<T = Record<string, unknown>>(tag: string, text: string, params: unknown[] = []): Promise<T[]> {
  try {
    return await run<T>(text, params)
  } catch (e) {
    console.error('db_failed', tag, e instanceof Error ? e.message : e)
    throw e
  }
}

// ── Атрибуция (UTM + тренер + реферер) ──

export type Attribution = {
  utm?: Record<string, string>
  t?: string | null       // код тренера из ?t=
  referrer?: string | null
  landing?: string | null
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

/** Чистим то, что прислал клиент: только известные ключи, длины ограничены. */
export function cleanAttribution(a: unknown): Required<Attribution> {
  const src = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>
  const utm: Record<string, string> = {}
  const u = src.utm && typeof src.utm === 'object' ? (src.utm as Record<string, unknown>) : {}
  for (const k of UTM_KEYS) if (typeof u[k] === 'string' && u[k]) utm[k] = String(u[k]).slice(0, 100)
  const t = typeof src.t === 'string' && /^[A-Za-z0-9_-]{2,32}$/.test(src.t) ? src.t.toLowerCase() : null
  const str = (v: unknown, n: number) => (typeof v === 'string' && v ? v.slice(0, n) : null)
  return { utm, t, referrer: str(src.referrer, 300), landing: str(src.landing, 300) }
}

// ── Попытки ──

export type AttemptRow = {
  id: number
  created_at: string
  updated_at: string
  sid: string | null
  name: string
  lang: 'ru' | 'kk'
  phone: string | null
  trainer_id: number | null
  trainer_code: string | null
  utm: Record<string, string>
  referrer: string | null
  landing: string | null
  answered: number
  answers: number[] | null
  dopamine: number | null
  acetylcholine: number | null
  gaba: number | null
  serotonin: number | null
  dominant: NeuroKey | null
  lowest: NeuroKey | null
  combo: VideoKey | null
  status: AttemptStatus
  paid_by: string | null
  finished_at: string | null
  checkout_at: string | null
  paid_at: string | null
  invoice_id: string | null
  invoice_ref: string | null
  invoice_error: string | null
  test_amount: number | null
  notes: string
  retake_of: number | null
}

export type AttemptMeta = { sid?: string | null; name?: string; lang?: 'ru' | 'kk'; attr?: Attribution }

export async function createAttempt(m: AttemptMeta): Promise<{ id: number }> {
  const a = cleanAttribution(m.attr)
  const rows = await qx<{ id: number }>('create_attempt', `
    INSERT INTO attempts (sid, name, lang, trainer_id, trainer_code, utm, referrer, landing)
    VALUES ($1, $2, $3, (SELECT id FROM trainers WHERE code = $4 AND active), $4, $5::jsonb, $6, $7)
    RETURNING id`, [m.sid ?? null, (m.name ?? '').slice(0, 60), m.lang === 'kk' ? 'kk' : 'ru', a.t, JSON.stringify(a.utm), a.referrer, a.landing])
  return { id: Number(rows[0].id) } // bigint приходит строкой
}

export async function getAttempt(id: number): Promise<AttemptRow | null> {
  const rows = await q<AttemptRow>('get_attempt', 'SELECT * FROM attempts WHERE id = $1', [id])
  return rows[0] ?? null
}

/** Пересдача: глубина цепочки (сколько пересдач было до этой попытки) и уже оплаченная пересдача этой попытки. */
export async function retakeInfo(id: number): Promise<{ depth: number; paidChild: number | null }> {
  const [d, c] = await Promise.all([
    q<{ depth: string }>('retake_depth', `
      WITH RECURSIVE chain AS (
        SELECT id, retake_of, 0 AS depth FROM attempts WHERE id = $1
        UNION ALL
        SELECT a.id, a.retake_of, chain.depth + 1 FROM attempts a JOIN chain ON a.id = chain.retake_of WHERE chain.depth < 10
      ) SELECT max(depth) AS depth FROM chain`, [id]),
    q<{ id: string }>('retake_child', `SELECT id FROM attempts WHERE retake_of = $1 AND status = 'paid' ORDER BY id DESC LIMIT 1`, [id])
  ])
  return { depth: Number(d[0]?.depth ?? 0), paidChild: c[0] ? Number(c[0].id) : null }
}

/** Бесплатная пересдача: попытка становится «оплаченной» без платежа, наследует телефон и атрибуцию исходной. */
export async function grantRetake(id: number, originalId: number): Promise<AttemptRow | null> {
  const rows = await q<AttemptRow>('grant_retake', `
    UPDATE attempts a SET
      retake_of = o.id, status = 'paid', paid_by = 'retake', paid_at = COALESCE(a.paid_at, now()),
      phone = COALESCE(a.phone, o.phone),
      trainer_code = COALESCE(a.trainer_code, o.trainer_code), trainer_id = COALESCE(a.trainer_id, o.trainer_id),
      utm = CASE WHEN a.utm = '{}'::jsonb THEN o.utm ELSE a.utm END,
      updated_at = now()
    FROM attempts o
    WHERE a.id = $1 AND o.id = $2 AND a.id <> o.id AND a.status <> 'paid'
    RETURNING a.*`, [id, originalId])
  return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null
}

/** Прогресс из beacon'ов quiz_step: только вверх. */
export async function bumpAnswered(id: number, step: number) {
  await q('bump_answered', 'UPDATE attempts SET answered = GREATEST(answered, $2), updated_at = now() WHERE id = $1', [id, step])
}

/** Завершение: ответы + баллы. Имя/язык/атрибуцию дописываем, если при старте не успели. */
export async function finishAttempt(id: number, r: { answers: number[]; scores: Scores; dominant: NeuroKey; lowest: NeuroKey; combo: VideoKey }, m: AttemptMeta = {}): Promise<AttemptRow> {
  const a = cleanAttribution(m.attr)
  const rows = await qx<AttemptRow>('finish_attempt', `
    UPDATE attempts SET
      answers = $2::jsonb, dopamine = $3, acetylcholine = $4, gaba = $5, serotonin = $6,
      dominant = $7, lowest = $8, combo = $9, answered = $10,
      status = CASE WHEN status = 'started' THEN 'finished' ELSE status END,
      finished_at = COALESCE(finished_at, now()),
      name = COALESCE(NULLIF($11, ''), name), lang = COALESCE($12, lang), sid = COALESCE(sid, $13),
      trainer_code = COALESCE(trainer_code, $14),
      trainer_id = COALESCE(trainer_id, (SELECT id FROM trainers WHERE code = $14 AND active)),
      utm = CASE WHEN utm = '{}'::jsonb THEN $15::jsonb ELSE utm END,
      referrer = COALESCE(referrer, $16), landing = COALESCE(landing, $17),
      updated_at = now()
    WHERE id = $1 RETURNING *`, [
    id, JSON.stringify(r.answers), r.scores.dopamine, r.scores.acetylcholine, r.scores.gaba, r.scores.serotonin,
    r.dominant, r.lowest, r.combo, r.answers.length,
    (m.name ?? '').slice(0, 60), m.lang ?? null, m.sid ?? null, a.t, JSON.stringify(a.utm), a.referrer, a.landing
  ])
  if (!rows[0]) throw new Error('attempt_not_found')
  return rows[0]
}

export async function setAttemptInvoice(id: number, i: { phone: string; invoiceId?: string; invoiceRef?: string; invoiceError?: string; testAmount?: number }) {
  await qx('attempt_invoice', `
    UPDATE attempts SET phone = $2, invoice_id = COALESCE($3, invoice_id), invoice_ref = COALESCE($4, invoice_ref),
      invoice_error = $5, test_amount = COALESCE($6, test_amount),
      status = CASE WHEN status = 'paid' THEN 'paid' WHEN $3::text IS NOT NULL THEN 'invoice' ELSE status END,
      checkout_at = COALESCE(checkout_at, now()), updated_at = now()
    WHERE id = $1`, [id, i.phone, i.invoiceId ?? null, i.invoiceRef ?? null, i.invoiceError ?? null, i.testAmount ?? null])
}

/** Открытый (неоплаченный, свежий) счёт по этой попытке и номеру — чтобы не плодить счета при повторном нажатии. */
export async function findPendingInvoice(attemptId: number, phone: string, maxAgeMin = 20): Promise<string | null> {
  const rows = await q<{ invoice_ref: string }>('pending_invoice', `
    SELECT a.invoice_ref FROM attempts a JOIN payments p ON p.attempt_id = a.id AND p.invoice_id = a.invoice_id
    WHERE a.id = $1 AND a.phone = $2 AND p.status = 'pending' AND a.invoice_ref IS NOT NULL
      AND p.created_at > now() - ($3 || ' minutes')::interval`, [attemptId, phone, String(maxAgeMin)])
  return rows[0]?.invoice_ref ?? null
}

export async function setAttemptNotes(id: number, notes: string): Promise<AttemptRow | null> {
  const rows = await q<AttemptRow>('attempt_notes', 'UPDATE attempts SET notes = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, notes.slice(0, 2000)])
  return rows[0] ?? null
}

// ── Оплаты ──

export async function createPayment(i: { invoiceId: string; provider: string; attemptId: number; phone: string; amount: number }) {
  await qx('create_payment',
    `INSERT INTO payments (invoice_id, provider, attempt_id, phone, amount) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (invoice_id) DO NOTHING`, [i.invoiceId, i.provider, i.attemptId, i.phone, i.amount])
}

export type PaymentOwner = { attempt_id: number | null; phone: string; status: string; paid_at: string | null }

/** Наш ли это счёт (вебхуки чужих/старых счетов игнорируем). */
export async function findPaymentByInvoice(invoiceId: string): Promise<PaymentOwner | null> {
  const rows = await q<PaymentOwner>('payment_owner', 'SELECT attempt_id, phone, status, paid_at FROM payments WHERE invoice_id = $1', [invoiceId])
  return rows[0] ?? null
}

export type PaidAttempt = Pick<AttemptRow, 'id' | 'sid' | 'utm' | 'trainer_code' | 'trainer_id' | 'name' | 'lang' | 'phone' | 'test_amount'>

/**
 * Отмечает счёт оплаченным. first=true только для первого вызова по этому счёту —
 * защита от дублей между вебхуком и поллингом. Неизвестный счёт НЕ создаётся (first=false, attempt=null).
 */
export async function markPaid(i: { invoiceId: string; source: 'webhook' | 'poll'; amount?: string | number; provider?: string }): Promise<{ first: boolean; attempt: PaidAttempt | null }> {
  const amount = i.amount != null ? Number(String(i.amount).replace(/[^\d.]/g, '')) || null : null
  const upd = await qx<{ attempt_id: number | null }>('mark_paid_upd',
    `UPDATE payments SET status = 'paid', paid_at = now(), source = $2, amount = COALESCE(amount, $3)
     WHERE invoice_id = $1 AND paid_at IS NULL RETURNING attempt_id`, [i.invoiceId, i.source, amount])
  let first = upd.length > 0
  let attemptId = upd[0]?.attempt_id != null ? Number(upd[0].attempt_id) : null
  if (!first) {
    const exists = await qx<{ attempt_id: number | null }>('mark_paid_chk', 'SELECT attempt_id FROM payments WHERE invoice_id = $1', [i.invoiceId])
    if (!exists.length) return { first: false, attempt: null }
    attemptId = exists[0].attempt_id != null ? Number(exists[0].attempt_id) : null
  }
  if (!attemptId) return { first, attempt: null }
  const rows = await qx<PaidAttempt>('mark_paid_attempt',
    `UPDATE attempts SET status = 'paid', paid_by = COALESCE(paid_by, $2), paid_at = COALESCE(paid_at, now()), updated_at = now()
     WHERE id = $1 RETURNING id, sid, utm, trainer_code, trainer_id, name, lang, phone, test_amount`, [attemptId, i.provider ?? 'kaspi'])
  const a = rows[0]
  return { first, attempt: a ? { ...a, id: Number(a.id), trainer_id: a.trainer_id != null ? Number(a.trainer_id) : null } : null }
}

/** Ручная выдача из админки (оплата вне сайта): попытка → оплачено, запись оплаты, событие. */
export async function grantManualPaid(attemptId: number, amount = Number(process.env.PRICE_KZT || 5000)): Promise<AttemptRow | null> {
  const rows = await q<AttemptRow>('grant_attempt',
    `UPDATE attempts SET status = 'paid', paid_by = 'admin', paid_at = COALESCE(paid_at, now()), updated_at = now() WHERE id = $1 RETURNING *`, [attemptId])
  const a = rows[0]
  if (!a) return null
  await q('grant_payment',
    `INSERT INTO payments (invoice_id, provider, attempt_id, phone, amount, status, source, paid_at)
     VALUES ($1, 'manual', $2, $3, $4, 'paid', 'admin', now()) ON CONFLICT (invoice_id) DO NOTHING`,
    [`manual-${a.id}`, a.id, a.phone ?? '', amount])
  await logEvent({ type: 'paid', attemptId: a.id, sid: a.sid, utm: a.utm, trainerCode: a.trainer_code, props: { amount, provider: 'manual', source: 'admin' } })
  return a
}

export async function setPaymentStatus(invoiceId: string, status: 'cancelled' | 'expired' | 'error') {
  await q('payment_status', `UPDATE payments SET status = $2 WHERE invoice_id = $1 AND status = 'pending'`, [invoiceId, status])
}

export async function setPaymentLinkSent(invoiceId: string, sent: boolean) {
  await q('payment_link_sent', 'UPDATE payments SET link_sent = $2 WHERE invoice_id = $1', [invoiceId, sent])
}

/** Оплаченные попытки по номеру — для восстановления ссылки на результат. */
export async function findPaidAttemptsByPhone(phone: string): Promise<{ id: number; name: string; lang: 'ru' | 'kk'; paid_at: string }[]> {
  return q('paid_by_phone', `SELECT id, name, lang, paid_at FROM attempts WHERE phone = $1 AND status = 'paid' ORDER BY paid_at DESC LIMIT 5`, [phone])
}

// ── События ──

export async function logEvent(e: {
  type: string
  sid?: string | null
  attemptId?: number | null
  trainerCode?: string | null
  step?: number | null
  props?: object
  utm?: object | null
  referrer?: string | null
  path?: string | null
  ua?: string | null
  ipHash?: string | null
}) {
  await q('log_event',
    `INSERT INTO events (type, sid, attempt_id, trainer_code, step, props, utm, referrer, path, ua, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11)`, [
    e.type, e.sid ?? null, e.attemptId ?? null, e.trainerCode ?? null, e.step ?? null, JSON.stringify(e.props ?? {}),
    e.utm && Object.keys(e.utm).length ? JSON.stringify(e.utm) : null, e.referrer ?? null, e.path ?? null, e.ua ?? null, e.ipHash ?? null
  ])
}

/** Сколько событий типа type с этим ключом за окно (лимиты попыток входа/восстановления). */
export async function countRecent(type: string, field: 'ip_hash' | 'props', value: string, minutes: number, propKey?: string): Promise<number> {
  const rows = field === 'ip_hash'
    ? await q<{ n: string }>('count_recent', `SELECT count(*) AS n FROM events WHERE type = $1 AND ip_hash = $2 AND ts > now() - ($3 || ' minutes')::interval`, [type, value, String(minutes)])
    : await q<{ n: string }>('count_recent', `SELECT count(*) AS n FROM events WHERE type = $1 AND props->>$4 = $2 AND ts > now() - ($3 || ' minutes')::interval`, [type, value, String(minutes), propKey])
  return Number(rows[0]?.n ?? 0)
}

/** IP не храним — только короткий хеш с секретом (для лимитов). */
export function ipHash(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['x-forwarded-for'] ?? headers['x-real-ip'] ?? ''
  const ip = (Array.isArray(raw) ? raw[0] : raw).split(',')[0].trim()
  return crypto.createHmac('sha256', process.env.ADMIN_SECRET || 'x').update(ip).digest('hex').slice(0, 16)
}

// ── Тренеры ──

export type TrainerRow = {
  id: number
  created_at: string
  code: string
  name: string
  phone: string
  active: boolean
  notes: string
  login: string | null
  has_password: boolean
  last_login_at: string | null
}

const TRAINER_COLS = 'id, created_at, code, name, phone, active, notes, login, (password_hash IS NOT NULL) AS has_password, last_login_at'

export async function listTrainers(): Promise<TrainerRow[]> {
  return q<TrainerRow>('trainers', `SELECT ${TRAINER_COLS} FROM trainers ORDER BY active DESC, created_at DESC`)
}

export async function getTrainer(id: number): Promise<TrainerRow | null> {
  return (await q<TrainerRow>('trainer', `SELECT ${TRAINER_COLS} FROM trainers WHERE id = $1`, [id]))[0] ?? null
}

export async function createTrainer(t: { code: string; name: string; phone?: string; notes?: string; login?: string | null; passwordHash?: string | null }): Promise<TrainerRow> {
  const rows = await qx<TrainerRow>('trainer_create', `
    INSERT INTO trainers (code, name, phone, notes, login, password_hash) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING ${TRAINER_COLS}`, [t.code, t.name.slice(0, 80), (t.phone ?? '').slice(0, 20), (t.notes ?? '').slice(0, 1000), t.login || null, t.passwordHash ?? null])
  return rows[0]
}

export async function updateTrainer(id: number, t: { code?: string; name?: string; phone?: string; notes?: string; active?: boolean; login?: string | null }): Promise<TrainerRow | null> {
  const rows = await qx<TrainerRow>('trainer_update', `
    UPDATE trainers SET code = COALESCE($2, code), name = COALESCE($3, name), phone = COALESCE($4, phone), notes = COALESCE($5, notes),
      active = COALESCE($6, active), login = CASE WHEN $7::boolean THEN $8 ELSE login END
    WHERE id = $1 RETURNING ${TRAINER_COLS}`, [id, t.code ?? null, t.name?.slice(0, 80) ?? null, t.phone?.slice(0, 20) ?? null, t.notes?.slice(0, 1000) ?? null, t.active ?? null, t.login !== undefined, t.login || null])
  return rows[0] ?? null
}

export async function setTrainerPassword(id: number, passwordHash: string) {
  await qx('trainer_password', 'UPDATE trainers SET password_hash = $2 WHERE id = $1', [id, passwordHash])
}

export async function findTrainerByLogin(login: string): Promise<{ id: number; password_hash: string | null; active: boolean; name: string } | null> {
  const rows = await q<{ id: number; password_hash: string | null; active: boolean; name: string }>('trainer_login', 'SELECT id, password_hash, active, name FROM trainers WHERE login = $1', [login])
  return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null // bigint приходит строкой
}

export async function touchTrainerLogin(id: number) {
  await q('trainer_touch', 'UPDATE trainers SET last_login_at = now() WHERE id = $1', [id])
}
