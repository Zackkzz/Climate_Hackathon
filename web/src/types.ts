// Types for the whole API contract (docs/api-contract.md). Keep in sync with the backend.

export type HeatBand = 'cooler' | 'average' | 'warm' | 'hot' | 'hottest'
export const HEAT_BANDS: HeatBand[] = ['cooler', 'average', 'warm', 'hot', 'hottest']

export interface OptionItem {
  key: string
  label: string
}

export interface Existing {
  hot_water: string
  heating: string
  cooling: string
  cooktop: string
  roof: string
}

export type PackageKey =
  | 'cool_roof'
  | 'heat_pump_hot_water'
  | 'reverse_cycle'
  | 'induction_cooktop'
  | 'ceiling_insulation'
  | 'disconnect_gas'

export const PACKAGE_KEYS: PackageKey[] = [
  'cool_roof',
  'heat_pump_hot_water',
  'reverse_cycle',
  'induction_cooktop',
  'ceiling_insulation',
  'disconnect_gas',
]

export type Package = Record<PackageKey, boolean>

export interface Finance {
  cost_of_capital: number
  term_years: number
  savings_share_to_charge: number
  reserve: number
  apply_rebates: boolean
}

export interface Tariff {
  electricity_c_per_kwh: number
  electricity_supply_c_per_day: number
  gas_c_per_mj: number
  gas_supply_c_per_day: number
}

export interface Meta {
  pilot: {
    name: string
    description: string
    centre: { lat: number; lon: number }
    bbox: [number, number, number, number]
    building_count: number
    /** True when the backend is serving example (not real) data. */
    is_fixture?: boolean
    /** Optional heat image; the app ignores it. */
    heat_overlay?: { file: string; bounds: [number, number, number, number] }
  }
  defaults: {
    existing: Existing
    package: Package
    finance: Finance
    tariff: Tariff
  }
  options: {
    hot_water: OptionItem[]
    heating: OptionItem[]
    cooling: OptionItem[]
    cooktop: OptionItem[]
    roof: OptionItem[]
  }
  data_notes: string[]
  // Optional extras the backend may add; the app copes without them.
  credits?: { name: string; url?: string; licence?: string; used_for?: string }[]
}

export interface BuildingProps {
  id: string
  label: string
  suburb: string
  storeys: number
  storeys_source: 'osm' | 'assumed'
  flats_est: number
  footprint_m2: number
  roof_m2: number
  heat_anomaly_c: number
  heat_band: HeatBand
  renter_share: number | null
  quick_score: number
}

export type Position = [number, number]
export type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] }
export type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: Position[][][] }

export interface BuildingFeature {
  type: 'Feature'
  geometry: PolygonGeometry | MultiPolygonGeometry
  properties: BuildingProps
}

export interface BuildingCollection {
  type: 'FeatureCollection'
  features: BuildingFeature[]
}

// ---- satellite heat for a spot on the map (GET /api/heat) ----
export interface HeatLookup {
  heat_anomaly_c: number
  heat_band: HeatBand
  site_lst_c: number
  area_median_lst_c: number
  scene_count: number
  first_date: string
  last_date: string
  window_km: number
  site_radius_m: number
  source: string
}

// ---- assess request ----

export interface BuildingInput {
  storeys?: number
  flats?: number
  roof_m2?: number
  flat_area_m2?: number
  lat?: number
  lon?: number
  heat_anomaly_c?: number
}

export interface AssessRequest {
  building_id?: string
  building?: BuildingInput
  existing?: Partial<Existing>
  package?: Partial<Package>
  finance?: Partial<Finance>
  tariff?: Partial<Tariff>
}

// ---- assess response ----

export interface EndUse {
  key: string
  label: string
  cost_per_year: number
  electricity_kwh: number
  gas_mj: number
}

export interface EnergyProfile {
  electricity_kwh: number
  gas_mj: number
  bill_per_year: number
  by_end_use: EndUse[]
}

export interface Comfort {
  hours_above_30c_baseline: number
  hours_above_30c_upgraded: number
  peak_indoor_c_baseline: number
  peak_indoor_c_upgraded: number
  /** Optional: describes the period the whole-period hours cover. */
  period_label?: string
  basis?: string
  /** Optional: the same hours with the flat's heating and cooling used as assumed. */
  hours_above_30c_baseline_as_used?: number
  hours_above_30c_upgraded_as_used?: number
  as_used_basis?: string
}

