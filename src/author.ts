// Блок автора (фото + имя с галочкой verified + подпись) для экранов, которые рисуются скриптом.
// На главной тот же блок свёрстан статично в index.html.
import { esc } from './dom'

const VERIFIED_SVG =
  '<svg class="verified" viewBox="0 0 24 24" role="img" aria-label="verified">' +
  '<path fill="#1D9BF0" d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12z"/>' +
  '<path d="M7.6 12.3l2.9 2.9 5.9-6" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'

export type AuthorPhoto = 'author.webp' | 'author-laugh.webp' | 'author-mic.webp'

export function authorRow(photo: AuthorPhoto, role: string): string {
  return `
    <div class="author-row">
      <img class="author-avatar" src="/img/${photo}" width="56" height="56" alt="Абдрашит" />
      <div>
        <div class="author-name">Абдрашит${VERIFIED_SVG} <span class="author-handle">· @abdrashitt</span></div>
        <div class="author-role">${esc(role)}</div>
      </div>
    </div>`
}
