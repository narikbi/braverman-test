// Видео-разбор на экране результата: свой плеер без брендинга.
// Источник — HLS с несколькими качествами (video.braverman.kz, см. content/videos.ts): плеер сам выбирает
// качество по скорости сети. Safari (iPhone/iPad/Mac) играет HLS сам, остальным подгружаем hls.js.
// Если HLS не загрузился — запасной mp4 одним файлом; если и он не пошёл — текст с кнопкой «Обновить».
import { VIDEO_BASE, hlsUrl, posterUrl, mp4Url } from './content/videos'
import { LANGS, type Lang } from './content'
import { T } from './i18n'
import { $ } from './dom'
import { track } from './analytics'
import type { VideoKey } from '../shared/scoring'
import type Hls from 'hls.js'

let videoKey: VideoKey | null = null
let videoLang: Lang = 'ru'
let playTracked = false
let hls: Hls | null = null
let gen = 0 // номер текущей загрузки: ответы старых (смена языка/экрана) игнорируем

const player = () => $<HTMLVideoElement>('videoPlayer')

function destroyHls() {
  hls?.destroy()
  hls = null
}

function showError(show: boolean) {
  const el = $('videoError')
  el.hidden = !show
  if (show) el.innerHTML = `${T().ui.videoError} <button type="button" class="link-btn" id="videoRetry">${T().ui.videoRetry}</button>`
  $('videoRetry')?.addEventListener('click', () => { if (videoKey) setSrc(videoKey, videoLang) })
}

/** Запасной вариант: обычный mp4 (один файл, без адаптации качества). */
function playMp4(key: VideoKey, code: Lang, my: number) {
  const v = player()
  destroyHls()
  v.onerror = () => { if (my === gen) showError(true) }
  v.src = mp4Url(key, code)
}

async function setSrc(key: VideoKey, code: Lang) {
  const my = ++gen
  const v = player()
  showError(false)
  destroyHls()
  v.hidden = false
  v.poster = posterUrl(key, code)
  v.onerror = null
  v.removeAttribute('src')
  const src = hlsUrl(key, code)

  // Safari умеет HLS сам — отдаём манифест напрямую
  if (v.canPlayType('application/vnd.apple.mpegurl')) {
    v.onerror = () => { if (my === gen) playMp4(key, code, my) }
    v.src = src
    return
  }
  try {
    const { default: HlsCtor } = await import('hls.js')
    if (my !== gen) return
    if (!HlsCtor.isSupported()) return playMp4(key, code, my)
    const h = new HlsCtor({ maxBufferLength: 30, backBufferLength: 30, startLevel: -1, capLevelToPlayerSize: true })
    hls = h
    h.on(HlsCtor.Events.ERROR, (_e, data) => {
      if (!data.fatal || my !== gen) return
      // сеть моргнула — пробуем ещё раз, иначе (или после повтора) — mp4
      if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && !(data as { retried?: boolean }).retried) {
        ;(data as { retried?: boolean }).retried = true
        setTimeout(() => { if (my === gen) h.startLoad() }, 1500)
        return
      }
      if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) { h.recoverMediaError(); return }
      playMp4(key, code, my)
    })
    h.loadSource(src)
    h.attachMedia(v)
  } catch {
    if (my === gen) playMp4(key, code, my) // hls.js не загрузился
  }
}

function renderSwitch() {
  const box = $('videoLangSwitch')
  box.innerHTML = ''
  LANGS.forEach(l => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'lang-btn' + (l.code === videoLang ? ' active' : '')
    b.textContent = T().ui.videoLangs[l.code]
    b.addEventListener('click', () => {
      if (videoLang === l.code || !videoKey) return
      videoLang = l.code
      setSrc(videoKey, l.code)
      renderSwitch()
    })
    box.appendChild(b)
  })
}

export function renderVideo(key: VideoKey, initialLang: Lang) {
  if (!VIDEO_BASE) return
  videoKey = key
  videoLang = initialLang
  playTracked = false
  $('videoCard').hidden = false
  $('videoTitle').textContent = T().ui.videoTitle
  renderSwitch()
  setSrc(key, videoLang)
  player().onplay = () => { if (!playTracked) { playTracked = true; track('VideoPlay') } }
}

/** Подписи на текущем языке интерфейса (после смены языка). */
export function relabelVideo() {
  if (!videoKey) return
  $('videoTitle').textContent = T().ui.videoTitle
  renderSwitch()
  if (!$('videoError').hidden) showError(true)
}

export function stopVideo() {
  gen++
  const v = player()
  v.pause()
  destroyHls()
  v.removeAttribute('src')
  v.removeAttribute('poster')
  v.hidden = true
  showError(false)
  $('videoCard').hidden = true
  videoKey = null
}