export interface FlatGroup {
  position: 'top' | 'lower'
  label: string
  count: number
  baseline: EnergyProfile
  upgraded: EnergyProfile
  saving_per_year: number
  charge_per_month: number
  net_saving_per_month: number
  net_saving_pct: number
  bill_neutral: boolean
  comfort: Comfort
}

export interface PackageItem {
  key: PackageKey
  label: string
  selected: boolean
  capex: number
  rebate: number
  net_capex: number
  applies_to: 'building' | 'flat' | string
  saving_per_year: number
  note: string
  /** Optional extras: cost and saving if this upgrade were switched on. */
  capex_if_selected?: number
  rebate_if_selected?: number
  saving_per_year_if_selected?: number
}

export interface PackageSummary {
  items: PackageItem[]
  capex_total: number
  rebates_total: number
  net_capex: number
  max_fundable_capex: number
  fully_funded: boolean
  funding_gap: number
  /** Optional: separate ways to close the gap, each with everything else unchanged. */
  gap_closers?: GapClosers
}

export interface GapClosers {
  grant_needed?: number | null
  cost_of_capital_for_full_funding?: number | null
  term_years_for_full_funding?: number | null
  note?: string
}

export interface FinanceResult {
  term_years: number
  cost_of_capital: number
  savings_share_to_charge: number
  reserve: number
  charge_per_month_building: number
  total_repaid: number
  /** null when nothing is lent (no upgrade selected), so there is no return to work out. */
  investor_return_pct: number | null
  owner_upfront_cost: number
  tenant_upfront_cost: number
  shortest_equipment_life_years?: number
}

export interface Impact {
  bill_saving_per_year_building: number
  co2e_t_per_year_saved: number
  gas_mj_per_year_avoided: number
  energy_reduction_pct: number
  peak_cooling_kw_change: number
  /** Optional: the block's emissions a year before and after. */
  co2e_t_per_year_baseline?: number
  co2e_t_per_year_upgraded?: number
}

export interface MonthRow {
  month: number
  label: string
  baseline_bill: number
  upgraded_bill: number
  charge: number
}

export interface Heatwave {
  label: string
  start: string
  hours: number[]
  outdoor_c: number[]
  indoor_top_baseline_c: number[]
  indoor_top_upgraded_c: number[]
}

export interface Assumption {
  key: string
  label: string
  value: number | string
  unit: string
  source: string
  kind: 'sourced' | 'assumption'
}

export interface AssessedBuilding {
  id: string | null
  label: string
  storeys: number
  flats: number
  roof_m2: number
  flat_area_m2: number
  heat_anomaly_c: number
  heat_band: HeatBand | null
}

export interface AssessResponse {
  building: AssessedBuilding
  flat_groups: FlatGroup[]
  package: PackageSummary
  finance: FinanceResult
  impact: Impact
  monthly: MonthRow[]
  heatwave: Heatwave
  assumptions: Assumption[]
  warnings: string[]
}

// ---- portfolio ----

export interface PortfolioRequest {
  building_ids: string[]
  finance?: Partial<Finance>
  package?: Partial<Package>
  existing?: Partial<Existing>
  tariff?: Partial<Tariff>
}

export interface PortfolioRow {
  building_id: string
  label: string
  flats: number
  heat_band: HeatBand | null
  net_capex: number
  fully_funded: boolean
  funding_gap: number
  tenant_net_saving_per_month: number
  co2e_t_per_year_saved: number
}

export interface PortfolioResponse {
  results: PortfolioRow[]
  totals: {
    buildings: number
    flats: number
    net_capex: number
    funding_gap: number
    co2e_t_per_year_saved: number
    fully_funded_count: number
  }
}

// ---- app state ----

/** Everything needed to reproduce a deal. This is what the share link encodes. */
export interface Deal {
  buildingId: string | null
  /** For blocks entered by hand (no building id). */
  own: { storeys: number; flats: number; roof_m2: number; flat_area_m2?: number; lat: number; lon: number } | null
  /** Corrections to a mapped block. */
  flats?: number
  storeys?: number
  existing: Existing
  package: Package
  finance: Finance
  tariff: Tariff
}
