// What the upgrade physically changes in a block: the roof, the ceiling and the equipment before and after, and the
// modelled figures shown beside each change. The before/after rules follow the engine (assess.py, equipment_pair).
import { money, num } from './format'
import type { AssessResponse, Existing, FlatGroup, Package } from './types'

export type RoofFinish = 'dark' | 'light' | 'cool'
export type Side = 'now' | 'after'

/** What is in the block on one side of the comparison. Equipment keys follow the API options. */
export interface BlockState {
  roof: RoofFinish
  insulated: boolean
  /** gas_storage | gas_instant | electric_storage | heat_pump */
  hotWater: string
  /** gas_heater | electric_resistive | none | reverse_cycle */
  heating: string
  /** none | old_ac | reverse_cycle */
  cooling: string
  /** gas | electric | induction */
  cooktop: string
  gasConnected: boolean
}

export function usesGas(s: BlockState): boolean {
  return s.hotWater.startsWith('gas') || s.heating === 'gas_heater' || s.cooktop === 'gas'
}

/** The block now and with the package. The gas meter only comes out when nothing is left on gas, as in the engine. */
export function blockStates(ex: Existing, pk: Package): Record<Side, BlockState> {
  const base: BlockState = { roof: ex.roof === 'light' ? 'light' : 'dark', insulated: false, hotWater: ex.hot_water, heating: ex.heating, cooling: ex.cooling, cooktop: ex.cooktop, gasConnected: false }
  const now = { ...base, gasConnected: usesGas(base) }
  const after: BlockState = {
    roof: pk.cool_roof ? 'cool' : now.roof,
    insulated: pk.ceiling_insulation,
    hotWater: pk.heat_pump_hot_water ? 'heat_pump' : now.hotWater,
    heating: pk.reverse_cycle ? 'reverse_cycle' : now.heating,
    cooling: pk.reverse_cycle ? 'reverse_cycle' : now.cooling,
    cooktop: pk.induction_cooktop ? 'induction' : now.cooktop,
    gasConnected: now.gasConnected,
  }
  if (now.gasConnected && pk.disconnect_gas && !usesGas(after)) after.gasConnected = false
  return { now, after }
}

// ---------- the roof, as the thermal model sees it ----------

/** Engine values, used when the assessment does not list them (demo data). */
const ROOF_DEFAULTS = {
  roof_absorptance_dark: 0.85,
  roof_absorptance_light: 0.45,
  roof_absorptance_cool_aged: 0.36,
  r_roof_ceiling_down: 0.74,
  r_ceiling_insulation_added: 3.5,
  cop_heat_pump_hot_water: 3,
}
type RoofKey = keyof typeof ROOF_DEFAULTS

export interface RoofModel {
  /** Share of the sun each finish absorbs. A cool roof is taken after about three years of weathering. */
  absorb: Record<RoofFinish, number>
  /** Heat resistance of the roof and ceiling for summer heat flowing down, without and with the added batts (m²K/W). */
  rDown: number
  rBatts: number
  hpCop: number
}

export function roofModel(r: AssessResponse | null): RoofModel {
  const v = (k: RoofKey) => {
    const a = r?.assumptions.find((x) => x.key === k)
    return typeof a?.value === 'number' ? a.value : ROOF_DEFAULTS[k]
  }
  const light = v('roof_absorptance_light')
  return {
    absorb: { dark: v('roof_absorptance_dark'), light, cool: Math.min(light, v('roof_absorptance_cool_aged')) },
    rDown: v('r_roof_ceiling_down'),
    rBatts: v('r_ceiling_insulation_added'),
    hpCop: v('cop_heat_pump_hot_water'),
  }
}

/**
 * Sun on the roof for one side: the share absorbed and reflected, and the heat reaching the top-floor rooms as a share
 * of the dark, uninsulated case. The model's roof term is absorptance x U, and U = 1 / R, so that ratio is exact.
 */
export function roofHeat(s: BlockState, m: RoofModel) {
  const a = m.absorb[s.roof]
  const toRoom = a / (m.rDown + (s.insulated ? m.rBatts : 0)) / (m.absorb.dark / m.rDown)
  return { absorbed: a, reflected: 1 - a, toRoom }
}

// ---------- temperatures ----------

export interface FloorTemps {
  /** Hottest indoor temperature over the year with no air conditioning running, °C. */
  top: Record<Side, number>
  lower: Record<Side, number> | null
}

const peak = (g: FlatGroup): Record<Side, number> => ({ now: g.comfort.peak_indoor_c_baseline, after: g.comfort.peak_indoor_c_upgraded })

