// График результата по парам: Дофамин–Ацетилхолин и ГАМК–Серотонин.
// Результат строится из победителей пар (сильнейший в каждой паре = две доминанты из видео-разбора),
// поэтому график показывает именно пары: победитель — в полном цвете с плашкой «басым»,
// второй в паре — бледный; главная доминанта — с мягким свечением; равенство баллов — «тең»
// (заблокированность отделов, нужна пересдача). Рисуем сами на canvas: чётко на ретине, без Chart.js,
// картинку можно скачать (chartImage).
import { NEURO_ORDER, NEURO_COLOR, BLOCK_PAIRS, type NeuroKey } from '../shared/scoring'

type Opts = {
  /** тизер до оплаты: только столбики, без цифр и подписей (поверх ещё и размытие) */
  minimal?: boolean
  /** подписи плашек: победитель пары / равенство */
  text?: { lead: string; tie: string }
}
type St = { scores: Record<NeuroKey, number>; max: number; dominant: NeuroKey | null; names: Record<NeuroKey, string>; opts: Opts; t: number }

const states = new WeakMap<HTMLCanvasElement, St>()
const observed = new WeakSet<HTMLCanvasElement>()
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
const TEXT = '#1A1A2E', MUTED = '#9CA3AF', PANEL = '#F6F7FB', GRID = '#E7E9F0', TIE = '#D97706'

const ease = (x: number) => 1 - Math.pow(1 - x, 3)

/** Победитель пары; null — баллы равны. */
export function pairWinner(scores: Record<NeuroKey, number>, [a, b]: [NeuroKey, NeuroKey]): NeuroKey | null {
  return scores[a] === scores[b] ? null : scores[a] > scores[b] ? a : b
}

