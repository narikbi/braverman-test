// Общая аналитика: периоды, воронка, KPI, источники, тренеры, оплаты.
// Используется админкой (api/admin.ts) и Telegram-ботом (api/tg-webhook.ts) — цифры везде одинаковые.
import { q } from './_db.js'

export const TZ = '+05:00' // Asia/Almaty, без перехода на летнее время

// ── период ──
export type RangePreset = 'today' | '7d' | '30d' | 'all' | 'custom'
export type Range = { from: Date; to: Date; prevFrom: Date; prevTo: Date; bucket: 'hour' | 'day'; label: string }

export function almatyDate(d: Date): string {
  return new Date(d.getTime() + 5 * 3600000).toISOString().slice(0, 10)
}

export function rangeFor(preset: string, customFrom?: string | null, customTo?: string | null): Range {
  const today = almatyDate(new Date())
  const day = (s: string, plus = 0) => new Date(new Date(`${s}T00:00:00${TZ}`).getTime() + plus * 86400000)
  let from: Date
  let to: Date
  if (preset === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(customFrom || '') && /^\d{4}-\d{2}-\d{2}$/.test(customTo || '')) {
    from = day(customFrom!)
    to = day(customTo!, 1)
  } else if (preset === 'today') {
    from = day(today)
    to = day(today, 1)
  } else if (preset === 'all') {
    from = new Date('2026-01-01T00:00:00Z')
    to = day(today, 1)
  } else {
    const n = preset === '30d' ? 30 : 7
    from = day(today, -(n - 1))
    to = day(today, 1)
  }
  const len = to.getTime() - from.getTime()
  return { from, to, prevFrom: new Date(from.getTime() - len), prevTo: from, bucket: len <= 2 * 86400000 ? 'hour' : 'day', label: preset }
}

export function parseRange(p: URLSearchParams): Range {
  return rangeFor(p.get('range') || '7d', p.get('from'), p.get('to'))
}

// ── scope: админ видит всё, тренер — только своё ──
export type Scope = { trainerId: number | null; trainerCode: string | null }
export const ALL: Scope = { trainerId: null, trainerCode: null }

export const FUNNEL_TYPES = ['page_view', 'quiz_start', 'quiz_finish', 'checkout_view', 'invoice_created', 'paid', 'result_view']
export const FUNNEL_LABELS: Record<string, string> = {
  page_view: 'Открыли сайт', quiz_start: 'Начали тест', quiz_finish: 'Закончили тест', checkout_view: 'Экран оплаты',
  invoice_created: 'Счёт выставлен', paid: 'Оплатили', result_view: 'Открыли результат'
}

export async function funnelCounts(from: Date, to: Date, s: Scope): Promise<Record<string, number>> {
  const rows = await q<{ type: string; n: string }>('funnel', `
    SELECT type, count(DISTINCT COALESCE(sid, 'a' || attempt_id::text, id::text)) AS n
    FROM events WHERE ts >= $1 AND ts < $2 AND type = ANY($3::text[]) AND ($4::text IS NULL OR trainer_code = $4)
    GROUP BY type`, [from, to, FUNNEL_TYPES, s.trainerCode])
  const out: Record<string, number> = {}
  for (const t of FUNNEL_TYPES) out[t] = 0
  for (const r of rows) out[r.type] = Number(r.n)
  return out
}

// Попытки и оплаты тренера считаем по коду ссылки (trainer_code), а не по trainer_id:
// код записывается всегда, даже если тренера зарегистрировали позже прихода клиента.
export async function kpi(from: Date, to: Date, s: Scope) {
  const [f, rev, att] = await Promise.all([
    funnelCounts(from, to, s),
    q<{ revenue: string; paid: string }>('revenue', `
      SELECT COALESCE(sum(p.amount), 0) AS revenue, count(*) AS paid FROM payments p
      LEFT JOIN attempts a ON a.id = p.attempt_id
      WHERE p.status = 'paid' AND p.paid_at >= $1 AND p.paid_at < $2 AND ($3::text IS NULL OR a.trainer_code = $3)`, [from, to, s.trainerCode]),
    q<{ started: string; finished: string }>('kpi_attempts', `
      SELECT count(*) FILTER (WHERE created_at >= $1 AND created_at < $2) AS started,
             count(*) FILTER (WHERE finished_at >= $1 AND finished_at < $2) AS finished
      FROM attempts WHERE ($3::text IS NULL OR trainer_code = $3)`, [from, to, s.trainerCode])
  ])
  const paid = Number(rev[0]?.paid ?? 0)
  const started = Number(att[0]?.started ?? 0)
  const finished = Number(att[0]?.finished ?? 0)
  return {
    visits: f.page_view, started, finished, checkouts: f.checkout_view, invoices: f.invoice_created,
    paid, revenue: Number(rev[0]?.revenue ?? 0), results: f.result_view,
    convVisitPaid: f.page_view ? +((paid / f.page_view) * 100).toFixed(2) : 0,
    convFinishPaid: finished ? +((paid / finished) * 100).toFixed(1) : 0,
    convStartFinish: started ? +((finished / started) * 100).toFixed(1) : 0
  }
}
export type Kpi = Awaited<ReturnType<typeof kpi>>

