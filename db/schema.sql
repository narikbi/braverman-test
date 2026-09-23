-- Схема braverman.kz (Neon Postgres). Идемпотентна: npm run db:migrate можно гонять повторно.
-- Новые изменения дописывать в конец как ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
-- Модель attempt-centric: одна строка на прохождение теста (телефон появляется на оплате).

CREATE TABLE IF NOT EXISTS trainers (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  code          text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_-]{2,32}$'),  -- ссылка /t/<code>, lower
  name          text NOT NULL,
  phone         text NOT NULL DEFAULT '',
  active        boolean NOT NULL DEFAULT true,
  notes         text NOT NULL DEFAULT '',
  login         text UNIQUE,                                              -- кабинет тренера
  password_hash text,                                                     -- scrypt "salt:hash"
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS attempts (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  sid           text,                                   -- клиентская сессия (bt_sid)
  name          text NOT NULL DEFAULT '',
  lang          text NOT NULL DEFAULT 'ru' CHECK (lang IN ('ru','kk')),
  phone         text,                                   -- +77XXXXXXXXX, появляется на оплате
  trainer_id    bigint REFERENCES trainers(id) ON DELETE SET NULL,
  trainer_code  text,                                   -- сырой ?t=, хранится даже если код неизвестен
  utm           jsonb NOT NULL DEFAULT '{}',
  referrer      text,
  landing       text,
  answered      int  NOT NULL DEFAULT 0,                -- прогресс (максимальный шаг)
  answers       jsonb,                                  -- [0|1] x 200, при завершении
  dopamine      smallint,
  acetylcholine smallint,
  gaba          smallint,
  serotonin     smallint,
  dominant      text,
  lowest        text,
  combo         text,                                   -- ключ видео, напр. 'dopamine-gaba'
  status        text NOT NULL DEFAULT 'started'
                CHECK (status IN ('started','finished','invoice','paid')),
  paid_by       text,                                   -- kaspi | admin
  finished_at   timestamptz,
  checkout_at   timestamptz,
  paid_at       timestamptz,
  invoice_id    text,                                   -- короткий kpa opId
  invoice_ref   text,                                   -- полный подписанный ref для поллинга
  invoice_error text,
  test_amount   int,
  notes         text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS attempts_created_idx ON attempts (created_at DESC);
CREATE INDEX IF NOT EXISTS attempts_status_idx  ON attempts (status);
CREATE INDEX IF NOT EXISTS attempts_phone_idx   ON attempts (phone);
CREATE INDEX IF NOT EXISTS attempts_trainer_idx ON attempts (trainer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attempts_sid_idx     ON attempts (sid);
CREATE INDEX IF NOT EXISTS attempts_invoice_idx ON attempts (invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id          bigserial PRIMARY KEY,
  invoice_id  text NOT NULL UNIQUE,                     -- kpa opId | 'sim-<attempt>' | 'manual-<attempt>'
  provider    text NOT NULL,                            -- kpa | manual | sim
  attempt_id  bigint REFERENCES attempts(id) ON DELETE SET NULL,
  phone       text NOT NULL DEFAULT '',
  amount      numeric(10,2),
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','paid','cancelled','expired','error')),
  source      text,                                     -- webhook | poll | admin
  link_sent   boolean,                                  -- ссылка на результат ушла в WhatsApp
  created_at  timestamptz NOT NULL DEFAULT now(),
  paid_at     timestamptz
);
CREATE INDEX IF NOT EXISTS payments_paid_idx    ON payments (paid_at DESC);
CREATE INDEX IF NOT EXISTS payments_created_idx ON payments (created_at DESC);
CREATE INDEX IF NOT EXISTS payments_attempt_idx ON payments (attempt_id);

CREATE TABLE IF NOT EXISTS events (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  type         text NOT NULL,
  sid          text,
  attempt_id   bigint,
  trainer_code text,
  step         int,
  props        jsonb NOT NULL DEFAULT '{}',
  utm          jsonb,
  referrer     text,
  path         text,
  ua           text,
  ip_hash      text
);
CREATE INDEX IF NOT EXISTS events_ts_idx         ON events (ts);
CREATE INDEX IF NOT EXISTS events_type_ts_idx    ON events (type, ts);
CREATE INDEX IF NOT EXISTS events_sid_idx        ON events (sid);
CREATE INDEX IF NOT EXISTS events_attempt_idx    ON events (attempt_id);
CREATE INDEX IF NOT EXISTS events_trainer_ts_idx ON events (trainer_code, ts);
