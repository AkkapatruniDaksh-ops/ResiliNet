-- SMS / voice gateway credentials managed from the in-app settings page
-- (falls back to environment secrets when a row is missing)
CREATE TABLE IF NOT EXISTS gateway_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
