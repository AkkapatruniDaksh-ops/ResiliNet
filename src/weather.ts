// Global live weather engine — works for any lat/lon on Earth.
// Data: Open-Meteo (forecast + flood, free, no key), reverse geocoding via
// Open-Meteo/BigDataCloud. Converts raw numbers into a risk level and plain-language advice.

import type { Risk } from './types'

export interface Place {
  name: string; region?: string; country?: string; country_code?: string
  lat: number; lon: number; timezone?: string; elevation_m?: number; population?: number
}

export interface HazardScore { prob: number; level: Risk; detail: string }

export interface Assessment {
  place: Place
  fetched_at: string
  data_source: string
  risk: Risk
  status: 'SAFE' | 'WATCH' | 'WARNING' | 'DANGER'
  headline: string
  summary: string
  advice: Array<{ icon: string; title: string; sub: string }>
  current: {
    time: string; temperature_c: number; humidity_pct: number; precipitation_mm: number
    rain_mm: number; wind_kmh: number; gust_kmh: number; weather_code: number; weather_text: string; is_day: number
  }
  hazards: { flood: HazardScore; storm: HazardScore; wind: HazardScore; rain: HazardScore }
  next_hours: Array<{ time: string; rain_mm: number; gust_kmh: number; prob_pct: number; code: number; text: string; risk: Risk }>
  next_days: Array<{ date: string; rain_mm: number; prob_pct: number; gust_kmh: number; code: number; text: string; risk: Risk; tmax: number; tmin: number }>
  river?: { discharge: number; mean: number; ratio: number } | null
  peak: { time: string | null; rain_mm: number; minutes_until: number | null }
  scores: { flood: number; storm: number; wind: number; rain: number }
}

const WMO: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Heavy freezing drizzle',
  61: 'Light rain', 63: 'Moderate rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail',
}
export const weatherText = (c: number) => WMO[c] ?? 'Unknown'

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const r1 = (v: number) => Math.round(v * 10) / 10
const levelOf = (p: number): Risk => p >= 0.7 ? 'RED' : p >= 0.45 ? 'AMBER' : p >= 0.25 ? 'YELLOW' : 'GREEN'
const RANK: Record<Risk, number> = { GREEN: 0, YELLOW: 1, AMBER: 2, RED: 3 }
const maxRisk = (...r: Risk[]) => r.reduce((a, b) => RANK[b] > RANK[a] ? b : a, 'GREEN' as Risk)

// ---------- geocoding ----------
export async function geocode(q: string, count = 6): Promise<Place[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=en&format=json`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error('geocoding failed')
  const j = await res.json() as any
  return (j.results ?? []).map((r: any) => ({
    name: r.name, region: r.admin1, country: r.country, country_code: r.country_code,
    lat: r.latitude, lon: r.longitude, timezone: r.timezone, elevation_m: r.elevation, population: r.population,
  }))
}

export async function reverseGeocode(lat: number, lon: number): Promise<Place> {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`)
    if (res.ok) {
      const j = await res.json() as any
      const name = j.locality || j.city || j.principalSubdivision || j.countryName || 'Selected location'
      return { name, region: j.principalSubdivision, country: j.countryName, country_code: j.countryCode, lat, lon }
    }
  } catch { /* fall through */ }
  return { name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon }
}

// ---------- raw fetch ----------
async function fetchOpenMeteo(lat: number, lon: number) {
  const params = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '4',
    current: 'temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
    minutely_15: 'precipitation,rain,wind_gusts_10m,weather_code',
    hourly: 'precipitation,precipitation_probability,cape,wind_gusts_10m,weather_code',
    daily: 'precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,weather_code,temperature_2m_max,temperature_2m_min',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`weather provider error (${res.status})`)
  return res.json() as Promise<any>
}

async function fetchFlood(lat: number, lon: number) {
  try {
    const res = await fetch(`https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge,river_discharge_mean&forecast_days=2`)
    if (!res.ok) return null
    const j = await res.json() as any
    const d = j.daily?.river_discharge?.[0], m = j.daily?.river_discharge_mean?.[0]
    if (d == null || m == null || m <= 0) return null
    return { discharge: r1(d), mean: r1(m), ratio: r1(d / m) }
  } catch { return null }
}

