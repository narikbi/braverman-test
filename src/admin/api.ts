// Клиент /api/admin: GET с параметрами, POST с JSON и CSRF-заголовком. 401 → Unauthorized.
export class Unauthorized extends Error {}
export class ApiError extends Error {
  constructor(public code: string, public status: number) { super(code) }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new Unauthorized()
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new ApiError(data.error || 'error', res.status)
  return data as T
}

export function adminGet<T>(action: string, params: Record<string, string | number | null | undefined> = {}): Promise<T> {
  const p = new URLSearchParams({ action })
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') p.set(k, String(v))
  return fetch(`/api/admin?${p}`, { credentials: 'same-origin' }).then(r => handle<T>(r))
}

export function adminPost<T>(action: string, body: object = {}): Promise<T> {
  return fetch(`/api/admin?action=${action}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'admin' },
    body: JSON.stringify(body)
  }).then(r => handle<T>(r))
}
