// Источник видео-разбора для <video>: HLS с несколькими качествами (video.braverman.kz, см. content/videos.ts) —
// плеер сам выбирает качество по скорости сети. Safari (iPhone/iPad/Mac) играет HLS сам, остальным подгружаем hls.js.
// Если HLS не загрузился — запасной mp4 одним файлом; если и он не пошёл — вызываем onError.
// Модуль не знает про разметку и тексты: им пользуются и плеер результата (video.ts), и страница варианта Б.
import { hlsUrl, posterUrl, mp4Url } from './content/videos'
import type { Lang } from './content'
import type { VideoKey } from '../shared/scoring'
import type Hls from 'hls.js'

export type VideoHandle = { destroy(): void }

/** Подключает ролик к плееру. destroy() — перед сменой источника или уходом с экрана. */
export function attachVideoSource(v: HTMLVideoElement, key: VideoKey, code: Lang, onError: () => void): VideoHandle {
  let alive = true // после destroy() ответы этой загрузки игнорируем
  let hls: Hls | null = null
  const destroyHls = () => { hls?.destroy(); hls = null }

  /** Запасной вариант: обычный mp4 (один файл, без адаптации качества). */
  const playMp4 = () => {
    destroyHls()
    v.onerror = () => { if (alive) onError() }
    v.src = mp4Url(key, code)
  }

  v.poster = posterUrl(key, code)
  v.onerror = null
  v.removeAttribute('src')
  const src = hlsUrl(key, code)

  if (v.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari умеет HLS сам — отдаём манифест напрямую
    v.onerror = () => { if (alive) playMp4() }
    v.src = src
  } else {
    import('hls.js').then(({ default: HlsCtor }) => {
      if (!alive) return
      if (!HlsCtor.isSupported()) return playMp4()
      const h = new HlsCtor({ maxBufferLength: 30, backBufferLength: 30, startLevel: -1, capLevelToPlayerSize: true })
      hls = h
      let netRetries = 0
      let mediaRetries = 0
      h.on(HlsCtor.Events.ERROR, (_e, data) => {
        if (!data.fatal || !alive) return
        // сеть моргнула — пробуем ещё пару раз, потом — mp4
        if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && netRetries++ < 2) {
          setTimeout(() => { if (alive) h.startLoad() }, 1500)
          return
        }
        if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && mediaRetries++ < 2) { h.recoverMediaError(); return }
        playMp4()
      })
      h.loadSource(src)
      h.attachMedia(v)
    }).catch(() => { if (alive) playMp4() }) // hls.js не загрузился
  }

  return {
    destroy() {
      alive = false
      destroyHls()
      v.onerror = null
    }
  }
}
