export type Bindings = {
  DB: D1Database
}

export type Mode = 'severe' | 'clear'
export type Risk = 'GREEN' | 'YELLOW' | 'AMBER' | 'RED'
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
export type Channel = 'cell' | 'sms' | 'ble' | 'app'

export interface SensorRow {
  id: number; code: string; name: string; kind: string; icon: string
  unit_count: number; rate_label: string; lat: number; lon: number
  status: string; last_seen: string; sort_order: number
}

export interface ModelRow {
  id: number; code: string; name: string; confidence: number; gpu_load: number
  detail: string; version: string; updated_at: string; sort_order: number
}

export interface VillageRow {
  id: number; slug: string; name: string; district: string; lat: number; lon: number
  elevation_m: number; population: number; map_x: number; map_y: number
  risk: Risk; risk_override: Risk | null; safe_zone: string; river: string; fm_channel: string
  updated_at: string
}

export interface AlertRow {
  id: number; severity: Severity; hazard: string; title: string; body: string | null
  village_id: number | null; village_name?: string | null; source: string; status: string
  eta_minutes: number | null; created_at: string; acknowledged_at: string | null
  acknowledged_by: string | null; resolved_at: string | null
}

export interface DispatchRow {
  id: number; alert_id: number | null; channel: Channel; message: string; reach: number
  status: string; operator: string; created_at: string
}

export interface NowcastRow {
  id: number; mode: Mode; horizon_min: number; rain_rate: number; stream_level: number
  strikes: number; wind_gust: number; max_dbz: number; flood_prob: number
  lightning_prob: number; wind_prob: number; ensemble_confidence: number; verdict: string
  population_at_risk: number; created_at: string
}

export const CHANNELS: Record<Channel, { label: string; desc: string; baseReach: number }> = {
  cell: { label: 'Cell Broadcast', desc: 'CB channel 4370', baseReach: 248000 },
  sms: { label: 'SMS Push', desc: 'IMD gateway', baseReach: 124500 },
  ble: { label: 'BLE Mesh', desc: 'Offline fallback', baseReach: 18200 },
  app: { label: 'ResiliNet App', desc: 'Native push', baseReach: 62700 },
}

export const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']
export const RISKS: Risk[] = ['GREEN', 'YELLOW', 'AMBER', 'RED']
