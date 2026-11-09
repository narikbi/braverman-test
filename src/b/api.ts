// Запросы, которые есть только у варианта Б. Остальное (тест, оплата, результат) — общий клиент src/api.ts.
import { getSid } from '../analytics'
import { getAttr } from '../attribution'
import { state } from './state'

async function post<T>(body: object): Promise<T> {
  const res = await fetch('/api/attempt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, sid: getSid(), attr: getAttr() }) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || `http_${res.status}`)
  return data as T
}

/** Сколько человек уже прошли тест — для счётчика на первом экране. */
export const publicStats = () => post<{ finished?: number }>({ action: 'public-stats' })

/** Номер WhatsApp с согласием (100-й вопрос) и/или имя (150-й) — в попытку на сервере. Попытки ещё нет — false. */
export async function saveContact(c: { phone?: string; consent?: boolean; name?: string }): Promise<boolean> {
  if (!state.attemptId || !state.attemptToken) return false
  try {
    await post({ action: 'b-save', id: state.attemptId, token: state.attemptToken, ...c })
    return true
  } catch {
    return false
  }
}