export function renderProfileChart(
  canvas: HTMLCanvasElement,
  scores: Record<NeuroKey, number>,
  max: number,
  dominant: NeuroKey | null, // null — без выделения (тизер до оплаты)
  labels: string[], // имена в порядке NEURO_ORDER
  opts: Opts = {}
) {
  const names = Object.fromEntries(NEURO_ORDER.map((k, i) => [k, labels[i] ?? k])) as Record<NeuroKey, string>
  const animate = !opts.minimal && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const st: St = { scores, max, dominant, names, opts, t: animate ? 0 : 1 }
  states.set(canvas, st)
  draw(canvas, st)
  if (animate) {
    const start = performance.now()
    const step = (now: number) => {
      if (states.get(canvas) !== st) return // перерисовали заново (смена языка) — старую анимацию бросаем
      st.t = Math.min(1, (now - start) / 750)
      draw(canvas, st)
      if (st.t < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  // ширина карточки меняется (поворот телефона, окно) — перерисовываем без анимации
  if (!observed.has(canvas) && 'ResizeObserver' in window) {
    observed.add(canvas)
    new ResizeObserver(() => { const s = states.get(canvas); if (s) draw(canvas, s) }).observe(canvas.parentElement || canvas)
  }
}

/** PNG графика для кнопки «Скачать» (всегда финальный кадр). */
export function chartImage(canvas: HTMLCanvasElement): string | null {
  const st = states.get(canvas)
  if (!st) return null
  if (st.t < 1) { st.t = 1; draw(canvas, st) }
  return canvas.toDataURL('image/png')
}

function draw(canvas: HTMLCanvasElement, st: St) {
  const W = canvas.parentElement?.clientWidth || canvas.clientWidth || 320
  const H = canvas.parentElement?.clientHeight || canvas.clientHeight || 280
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#fff' // белый фон — чтобы скачанная картинка не была прозрачной
  ctx.fillRect(0, 0, W, H)

  const { scores, max, dominant, names, opts } = st
  const minimal = !!opts.minimal
  const e = ease(st.t)
  const GAP = 12
  const panelW = (W - GAP) / 2
  const top = minimal ? 18 : 64 // место над столбиками: плашка + число
  const base = H - (minimal ? 18 : 36) // низ столбиков; под ним — имена
  const areaH = base - top

  BLOCK_PAIRS.forEach((pair, pi) => {
    const x0 = pi * (panelW + GAP)
    roundRect(ctx, x0, 0, panelW, H, 16)
    ctx.fillStyle = PANEL
    ctx.fill()

    // сетка: 10, 20, 30, 40 баллов
    ctx.strokeStyle = GRID
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    for (let g = 1; g < 5; g++) {
      const y = Math.round(base - (areaH * g) / 5) + 0.5
      ctx.beginPath(); ctx.moveTo(x0 + 10, y); ctx.lineTo(x0 + panelW - 10, y); ctx.stroke()
    }
    ctx.setLineDash([])

    const winner = pairWinner(scores, pair)
    const tie = winner === null
    const slot = panelW / 2
    const bw = Math.min(46, slot * 0.5)

    pair.forEach((k, j) => {
      const cx = x0 + slot * (j + 0.5)
      const v = scores[k]
      const h = Math.max(4, areaH * Math.min(1, v / max) * e)
      const yTop = base - h
      const win = !minimal && (tie || winner === k)
      const color = NEURO_COLOR[k]

      // столбик
      ctx.save()
      if (!minimal && k === dominant) { ctx.shadowColor = `${color}66`; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4 }
      roundRect(ctx, cx - bw / 2, yTop, bw, h, [10, 10, 4, 4])
      if (minimal) ctx.fillStyle = `${color}73`
      else if (win) {
        const g = ctx.createLinearGradient(0, yTop, 0, base)
        g.addColorStop(0, color); g.addColorStop(1, `${color}CC`)
        ctx.fillStyle = g
      } else ctx.fillStyle = `${color}3D`
      ctx.fill()
      ctx.restore()
      if (!minimal && tie) hatch(ctx, cx - bw / 2, yTop, bw, h) // равенство — штриховка

      if (minimal) return
      // число над столбиком (считается вверх вместе с анимацией)
      const shown = Math.round(v * e)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.font = win ? `800 ${k === dominant ? 20 : 18}px ${FONT}` : `600 14px ${FONT}`
      ctx.fillStyle = tie ? TIE : win ? color : MUTED
      ctx.fillText(String(shown), cx, yTop - 8)

      // плашка «басым» над победителем
      if (winner === k && opts.text && st.t > 0.55) pill(ctx, cx, yTop - (k === dominant ? 41 : 39), opts.text.lead, color)

      // имя под столбиком (ужимаем шрифт, если не влезает)
      ctx.fillStyle = win ? TEXT : MUTED
      fitText(ctx, names[k], cx, base + 22, slot - 2, win ? 700 : 500, 12.5)
    })

    // равенство — одна янтарная плашка над парой
    if (tie && !minimal && opts.text && st.t > 0.55) {
      const hTie = areaH * Math.min(1, scores[pair[0]] / max) * e
      pill(ctx, x0 + panelW / 2, base - hTie - 38, opts.text.tie, TIE)
    }
  })
}

function pill(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, color: string) {
  ctx.font = `700 11px ${FONT}`
  const w = ctx.measureText(text).width + 16
  const h = 20
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 10)
  ctx.fillStyle = color
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy + 0.5)
  ctx.textBaseline = 'alphabetic'
}

function fitText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, weight: number, size: number) {
  let s = size
  do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 0.5 } while (ctx.measureText(text).width > maxW && s >= 9.5)
  ctx.textAlign = 'center'
  ctx.fillText(text, cx, y)
}

function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  roundRect(ctx, x, y, w, h, [10, 10, 4, 4])
  ctx.clip()
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = 3
  for (let i = -h; i < w + h; i += 9) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke() }
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]) {
  const [tl, tr, br, bl] = (Array.isArray(r) ? r : [r, r, r, r]).map(v => Math.max(0, Math.min(v, w / 2, h / 2)))
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + tr)
  ctx.lineTo(x + w, y + h - br); ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h)
  ctx.lineTo(x + bl, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - bl)
  ctx.lineTo(x, y + tl); ctx.quadraticCurveTo(x, y, x + tl, y)
  ctx.closePath()
}