// ---------- assessment ----------
export async function assess(place: Place): Promise<Assessment> {
  const [wx, river] = await Promise.all([fetchOpenMeteo(place.lat, place.lon), fetchFlood(place.lat, place.lon)])
  const cur = wx.current
  const nowIdx = Math.max(0, wx.minutely_15.time.findIndex((t: string) => t >= cur.time))
  const m15 = wx.minutely_15
  const hourly = wx.hourly
  const hourNowIdx = Math.max(0, hourly.time.findIndex((t: string) => t.slice(0, 13) === cur.time.slice(0, 13)))

  // Next 3 hours at 15-min resolution
  const win = (arr: number[], from: number, n: number) => arr.slice(from, from + n).map(v => v ?? 0)
  const rain3h = win(m15.precipitation, nowIdx, 12)
  const gust3h = win(m15.wind_gusts_10m, nowIdx, 12)
  const codes3h = win(m15.weather_code, nowIdx, 12)
  const rainSum3h = rain3h.reduce((a, b) => a + b, 0)
  const rainMax15 = Math.max(0, ...rain3h)
  const rainRateMax = rainMax15 * 4 // mm per hour equivalent
  const gustMax = Math.max(cur.wind_gusts_10m ?? 0, ...gust3h)
  const cape6h = Math.max(0, ...win(hourly.cape, hourNowIdx, 6))
  const rain6hSum = win(hourly.precipitation, hourNowIdx, 6).reduce((a, b) => a + b, 0)
  const rain24hSum = win(hourly.precipitation, hourNowIdx, 24).reduce((a, b) => a + b, 0)
  const probMax6h = Math.max(0, ...win(hourly.precipitation_probability, hourNowIdx, 6))
  const stormCode = [...codes3h, cur.weather_code, ...win(hourly.weather_code, hourNowIdx, 6)].some(c => c >= 95)

  // --- hazard probabilities (0..1) ---
  const rainScore = clamp(Math.max(rainRateMax / 40, rainSum3h / 30, rain6hSum / 50) * (probMax6h ? Math.max(0.5, probMax6h / 100) : 0.6))
  const riverBoost = river ? clamp((river.ratio - 1.2) / 2) : 0
  const floodScore = clamp(0.6 * clamp(Math.max(rain6hSum / 60, rain24hSum / 120)) + 0.25 * riverBoost + 0.15 * rainScore
    + (place.elevation_m != null && place.elevation_m < 30 ? 0.05 : 0))
  // CAPE alone is common in the tropics; only count it when rain is actually likely
  const capeTerm = clamp((cape6h - 800) / 2500) * clamp(probMax6h / 60)
  const stormScore = clamp(0.45 * capeTerm + (stormCode ? 0.5 : 0) + 0.1 * clamp(probMax6h / 100) * clamp(cape6h / 1500))
  const windScore = clamp((gustMax - 35) / 55)

  const hazards = {
    flood: { prob: floodScore, level: levelOf(floodScore), detail: `${Math.round(rain24hSum)} mm of rain expected in the next 24 h${river && river.ratio >= 1.2 ? `, river flow ${river.ratio}× normal` : ''}` },
    storm: { prob: stormScore, level: levelOf(stormScore), detail: stormCode ? 'Thunderstorms forecast within 6 h' : cape6h >= 800 ? `Storm energy building (${Math.round(cape6h)} J/kg)` : 'No thunderstorm signal' },
    wind: { prob: windScore, level: levelOf(windScore), detail: `Gusts up to ${Math.round(gustMax)} km/h` },
    rain: { prob: rainScore, level: levelOf(rainScore), detail: rainSum3h >= 0.5 ? `Up to ${Math.round(rainRateMax)} mm/h, ${Math.round(rainSum3h)} mm in the next 3 h` : `${Math.round(rain6hSum)} mm in the next 6 h` },
  }
  const risk = maxRisk(hazards.flood.level, hazards.storm.level, hazards.wind.level, hazards.rain.level)
  const status = risk === 'RED' ? 'DANGER' : risk === 'AMBER' ? 'WARNING' : risk === 'YELLOW' ? 'WATCH' : 'SAFE'

  // dominant hazard for headline
  const dominant = (Object.entries(hazards) as Array<[keyof typeof hazards, HazardScore]>).sort((a, b) => b[1].prob - a[1].prob)[0][0]
  const { headline, summary, advice } = narrative(status, dominant, hazards, place, cur)

  // peak rain in next 3h
  let peakIdx = -1, peakVal = 0
  rain3h.forEach((v, i) => { if (v > peakVal) { peakVal = v; peakIdx = i } })
  const peakTime = peakIdx >= 0 ? m15.time[nowIdx + peakIdx] : null

  const next_hours = Array.from({ length: 12 }, (_, i) => {
    const idx = nowIdx + i * 4
    if (!m15.time[idx]) return null
    const hIdx = hourNowIdx + i
    const rainMM = win(m15.precipitation, idx, 4).reduce((a, b) => a + b, 0)
    const gust = Math.max(0, ...win(m15.wind_gusts_10m, idx, 4))
    const code = m15.weather_code[idx] ?? hourly.weather_code[hIdx] ?? 0
    const p = clamp(Math.max(rainMM / 15, (gust - 35) / 55, code >= 95 ? 0.6 : 0))
    return { time: m15.time[idx], rain_mm: r1(rainMM), gust_kmh: Math.round(gust), prob_pct: hourly.precipitation_probability[hIdx] ?? 0, code, text: weatherText(code), risk: levelOf(p) }
  }).filter(Boolean) as Assessment['next_hours']

  const next_days = wx.daily.time.map((date: string, i: number) => {
    const rain = wx.daily.precipitation_sum[i] ?? 0, gust = wx.daily.wind_gusts_10m_max[i] ?? 0, code = wx.daily.weather_code[i] ?? 0
    const p = clamp(Math.max(rain / 60, (gust - 35) / 55, code >= 95 ? 0.5 : 0))
    return { date, rain_mm: r1(rain), prob_pct: wx.daily.precipitation_probability_max[i] ?? 0, gust_kmh: Math.round(gust), code, text: weatherText(code), risk: levelOf(p), tmax: wx.daily.temperature_2m_max[i], tmin: wx.daily.temperature_2m_min[i] }
  })

  return {
    place: { ...place, timezone: wx.timezone, elevation_m: place.elevation_m ?? wx.elevation },
    fetched_at: new Date().toISOString(),
    data_source: 'Open-Meteo (ECMWF / GFS / ICON blend) · GloFAS river model',
    risk, status, headline, summary, advice,
    current: {
      time: cur.time, temperature_c: cur.temperature_2m, humidity_pct: cur.relative_humidity_2m,
      precipitation_mm: cur.precipitation, rain_mm: cur.rain, wind_kmh: cur.wind_speed_10m, gust_kmh: cur.wind_gusts_10m,
      weather_code: cur.weather_code, weather_text: weatherText(cur.weather_code), is_day: cur.is_day,
    },
    hazards, next_hours, next_days, river,
    peak: { time: peakTime, rain_mm: r1(peakVal * 4), minutes_until: peakTime ? Math.max(0, Math.round((new Date(peakTime).getTime() - new Date(cur.time).getTime()) / 60000)) : null },
    scores: { flood: r1(floodScore * 100), storm: r1(stormScore * 100), wind: r1(windScore * 100), rain: r1(rainScore * 100) },
  }
}

