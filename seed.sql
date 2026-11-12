-- ResiliNet-AI seed data (Langtang / Trishuli basin scenario)

INSERT OR REPLACE INTO system_state (key, value) VALUES
  ('mode', 'severe'),
  ('last_tick', '0'),
  ('radar_site', 'KTM-01'),
  ('horizon_min', '45');

INSERT OR IGNORE INTO sensors (code, name, kind, icon, unit_count, rate_label, lat, lon, status, sort_order) VALUES
  ('RDR-KTM-01', 'IMD Doppler Radar', 'radar',     'satellite', 1,   '1.2 GB/s', 27.7172, 85.3240, 'LIVE', 1),
  ('SAT-3DR',    'INSAT-3DR Sat',     'satellite', 'satellite', 1,   '420 MB/s', 0,       82.0,    'LIVE', 2),
  ('CAM-GRID',   'CCTV Vision Grid',  'cctv',      'camera',    47,  '8.4 MB/s', 28.16,   85.33,   'LIVE', 3),
  ('SEN-GAUGE',  'IoT Rain Gauges',   'gauge',     'sensor',    128, '12 KB/s',  28.20,   85.35,   'LIVE', 4),
  ('HYD-LEVEL',  'Stream Level',      'stream',    'sensor',    24,  '6 KB/s',   28.16,   85.34,   'LIVE', 5),
  ('LDN-DETECT', 'Lightning Detect',  'lightning', 'sensor',    12,  '2 KB/s',   28.10,   85.40,   'LIVE', 6);

INSERT OR IGNORE INTO models (code, name, confidence, gpu_load, detail, version, sort_order) VALUES
  ('DIFF', 'Diffusion Super-Res', 92, 71, 'super-res ×8',      'v2.3', 1),
  ('GNN',  'Physics-GNN',         89, 63, 'physics loss 0.031', 'v1.8', 2),
  ('LSTM', 'ConvLSTM Nowcast',    94, 82, '6-min ahead',        'v3.1', 3),
  ('HYDR', 'Hydro Runoff',        86, 44, 'runoff coeff 0.72',  'v1.2', 4);

INSERT OR IGNORE INTO villages (slug, name, district, lat, lon, elevation_m, population, map_x, map_y, risk, safe_zone, river) VALUES
  ('syabrubesi', 'Syabrubesi', 'Rasuwa', 28.1600, 85.3400, 1460, 3200,  420, 310, 'RED',   'Dhunche Ridge — 1.2km NE',     'Trishuli / Lende Khola'),
  ('dhunche',    'Dhunche',    'Rasuwa', 28.1100, 85.2970, 1950, 5400,  560, 380, 'RED',   'Dhunche Army Camp — 400m S',   'Trishuli'),
  ('kalikasthan','Kalikasthan','Rasuwa', 28.0300, 85.2500, 1300, 12400, 640, 280, 'AMBER', 'Kalika School Grounds — 600m E','Trishuli'),
  ('langtang',   'Langtang',   'Rasuwa', 28.2140, 85.5170, 3430, 700,   300, 250, 'AMBER', 'Kyanjin Plateau — 2.5km E',     'Langtang Khola'),
  ('trishuli',   'Trishuli',   'Nuwakot',27.9200, 85.1500, 540,  102800,200, 390, 'AMBER', 'Bidur Highlands — 2km W',      'Trishuli');

-- Baseline alerts (severe scenario)
INSERT INTO alerts (severity, hazard, title, body, village_id, source, status, eta_minutes, created_at) VALUES
  ('CRITICAL', 'CONVECTION', 'Convective cell 68 dBZ · SW quadrant', 'ConvLSTM detects rapidly intensifying cell moving NE at 42 km/h.', 1, 'engine', 'active', 25, datetime('now')),
  ('CRITICAL', 'FLOOD',      'Flash flood probability > 85% · Trishuli basin', 'Hydro runoff model: stream rise 2.4m in 40 min at HYD-07.', 2, 'engine', 'active', 40, datetime('now','-3 minutes')),
  ('HIGH',     'LIGHTNING',  'Lightning cluster · Syabrubesi', '14 CG strikes / 5 min within 3 km.', 1, 'engine', 'active', 10, datetime('now','-6 minutes')),
  ('HIGH',     'RAIN',       'Rainfall rate 78 mm/hr · exceeding threshold', 'SEN-104 / SEN-118 both above 60 mm/hr warning level.', 3, 'engine', 'active', NULL, datetime('now','-12 minutes')),
  ('MEDIUM',   'WIND',       'Wind gusts 62 km/h · Dhunche ridge', 'Downdraft signature on radial velocity.', 2, 'engine', 'active', NULL, datetime('now','-18 minutes')),
  ('LOW',      'GENERAL',    'Elevated humidity anomaly detected', 'Dew-point spread collapsed to 1.2°C across the basin.', NULL, 'engine', 'acknowledged', NULL, datetime('now','-24 minutes')),
  ('INFO',     'SYSTEM',     'Model retrain complete · 87.4% accuracy', 'Nightly ConvLSTM retrain finished on 4×A100.', NULL, 'engine', 'resolved', NULL, datetime('now','-3 hours')),
  ('INFO',     'SYSTEM',     'Sensor SEN-104 back online', 'Gauge reconnected after 12 min gap.', NULL, 'engine', 'resolved', NULL, datetime('now','-4 hours'));

INSERT INTO audit_log (actor, action, target, details, created_at) VALUES
  ('SYSTEM', 'system.boot', 'resilinet', '{"version":"1.0.0"}', datetime('now','-5 hours')),
  ('OPS-01', 'alert.ack', 'alert:6', '{"note":"monitoring"}', datetime('now','-20 minutes'));

INSERT INTO nowcast_runs (mode, horizon_min, rain_rate, stream_level, strikes, wind_gust, max_dbz, flood_prob, lightning_prob, wind_prob, ensemble_confidence, verdict, population_at_risk, created_at) VALUES
  ('severe', 45, 78, 3.9, 14, 62, 68, 0.87, 0.74, 0.41, 92.7, 'SEVERE CONVECTION', 124500, datetime('now'));
