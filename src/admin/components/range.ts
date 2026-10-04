import { getRange, setRange, type RangePreset } from '../state'
import { L } from '../i18n'

const presets = (): { key: RangePreset; label: string }[] => [
  { key: 'today', label: L('Сегодня', 'Бүгін') }, { key: '7d', label: L('7 дней', '7 күн') }, { key: '30d', label: L('30 дней', '30 күн') },
  { key: 'all', label: L('Всё время', 'Барлық уақыт') }, { key: 'custom', label: L('Период', 'Кезең') }
]

export function renderRange(slot: HTMLElement) {
  const r = getRange()
  slot.innerHTML = `<div class="range">
    ${presets().map(p => `<button data-p="${p.key}" class="${r.preset === p.key ? 'active' : ''}">${p.label}</button>`).join('')}
    <div class="custom" ${r.preset === 'custom' ? '' : 'hidden'}>
      <input type="date" id="r-from" value="${r.from || ''}" /> — <input type="date" id="r-to" value="${r.to || ''}" />
    </div>
  </div>`
  slot.querySelectorAll<HTMLButtonElement>('[data-p]').forEach(b => b.addEventListener('click', () => {
    const preset = b.dataset.p as RangePreset
    if (preset === 'custom') {
      const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10)
      const week = new Date(Date.now() + 5 * 3600000 - 6 * 86400000).toISOString().slice(0, 10)
      setRange({ preset, from: r.from || week, to: r.to || today })
    } else setRange({ preset })
    renderRange(slot)
  }))
  const apply = () => {
    const from = (slot.querySelector('#r-from') as HTMLInputElement).value
    const to = (slot.querySelector('#r-to') as HTMLInputElement).value
    if (from && to && from <= to) setRange({ preset: 'custom', from, to })
  }
  slot.querySelector('#r-from')?.addEventListener('change', apply)
  slot.querySelector('#r-to')?.addEventListener('change', apply)
}
