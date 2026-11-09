// A/B-эксперимент: вариант Б воронки (braverman.kz/b). Вся серверная логика варианта собрана здесь.
// Чтобы убрать эксперимент — удалить этот файл и его вызовы (attempt.ts, track.ts, admin.ts, _fulfill.ts, checkout.ts, _tgbot.ts).
//
// Метка варианта: attempts.variant = NULL (вариант А) | 'b' | 'b:work' | 'b:love' (вариант и нарезка).
// events.variant заполняется только у событий, присланных страницей Б; серверные события (счёт, оплата,
// открытие результата) получают вариант через JOIN attempts — поэтому logEvent и его вызовы не менялись.
// В отчётах вариант события = вариант его попытки, а у событий без попытки (визит до старта теста) — метка события.
import { q, qx, logEvent } from './_db.js'
import type { Range } from './_stats.js'

// ── Схема: колонки создаём сами при первом обращении (дублируется в db/schema.sql) ──
let schemaReady: Promise<void> | null = null
export function ensureAbSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const [t] = await qx<{ n: number }>('ab_schema_check', `
        SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema = 'public' AND ((table_name = 'attempts' AND column_name IN ('variant', 'wa_phone', 'wa_consent_at'))
           OR (table_name = 'events' AND column_name = 'variant'))`)
      if ((t?.n ?? 0) >= 4) return
      await qx('ab_schema_1', `ALTER TABLE attempts ADD COLUMN IF NOT EXISTS variant text`)
      await qx('ab_schema_2', `ALTER TABLE attempts ADD COLUMN IF NOT EXISTS wa_phone text`)
      await qx('ab_schema_3', `ALTER TABLE attempts ADD COLUMN IF NOT EXISTS wa_consent_at timestamptz`)
      await qx('ab_schema_4', `ALTER TABLE events ADD COLUMN IF NOT EXISTS variant text`)
      await qx('ab_schema_5', `CREATE INDEX IF NOT EXISTS attempts_variant_idx ON attempts (variant) WHERE variant IS NOT NULL`)
    })().catch(e => { schemaReady = null; throw e })
  }
  return schemaReady
}

// ── Метка ──
/** Принимаем только известные значения; вариант А не хранится (NULL). */
export function parseVariant(raw: unknown): string | null {
  return typeof raw === 'string' && /^b(:(work|love))?$/.test(raw) ? raw : null
}
export const isVariantB = (v: string | null | undefined): boolean => !!v && v.startsWith('b')

const HOOK_RU: Record<string, string> = { work: 'работа', love: 'отношения' }
/** Строка для уведомлений в Telegram: «🅱 Вариант Б · нарезка «работа»»; для варианта А — ''. */
export function variantLine(a: { variant?: string | null } | null | undefined): string {
  const v = a?.variant
  if (!isVariantB(v)) return ''
  const hook = v!.split(':')[1]
  return `🅱 Вариант Б${hook ? ` · нарезка «${HOOK_RU[hook] || hook}»` : ''}`
}

export async function setAttemptVariant(id: number, variant: string): Promise<void> {
  await q('ab_set_variant', `UPDATE attempts SET variant = COALESCE(variant, $2) WHERE id = $1`, [id, variant])
}

/** Номер WhatsApp с согласием (100-й вопрос) и имя (150-й). Сообщений по этому номеру не шлём. */
export async function saveContact(id: number, c: { phone?: string | null; consent?: boolean; name?: string }): Promise<void> {
  await q('ab_save_contact', `
    UPDATE attempts SET
      wa_phone = COALESCE($2, wa_phone),
      wa_consent_at = CASE WHEN $3::boolean THEN COALESCE(wa_consent_at, now()) ELSE wa_consent_at END,
      name = COALESCE(NULLIF($4, ''), name),
      updated_at = now()
    WHERE id = $1`, [id, c.phone ?? null, !!(c.phone && c.consent), (c.name ?? '').slice(0, 60)])
}

/** Событие со страницы Б — как logEvent, плюс колонка variant. Колонки ещё нет — пишем обычным logEvent. */
export async function logEventB(e: Parameters<typeof logEvent>[0] & { variant: string }): Promise<void> {
  try {
    await qx('log_event_b',
      `INSERT INTO events (type, sid, attempt_id, trainer_code, step, props, utm, referrer, path, ua, ip_hash, variant)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12)`, [
        e.type, e.sid ?? null, e.attemptId ?? null, e.trainerCode ?? null, e.step ?? null, JSON.stringify(e.props ?? {}),
        e.utm && Object.keys(e.utm).length ? JSON.stringify(e.utm) : null, e.referrer ?? null, e.path ?? null, e.ua ?? null, e.ipHash ?? null, e.variant
      ])
  } catch {
    await logEvent(e)
  }
}

