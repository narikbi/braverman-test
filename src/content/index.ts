// Реестр языков и типы контента. Тексты — в ru.ts / kk.ts.
import type { NeuroKey } from '../../shared/scoring'
import { RU } from './ru'
import { KK } from './kk'

export type Lang = 'ru' | 'kk'

export type NeuroText = { name: string; lobe: string; func: string; title: string; description: string; lowNote: string }

export type UiText = {
  htmlTitle: string
  badge: string
  h1: string
  lead: string
  authorRole: string
  authorVideoRole: string
  factMinutes: string
  factQuestions: string
  factNeuro: string
  nameLabel: string
  namePlaceholder: string
  nameError: string
  startBtn: string
  startHint: string
  back: string
  counter: (i: number, n: number) => string
  yes: string
  no: string
  keyHint: string
  resultEyebrow: string
  chartTitle: string
  lowPrefix: string
  tooltip: (v: number, m: number) => string
  download: string
  restart: string
  videoTitle: string
  videoLangs: Record<Lang, string>
  fileName: string
  recoverLink: string
  checkout: {
    title: string; lead: string; teaserLabel: string; benefits: string[]
    phoneLabel: string; phonePlaceholder: string; phoneError: string; noKaspi: string
    payBtn: (price: string) => string; sending: string; priceNote: string; error: string
  }
  waiting: {
    title: string; lead: string; steps: string[]; waiting: string; note: string; changePhone: string
    failedTitle: string; failedBody: string; retry: string
  }
  resultLink: { title: string; hint: string; copy: string; copied: string; shareWa: string; waText: (link: string) => string }
  recover: {
    title: string; lead: string; btn: string; codeLabel: string; codeBtn: string; sent: string; manual: string
    notFound: string; badCode: string; tooMany: string; back: string
  }
  errors: { generic: string; network: string }
}

export type Content = {
  ui: UiText
  neuro: Record<NeuroKey, NeuroText>
  questions: Record<NeuroKey, string[]>
}

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ru', label: 'Рус' },
  { code: 'kk', label: 'Қаз' }
]

export const CONTENT: Record<Lang, Content> = { ru: RU, kk: KK }

/** Примеры в подсказке поля имени («Мысалы: …») — известные люди Казахстана, по кругу. */
export const EXAMPLE_NAMES = [
  'Абдрашит Түлкібай',
  'Қайрат Нұртас',
  'Руслан Тай',
  'Жомарт Аралбайұлы',
  'Алдияр Жапарханов',
  'Жеңіс Омаров',
  'Еңлік Құрарбек',
  'Төреғали Төреәлі',
  'Азамат Маркленов',
  'Садраддин',
  'Нәрікби Мақсұт',
  'Қанат Бейсекеев',
  'Роза Рымбаева',
  'Қуаныш Бейсек',
  'Руслан Берденов',
  'Данияр Жігітбек',
  'Азамат Скаков',
  'Алмас Жали',
  'Өркен Кенжебек',
  'Қуаныш Шонбай',
  'Рустем Омаров'
]
