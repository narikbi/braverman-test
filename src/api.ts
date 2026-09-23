// Клиент серверных функций /api/*.
import { getSid } from './analytics'
import { getAttr } from './attribution'
import type { NeuroKey, VideoKey } from '../shared/scoring'
import type { Lang } from './content'

export class ApiError extends Error {
  constructor(public code: string, public status: number) { super(code) }
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new ApiError(data.error || `http_${res.status}`, res.status)
  return data as T
}

function post<T>(path: string, body: object): Promise<T> {
  return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => handle<T>(r), () => { throw new ApiError('network', 0) })
}

export type Teaser = { dominant: NeuroKey; lowest: NeuroKey; combo: VideoKey }
export type AttemptRes = { id: number; token: string; offline?: boolean; teaser?: Teaser }

export function startAttempt(p: { name: string; lang: Lang }): Promise<AttemptRes> {
  return post('/api/attempt', { action: 'start', ...p, sid: getSid(), attr: getAttr() })
}

export function finishAttempt(p: { id: number; token: string; answers: number[]; name: string; lang: Lang }): Promise<AttemptRes> {
  return post('/api/attempt', { action: 'finish', ...p, sid: getSid(), attr: getAttr() })
}

export type CheckoutRes = { invoiceId?: string; paid?: boolean; r?: string }
export function checkout(p: { id: number; token: string; phone: string; hp: string; testToken?: string }): Promise<CheckoutRes> {
  return post('/api/checkout', p)
}

export type InvoiceStatus = { status: 'pending' | 'paid' | 'cancelled' | 'expired' | 'unknown'; r?: string }
export async function checkInvoice(ref: string): Promise<InvoiceStatus> {
  const res = await fetch(`/api/invoice-status?id=${encodeURIComponent(ref)}`)
  return handle<InvoiceStatus>(res)
}

export type ResultPayload = {
  id: number; name: string; lang: Lang
  scores: Record<NeuroKey, number>; max: number
  dominant: NeuroKey; lowest: NeuroKey; combo: VideoKey; paidAt: string
}
export async function getResult(r: string): Promise<ResultPayload> {
  const res = await fetch(`/api/result?r=${encodeURIComponent(r)}&sid=${getSid()}`)
  return handle<ResultPayload>(res)
}

export type RecoverRes = { need_code?: boolean; manual?: boolean; r?: string }
export function recover(p: { phone: string; code?: string; hp: string }): Promise<RecoverRes> {
  return post('/api/recover', { ...p, sid: getSid() })
}
