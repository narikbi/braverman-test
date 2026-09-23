// Видео-разбор на экране результата: свой плеер (R2, без брендинга) с фолбэком на YouTube.
import { VIDEO_BASE, VIDEOS } from './content/videos'
import { LANGS, type Lang } from './content'
import { T } from './i18n'
import { $ } from './dom'
import { track } from './analytics'
import type { VideoKey } from '../shared/scoring'

let videoKey: VideoKey | null = null
let videoLang: Lang = 'ru'
let playTracked = false

function setSrc(key: VideoKey, code: Lang) {
  const player = $<HTMLVideoElement>('videoPlayer')
  const frame = $<HTMLIFrameElement>('videoFrame')
  const youtubeId = VIDEOS[key][code]
  const yt = () => {
    player.hidden = true
    player.removeAttribute('src')
    frame.hidden = false
    frame.src = `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&playsinline=1`
  }
  if (!VIDEO_BASE) return yt()
  frame.hidden = true
  frame.src = ''
  player.hidden = false
  player.onerror = yt // файл в R2 не открылся — YouTube
  player.src = `${VIDEO_BASE}/${key}-${code}.mp4`
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
  videoKey = key
  videoLang = initialLang
  playTracked = false
  $('videoCard').hidden = false
  $('videoTitle').textContent = T().ui.videoTitle
  renderSwitch()
  setSrc(key, videoLang)
  const player = $<HTMLVideoElement>('videoPlayer')
  player.onplay = () => { if (!playTracked) { playTracked = true; track('VideoPlay') } }
}

/** Подписи на текущем языке интерфейса (после смены языка). */
export function relabelVideo() {
  if (!videoKey) return
  $('videoTitle').textContent = T().ui.videoTitle
  renderSwitch()
}

export function stopVideo() {
  const player = $<HTMLVideoElement>('videoPlayer')
  player.pause()
  player.removeAttribute('src')
  player.hidden = true
  $<HTMLIFrameElement>('videoFrame').src = ''
  $('videoFrame').hidden = true
  $('videoCard').hidden = true
  videoKey = null
}
