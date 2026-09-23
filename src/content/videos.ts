// Видео-разборы результатов: 8 комбинаций × 2 языка.
// Основной хостинг — Cloudflare R2 (файлы <ключ>-<язык>.mp4, база из VITE_VIDEO_BASE),
// YouTube-ID — запасной вариант, если файл в R2 не загрузился.
import type { VideoKey } from '../../shared/scoring'
import type { Lang } from './index'

export const VIDEO_BASE: string = (import.meta.env.VITE_VIDEO_BASE as string | undefined) || 'https://pub-5a014c13711042d6b1b4e8d96d558550.r2.dev'

export const VIDEOS: Record<VideoKey, Record<Lang, string>> = {
  //                                қазақша              орысша
  'dopamine-gaba':            { kk: 'HeVNed6JpAQ', ru: 'HdiWrCP3ZJY' }, // 01 / 02 Дофамин-ГАМК
  'dopamine-serotonin':       { kk: '-W7hPYI_qXo', ru: 'PQOPnX9xssU' }, // 03 / 04 Дофамин-Серотонин
  'acetylcholine-gaba':       { kk: '6dS4r3QpVSo', ru: 'LfY6_qn8Ej4' }, // 05 / 06 Холин-ГАМК
  'acetylcholine-serotonin':  { kk: 'I7gCAleBA1M', ru: 'kJkEs9lIGZQ' }, // 07 / 08 Холин-Серотонин
  'gaba-dopamine':            { kk: 'WPLr0clqwWg', ru: '9jR4a6plXb8' }, // 09 / 10 ГАМК-Дофамин
  'gaba-acetylcholine':       { kk: '-CZSMMq0qBo', ru: '-ISffjMr_l0' }, // 11 / 12 ГАМК-Холин
  'serotonin-dopamine':       { kk: 'voj5RPHNZNE', ru: 'wJnmcY2ORP0' }, // 13 / 14 Серотонин-Дофамин
  'serotonin-acetylcholine':  { kk: 'WpBzYcV70wI', ru: 'hlTg5gR0dCk' }  // 15 / 16 Серотонин-Холин
}
