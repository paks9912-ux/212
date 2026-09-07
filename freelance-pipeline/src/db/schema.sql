-- Схема базы. Всё, что видел конвейер, остаётся здесь — включая отсеянное.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS opportunities (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL,
  platform      TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  url           TEXT,
  title         TEXT NOT NULL,
  text          TEXT NOT NULL,
  lang          TEXT NOT NULL,
  posted_at     TEXT,
  fetched_at    TEXT NOT NULL,
  budget_min    REAL,
  budget_max    REAL,
  currency      TEXT,
  budget_usd    REAL,
  budget_type   TEXT,
  proposals     INTEGER,
  skills        TEXT NOT NULL DEFAULT '[]',
  client        TEXT,
  status        TEXT NOT NULL DEFAULT 'new',
  filter_reason TEXT,
  dedup_key     TEXT NOT NULL,
  raw           TEXT,
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opp_dedup ON opportunities(dedup_key);
CREATE INDEX IF NOT EXISTS idx_opp_fetched ON opportunities(fetched_at);

CREATE TABLE IF NOT EXISTS scores (
  opportunity_id TEXT PRIMARY KEY REFERENCES opportunities(id) ON DELETE CASCADE,
  model          TEXT NOT NULL,
  score          REAL NOT NULL,
  factors        TEXT NOT NULL,
  est_hours      REAL NOT NULL,
  budget_usd     REAL NOT NULL,
  p_win          REAL NOT NULL,
  ev_hourly      REAL NOT NULL,
  hourly_if_won  REAL NOT NULL,
  fee            REAL NOT NULL,
  service_key    TEXT,
  categories     TEXT NOT NULL,
  primary_cat    TEXT NOT NULL,
  show           INTEGER NOT NULL,
  summary        TEXT,
  rationale      TEXT,
  missing_info   TEXT,
  red_flags      TEXT,
  risk_level     TEXT,
  cost_usd       REAL NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);

-- Ваши решения по заказам. Причины отказа нужны для калибровки.
CREATE TABLE IF NOT EXISTS decisions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  decision       TEXT NOT NULL,          -- apply | later | reject
  reason         TEXT,
  made_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proposals (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  variant        TEXT NOT NULL,
  text           TEXT NOT NULL,
  chosen         INTEGER NOT NULL DEFAULT 0,
  sent_at        TEXT,
  outcome        TEXT,                    -- won | lost | no_reply | null
  created_at     TEXT NOT NULL,
  cost_usd       REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  client_name    TEXT,
  platform       TEXT NOT NULL,
  title          TEXT NOT NULL,
  service_key    TEXT,
  budget         REAL,
  currency       TEXT DEFAULT 'USD',
  budget_usd     REAL,
  fee            REAL NOT NULL DEFAULT 0,
  deadline       TEXT,
  status         TEXT NOT NULL DEFAULT 'NEW',
  requirements   TEXT,
  notes          TEXT,
  est_hours      REAL,
  ai_share       REAL,                    -- доля работы, сделанная AI (ваша оценка после сдачи)
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS time_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  minutes    INTEGER NOT NULL,
  note       TEXT,
  at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount     REAL NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'USD',
  amount_usd REAL NOT NULL,
  fee_usd    REAL NOT NULL DEFAULT 0,
  at         TEXT NOT NULL,
  note       TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  direction  TEXT NOT NULL,               -- in | out
  text       TEXT NOT NULL,
  analysis   TEXT,
  at         TEXT NOT NULL
);

-- Журнал событий: что происходило, для аудита и обучения
CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  kind    TEXT NOT NULL,
  payload TEXT,
  at      TEXT NOT NULL
);

-- Служебное состояние источников: последний id сообщения и т.п.
CREATE TABLE IF NOT EXISTS source_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
