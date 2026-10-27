// Видео-разборы результатов: 8 комбинаций × 2 языка, файлы называются <ключ>-<язык>.
// Хостинг — Cloudflare R2 через свой домен (VITE_VIDEO_BASE, напр. https://video.braverman.kz):
//   hls/<ключ>-<язык>/master.m3u8  — HLS с качествами 1080p/720p/480p/360p (основной источник)
//   hls/<ключ>-<язык>/poster.jpg    — кадр-превью
//   <ключ>-<язык>.mp4               — исходный файл одним куском (запасной вариант)
import type { VideoKey } from '../../shared/scoring'
import type { Lang } from './index'

export const VIDEO_BASE: string = ((import.meta.env.VITE_VIDEO_BASE as string | undefined) || 'https://video.braverman.kz').replace(/\/$/, '')

export const hlsUrl = (key: VideoKey, lang: Lang) => `${VIDEO_BASE}/hls/${key}-${lang}/master.m3u8`
export const posterUrl = (key: VideoKey, lang: Lang) => `${VIDEO_BASE}/hls/${key}-${lang}/poster.jpg`
export const mp4Url = (key: VideoKey, lang: Lang) => `${VIDEO_BASE}/${key}-${lang}.mp4`
