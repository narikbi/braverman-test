// Период дашборда — общий для всех экранов, живёт в localStorage. Плюс мета с сервера (action=me).
export type RangePreset = 'today' | '7d' | '30d' | 'all' | 'custom'
export type Range = { preset: RangePreset; from?: string; to?: string }

const KEY = 'bt_admin_range'
let range: Range = load()
const subs = new Set<() => void>()

function load(): Range {
  try { return JSON.parse(localStorage.getItem(KEY) || '') } catch { return { preset: '7d' } }
}

export function getRange(): Range { return range }
export function setRange(r: Range) {
  range = r
  try { localStorage.setItem(KEY, JSON.stringify(r)) } catch { /* noop */ }
  subs.forEach(fn => fn())
}
export function onRange(fn: () => void): () => void {
  subs.add(fn)
  return () => subs.delete(fn)
}
export function rangeParams(): Record<string, string> {
  return range.preset === 'custom' ? { range: 'custom', from: range.from || '', to: range.to || '' } : { range: range.preset }
}

export type StatusDef = { key: string; label: string }
export type Meta = { role: 'admin' | 'trainer'; trainer: { id: number; name: string; code: string } | null; statuses: StatusDef[]; site: string; price: number; seesPhone: boolean }
export let META: Meta = { role: 'admin', trainer: null, statuses: [], site: '', price: 5000, seesPhone: true }
export function setMeta(m: Meta) { META = m }
export const isAdmin = () => META.role === 'admin'
export const statusLabel = (key: string) => META.statuses.find(s => s.key === key)?.label ?? key
