-- Users, sessions, alert subscriptions, notification log

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT,
  phone TEXT,                              -- E.164, e.g. +919876543210
  phone_verified INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT NOT NULL,             -- pbkdf2$iterations$salt$hash (base64)
  provider TEXT NOT NULL DEFAULT 'password',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                     -- random token
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- A place the user wants to be warned about
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  label TEXT NOT NULL,                     -- "Home", "Mum's village"
  place_name TEXT NOT NULL,
  region TEXT, country TEXT,
  lat REAL NOT NULL, lon REAL NOT NULL,
  min_level TEXT NOT NULL DEFAULT 'AMBER', -- YELLOW | AMBER | RED  (warn at or above)
  via_sms INTEGER NOT NULL DEFAULT 1,
  via_call INTEGER NOT NULL DEFAULT 0,     -- voice call only for RED by default (see call_min_level)
  call_min_level TEXT NOT NULL DEFAULT 'RED',
  quiet_start INTEGER,                     -- local hour 0-23 (nullable = no quiet hours)
  quiet_end INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  last_level TEXT,                         -- last risk we saw
  last_notified_level TEXT,
  last_checked DATETIME,
  last_notified DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_active_checked ON subscriptions(active, last_checked);

-- Every SMS / call / (email) we attempted
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subscription_id INTEGER,
  channel TEXT NOT NULL,                   -- sms | call | test
  to_number TEXT,
  level TEXT,                              -- risk level that triggered it
  message TEXT NOT NULL,
  status TEXT NOT NULL,                    -- sent | simulated | failed | skipped_quiet
  provider_ref TEXT,                       -- Twilio SID
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);
