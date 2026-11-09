# Вариант Б (A/B-эксперимент)

Новая воронка теста по адресу `braverman.kz/b` (нарезки: `/b/work`, `/b/love`). Те же 200 вопросов, подсчёт,
оплата Kaspi, цена и промокоды, что на основном сайте (вариант А); другие экраны и порядок шагов:

1. первый экран без имени, цена сразу, счётчик прошедших;
2. тест с выводами после 50 / 100 / 150 вопросов (на 100-м — номер WhatsApp с согласием, на 150-м — имя);
3. после 200-го — настоящий тип бесплатно, превью 35 с, оплата полного разбора;
4. счёт Kaspi, результат на один экран.

## Где что лежит

| Что | Где |
|---|---|
| Страница и экраны | `b.html`, `src/b/` |
| Серверная логика, метка варианта, отчёт | `api/_ab.ts` |
| Панель эксперимента и сравнение А/Б в админке | `src/admin/pages/ab-panel.ts`, `src/admin/pages/ab-compare.ts` |
| Превью 35 с | бакет R2 `braverman-videos`, папка `teaser/` |

Метка варианта: `attempts.variant` = `NULL` (вариант А) | `b` | `b:work` | `b:love`; `events.variant` — только у событий,
присланных страницей Б. Номер с 100-го вопроса — `attempts.wa_phone`, `wa_consent_at` (сообщений по нему пока не шлём).
Ссылка из WhatsApp всегда ведёт на `/?r=…` (так задан шаблон Meta); результат попытки Б оттуда сам переходит на `/b?r=…`.

## Как убрать вариант Б

1. Удалить `b.html`, `src/b/`, `api/_ab.ts`, `src/admin/pages/ab-panel.ts`, `src/admin/pages/ab-compare.ts`, папку `teaser/` в R2.
2. Убрать строки, помеченные «A/B-эксперимент» / «вариант Б»:
   - маршруты `/b` в `vercel.json` и `vite.config.ts`;
   - `api/attempt.ts` (разбор `variant`, действия `b-save`, `public-stats`), `api/track.ts`, `api/admin.ts` (действие `ab`, параметр `variant`),
     `api/checkout.ts`, `api/_fulfill.ts`, `api/_tgbot.ts` (строка варианта в Telegram), `api/result.ts`;
   - админка: пункт меню в `layout.ts`, маршруты в `router.ts` и `main.ts`, чип «B» в `attempts.ts` и `attempt-drawer.ts`, стили в конце `admin.css`;
   - переход на `/b?r=` в `src/screens/result.ts`, `setVariant` в `src/analytics.ts`.
3. Можно оставить: колонки в базе (у варианта А они пустые), `src/video-source.ts`, параметр `variant` в `sourcesStats`,
   исправление подсчёта «Открыли результат».
