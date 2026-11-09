// Видео-разбор на экране результата: свой плеер без брендинга (заголовок, выбор языка, сообщение об ошибке).
// Сам источник (HLS с выбором качества, запасной mp4) подключает video-source.ts.
import { VIDEO_BASE } from './content/videos'
import { LANGS, type Lang } from './content'
import { T } from './i18n'
import { $ } from './dom'
import { track } from './analytics'
import { attachVideoSource, type VideoHandle } from './video-source'
import type { VideoKey } from '../shared/scoring'

let videoKey: VideoKey | null = null
let videoLang: Lang = 'ru'
let playTracked = false
let handle: VideoHandle | null = null

const player = () => $<HTMLVideoElement>('videoPlayer')

function showError(show: boolean) {
  const el = $('videoError')
  el.hidden = !show
  if (show) el.innerHTML = `${T().ui.videoError} <button type="button" class="link-btn" id="videoRetry">${T().ui.videoRetry}</button>`
  $('videoRetry')?.addEventListener('click', () => { if (videoKey) setSrc(videoKey, videoLang) })
}

function setSrc(key: VideoKey, code: Lang) {
  const v = player()
  showError(false)
  handle?.destroy()
  v.hidden = false
  handle = attachVideoSource(v, key, code, () => showError(true))
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
  const v = player()
  v.pause()
  handle?.destroy()
  handle = null
  v.removeAttribute('src')
  v.removeAttribute('poster')
  v.hidden = true
  showError(false)
  $('videoCard').hidden = true
  videoKey = null
}
