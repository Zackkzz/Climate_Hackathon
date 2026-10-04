// DEMO DATA ONLY. A small, plausible stand-in for the real model so the app reacts to its inputs
// when no backend is running. These numbers are not real estimates.
import type {
  Assumption,
  AssessRequest,
  AssessResponse,
  AssessedBuilding,
  EnergyProfile,
  EndUse,
  FlatGroup,
  HeatBand,
  MonthRow,
  Package,
  PackageItem,
  PackageKey,
  PortfolioRequest,
  PortfolioResponse,
  Tariff,
  Existing,
  Finance,
} from '../types.ts'
import { PACKAGE_KEYS } from '../types.ts'
import { bandForAnomaly, mockBuildings, mockMeta } from './fixtures.ts'

export class MockApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const HW_DELIVERED_MJ = 7560 // 110 L/day heated by 45 K
const OTHER_KWH = 1800
const GRID_KG_PER_KWH = 0.66
const GAS_KG_PER_MJ = 0.0555

interface Parts {
  hwKwh: number
  hwMj: number
  heatKwh: number
  heatMj: number
  coolKwh: number
  cookKwh: number
  cookMj: number
  otherKwh: number
}

interface Ctx {
  anomaly: number
  existing: Existing
  tariff: Tariff
  flatArea: number
}

function demands(pos: 'top' | 'lower', ctx: Ctx, pkg: Package) {
  const top = pos === 'top'
  const insul = top && pkg.ceiling_insulation
  const heat = 2200 * (top ? 1.15 : 0.9) * (insul ? 0.85 : 1)
  const heatBase = 2200 * (top ? 1.15 : 0.9)
  const hotFactor = 1 + 0.3 * (ctx.anomaly - 1)
  const coolBase = 900 * Math.max(0.6, hotFactor) * (top ? 1.6 : 0.8)
  const roofFactor = top && pkg.cool_roof ? (ctx.existing.roof === 'light' ? 0.95 : 0.78) : 1
  const cool = coolBase * roofFactor * (insul ? 0.9 : 1)
  return { heat, heatBase, cool, coolBase }
}

function flatParts(pos: 'top' | 'lower', ctx: Ctx, pkg: Package, upgraded: boolean): Parts {
  const ex = ctx.existing
  const d = demands(pos, ctx, upgraded ? pkg : noPkg())
  const p: Parts = { hwKwh: 0, hwMj: 0, heatKwh: 0, heatMj: 0, coolKwh: 0, cookKwh: 0, cookMj: 0, otherKwh: OTHER_KWH }

  // hot water
  if (upgraded && pkg.heat_pump_hot_water) p.hwKwh = HW_DELIVERED_MJ / 3.6 / 3.4
  else if (ex.hot_water === 'gas_storage') p.hwMj = HW_DELIVERED_MJ / 0.62
  else if (ex.hot_water === 'gas_instant') p.hwMj = HW_DELIVERED_MJ / 0.78
  else p.hwKwh = HW_DELIVERED_MJ / 3.6 / 0.9

  // heating and cooling
  if (upgraded && pkg.reverse_cycle) {
    const heatTakeBack = ex.heating === 'none' ? 0.55 : 1
    const coolTakeBack = ex.cooling === 'none' ? 0.6 : 1
    p.heatKwh = (d.heat * heatTakeBack) / 3.8
    p.coolKwh = (d.cool * coolTakeBack) / 3.4
  } else {
    if (ex.heating === 'gas_heater') p.heatMj = (d.heat * 3.6) / 0.75
    else if (ex.heating === 'electric_resistive') p.heatKwh = d.heat
    if (ex.cooling === 'old_ac') p.coolKwh = d.cool / 2.4
  }

  // cooktop
  if (upgraded && pkg.induction_cooktop) p.cookKwh = 230
  else if (ex.cooktop === 'gas') p.cookMj = 1800
  else p.cookKwh = 250

  return p
}