// ---------- plain-language narrative ----------
function narrative(status: Assessment['status'], dominant: string, hz: Assessment['hazards'], place: Place, cur: any) {
  const name = place.name
  const advice: Assessment['advice'] = []
  let headline = '', summary = ''

  if (status === 'SAFE') {
    headline = `No severe weather expected in ${name}`
    summary = `${weatherText(cur.weather_code)}, ${Math.round(cur.temperature_2m)}°C. Rain and wind are within normal limits for the next few hours.`
    advice.push({ icon: '✅', title: 'Nothing to do right now', sub: 'Keep this page saved so you can check again quickly.' })
    advice.push({ icon: '🔔', title: 'Stay informed', sub: 'Local authorities and radio remain the official source in an emergency.' })
    return { headline, summary, advice }
  }

  const words: Record<string, string> = { flood: 'flooding', storm: 'thunderstorms', wind: 'strong winds', rain: 'heavy rain' }
  const lvl = status === 'DANGER' ? 'Dangerous' : status === 'WARNING' ? 'Likely' : 'Possible'
  headline = `${lvl} ${words[dominant]} near ${name}`
  const parts: string[] = []
  if (hz.rain.level !== 'GREEN') parts.push(hz.rain.detail)
  if (hz.flood.level !== 'GREEN') parts.push(hz.flood.detail)
  if (hz.storm.level !== 'GREEN') parts.push(hz.storm.detail)
  if (hz.wind.level !== 'GREEN') parts.push(hz.wind.detail)
  const lead = status === 'DANGER' ? 'Act now.' : status === 'WARNING' ? 'Be ready.' : 'Keep an eye on the sky.'
  summary = `${lead} Right now: ${weatherText(cur.weather_code).toLowerCase()}, ${Math.round(cur.temperature_2m)}°C. ${parts.join('. ')}.`

  if (hz.flood.level === 'RED' || hz.flood.level === 'AMBER') {
    advice.push({ icon: '⬆️', title: 'Move to higher ground', sub: 'Stay away from rivers, streams, underpasses and low roads. Never drive through flood water.' })
  }
  if (hz.storm.level !== 'GREEN') {
    advice.push({ icon: '⚡', title: 'Get indoors when thunder is heard', sub: 'Avoid open fields, tall trees and metal structures. Unplug sensitive electronics.' })
  }
  if (hz.wind.level !== 'GREEN') {
    advice.push({ icon: '💨', title: 'Secure loose objects', sub: 'Stay away from trees, hoardings and weak roofs. Park vehicles away from trees.' })
  }
  if (hz.rain.level !== 'GREEN') {
    advice.push({ icon: '🌧️', title: 'Avoid unnecessary travel', sub: 'Roads may flood quickly and visibility will be poor.' })
  }
  advice.push({ icon: '📻', title: 'Follow official instructions', sub: 'Tune to local radio / TV and check your national disaster-management app.' })
  if (status === 'DANGER') advice.unshift({ icon: '🚨', title: 'Call emergency services if in danger', sub: 'India 112 · Nepal 100/1149 · EU 112 · US 911 · UK 999' })
  return { headline, summary, advice }
}
