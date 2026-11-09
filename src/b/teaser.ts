// Превью на экране бесплатного типа: первые 35 секунд ролика комбинации, дальше — «продолжение в полном разборе».
// Отдельный лёгкий файл teaser/<ключ>-<язык>.mp4 (нарезан из полного ролика): полное видео до оплаты на странице не лежит.
// Если такого файла нет — берём полный ролик через общий загрузчик и сами останавливаем на 35-й секунде.
import { VIDEO_BASE } from '../content/videos'
import { attachVideoSource, type VideoHandle } from '../video-source'
import { track } from '../analytics'
import { esc } from '../dom'
import type { Lang } from '../content'
import type { VideoKey } from '../../shared/scoring'

const LIMIT = 35 // секунд

export function mountTeaser(box: HTMLElement, key: VideoKey, code: Lang, text: { cap: string; end: string; error: string }): { destroy(): void } {
  box.innerHTML = `
    <div class="video" id="teaser">
      <video playsinline preload="metadata" poster="${VIDEO_BASE}/hls/${key}-${code}/poster.jpg"></video>
      <button type="button" class="play" id="tPlay" aria-label="${esc(text.cap)}"><i></i></button>
      <span class="cap" id="tCap">${esc(text.cap)}</span>
      <span class="bar"><i id="tBar"></i></span>
    </div>`
  const wrap = box.querySelector<HTMLElement>('#teaser')!
  const v = wrap.querySelector('video')!
  const btn = wrap.querySelector<HTMLButtonElement>('#tPlay')!
  const bar = wrap.querySelector<HTMLElement>('#tBar')!
  let full: VideoHandle | null = null
  let ended = false
  let tracked = false

  const fail = () => {
    wrap.querySelector('#tCap')!.textContent = text.error
    btn.hidden = true
  }
  // сначала короткий файл; не открылся — полный ролик (HLS/mp4), остановим его сами
  v.onerror = () => { full = attachVideoSource(v, key, code, fail) }
  v.src = `${VIDEO_BASE}/teaser/${key}-${code}.mp4`

  const stop = () => {
    if (ended) return
    ended = true
    v.pause()
    btn.hidden = true
    wrap.querySelector<HTMLElement>('#tCap')!.hidden = true
    bar.style.width = '100%'
    wrap.insertAdjacentHTML('beforeend', `<span class="ended">${esc(text.end)}</span>`)
  }
  v.addEventListener('timeupdate', () => {
    bar.style.width = `${Math.min(1, v.currentTime / LIMIT) * 100}%`
    if (v.currentTime >= LIMIT) stop()
  })
  v.addEventListener('ended', stop)
  v.addEventListener('play', () => { btn.classList.add('pause'); if (!tracked) { tracked = true; track('TeaserPlay') } })
  v.addEventListener('pause', () => btn.classList.remove('pause'))
  const toggle = () => {
    if (ended) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }
  btn.addEventListener('click', toggle)
  v.addEventListener('click', toggle)

  return {
    destroy() {
      v.pause()
      full?.destroy()
      v.onerror = null
      v.removeAttribute('src')
      v.load()
    }
  }
}
