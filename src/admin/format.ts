export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

const dtf = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const dtfFull = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dayf = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: 'short' })
const hourf = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit' })

export const fmtDate = (v: string | null | undefined) => (v ? dtf.format(new Date(v)) : '—')
export const fmtDateFull = (v: string | null | undefined) => (v ? dtfFull.format(new Date(v)) : '—')
export const fmtDay = (v: string) => dayf.format(new Date(v))
export const fmtHour = (v: string) => hourf.format(new Date(v))
export const fmtMoney = (n: number | string | null | undefined) => (n == null ? '—' : `${Math.round(Number(n)).toLocaleString('ru-RU')} ₸`)
export const fmtNum = (n: number) => n.toLocaleString('ru-RU')
export const fmtPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`
export const fmtLang = (l: string | null | undefined) => (l === 'kk' ? 'Қаз' : l === 'ru' ? 'Рус' : '—')

export function fmtPhone(p: string | null | undefined): string {
  if (!p) return '—'
  if (p.includes('•')) return p
  const d = p.replace(/\D/g, '')
  return d.length === 11 ? `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}` : p
}

/** Дельта к прошлому периоду: {text, dir} */
export function fmtDelta(cur: number, prev: number): { text: string; dir: 'up' | 'down' | 'flat' } {
  if (!prev && !cur) return { text: '—', dir: 'flat' }
  if (!prev) return { text: 'новое', dir: 'up' }
  const d = ((cur - prev) / prev) * 100
  if (Math.abs(d) < 0.5) return { text: '0%', dir: 'flat' }
  return { text: `${d > 0 ? '+' : ''}${d.toFixed(0)}%`, dir: d > 0 ? 'up' : 'down' }
}

export const bucketLabel = (t: string, bucket: 'hour' | 'day') => (bucket === 'hour' ? fmtHour(t) : fmtDay(t))

export const NEURO_LABELS: Record<string, string> = { dopamine: 'Дофамин', acetylcholine: 'Ацетилхолин', gaba: 'ГАМК', serotonin: 'Серотонин' }
export const NEURO_COLORS: Record<string, string> = { dopamine: '#FF6B6B', acetylcholine: '#7C5CFC', gaba: '#2DB58A', serotonin: '#F4A93D' }
export const fmtNeuro = (k: string | null | undefined) => (k ? NEURO_LABELS[k] || k : '—')
export const fmtCombo = (c: string | null | undefined) => (c ? c.split('-').map(fmtNeuro).join(' + ') : '—')

export const EVENT_LABELS: Record<string, string> = {
  page_view: 'Открыл сайт', quiz_start: 'Начал тест', quiz_step: 'Вопрос', quiz_finish: 'Закончил тест',
  checkout_view: 'Экран оплаты', checkout_submit: 'Нажал «оплатить»', invoice_created: 'Счёт выставлен', invoice_failed: 'Счёт не выставлен',
  paid: 'Оплата', result_view: 'Открыл результат', video_play: 'Запустил видео',
  webhook_kpa: 'Вебхук Kaspi', webhook_kpa_ignored: 'Вебхук Kaspi (чужой счёт)',
  recover_view: 'Экран восстановления', recover_attempt: 'Запрос восстановления', access_recovered: 'Восстановил доступ', recover_requested: 'Просил ссылку (вручную)',
  access_granted: 'Доступ выдан вручную', link_resent: 'Ссылка отправлена повторно',
  admin_login_ok: 'Вход в админку', admin_login_fail: 'Неудачный вход', trainer_login_ok: 'Вход тренера', trainer_login_fail: 'Неудачный вход тренера',
  trainer_created: 'Тренер создан', trainer_password_set: 'Пароль тренера задан'
}