// ── источники (UTM и ссылки тренеров) ──
export type SourceRow = { source: string; medium: string; campaign: string; content: string; views: number; started: number; finished: number; invoices: number; paid: number; revenue: number }
export async function sourcesStats(from: Date, to: Date, trainerCode: string | null): Promise<SourceRow[]> {
  const rows = await q<Record<string, string>>('sources', `
    SELECT COALESCE(utm->>'utm_source', CASE WHEN trainer_code IS NOT NULL THEN 'тренер:' || trainer_code ELSE '(прямые)' END) AS source,
      COALESCE(utm->>'utm_medium', '') AS medium, COALESCE(utm->>'utm_campaign', '') AS campaign, COALESCE(utm->>'utm_content', '') AS content,
      count(DISTINCT sid) FILTER (WHERE type = 'page_view')  AS views,
      count(*) FILTER (WHERE type = 'quiz_start')            AS started,
      count(*) FILTER (WHERE type = 'quiz_finish')           AS finished,
      count(*) FILTER (WHERE type = 'invoice_created')       AS invoices,
      count(*) FILTER (WHERE type = 'paid')                  AS paid,
      COALESCE(sum((props->>'amount')::numeric) FILTER (WHERE type = 'paid' AND props->>'amount' ~ '^[0-9.]+$'), 0) AS revenue
    FROM events WHERE ts >= $1 AND ts < $2 AND ($3::text IS NULL OR trainer_code = $3)
    GROUP BY 1, 2, 3, 4 ORDER BY views DESC, paid DESC LIMIT 60`, [from, to, trainerCode])
  return rows.map(x => ({
    source: x.source, medium: x.medium, campaign: x.campaign, content: x.content,
    views: +x.views, started: +x.started, finished: +x.finished, invoices: +x.invoices, paid: +x.paid, revenue: +x.revenue
  }))
}

// ── тренеры ──
export type TrainerStat = { id: number; code: string; name: string; active: boolean; visits: number; started: number; finished: number; paid: number; revenue: number }
export async function trainersStats(from: Date, to: Date): Promise<{ rows: TrainerStat[]; unknown: { code: string; visits: number; started: number }[] }> {
  const rows = await q<Record<string, string>>('trainers_stats', `
    SELECT t.id, t.code, t.name, t.active,
      (SELECT count(DISTINCT e.sid) FROM events e WHERE e.trainer_code = t.code AND e.type = 'page_view' AND e.ts >= $1 AND e.ts < $2) AS visits,
      count(a.id) FILTER (WHERE a.created_at >= $1 AND a.created_at < $2)   AS started,
      count(a.id) FILTER (WHERE a.finished_at >= $1 AND a.finished_at < $2) AS finished,
      count(a.id) FILTER (WHERE a.paid_at >= $1 AND a.paid_at < $2 AND a.paid_by IS DISTINCT FROM 'retake') AS paid, -- бесплатные пересдачи не считаем
      COALESCE((SELECT sum(p.amount) FROM payments p JOIN attempts a2 ON a2.id = p.attempt_id
                WHERE a2.trainer_code = t.code AND p.status = 'paid' AND p.paid_at >= $1 AND p.paid_at < $2), 0) AS revenue
    FROM trainers t LEFT JOIN attempts a ON a.trainer_code = t.code
    GROUP BY t.id ORDER BY paid DESC, started DESC, t.name`, [from, to])
  const unknown = await q<{ code: string; visits: string; started: string }>('unknown_codes', `
    SELECT trainer_code AS code, count(DISTINCT sid) FILTER (WHERE type = 'page_view') AS visits, count(*) FILTER (WHERE type = 'quiz_start') AS started
    FROM events WHERE ts >= $1 AND ts < $2 AND trainer_code IS NOT NULL AND trainer_code NOT IN (SELECT code FROM trainers)
    GROUP BY 1 ORDER BY visits DESC LIMIT 20`, [from, to])
  return {
    rows: rows.map(x => ({ id: +x.id, code: x.code, name: x.name, active: x.active as unknown as boolean, visits: +x.visits, started: +x.started, finished: +x.finished, paid: +x.paid, revenue: +x.revenue })),
    unknown: unknown.map(u => ({ code: u.code, visits: +u.visits, started: +u.started }))
  }
}

// ── последние оплаты ──
export type PaidRow = { paid_at: string; amount: number; provider: string; phone: string; name: string | null; attempt_id: number | null; trainer_code: string | null; source: string | null; test_amount: number | null }
export async function recentPaid(limit = 10): Promise<PaidRow[]> {
  const rows = await q<Record<string, unknown>>('recent_paid', `
    SELECT p.paid_at, p.amount, p.provider, p.phone, a.name, p.attempt_id, a.trainer_code, a.utm->>'utm_source' AS source, a.test_amount
    FROM payments p LEFT JOIN attempts a ON a.id = p.attempt_id
    WHERE p.status = 'paid' ORDER BY p.paid_at DESC NULLS LAST LIMIT $1`, [limit])
  return rows.map(r => ({
    paid_at: String(r.paid_at), amount: Number(r.amount ?? 0), provider: String(r.provider ?? ''), phone: String(r.phone ?? ''),
    name: (r.name as string) ?? null, attempt_id: r.attempt_id != null ? Number(r.attempt_id) : null,
    trainer_code: (r.trainer_code as string) ?? null, source: (r.source as string) ?? null, test_amount: r.test_amount != null ? Number(r.test_amount) : null
  }))
}
