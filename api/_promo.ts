// Промокоды на бесплатный тест: код вводят на экране оплаты или открывают ссылку /promo/<код>.
// Погашение — атомарно (used < max_uses), попытка становится paid_by='promo' без строки в payments
// и без события 'paid' — в выручку, «Оплатили» и конверсии промокоды не попадают.
import crypto from 'node:crypto'
import { q, qx, type AttemptRow } from './_db.js'
import { SITE } from './_lib.js'

// ── Схема: создаём сами при первом обращении (дублируется в db/schema.sql) ──
let schemaReady: Promise<void> | null = null
export function ensurePromoSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const [t] = await qx<{ tbl: string | null; col: number }>('promo_schema_check', `
        SELECT to_regclass('public.promo_codes')::text AS tbl,
               (SELECT count(*)::int FROM information_schema.columns WHERE table_name = 'attempts' AND column_name = 'promo_code') AS col`)
      if (!t?.tbl) {
        await qx('promo_schema_table', `
          CREATE TABLE IF NOT EXISTS promo_codes (
            id bigserial PRIMARY KEY,
            code text NOT NULL UNIQUE,
            note text NOT NULL DEFAULT '',
            max_uses int NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
            used int NOT NULL DEFAULT 0,
            active boolean NOT NULL DEFAULT true,
            created_by text NOT NULL DEFAULT 'admin',
            created_at timestamptz NOT NULL DEFAULT now(),
            last_used_at timestamptz
          )`)
      }
      if (!t?.col) {
        await qx('promo_schema_col', `ALTER TABLE attempts ADD COLUMN IF NOT EXISTS promo_code text`)
        await qx('promo_schema_idx', `CREATE INDEX IF NOT EXISTS attempts_promo_idx ON attempts (promo_code) WHERE promo_code IS NOT NULL`)
      }
    })().catch(e => { schemaReady = null; throw e })
  }
  return schemaReady
}

