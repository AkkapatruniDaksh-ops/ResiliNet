-- Global mode: any location on Earth, community reports, weather cache

-- Cached weather assessments per rounded lat/lon (keeps Open-Meteo calls low)
CREATE TABLE IF NOT EXISTS weather_cache (
  key TEXT PRIMARY KEY,                 -- "lat2,lon2" rounded to 2 decimals
  payload TEXT NOT NULL,                -- JSON assessment
  fetched_at INTEGER NOT NULL           -- epoch ms
);

-- Locations people have looked up (drives "recent / popular places")
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  region TEXT,
  country TEXT,
  country_code TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  timezone TEXT,
  elevation_m REAL,
  lookups INTEGER NOT NULL DEFAULT 1,
  last_risk TEXT,                       -- GREEN | YELLOW | AMBER | RED
  last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_latlon ON locations(lat, lon);
CREATE INDEX IF NOT EXISTS idx_locations_lookups ON locations(lookups DESC);

-- Ground-truth reports from the public ("it's flooding here")
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  place TEXT,
  kind TEXT NOT NULL,                   -- flood | heavy_rain | lightning | wind | hail | landslide | all_clear | other
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  note TEXT,
  reporter TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);

-- Alert history for real locations (from the live weather engine)
CREATE TABLE IF NOT EXISTS location_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location_key TEXT NOT NULL,
  place TEXT,
  hazard TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_location_alerts_key ON location_alerts(location_key, created_at DESC);
