// DEMO DATA ONLY. Invented buildings around Lakemba NSW so the app can be shown without a backend.
// None of these numbers are real. The app shows a "demo data" tag whenever this file is in use.
import type { BuildingCollection, BuildingFeature, HeatBand, Meta } from '../types.ts'

export const mockMeta: Meta = {
  pilot: {
    name: 'Lakemba pilot (demo data)',
    description: 'A small area of older rented walk-up flats in south-western Sydney',
    centre: { lat: -33.92, lon: 151.075 },
    bbox: [151.066, -33.926, 151.084, -33.914],
    building_count: 30,
  },
  defaults: {
    existing: { hot_water: 'gas_storage', heating: 'electric_resistive', cooling: 'none', cooktop: 'gas', roof: 'dark' },
    package: {
      cool_roof: true,
      heat_pump_hot_water: true,
      reverse_cycle: true,
      induction_cooktop: false,
      ceiling_insulation: false,
      disconnect_gas: false,
    },
    finance: { cost_of_capital: 0.055, term_years: 12, savings_share_to_charge: 0.8, reserve: 0.05, apply_rebates: true },
    tariff: { electricity_c_per_kwh: 33.0, electricity_supply_c_per_day: 105.0, gas_c_per_mj: 4.5, gas_supply_c_per_day: 70.0 },
  },
  options: {
    hot_water: [
      { key: 'gas_storage', label: 'Gas storage tank' },
      { key: 'gas_instant', label: 'Gas instantaneous' },
      { key: 'electric_storage', label: 'Electric storage tank' },
    ],
    heating: [
      { key: 'gas_heater', label: 'Gas heater' },
      { key: 'electric_resistive', label: 'Plug-in electric heater' },
      { key: 'none', label: 'No heating' },
    ],
    cooling: [
      { key: 'none', label: 'No air conditioning' },
      { key: 'old_ac', label: 'Old window or wall air conditioner' },
    ],
    cooktop: [
      { key: 'gas', label: 'Gas cooktop' },
      { key: 'electric', label: 'Electric cooktop' },
    ],
    roof: [
      { key: 'dark', label: 'Dark roof' },
      { key: 'light', label: 'Light roof' },
    ],
  },
  data_notes: [
    'This is demo data. The buildings, heat bands and renter shares are invented to show how the app works.',
    'Heat is satellite land-surface temperature on hot summer days, not the air temperature inside a flat.',
    'Renter share is for the surrounding census area, not for each building.',
  ],
  credits: [
    { name: 'Demo fixtures', url: undefined, licence: 'Invented for the demo', used_for: 'Everything on screen in demo mode' },
  ],
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const STREETS = ['Haldon Street', 'Railway Parade', 'Wangee Road', 'Quigg Street', 'Croydon Road', 'Hornsey Road']
const BANDS: HeatBand[] = ['cooler', 'average', 'warm', 'hot', 'hottest']

function buildFixtures(): BuildingCollection {
  const r = rng(20261004)
  const centre = mockMeta.pilot.centre
  const mPerDegLat = 111320
  const mPerDegLon = 111320 * Math.cos((centre.lat * Math.PI) / 180)
  const cols = 6
  const rows = 5
  const raw: { feature: BuildingFeature; anomaly: number; rent: number }[] = []
  let n = 0
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      n++
      const cx = (col - (cols - 1) / 2) * 120 + (r() - 0.5) * 40
      const cy = (row - (rows - 1) / 2) * 100 + (r() - 0.5) * 30
      const storeys = 2 + Math.floor(r() * 3)
      const w = 16 + r() * 10
      const h = 14 + r() * 10
      const footprint = w * h
      const flatsPerStorey = 3 + Math.floor(r() * 3)
      const angle = (r() - 0.5) * 0.35
      const corners: [number, number][] = [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
        [-w / 2, -h / 2],
      ]
      const ring = corners.map(([x, y]) => {
        const rx = x * Math.cos(angle) - y * Math.sin(angle)
        const ry = x * Math.sin(angle) + y * Math.cos(angle)
        return [centre.lon + (cx + rx) / mPerDegLon, centre.lat + (cy + ry) / mPerDegLat] as [number, number]
      })
      // Hotter toward the east side (railway) with noise; a dark-roof, little-shade look.
      const anomaly = -0.6 + (col / (cols - 1)) * 2.4 + (r() - 0.5) * 1.6 + (row === 2 ? 0.4 : 0)
      const rent = Math.min(0.92, Math.max(0.28, 0.45 + (col / (cols - 1)) * 0.25 + (r() - 0.5) * 0.25))
      const street = STREETS[(row + col) % STREETS.length]
      const num = 2 + Math.floor(r() * 90)
      const noName = r() < 0.15
      const assumed = r() < 0.2
      raw.push({
        anomaly,
        rent,
        feature: {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: {
            id: `demo_${String(n).padStart(3, '0')}`,
            label: noName ? `Block near ${street}` : `${num} ${street}, Lakemba`,
            suburb: 'Lakemba',
            storeys,
            storeys_source: assumed ? 'assumed' : 'osm',
            flats_est: storeys * flatsPerStorey,
            footprint_m2: Math.round(footprint * 10) / 10,
            roof_m2: Math.round(footprint * 10) / 10,
            heat_anomaly_c: Math.round(anomaly * 10) / 10,
            heat_band: 'average',
            renter_share: r() < 0.08 ? null : Math.round(rent * 100) / 100,
            quick_score: 0,
          },
        },
      })
    }
  }
  const sorted = [...raw].sort((a, b) => a.anomaly - b.anomaly)
  sorted.forEach((item, i) => {
    item.feature.properties.heat_band = BANDS[Math.min(4, Math.floor((i / sorted.length) * 5))]
  })
  const minA = sorted[0].anomaly
  const maxA = sorted[sorted.length - 1].anomaly
  for (const item of raw) {
    const heatN = (item.anomaly - minA) / (maxA - minA)
    const rent = item.feature.properties.renter_share ?? 0.45
    item.feature.properties.quick_score = Math.round(100 * (0.6 * heatN + 0.4 * Math.min(1, (rent - 0.25) / 0.65)))
  }
  return { type: 'FeatureCollection', features: raw.map((x) => x.feature) }
}

export const mockBuildings: BuildingCollection = buildFixtures()

/** Band thresholds (anomaly, deg C) derived from the fixtures, used to band hand-entered blocks. */
export function bandForAnomaly(a: number): HeatBand {
  const sorted = mockBuildings.features.map((f) => f.properties.heat_anomaly_c).sort((x, y) => x - y)
  const idx = sorted.filter((v) => v <= a).length
  return BANDS[Math.min(4, Math.floor((idx / sorted.length) * 5))]
}
