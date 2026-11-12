-- ResiliNet-AI — initial schema
-- Key/value system state (sim mode, last tick, etc.)
CREATE TABLE IF NOT EXISTS system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Physical / virtual data sources feeding the fusion layer
CREATE TABLE IF NOT EXISTS sensors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,            -- RDR-KTM-01
  name TEXT NOT NULL,                   -- IMD Doppler Radar
  kind TEXT NOT NULL,                   -- radar | satellite | cctv | gauge | stream | lightning
  icon TEXT NOT NULL,                   -- icon key for UI
  unit_count INTEGER DEFAULT 1,         -- number of physical units (e.g. 47 cameras)
  rate_label TEXT,                      -- "1.2 GB/s"
  lat REAL, lon REAL,
  status TEXT NOT NULL DEFAULT 'LIVE',  -- LIVE | ELEVATED | ALERT | OFFLINE
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  sort_order INTEGER DEFAULT 0
);

-- Time-series observations (kept small: pruned by the ticker)
CREATE TABLE IF NOT EXISTS sensor_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sensor_id INTEGER NOT NULL,
  metric TEXT NOT NULL,                 -- rain_rate | stream_level | strikes | reflectivity | wind_gust | humidity
  value REAL NOT NULL,
  unit TEXT,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sensor_id) REFERENCES sensors(id)
);
CREATE INDEX IF NOT EXISTS idx_readings_sensor_ts ON sensor_readings(sensor_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_readings_metric_ts ON sensor_readings(metric, ts DESC);

-- AI ensemble members
CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,            -- DIFF | GNN | LSTM | HYDR
  name TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 85,
  gpu_load REAL NOT NULL DEFAULT 50,
  detail TEXT,                          -- "super-res x8"
  version TEXT DEFAULT 'v1.0',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sort_order INTEGER DEFAULT 0
);

-- Villages / zones under surveillance
CREATE TABLE IF NOT EXISTS villages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  district TEXT,
  lat REAL, lon REAL,
  elevation_m INTEGER,
  population INTEGER NOT NULL DEFAULT 0,
  map_x REAL, map_y REAL,               -- position on the 740x680 hazard-map canvas space
  risk TEXT NOT NULL DEFAULT 'GREEN',    -- GREEN | YELLOW | AMBER | RED
  risk_override TEXT,                   -- operator-forced risk (nullable)
  safe_zone TEXT,                       -- "Dhunche Ridge — 1.2km NE"
  river TEXT,
  fm_channel TEXT DEFAULT 'FM 100.4 MHz',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Alerts raised by the engine or operators
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  severity TEXT NOT NULL,               -- CRITICAL | HIGH | MEDIUM | LOW | INFO
  hazard TEXT NOT NULL DEFAULT 'GENERAL',-- FLOOD | CONVECTION | LIGHTNING | WIND | RAIN | SYSTEM | GENERAL
  title TEXT NOT NULL,
  body TEXT,
  village_id INTEGER,
  source TEXT NOT NULL DEFAULT 'engine', -- engine | operator
  status TEXT NOT NULL DEFAULT 'active', -- active | acknowledged | resolved
  eta_minutes INTEGER,                  -- expected time to impact when raised
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at DATETIME,
  acknowledged_by TEXT,
  resolved_at DATETIME,
  FOREIGN KEY (village_id) REFERENCES villages(id)
);
CREATE INDEX IF NOT EXISTS idx_alerts_status_created ON alerts(status, created_at DESC);

-- Outbound dispatches on each channel
CREATE TABLE IF NOT EXISTS dispatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER,
  channel TEXT NOT NULL,                -- cell | sms | ble | app
  message TEXT NOT NULL,
  reach INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'sent',  -- queued | sent | failed
  operator TEXT NOT NULL DEFAULT 'OPS-01',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (alert_id) REFERENCES alerts(id)
);
CREATE INDEX IF NOT EXISTS idx_dispatches_created ON dispatches(created_at DESC);

-- Nowcast engine runs (ensemble output)
CREATE TABLE IF NOT EXISTS nowcast_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,                   -- severe | clear
  horizon_min INTEGER NOT NULL,
  rain_rate REAL, stream_level REAL, strikes INTEGER, wind_gust REAL, max_dbz REAL,
  flood_prob REAL, lightning_prob REAL, wind_prob REAL,
  ensemble_confidence REAL,
  verdict TEXT NOT NULL,                -- SEVERE CONVECTION | ELEVATED | STABLE
  population_at_risk INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nowcast_created ON nowcast_runs(created_at DESC);

-- Operator audit trail
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL DEFAULT 'OPS-01',
  action TEXT NOT NULL,                 -- mode.change | alert.ack | alert.resolve | alert.create | dispatch.send | village.override
  target TEXT,
  details TEXT,                         -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
