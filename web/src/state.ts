import type { AssessRequest, Deal, Existing, Finance, Meta, Package, Tariff } from './types'
import { PACKAGE_KEYS } from './types'

export type Step = 'find' | 'build' | 'share'
export type Sheet = 'tenant' | 'owner' | 'funder'

export interface Route {
  step: Step
  how: boolean
  sheet: Sheet
}

export function newDeal(meta: Meta, buildingId: string | null): Deal {
  return {
    buildingId,
    own: null,
    existing: { ...meta.defaults.existing },
    package: { ...meta.defaults.package },
    finance: { ...meta.defaults.finance },
    tariff: { ...meta.defaults.tariff },
  }
}

export function dealToRequest(d: Deal): AssessRequest {
  const base: AssessRequest = {
    existing: d.existing,
    package: d.package,
    finance: d.finance,
    tariff: d.tariff,
  }
  if (d.buildingId) {
    const overrides: NonNullable<AssessRequest['building']> = {}
    if (d.flats !== undefined) overrides.flats = d.flats
    if (d.storeys !== undefined) overrides.storeys = d.storeys
    return { ...base, building_id: d.buildingId, building: overrides }
  }
  if (d.own) {
    return {
      ...base,
      building: {
        storeys: d.own.storeys,
        flats: d.own.flats,
        roof_m2: d.own.roof_m2,
        flat_area_m2: d.own.flat_area_m2,
        lat: d.own.lat,
        lon: d.own.lon,
      },
    }
  }
  return base
}

const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b)

export function encodeDeal(d: Deal, meta: Meta, sheet?: Sheet): string {
  const p = new URLSearchParams()
  if (d.buildingId) p.set('b', d.buildingId)
  if (d.own) {
    const o = d.own
    p.set('own', [o.storeys, o.flats, o.roof_m2, o.flat_area_m2 ?? 65, o.lat, o.lon].join('_'))
  }
  if (d.flats !== undefined) p.set('fl', String(d.flats))
  if (d.storeys !== undefined) p.set('st', String(d.storeys))
  const e = d.existing
  p.set('ex', [e.hot_water, e.heating, e.cooling, e.cooktop, e.roof].join(','))
  const on = PACKAGE_KEYS.filter((k) => d.package[k])
  p.set('pk', on.length ? on.join(',') : '-')
  const f = d.finance
  if (!same(f, meta.defaults.finance)) {
    p.set('fin', [f.cost_of_capital, f.term_years, f.savings_share_to_charge, f.reserve, f.apply_rebates ? 1 : 0].join(','))
  }
  const t = d.tariff
  if (!same(t, meta.defaults.tariff)) {
    p.set('tar', [t.electricity_c_per_kwh, t.electricity_supply_c_per_day, t.gas_c_per_mj, t.gas_supply_c_per_day].join(','))
  }
  if (sheet) p.set('sheet', sheet)
  return p.toString()
}

const numOr = (s: string | undefined, fallback: number) => {
  const n = Number(s)
  return s !== undefined && s !== '' && Number.isFinite(n) ? n : fallback
}

export function decodeDeal(qs: string, meta: Meta): Deal | null {
  const p = new URLSearchParams(qs)
  const b = p.get('b')
  const ownRaw = p.get('own')
  if (!b && !ownRaw) return null
  const d = newDeal(meta, b)
  if (!b && ownRaw) {
    const [st, fl, roof, area, lat, lon] = ownRaw.split('_').map(Number)
    if (![st, fl, roof, lat, lon].every(Number.isFinite)) return null
    d.own = { storeys: st, flats: fl, roof_m2: roof, flat_area_m2: Number.isFinite(area) ? area : 65, lat, lon }
  }
  const fl = p.get('fl')
  const st = p.get('st')
  if (fl) d.flats = numOr(fl, 0) || undefined
  if (st) d.storeys = numOr(st, 0) || undefined
  const ex = p.get('ex')?.split(',')
  if (ex && ex.length === 5) {
    const o = meta.options
    const ok = (list: { key: string }[], v: string, fb: string) => (list.some((x) => x.key === v) ? v : fb)
    const def = meta.defaults.existing
    const next: Existing = {
      hot_water: ok(o.hot_water, ex[0], def.hot_water),
      heating: ok(o.heating, ex[1], def.heating),
      cooling: ok(o.cooling, ex[2], def.cooling),
      cooktop: ok(o.cooktop, ex[3], def.cooktop),
      roof: ok(o.roof, ex[4], def.roof),
    }
    d.existing = next
  }
  const pk = p.get('pk')
  if (pk !== null) {
    const on = new Set(pk.split(','))
    const next = { ...d.package }
    for (const k of PACKAGE_KEYS) next[k] = on.has(k)
    d.package = next as Package
  }
  const fin = p.get('fin')?.split(',')
  if (fin && fin.length === 5) {
    const def = meta.defaults.finance
    const next: Finance = {
      cost_of_capital: numOr(fin[0], def.cost_of_capital),
      term_years: numOr(fin[1], def.term_years),
      savings_share_to_charge: numOr(fin[2], def.savings_share_to_charge),
      reserve: numOr(fin[3], def.reserve),
      apply_rebates: fin[4] !== '0',
    }
    d.finance = next
  }
  const tar = p.get('tar')?.split(',')
  if (tar && tar.length === 4) {
    const def = meta.defaults.tariff
    const next: Tariff = {
      electricity_c_per_kwh: numOr(tar[0], def.electricity_c_per_kwh),
      electricity_supply_c_per_day: numOr(tar[1], def.electricity_supply_c_per_day),
      gas_c_per_mj: numOr(tar[2], def.gas_c_per_mj),
      gas_supply_c_per_day: numOr(tar[3], def.gas_supply_c_per_day),
    }
    d.tariff = next
  }
  return d
}

export function parseHash(hash: string): { route: Route; qs: string } {
  const raw = hash.replace(/^#\/?/, '')
  const [path, qs = ''] = raw.split('?')
  const p = new URLSearchParams(qs)
  const sheetRaw = p.get('sheet')
  const sheet: Sheet = sheetRaw === 'owner' || sheetRaw === 'funder' ? sheetRaw : 'tenant'
  const step: Step = path === 'build' || path === 'share' ? path : 'find'
  return { route: { step, how: p.get('how') === '1', sheet }, qs }
}