// ── Коды ──
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // без 0/O, 1/I/L
export function genCode(): string {
  const bytes = crypto.randomBytes(5)
  return 'BRV-' + Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

/** Код как его вводят люди: пробелы по краям, любой регистр. null — не похоже на код. */
export function normCode(raw: unknown): string | null {
  const c = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return /^[A-Z0-9-]{3,32}$/.test(c) ? c : null
}

/** «1 раз», «3 раза», «5 раз» */
export function timesRu(n: number): string {
  const d = n % 10, h = n % 100
  return `${n} ${d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'раза' : 'раз'}`
}

export const promoLink = (code: string) => `${SITE()}/promo/${encodeURIComponent(code)}`

export type PromoRow = {
  id: number; code: string; note: string; max_uses: number; used: number; active: boolean
  created_by: string; created_at: string; last_used_at: string | null
}
export type PromoStatus = 'active' | 'used' | 'off'
export const promoStatus = (p: Pick<PromoRow, 'active' | 'used' | 'max_uses'>): PromoStatus =>
  !p.active ? 'off' : p.used >= p.max_uses ? 'used' : 'active'

const toRow = (r: Record<string, unknown>): PromoRow => ({
  id: Number(r.id), code: String(r.code), note: String(r.note ?? ''), max_uses: Number(r.max_uses), used: Number(r.used),
  active: !!r.active, created_by: String(r.created_by ?? 'admin'), created_at: String(r.created_at), last_used_at: (r.last_used_at as string) ?? null
})

/** Новый код. Свой код занят → 'code_taken'; сгенерированный при коллизии перегенерируем. */
export async function createPromo(p: { note?: string; uses?: number; code?: string | null; by: 'admin' | 'bot' }): Promise<PromoRow | 'code_taken'> {
  await ensurePromoSchema()
  const uses = Math.min(1000, Math.max(1, Math.floor(Number(p.uses) || 1)))
  const note = String(p.note ?? '').trim().slice(0, 200)
  for (let i = 0; i < 5; i++) {
    const code = p.code || genCode()
    const rows = await qx<Record<string, unknown>>('promo_create', `
      INSERT INTO promo_codes (code, note, max_uses, created_by) VALUES ($1, $2, $3, $4)
      ON CONFLICT (code) DO NOTHING RETURNING *`, [code, note, uses, p.by])
    if (rows[0]) return toRow(rows[0])
    if (p.code) return 'code_taken'
  }
  throw new Error('promo_code_collision')
}

export type PromoWithUses = PromoRow & { status: PromoStatus; link: string; attempts: { id: number; name: string; paid_at: string }[] }

export async function listPromos(): Promise<PromoWithUses[]> {
  await ensurePromoSchema()
  const rows = await q<Record<string, unknown>>('promo_list', `
    SELECT p.*, COALESCE((
      SELECT json_agg(json_build_object('id', a.id, 'name', a.name, 'paid_at', a.paid_at) ORDER BY a.paid_at)
      FROM attempts a WHERE a.promo_code = p.code AND a.paid_by = 'promo'), '[]') AS attempts
    FROM promo_codes p ORDER BY p.created_at DESC LIMIT 500`)
  return rows.map(r => {
    const p = toRow(r)
    const attempts = (r.attempts as { id: number | string; name: string; paid_at: string }[]).map(a => ({ ...a, id: Number(a.id) }))
    return { ...p, status: promoStatus(p), link: promoLink(p.code), attempts }
  })
}

export async function togglePromo(id: number, active: boolean): Promise<PromoRow | null> {
  await ensurePromoSchema()
  const rows = await qx<Record<string, unknown>>('promo_toggle', `UPDATE promo_codes SET active = $2 WHERE id = $1 RETURNING *`, [id, active])
  return rows[0] ? toRow(rows[0]) : null
}

export async function getPromo(code: string): Promise<PromoRow | null> {
  await ensurePromoSchema()
  const rows = await q<Record<string, unknown>>('promo_get', `SELECT * FROM promo_codes WHERE code = $1`, [code])
  return rows[0] ? toRow(rows[0]) : null
}

export type PromoFail = 'not_found' | 'inactive' | 'used_up' | 'already_paid'

/** Можно ли сейчас погасить код (для пометки «тест в подарок» на странице по ссылке). */
export async function checkPromo(code: string): Promise<{ valid: true; promo: PromoRow } | { valid: false; reason: PromoFail }> {
  const p = await getPromo(code)
  if (!p) return { valid: false, reason: 'not_found' }
  const s = promoStatus(p)
  if (s === 'off') return { valid: false, reason: 'inactive' }
  if (s === 'used') return { valid: false, reason: 'used_up' }
  return { valid: true, promo: p }
}

/**
 * Погасить код на попытку: одним запросом занимаем одно использование и отмечаем попытку оплаченной.
 * Попытка уже оплачена — код не тратим ('already_paid'). phone — с экрана оплаты (по ссылке номера нет).
 */
export async function redeemPromo(attemptId: number, code: string, phone: string | null): Promise<{ ok: true; attempt: AttemptRow; promo: PromoRow } | { ok: false; reason: PromoFail }> {
  await ensurePromoSchema()
  const rows = await qx<Record<string, unknown>>('promo_redeem', `
    WITH c AS (
      UPDATE promo_codes SET used = used + 1, last_used_at = now()
      WHERE code = $2 AND active AND used < max_uses
        AND EXISTS (SELECT 1 FROM attempts WHERE id = $1 AND status <> 'paid' AND dominant IS NOT NULL)
      RETURNING *
    ), a AS (
      UPDATE attempts SET status = 'paid', paid_by = 'promo', promo_code = c.code, paid_at = COALESCE(attempts.paid_at, now()),
        phone = COALESCE($3, attempts.phone), updated_at = now()
      FROM c WHERE attempts.id = $1
      RETURNING attempts.*
    )
    SELECT row_to_json(a.*) AS attempt, row_to_json(c.*) AS promo FROM a, c`, [attemptId, code, phone])
  const r = rows[0] as { attempt: AttemptRow; promo: Record<string, unknown> } | undefined
  if (r) return { ok: true, attempt: { ...r.attempt, id: Number(r.attempt.id) }, promo: toRow(r.promo) }
  // не вышло — объясняем почему
  const own = await q<{ status: string }>('promo_attempt', 'SELECT status FROM attempts WHERE id = $1', [attemptId])
  if (own[0]?.status === 'paid') return { ok: false, reason: 'already_paid' }
  const c = await checkPromo(code)
  return { ok: false, reason: c.valid ? 'used_up' : c.reason }
}