export function floorTemps(r: AssessResponse | null): FloorTemps | null {
  const top = r?.flat_groups.find((g) => g.position === 'top')
  if (!top) return null
  const lower = r?.flat_groups.find((g) => g.position === 'lower')
  return { top: peak(top), lower: lower ? peak(lower) : null }
}

/** Wall colour for an indoor temperature: warm white when mild, deeper orange as it gets hotter. */
const TINT_STOPS: [number, [number, number, number]][] = [
  [26, [251, 247, 238]],
  [30, [253, 234, 205]],
  [34, [252, 211, 165]],
  [38, [249, 177, 128]],
  [42, [243, 141, 94]],
]
export function heatTint(t: number | null | undefined): string {
  if (t == null || !Number.isFinite(t)) return '#f4f6f8'
  const s = TINT_STOPS
  if (t <= s[0][0]) return `rgb(${s[0][1].join(',')})`
  for (let i = 1; i < s.length; i++) {
    const [t1, c1] = s[i]
    const [t0, c0] = s[i - 1]
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0)
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * f)).join(',')})`
    }
  }
  return `rgb(${s[s.length - 1][1].join(',')})`
}

// ---------- energy per flat ----------

interface Use {
  gas: number
  elec: number
}

/** Average energy a year per flat for some end uses, in kWh (gas converted from MJ). */
function avgUse(r: AssessResponse, side: 'baseline' | 'upgraded', keys: string[]): Use {
  const n = r.flat_groups.reduce((a, g) => a + g.count, 0) || 1
  const out = { gas: 0, elec: 0 }
  for (const g of r.flat_groups) {
    for (const e of g[side].by_end_use) {
      if (!keys.includes(e.key)) continue
      out.gas += (g.count * e.gas_mj) / 3.6 / n
      out.elec += (g.count * e.electricity_kwh) / n
    }
  }
  return out
}

function avgCost(r: AssessResponse, side: 'baseline' | 'upgraded', key: string): number {
  const n = r.flat_groups.reduce((a, g) => a + g.count, 0) || 1
  return r.flat_groups.reduce((a, g) => a + g.count * (g[side].by_end_use.find((e) => e.key === key)?.cost_per_year ?? 0), 0) / n
}

/** Rounded for reading: 2,965 becomes 2,970; 741 becomes 740. */
function kwh(v: number): string {
  return `${num(v >= 100 ? Math.round(v / 10) * 10 : v)} kWh`
}

function useText(u: Use): string {
  const total = u.gas + u.elec
  if (total < 0.5) return 'None'
  if (u.gas >= 0.5 && u.elec >= 0.5) return `${kwh(total)} a year, ${kwh(u.gas)} of it gas`
  return `${kwh(total)} of ${u.gas >= 0.5 ? 'gas' : 'electricity'} a year`
}

export interface EnergyPair {
  now: string
  /** Empty when the item does not change. */
  after: string
}

/** Energy per flat before and after: "2,970 kWh of gas a year" and "740 kWh of electricity a year, 75% less". */
function energyPair(before: Use, after: Use, changed: boolean): EnergyPair | null {
  const b = before.gas + before.elec
  const a = after.gas + after.elec
  if (b < 0.5 && a < 0.5) return null
  if (!changed) return { now: useText(before), after: '' }
  const pct = b > 0 ? Math.round((1 - a / b) * 100) : 0
  const diff = b < 0.5 ? '' : pct > 0 ? `, ${pct}% less` : pct < 0 ? `, ${-pct}% more` : ', about the same'
  return { now: useText(before), after: `${useText(after)}${diff}` }
}

// ---------- the change list ----------

export type ChangeKey = 'roof' | 'ceiling' | 'hot_water' | 'heat_cool' | 'cooktop' | 'gas'

export interface ChangeRow {
  key: ChangeKey
  title: string
  changed: boolean
  now: string
  after: string
  /** Modelled energy per flat before and after. Null until the assessment is in, or when the item uses none. */
  energy: EnergyPair | null
  note?: string
}

const pctOf = (x: number) => `${Math.round(x * 100)}%`

const HOT_WATER: Record<string, string> = {
  gas_storage: 'A gas storage tank for each flat.',
  gas_instant: 'A gas instantaneous heater for each flat.',
  electric_storage: 'An electric storage tank for each flat.',
  heat_pump: 'A heat pump with its own tank for each flat.',
}
const HEATING: Record<string, string> = { gas_heater: 'a gas heater', electric_resistive: 'a plug-in electric heater', none: 'no heater', reverse_cycle: 'a reverse-cycle air conditioner' }
const COOLING: Record<string, string> = { none: 'no air conditioning', old_ac: 'an old window or wall air conditioner', reverse_cycle: 'a reverse-cycle air conditioner' }
const COOKTOP: Record<string, string> = { gas: 'A gas cooktop.', electric: 'An electric coil cooktop.', induction: 'An induction cooktop.' }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const SAME = 'Stays as it is.'

function roofText(f: RoofFinish, m: RoofModel): string {
  const a = pctOf(m.absorb[f])
  if (f === 'cool') return `A reflective cool roof coating. It absorbs about ${a} of the sun once it has weathered.`
  return `A ${f === 'dark' ? 'dark' : 'light-coloured'} roof that absorbs about ${a} of the sun.`
}

function gasAfterText(s: Record<Side, BlockState>): string {
  if (!s.now.gasConnected) return SAME
  if (!s.after.gasConnected) return 'Gas meters removed, so the daily gas charge stops.'
  const left = [s.after.hotWater.startsWith('gas') && 'hot water', s.after.heating === 'gas_heater' && 'heater', s.after.cooktop === 'gas' && 'cooktop'].filter(Boolean) as string[]
  if (left.length) return `Stays connected for the ${left.join(' and ')}.`
  return 'Nothing uses gas any more, but the meters stay, so the daily gas charge goes on.'
}

/** New air conditioning adds cooling energy the flat never used; say so beside the figure. */
function withCooling(p: EnergyPair | null, added: boolean): EnergyPair | null {
  return p && added && p.after ? { ...p, after: `${p.after}, cooling included` } : p
}

export function changeRows(s: Record<Side, BlockState>, r: AssessResponse | null): ChangeRow[] {
  const m = roofModel(r)
  const { now, after } = s
  const e = (keys: string[], changed: boolean) => (r ? energyPair(avgUse(r, 'baseline', keys), avgUse(r, 'upgraded', keys), changed) : null)
  const heatCoolNow = `${cap(HEATING[now.heating] ?? now.heating)} and ${COOLING[now.cooling] ?? now.cooling}.`
  const hc = after.heating !== now.heating || after.cooling !== now.cooling
  const gasCost = r ? avgCost(r, 'baseline', 'gas_supply') : 0
  return [
    {
      key: 'roof',
      title: 'Roof',
      changed: after.roof !== now.roof,
      now: roofText(now.roof, m),
      after: after.roof !== now.roof ? roofText(after.roof, m) : SAME,
      energy: null,
      note: 'Cools the top floor only.',
    },
    {
      key: 'ceiling',
      title: 'Ceiling',
      changed: after.insulated,
      now: 'No insulation above the top-floor ceilings.',
      after: after.insulated ? `R${m.rBatts} insulation batts laid above the top-floor ceilings.` : SAME,
      energy: null,
      note: 'Helps the top floor only.',
    },
    {
      key: 'hot_water',
      title: 'Hot water',
      changed: after.hotWater !== now.hotWater,
      now: HOT_WATER[now.hotWater] ?? now.hotWater,
      after: after.hotWater !== now.hotWater ? `${HOT_WATER[after.hotWater]} It moves heat from the air into the water, about ${num(m.hpCop)} units of heat for each unit of electricity.` : SAME,
      energy: e(['hot_water'], after.hotWater !== now.hotWater),
    },
    {
      key: 'heat_cool',
      title: 'Heating and cooling',
      changed: hc,
      now: heatCoolNow,
      after: hc ? 'A reverse-cycle split system in each flat: one unit that heats in winter and cools in summer.' : SAME,
      energy: withCooling(e(['heating', 'cooling'], hc), hc && now.cooling === 'none'),
    },
    {
      key: 'cooktop',
      title: 'Cooktop',
      changed: after.cooktop !== now.cooktop,
      now: COOKTOP[now.cooktop] ?? now.cooktop,
      after: after.cooktop !== now.cooktop ? COOKTOP[after.cooktop] : SAME,
      energy: e(['cooking'], after.cooktop !== now.cooktop),
    },
    {
      key: 'gas',
      title: 'Gas supply',
      changed: now.gasConnected !== after.gasConnected,
      now: now.gasConnected ? `A gas meter for each flat${gasCost > 0 ? `, with a daily charge of about ${money(gasCost)} a year` : ''}.` : 'No gas connection.',
      after: gasAfterText(s),
      energy: null,
    },
  ]
}
