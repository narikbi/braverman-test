// Hash-роутер: #/ #/attempts #/attempts/:id #/payments #/trainers #/trainers/:id #/health #/login
export type Route = { name: 'dashboard' | 'attempts' | 'attempt' | 'payments' | 'trainers' | 'trainer' | 'health' | 'login'; id?: number }

export function parseRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  const [seg, id] = h.split('/')
  if (seg === 'login') return { name: 'login' }
  if (seg === 'attempts') return id ? { name: 'attempt', id: Number(id) } : { name: 'attempts' }
  if (seg === 'trainers') return id ? { name: 'trainer', id: Number(id) } : { name: 'trainers' }
  if (seg === 'payments') return { name: 'payments' }
  if (seg === 'health') return { name: 'health' }
  return { name: 'dashboard' }
}

export function navigate(hash: string) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'))
  else location.hash = hash
}
