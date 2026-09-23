# braverman.kz — тест Бравермана

Платный онлайн-тест на биохимический тип личности: 200 вопросов (ru/kk), результат по
4 нейромедиаторам, доминирующий тип и активная доля мозга, видео-разбор комбинации.
Оплата — Kaspi-счёт на номер (5 000 ₸), админка, аналитика трафика, партнёрские ссылки
тренеров с собственным кабинетом.

## Стек

- **Фронт**: Vite 5 + TypeScript без фреймворка (`src/`), два входа: `index.html` (тест) и `admin.html` (админка/кабинет тренера).
- **API**: Vercel serverless-функции `api/*.ts` (8 функций; файлы с `_` — общие модули).
- **База**: Neon Postgres (`db/schema.sql`, `npm run db:migrate`).
- **Оплата**: собственный Kaspi-шлюз `braverman-kaspi` на Fly.io (код — `MindQuiz/kaspi-gateway`).
- **WhatsApp**: общий шлюз `mindquiz-wa` (ссылка на результат, код восстановления) — опционально.
- **Видео**: Cloudflare R2 (публичный бакет), YouTube — фолбэк.

## Структура

```
shared/scoring.ts        подсчёт (общий для фронта и сервера): порядок вопросов, баллы, доминанта, ключ видео
src/content/{ru,kk}.ts   тексты интерфейса, описания типов, по 200 вопросов
src/screens/*            intro → quiz → checkout (тизер + Kaspi) → waiting → result; recover
src/admin/*              SPA админки: дашборд, прохождения, оплаты, тренеры, система
api/attempt.ts           старт/финиш попытки (скоринг на сервере)
api/checkout.ts          телефон → Kaspi-счёт
api/invoice-status.ts    поллинг статуса счёта (только подписанные ref)
api/kaspi-gw-webhook.ts  вебхук шлюза (подпись + ownership-guard)
api/result.ts            данные результата по токену ?r=
api/recover.ts           восстановление по номеру (код в WhatsApp)
api/track.ts             события воронки
api/admin.ts             роутер админки и кабинета тренера (?action=)
```

## Локальный запуск

```bash
cp .env.example .env      # заполнить DATABASE_URL, ACCESS_SECRET, ADMIN_*; для демо SIMULATE_PAYMENT=1
npm install
npm run db:migrate        # применить db/schema.sql
npm run dev               # http://localhost:5173  (админка: /admin)
```

В dev `vite.config.ts` сам исполняет `api/*.ts`, так что вся цепочка (тест → счёт → результат)
работает локально. `SIMULATE_PAYMENT=1` открывает результат без оплаты; `?test=<TEST_TOKEN>`
в адресе выставляет реальный счёт на `TEST_AMOUNT` ₸ (1 ₸) для боевой проверки.

## Как считается результат

Вопросы 4 блоков переплетены round-robin (`shared/scoring.ts`): вопрос `i` принадлежит
`NEURO_ORDER[i % 4]`. Да = 1. Баллы — абсолютные, 0–50 на нейромедиатор. Доминанта — максимум;
видео-разбор — доминанта + кто выше из противоположной пары (дофамин/ацетилхолин ↔ ГАМК/серотонин).
Файлы видео в R2: `<ключ>-<язык>.mp4`, напр. `dopamine-gaba-kk.mp4` (см. `scripts/rename-videos.sh`).

## Тренеры

Админ создаёт тренера (Тренеры → Добавить): имя, код, логин/пароль. Ссылка тренера —
`https://braverman.kz/t/<код>`; код сохраняется у посетителя и привязывается ко всем событиям
и попыткам. Тренер входит на `/admin` тем же формой входа и видит только своих клиентов
(`TRAINER_SEES_PHONE=0` маскирует телефоны).

## Деплой

1. **Vercel**: проект `braverman`, framework Vite, env из `.env.example`, домен `braverman.kz`.
2. **Neon**: `DATABASE_URL` → `npm run db:migrate`.
3. **Kaspi-шлюз** (из `MindQuiz/kaspi-gateway`): `fly apps create braverman-kaspi`,
   том `kaspi_data`, секреты `TOKEN_SECRET_KEY`, `GATEWAY_TOKEN`, `WEBHOOK_URL=https://braverman.kz/api/kaspi-gw-webhook`,
   `WEBHOOK_SECRET`; `fly deploy -a braverman-kaspi`. Затем вход **отдельного** кассира Kaspi по SMS
   на `https://braverman-kaspi.fly.dev/` (Kaspi держит одну сессию на кассира — тот же кассир,
   что у `mindquiz-kaspi`, использовать нельзя).
4. **DNS (ps.kz)**: `A @ 76.76.21.21`, `CNAME www cname.vercel-dns.com`.
5. **Пиксели**: `VITE_META_PIXEL_ID`, `VITE_TIKTOK_PIXEL_ID`.

Старый статический сайт живёт в ветке `legacy-static` (GitHub Pages) до переключения домена.

## Безопасность (кратко)

Результат отдаётся только по HMAC-токену, выданному после оплаты; поллинг принимает только
подписанные ссылки на счёт; вебхук проверяет подпись и принадлежность счёта; ручная выдача —
только из админки; восстановление по номеру ограничено по частоте и подтверждается кодом.
