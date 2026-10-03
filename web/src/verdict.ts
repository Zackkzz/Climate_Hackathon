import { money, moneyApprox } from './format'
import type { AssessResponse, PackageKey } from './types'

export type Tone = 'good' | 'warn' | 'bad' | 'empty'

export interface Verdict {
  tone: Tone
  headline: string
  detail: string
  hints: string[]
}

/** Short names for use inside sentences. */
export const ITEM_SHORT: Record<PackageKey, string> = {
  cool_roof: 'cool roof',
  heat_pump_hot_water: 'heat pump hot water',
  reverse_cycle: 'reverse-cycle air conditioning',
  induction_cooktop: 'induction cooktop',
  ceiling_insulation: 'ceiling insulation',
  disconnect_gas: 'gas disconnection',
}

export const ITEM_BENEFIT: Record<PackageKey, string> = {
  cool_roof: 'Reflects the sun so top-floor flats stay cooler',
  heat_pump_hot_water: 'Hot water for about a third of the energy, no gas',
  reverse_cycle: 'One efficient unit that heats and cools',
  induction_cooktop: 'Electric cooking that is quick and easy to clean',
  ceiling_insulation: 'Keeps summer heat out and winter warmth in',
  disconnect_gas: 'Ends the fixed gas supply charge',
}

export function groupsTotal(r: AssessResponse): number {
  return r.flat_groups.reduce((a, g) => a + g.count, 0)
}

export function makeVerdict(r: AssessResponse): Verdict {
  const p = r.package
  const selected = p.items.filter((i) => i.selected)
  if (selected.length === 0) {
    return {
      tone: 'empty',
      headline: 'Switch on at least one upgrade to see the deal',
      detail: 'Start with heat pump hot water and reverse-cycle air conditioning. They save the most on the bill.',
      hints: [],
    }
  }
  const allBetterOff = r.flat_groups.every((g) => g.bill_neutral)
  const minKeep = Math.min(...r.flat_groups.map((g) => g.net_saving_per_month))
  if (p.fully_funded && allBetterOff) {
    return {
      tone: 'good',
      headline: `This deal works: every flat is better off and the upgrade is fully repaid in ${r.finance.term_years} years`,
      detail: `Each flat keeps at least ${money(minKeep)} a month and nobody pays anything upfront.`,
      hints: [],
    }
  }
  const hints: string[] = []
  if (p.funding_gap > 0) {
    const worst = selected
      .filter((i) => i.net_capex > 0)
      .map((i) => ({ i, ratio: i.saving_per_year / i.net_capex }))
      .sort((a, b) => a.ratio - b.ratio)[0]
    if (worst && worst.ratio < 0.1 && worst.i.net_capex >= p.funding_gap * 0.25) {
      hints.push(
        `Taking out the ${ITEM_SHORT[worst.i.key]} would cut ${moneyApprox(worst.i.net_capex)} from the cost and lose only about ${moneyApprox(worst.i.saving_per_year)} a year in savings.`,
      )
    }
    if (r.finance.term_years < 20) hints.push('A longer repayment period spreads the cost over more months. Try it under Advanced.')
    if (p.rebates_total === 0 && p.capex_total > 0) hints.push('Check that rebates are switched on under Advanced.')
    hints.push('A grant or cheaper money for the gap would close it.')
  }
  const ratio = p.net_capex > 0 ? p.funding_gap / p.net_capex : 0
  const detail = allBetterOff
    ? "Every flat still comes out ahead, because the monthly charge is capped. What's missing is capital for the rest."
    : 'Some flats would pay more than they do now. Change the package or the terms.'
  if (ratio <= 0.35 && allBetterOff) {
    return {
      tone: 'warn',
      headline: `Close, but ${moneyApprox(p.funding_gap)} short: the bill savings can't repay the whole package`,
      detail,
      hints: hints.slice(0, 3),
    }
  }
  return {
    tone: 'bad',
    headline: `Not yet: the bill savings can repay about ${Math.round((1 - ratio) * 100)}% of the package, ${moneyApprox(p.funding_gap)} short`,
    detail,
    hints: hints.slice(0, 3),
  }
}

export interface BalanceView {
  old: number
  energy: number
  charge: number
  keep: number
}

export type GroupSel = 'avg' | 'top' | 'lower'

/** Monthly figures for an average flat, or for one floor group. */
export function balanceFor(r: AssessResponse, sel: GroupSel): BalanceView {
  const groups = sel === 'avg' ? r.flat_groups : r.flat_groups.filter((g) => g.position === sel)
  const use = groups.length ? groups : r.flat_groups
  const w = use.reduce((a, g) => a + g.count, 0) || 1
  const avg = (f: (g: (typeof use)[number]) => number) => use.reduce((a, g) => a + g.count * f(g), 0) / w
  const old = avg((g) => g.baseline.bill_per_year) / 12
  const energy = avg((g) => g.upgraded.bill_per_year) / 12
  const charge = avg((g) => g.charge_per_month)
  return { old, energy, charge, keep: old - energy - charge }
}

export interface WeekComfort {
  peakOld: number
  peakNew: number
  hoursOld: number
  hoursNew: number
}

/** Comfort figures for the hottest week, worked out from the same hourly series the chart draws. */
export function weekComfort(r: AssessResponse): WeekComfort {
  const hw = r.heatwave
  const n = Math.min(hw.indoor_top_baseline_c.length, hw.indoor_top_upgraded_c.length)
  const old = hw.indoor_top_baseline_c.slice(0, n)
  const nw = hw.indoor_top_upgraded_c.slice(0, n)
  return {
    peakOld: n ? Math.max(...old) : 0,
    peakNew: n ? Math.max(...nw) : 0,
    hoursOld: old.filter((x) => x > 30).length,
    hoursNew: nw.filter((x) => x > 30).length,
  }
}