// ── Счётчик на первом экране: «N человек уже знают свой тип» ──
let statsCache: { at: number; finished: number } | null = null
export async function publicStats(): Promise<{ finished: number }> {
  if (statsCache && Date.now() - statsCache.at < 5 * 60 * 1000) return { finished: statsCache.finished }
  const rows = await q<{ n: string }>('ab_public_stats', `SELECT count(*) AS n FROM attempts WHERE finished_at IS NOT NULL`)
  const finished = Number(rows[0]?.n ?? 0)
  if (finished) statsCache = { at: Date.now(), finished }
  return { finished }
}

// ── Отчёт для админки: панель варианта Б и сравнение А/Б ──
// «Чистая» воронка сайта, одинаковая для обоих вариантов:
//  · визит — уникальная сессия, открывшая сайт не по ссылке на готовый результат (?r=), тест после оплаты (?p=) или восстановление;
//  · без оплат вне сайта, тестов тренеров, бесплатных пересдач и тестовых счетов на 1 ₸;
//  · оплата — событие 'paid' с сайта (Kaspi), ручная выдача доступа не считается.
const SIDE = `split_part(COALESCE(a.variant, e.variant, 'a'), ':', 1)`
const HOOK = `split_part(COALESCE(a.variant, e.variant, ''), ':', 2)`
const ORGANIC = `(a.id IS NULL OR (COALESCE(a.paid_by, '') NOT IN ('prepaid', 'trainer', 'retake') AND a.test_amount IS NULL))`
const NEW_VISIT = `e.type = 'page_view' AND COALESCE(e.path, '') !~ '[?&](r|p|recover)='`
const REAL_PAID = `e.type = 'paid' AND COALESCE(e.props->>'provider', '') <> 'manual'`
const WHO = `COALESCE(e.sid, 'a' || e.attempt_id::text)`
const METRICS = `
  count(DISTINCT e.sid) FILTER (WHERE ${NEW_VISIT})                                   AS visits,
  count(DISTINCT ${WHO}) FILTER (WHERE e.type = 'quiz_start')                         AS started,
  count(DISTINCT ${WHO}) FILTER (WHERE e.type = 'quiz_step' AND e.step = 50)          AS q50,
  count(DISTINCT ${WHO}) FILTER (WHERE e.type = 'quiz_step' AND e.step = 100)         AS q100,
  count(DISTINCT ${WHO}) FILTER (WHERE e.type = 'wa_optin')                           AS optins,
  count(DISTINCT ${WHO}) FILTER (WHERE e.type = 'quiz_step' AND e.step = 150)         AS q150,
  count(DISTINCT ${WHO}) FILTER (WHERE e.type = 'name_given')                         AS names,
  count(DISTINCT ${WHO}) FILTER (WHERE e.type = 'quiz_finish')                        AS finished,
  count(DISTINCT ${WHO}) FILTER (WHERE e.type = 'checkout_view')                      AS checkouts,
  count(DISTINCT e.sid) FILTER (WHERE e.type = 'teaser_play')                         AS teasers,
  count(DISTINCT ${WHO}) FILTER (WHERE e.type = 'checkout_submit')                    AS submits,
  count(DISTINCT e.attempt_id) FILTER (WHERE e.type = 'invoice_created')              AS invoices,
  count(DISTINCT e.attempt_id) FILTER (WHERE ${REAL_PAID})                            AS paid,
  COALESCE(sum((e.props->>'amount')::numeric) FILTER (WHERE ${REAL_PAID} AND e.props->>'amount' ~ '^[0-9.]+$'), 0) AS revenue,
  count(DISTINCT e.attempt_id) FILTER (WHERE e.type = 'result_view')                  AS results,
  count(DISTINCT e.sid) FILTER (WHERE e.type = 'video_play')                          AS videos,
  count(DISTINCT e.attempt_id) FILTER (WHERE e.type = 'promo_redeemed')               AS promo`
const FROM = `FROM events e LEFT JOIN attempts a ON a.id = e.attempt_id WHERE e.ts >= $1 AND e.ts < $2 AND ${ORGANIC}`

