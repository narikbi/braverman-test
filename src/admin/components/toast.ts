let box: HTMLElement | null = null
export function toast(text: string, kind: 'ok' | 'err' = 'ok') {
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box) }
  const el = document.createElement('div')
  el.className = `toast toast-${kind}`
  el.textContent = text
  box.appendChild(el)
  setTimeout(() => el.classList.add('show'), 10)
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300) }, 2800)
}