function noPkg(): Package {
  return {
    cool_roof: false,
    heat_pump_hot_water: false,
    reverse_cycle: false,
    induction_cooktop: false,
    ceiling_insulation: false,
    disconnect_gas: false,
  }
}

function gasMjOf(p: Parts) {
  return p.hwMj + p.heatMj + p.cookMj
}

function gasDisconnected(parts: Parts, pkg: Package, upgraded: boolean) {
  return upgraded && pkg.disconnect_gas && parts.hwMj + parts.heatMj + parts.cookMj === 0
}

/** `connected` means the flat still pays a gas supply charge. */
function profile(parts: Parts, t: Tariff, connected: boolean): EnergyProfile {
  const elecKwh = parts.hwKwh + parts.heatKwh + parts.coolKwh + parts.cookKwh + parts.otherKwh
  const gasMj = parts.hwMj + parts.heatMj + parts.cookMj
  const ek = t.electricity_c_per_kwh / 100
  const gm = t.gas_c_per_mj / 100
  const elecSupply = (t.electricity_supply_c_per_day * 365) / 100
  const gasSupplyCost = connected ? (t.gas_supply_c_per_day * 365) / 100 : 0
  const row = (key: string, label: string, kwh: number, mj: number): EndUse => ({
    key,
    label,
    cost_per_year: Math.round(kwh * ek + mj * gm),
    electricity_kwh: Math.round(kwh),
    gas_mj: Math.round(mj),
  })
  const by: EndUse[] = [
    row('hot_water', 'Hot water', parts.hwKwh, parts.hwMj),
    row('heating', 'Heating', parts.heatKwh, parts.heatMj),
    row('cooling', 'Cooling', parts.coolKwh, 0),
    row('cooking', 'Cooking', parts.cookKwh, parts.cookMj),
    row('other', 'Lights, fridge and appliances', parts.otherKwh, 0),
    { key: 'supply', label: 'Fixed supply charges', cost_per_year: Math.round(elecSupply + gasSupplyCost), electricity_kwh: 0, gas_mj: 0 },
  ]
  return {
    electricity_kwh: Math.round(elecKwh),
    gas_mj: Math.round(gasMj),
    bill_per_year: Math.round(elecKwh * ek + gasMj * gm + elecSupply + gasSupplyCost),
    by_end_use: by,
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const COOL_W = [0.22, 0.2, 0.15, 0.05, 0, 0, 0, 0, 0.03, 0.06, 0.12, 0.17]
const HEAT_W = [0, 0, 0.02, 0.07, 0.17, 0.27, 0.29, 0.15, 0.03, 0, 0, 0]
const HW_RAW = [0.9, 0.9, 0.95, 1, 1.1, 1.2, 1.25, 1.2, 1.1, 1, 0.95, 0.9]
const HW_W = HW_RAW.map((x) => x / HW_RAW.reduce((a, b) => a + b, 0))

function monthlyBill(parts: Parts, t: Tariff, connected: boolean, m: number): number {
  const ek = t.electricity_c_per_kwh / 100
  const gm = t.gas_c_per_mj / 100
  const kwh = parts.hwKwh * HW_W[m] + parts.heatKwh * HEAT_W[m] + parts.coolKwh * COOL_W[m] + parts.cookKwh / 12 + parts.otherKwh / 12
  const mj = parts.hwMj * HW_W[m] + parts.heatMj * HEAT_W[m] + parts.cookMj / 12
  const supply = (t.electricity_supply_c_per_day * 365) / 100 / 12 + (connected ? (t.gas_supply_c_per_day * 365) / 100 / 12 : 0)
  return kwh * ek + mj * gm + supply
}

function pvFactor(rate: number, years: number) {
  const r = rate / 12
  const n = Math.round(years * 12)
  return r === 0 ? n : (1 - Math.pow(1 + r, -n)) / r
}

function irr(outlay: number, monthlyIn: number, n: number): number {
  if (outlay <= 0 || monthlyIn <= 0) return 0
  let lo = -0.02
  let hi = 0.05
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    const pv = mid === 0 ? monthlyIn * n : (monthlyIn * (1 - Math.pow(1 + mid, -n))) / mid
    if (pv > outlay) lo = mid
    else hi = mid
  }
  return ((lo + hi) / 2) * 12 * 100
}

interface Counts {
  top: number
  lower: number
}

function itemCosts(key: PackageKey, b: { roof_m2: number; flat_area_m2: number }, counts: Counts, rebates: boolean) {
  const flats = counts.top + counts.lower
  switch (key) {
    case 'cool_roof':
      return { capex: 20 * b.roof_m2, rebate: 0, applies_to: 'building', top_only: true, note: 'Helps top-floor flats only' }
    case 'heat_pump_hot_water':
      return { capex: 2700 * flats, rebate: rebates ? 1000 * flats : 0, applies_to: 'flat', top_only: false, note: 'One unit per flat, replaces the old tank' }
    case 'reverse_cycle':
      return { capex: 2500 * flats, rebate: rebates ? 450 * flats : 0, applies_to: 'flat', top_only: false, note: 'One efficient heater and cooler per flat' }
    case 'induction_cooktop':
      return { capex: 1500 * flats, rebate: 0, applies_to: 'flat', top_only: false, note: 'Replaces the gas cooktop' }
    case 'ceiling_insulation':
      return {
        capex: 28 * b.flat_area_m2 * counts.top,
        rebate: rebates ? 0.15 * 28 * b.flat_area_m2 * counts.top : 0,
        applies_to: 'top floor',
        top_only: true,
        note: 'Top-floor ceilings only',
      }
    case 'disconnect_gas':
      return { capex: 1800 + 280 * flats, rebate: 0, applies_to: 'building', top_only: false, note: 'Removes the gas supply and its fixed charge' }
  }
}

const LABELS: Record<PackageKey, string> = {
  cool_roof: 'Reflective cool roof coating',
  heat_pump_hot_water: 'Heat pump hot water',
  reverse_cycle: 'Reverse-cycle air conditioning',
  induction_cooktop: 'Induction cooktop',
  ceiling_insulation: 'Ceiling insulation',
  disconnect_gas: 'Disconnect gas',
}

function simulateHeat(anomaly: number, pkg: Package, roof: string, upgraded: boolean) {
  const dayMax = [30, 32, 35, 38, 40, 34, 29]
  const dayMin = dayMax.map((m) => m - 11)
  const outdoor: number[] = []
  for (let h = 0; h < 168; h++) {
    const tau = h / 24
    const i0 = Math.min(6, Math.floor(tau))
    const i1 = Math.min(6, i0 + 1)
    const f = tau - i0
    const mx = dayMax[i0] * (1 - f) + dayMax[i1] * f
    const mn = dayMin[i0] * (1 - f) + dayMin[i1] * f
    const hr = h % 24
    outdoor.push((mx + mn) / 2 + ((mx - mn) / 2) * Math.cos((2 * Math.PI * (hr - 15)) / 24))
  }
  let gain = 10 * (1 + 0.1 * (anomaly - 1))
  let tc = 11
  if (upgraded) {
    if (pkg.cool_roof) gain *= roof === 'light' ? 0.9 : 0.4
    if (pkg.ceiling_insulation) {
      gain *= 0.75
      tc = 14
    }
  }
  const out: number[] = []
  let ti = outdoor[0] + 1
  for (let pass = 0; pass < 2; pass++) {
    for (let h = 0; h < 168; h++) {
      const hr = h % 24
      const sun = hr >= 7 && hr <= 18 ? Math.sin((Math.PI * (hr - 7)) / 11) : 0
      const drive = outdoor[h] - 2.2 + gain * sun
      ti = ti + (drive - ti) / tc
      if (pass === 1) out.push(ti)
    }
  }
  return { outdoor, indoor: out }
}

export function mockAssess(req: AssessRequest): AssessResponse {
  const d = mockMeta.defaults
  const existing: Existing = { ...d.existing, ...req.existing }
  const pkg: Package = { ...d.package, ...req.package }
  const fin: Finance = { ...d.finance, ...req.finance }
  const tariff: Tariff = { ...d.tariff, ...req.tariff }
  const warnings: string[] = []

  let b: AssessedBuilding
  if (req.building_id) {
    const f = mockBuildings.features.find((x) => x.properties.id === req.building_id)
    if (!f) throw new MockApiError(404, `We could not find a building called ${req.building_id}.`)
    const p = f.properties
    b = {
      id: p.id,
      label: p.label,
      storeys: req.building?.storeys ?? p.storeys,
      flats: req.building?.flats ?? p.flats_est,
      roof_m2: req.building?.roof_m2 ?? p.roof_m2,
      flat_area_m2: req.building?.flat_area_m2 ?? 65,
      heat_anomaly_c: req.building?.heat_anomaly_c ?? p.heat_anomaly_c,
      heat_band: p.heat_band,
    }
    if (p.storeys_source === 'assumed' && req.building?.storeys === undefined)
      warnings.push('The number of storeys was assumed, not mapped. Change it above if you know it.')
  } else {
    const bi = req.building
    if (!bi || !bi.storeys || !bi.flats || !bi.roof_m2) throw new MockApiError(400, 'Please give the number of storeys, flats and the roof area.')
    b = {
      id: null,
      label: 'Your block',
      storeys: bi.storeys,
      flats: bi.flats,
      roof_m2: bi.roof_m2,
      flat_area_m2: bi.flat_area_m2 ?? 65,
      heat_anomaly_c: bi.heat_anomaly_c ?? 0.8,
      heat_band: null,
    }
    b.heat_band = bandForAnomaly(b.heat_anomaly_c)
    warnings.push('No satellite heat value is available in the built-in demo data, so this heat level is made up.')
  }
  if (b.flats < 1 || b.storeys < 1) throw new MockApiError(400, 'A block needs at least one flat and one storey.')

  const perStorey = b.flats / b.storeys
  const topCount = b.storeys > 1 ? Math.max(1, Math.min(b.flats - 1, Math.round(perStorey))) : b.flats
  const counts: Counts = { top: topCount, lower: b.flats - topCount }
  const ctx: Ctx = { anomaly: b.heat_anomaly_c, existing, tariff, flatArea: b.flat_area_m2 }

  // gas disconnect only if the package leaves no gas appliance
  const probeTop = flatParts('top', ctx, pkg, true)
  const gasLeft = probeTop.hwMj + probeTop.heatMj + probeTop.cookMj > 0
  const effPkg: Package = { ...pkg }
  if (pkg.disconnect_gas && gasLeft) {
    effPkg.disconnect_gas = false
    warnings.push('Disconnecting gas was left out because some gas appliances stay. Replace them all and it can go ahead.')
  }
  if (!PACKAGE_KEYS.some((k) => effPkg[k])) warnings.push('No upgrades are switched on yet, so there is nothing to compare.')
  if (existing.roof === 'light' && pkg.cool_roof) warnings.push('The roof is already light, so a cool roof coating adds little.')
  if (existing.cooling === 'none' && pkg.reverse_cycle)
    warnings.push('These flats have no cooling now, so we assume people will use their new air conditioning. That uses some electricity and cuts the saving.')

  // per-group energy
  const groups: { pos: 'top' | 'lower'; count: number }[] = [{ pos: 'top', count: counts.top }]
  if (counts.lower > 0) groups.push({ pos: 'lower', count: counts.lower })

  const groupData = groups.map((g) => {
    const base = flatParts(g.pos, ctx, effPkg, false)
    const up = flatParts(g.pos, ctx, effPkg, true)
    const baseConn = gasMjOf(base) > 0
    const upConn = baseConn && !gasDisconnected(up, effPkg, true)
    return { ...g, baseParts: base, upParts: up, baseConn, upConn, baseline: profile(base, tariff, baseConn), upgraded: profile(up, tariff, upConn) }
  })

  // building bill for a hypothetical package (for per-item savings)
  const buildingSaving = (p: Package) => {
    let s = 0
    for (const g of groups) {
      const bp = flatParts(g.pos, ctx, p, false)
      const up = flatParts(g.pos, ctx, p, true)
      const baseConn = gasMjOf(bp) > 0
      const upConn = baseConn && !gasDisconnected(up, p, true)
      s += g.count * (profile(bp, tariff, baseConn).bill_per_year - profile(up, tariff, upConn).bill_per_year)
    }
    return s
  }
  const totalSaving = buildingSaving(effPkg)

  // package items
  const items: PackageItem[] = PACKAGE_KEYS.map((key) => {
    const c = itemCosts(key, b, counts, fin.apply_rebates)
    const selected = effPkg[key]
    const withIt = { ...effPkg, [key]: true }
    const withoutIt = { ...effPkg, [key]: false }
    const saving = selected ? totalSaving - buildingSaving(withoutIt) : buildingSaving(withIt) - totalSaving
    const capex = Math.round(c.capex)
    const rebate = Math.round(c.rebate)
    return {
      key,
      label: LABELS[key],
      selected,
      capex,
      rebate,
      net_capex: capex - rebate,
      applies_to: c.applies_to,
      saving_per_year: Math.round(saving),
      note: c.note,
      capex_if_selected: capex,
      rebate_if_selected: rebate,
      saving_per_year_if_selected: Math.round(saving),
    }
  })
  const sel = items.filter((i) => i.selected)
  const netCapex = sel.reduce((a, i) => a + i.net_capex, 0)
  const capexTotal = sel.reduce((a, i) => a + i.capex, 0)
  const rebatesTotal = sel.reduce((a, i) => a + i.rebate, 0)

  // allocation of net capex to flats: roof and insulation go to the top floor only
  const topOnlyNet = sel.filter((i) => itemCosts(i.key, b, counts, true).top_only).reduce((a, i) => a + i.net_capex, 0)
  const sharedNet = netCapex - topOnlyNet
  const allocPerFlat = (pos: 'top' | 'lower') => sharedNet / b.flats + (pos === 'top' ? topOnlyNet / counts.top : 0)

  const pv = pvFactor(fin.cost_of_capital, fin.term_years)
  let maxFundable = 0
  let totalMonthlyIn = 0
  const flat_groups: FlatGroup[] = groupData.map((g) => {
    const savingYear = g.baseline.bill_per_year - g.upgraded.bill_per_year
    const need = (allocPerFlat(g.pos) * (1 + fin.reserve)) / pv
    const cap = Math.max(0, (fin.savings_share_to_charge * savingYear) / 12)
    const charge = netCapex > 0 ? Math.min(need, cap) : 0
    maxFundable += (g.count * charge * pv) / (1 + fin.reserve)
    totalMonthlyIn += g.count * charge
    const net = savingYear / 12 - charge
    const heatB = simulateHeat(ctx.anomaly, effPkg, existing.roof, false)
    const heatU = simulateHeat(ctx.anomaly, effPkg, existing.roof, true)
    // lower floors sit a little cooler and get no roof benefit
    const offset = g.pos === 'top' ? 0 : -1.2
    const hb = heatB.indoor.map((v) => v + offset)
    const hu = g.pos === 'top' ? heatU.indoor : hb
    const hours = (arr: number[]) => arr.filter((v) => v > 30).length
    const baseSaving = g.baseline.bill_per_year
    return {
      position: g.pos,
      label: g.pos === 'top' ? 'Top-floor flats' : 'Lower-floor flats',
      count: g.count,
      baseline: g.baseline,
      upgraded: g.upgraded,
      saving_per_year: Math.round(savingYear),
      charge_per_month: Math.round(charge * 10) / 10,
      net_saving_per_month: Math.round(net * 10) / 10,
      net_saving_pct: baseSaving > 0 ? Math.round((net * 12 * 1000) / baseSaving) / 10 : 0,
      bill_neutral: g.upgraded.bill_per_year + charge * 12 <= g.baseline.bill_per_year + 0.5,
      comfort: {
        hours_above_30c_baseline: hours(hb),
        hours_above_30c_upgraded: hours(hu),
        peak_indoor_c_baseline: Math.round(Math.max(...hb) * 10) / 10,
        peak_indoor_c_upgraded: Math.round(Math.max(...hu) * 10) / 10,
      },
    }
  })

  const fundGap = Math.max(0, netCapex - maxFundable)
  const fullyFunded = fundGap < 1
  const totalRepaid = totalMonthlyIn * 12 * fin.term_years
  const outlay = netCapex
  const returnPct = outlay > 0 ? irr(outlay, totalMonthlyIn, Math.round(fin.term_years * 12)) : 0

  // impact
  let baseElec = 0
  let upElec = 0
  let baseGas = 0
  let upGas = 0
  for (const g of groupData) {
    baseElec += g.count * g.baseline.electricity_kwh
    upElec += g.count * g.upgraded.electricity_kwh
    baseGas += g.count * g.baseline.gas_mj
    upGas += g.count * g.upgraded.gas_mj
  }
  const co2 = (baseElec - upElec) * GRID_KG_PER_KWH * 0.001 + (baseGas - upGas) * GAS_KG_PER_MJ * 0.001
  const baseEnergyMj = baseElec * 3.6 + baseGas
  const upEnergyMj = upElec * 3.6 + upGas

  // monthly (average flat)
  const monthly: MonthRow[] = MONTHS.map((label, m) => {
    let bb = 0
    let ub = 0
    for (const g of groupData) {
      bb += g.count * monthlyBill(g.baseParts, tariff, g.baseConn, m)
      ub += g.count * monthlyBill(g.upParts, tariff, g.upConn, m)
    }
    return {
      month: m + 1,
      label,
      baseline_bill: Math.round(bb / b.flats),
      upgraded_bill: Math.round(ub / b.flats),
      charge: Math.round((totalMonthlyIn / b.flats) * 10) / 10,
    }
  })

  const hb = simulateHeat(ctx.anomaly, effPkg, existing.roof, false)
  const hu = simulateHeat(ctx.anomaly, effPkg, existing.roof, true)
  const r1 = (v: number) => Math.round(v * 10) / 10

  const assumptions: Assumption[] = [
    { key: 'hot_water_litres', label: 'Hot water used per flat', value: 110, unit: 'L/day', source: 'assumption', kind: 'assumption' },
    { key: 'grid_factor', label: 'Emissions from grid electricity', value: GRID_KG_PER_KWH, unit: 'kg CO2e/kWh', source: 'https://www.dcceew.gov.au/climate-change/publications/national-greenhouse-accounts-factors', kind: 'sourced' },
    { key: 'gas_factor', label: 'Emissions from natural gas', value: GAS_KG_PER_MJ, unit: 'kg CO2e/MJ', source: 'https://www.dcceew.gov.au/climate-change/publications/national-greenhouse-accounts-factors', kind: 'sourced' },
    { key: 'elec_price', label: 'Electricity price', value: tariff.electricity_c_per_kwh, unit: 'c/kWh', source: 'https://www.aer.gov.au/', kind: 'sourced' },
    { key: 'hp_cop', label: 'Heat pump hot water efficiency', value: 3.4, unit: 'heat out per unit of electricity', source: 'assumption', kind: 'assumption' },
    { key: 'rc_cop', label: 'Reverse-cycle efficiency (heating / cooling)', value: '3.8 / 3.4', unit: '', source: 'assumption', kind: 'assumption' },
    { key: 'flat_area', label: 'Floor area per flat', value: b.flat_area_m2, unit: 'm2', source: 'assumption', kind: 'assumption' },
    { key: 'weather', label: 'Hottest week', value: 'Invented for the demo', unit: '', source: 'assumption', kind: 'assumption' },
    { key: 'cost', label: 'Install costs', value: 'Demo figures', unit: '', source: 'assumption', kind: 'assumption' },
  ]

  return {
    building: b,
    flat_groups,
    package: {
      items,
      capex_total: capexTotal,
      rebates_total: rebatesTotal,
      net_capex: netCapex,
      max_fundable_capex: Math.round(maxFundable),
      fully_funded: fullyFunded,
      funding_gap: Math.round(fundGap),
      gap_closers: { grant_needed: Math.round(fundGap), cost_of_capital_for_full_funding: null, term_years_for_full_funding: null },
    },
    finance: {
      term_years: fin.term_years,
      cost_of_capital: fin.cost_of_capital,
      savings_share_to_charge: fin.savings_share_to_charge,
      reserve: fin.reserve,
      charge_per_month_building: Math.round(totalMonthlyIn * 10) / 10,
      total_repaid: Math.round(totalRepaid),
      investor_return_pct: Math.round(returnPct * 10) / 10,
      owner_upfront_cost: 0,
      tenant_upfront_cost: 0,
    },
    impact: {
      bill_saving_per_year_building: Math.round(totalSaving),
      co2e_t_per_year_saved: r1(co2),
      gas_mj_per_year_avoided: Math.round(baseGas - upGas),
      energy_reduction_pct: baseEnergyMj > 0 ? r1(((baseEnergyMj - upEnergyMj) / baseEnergyMj) * 100) : 0,
      peak_cooling_kw_change: effPkg.reverse_cycle || effPkg.cool_roof ? -r1(0.05 * b.flats) : 0,
    },
    monthly,
    heatwave: {
      label: 'Hottest week in the weather record used',
      start: '2020-01-05T00:00',
      hours: Array.from({ length: 168 }, (_, i) => i),
      outdoor_c: hb.outdoor.map(r1),
      indoor_top_baseline_c: hb.indoor.map(r1),
      indoor_top_upgraded_c: hu.indoor.map(r1),
    },
    assumptions,
    warnings,
  }
}

export function mockPortfolio(req: PortfolioRequest): PortfolioResponse {
  if (req.building_ids.length > 50) throw new MockApiError(400, 'Please pick 50 blocks or fewer.')
  const results = req.building_ids.map((id) => {
    const r = mockAssess({ building_id: id, existing: req.existing, package: req.package, finance: req.finance, tariff: req.tariff })
    const top = r.flat_groups[0]
    return {
      building_id: id,
      label: r.building.label,
      flats: r.building.flats,
      heat_band: r.building.heat_band as HeatBand | null,
      net_capex: r.package.net_capex,
      fully_funded: r.package.fully_funded,
      funding_gap: r.package.funding_gap,
      tenant_net_saving_per_month: top.net_saving_per_month,
      co2e_t_per_year_saved: r.impact.co2e_t_per_year_saved,
    }
  })
  return {
    results,
    totals: {
      buildings: results.length,
      flats: results.reduce((a, r) => a + r.flats, 0),
      net_capex: results.reduce((a, r) => a + r.net_capex, 0),
      funding_gap: results.reduce((a, r) => a + r.funding_gap, 0),
      co2e_t_per_year_saved: Math.round(results.reduce((a, r) => a + r.co2e_t_per_year_saved, 0) * 10) / 10,
      fully_funded_count: results.filter((r) => r.fully_funded).length,
    },
  }
}