const KEYS = ['visits', 'started', 'q50', 'q100', 'optins', 'q150', 'names', 'finished', 'checkouts', 'teasers', 'submits', 'invoices', 'paid', 'revenue', 'results', 'videos', 'promo'] as const
export type AbSide = Record<(typeof KEYS)[number], number>
const emptySide = (): AbSide => Object.fromEntries(KEYS.map(k => [k, 0])) as AbSide
const toSide = (r: Record<string, unknown> | undefined): AbSide => {
  const s = emptySide()
  if (r) for (const k of KEYS) s[k] = Number(r[k] ?? 0)
  return s
}

/** Метрики вариантов А и Б за период. */
export async function abSides(from: Date, to: Date): Promise<{ a: AbSide; b: AbSide }> {
  const rows = await q<Record<string, unknown>>('ab_sides', `SELECT ${SIDE} AS v, ${METRICS} ${FROM} GROUP BY 1`, [from, to])
  return { a: toSide(rows.find(r => r.v === 'a')), b: toSide(rows.find(r => r.v === 'b')) }
}

export type AbSourceRow = { source: string; a: { visits: number; finished: number; paid: number }; b: { visits: number; finished: number; paid: number } }

export async function abReport(r: Range) {
  const [cur, prev, hookRows, srcRows, recent] = await Promise.all([
    abSides(r.from, r.to),
    abSides(r.prevFrom, r.prevTo),
    q<Record<string, unknown>>('ab_hooks', `SELECT ${HOOK} AS hook, ${METRICS} ${FROM} AND ${SIDE} = 'b' GROUP BY 1`, [r.from, r.to]),
    q<Record<string, string>>('ab_sources', `
      SELECT COALESCE(e.utm->>'utm_source', CASE WHEN e.trainer_code IS NOT NULL THEN 'ссылки тренеров' ELSE '(без метки)' END) AS source, ${SIDE} AS v,
        count(DISTINCT e.sid) FILTER (WHERE ${NEW_VISIT})            AS visits,
        count(DISTINCT ${WHO}) FILTER (WHERE e.type = 'quiz_finish') AS finished,
        count(DISTINCT e.attempt_id) FILTER (WHERE ${REAL_PAID})     AS paid
      ${FROM} GROUP BY 1, 2`, [r.from, r.to]),
    q<Record<string, unknown>>('ab_recent', `
      SELECT id, created_at, name, COALESCE(phone, wa_phone) AS phone, status, answered, dominant, combo, variant, paid_by, test_amount,
             (wa_consent_at IS NOT NULL) AS wa_optin
      FROM attempts WHERE variant LIKE 'b%' AND created_at >= $1 AND created_at < $2
      ORDER BY created_at DESC LIMIT 30`, [r.from, r.to])
  ])

  const hooks = ['', 'work', 'love'].map(h => ({ hook: h || 'all', ...toSide(hookRows.find(x => (x.hook || '') === h)) }))

  const bySource = new Map<string, AbSourceRow>()
  for (const x of srcRows) {
    const row = bySource.get(x.source) ?? { source: x.source, a: { visits: 0, finished: 0, paid: 0 }, b: { visits: 0, finished: 0, paid: 0 } }
    row[x.v === 'b' ? 'b' : 'a'] = { visits: +x.visits, finished: +x.finished, paid: +x.paid }
    bySource.set(x.source, row)
  }
  const sources = [...bySource.values()]
    .filter(s => s.a.visits || s.b.visits || s.a.paid || s.b.paid)
    .sort((x, y) => y.b.visits - x.b.visits || y.a.visits - x.a.visits)
    .slice(0, 15)

  return {
    a: cur.a, b: cur.b, prevA: prev.a, prevB: prev.b, hooks, sources,
    recent: recent.map(x => ({ ...x, id: Number(x.id) }))
  }
}

/** Строка для отчётов Telegram-бота; пока на /b никто не заходил — ''. */
export async function abBrief(from: Date, to: Date): Promise<string> {
  const { a, b } = await abSides(from, to)
  if (!b.visits && !b.paid) return ''
  const conv = (s: AbSide) => (s.visits ? `${((s.paid / s.visits) * 100).toFixed(1)}%` : '—')
  return `🅱 Вариант Б: ${b.visits} виз. · ${b.paid} опл. · сайт → оплата ${conv(b)} (А: ${conv(a)})`
}
