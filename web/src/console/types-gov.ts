// Types for the government routes in docs/portals-contract.md.
import type { Programme } from './types'

export interface Target {
  key: string
  label: string
  target: number
  by: string
  actual: number
}
export interface AreaRow {
  area: string
  kind: string
  buildings: number
  flats_est: number
  renter_share: number
  hottest_band_buildings: number
  projects: number
  flats_upgraded: number
}
export interface Outcomes {
  as_of: string
  programme: Programme
  reach: { projects_active: number; flats_upgraded: number; households_renting_est: number; blocks_in_pipeline: number }
  money: { grant_committed: number; grant_spent: number; capital_deployed: number; repaid: number; reserve: number; cost_per_flat: number; grant_per_tonne_co2e: number }
  impact_modelled: { tenant_saving_per_year: number; co2e_t_per_year: number; gas_mj_per_year_avoided: number; energy_reduction_pct: number; top_floor_hours_above_30c_avoided: number }
  impact_verified: { projects: number; realisation_rate: number; tenant_saving_per_year: number; co2e_t_per_year: number } | null
  protections: { charges_paused_months: number; true_ups: number; refunded: number; tenants_worse_off_verified: number; complaints_open: number }
  targets: Target[]
  by_area: AreaRow[]
}
export interface BuildingPoint {
  building_id: string
  lat: number
  lon: number
  heat_band: string
  renter_share: number | null
  flats_est: number
  project_stage: string | null
}
export interface Areas {
  by_area: AreaRow[]
  buildings: BuildingPoint[]
}
export interface Grant {
  id: number
  project_id: number
  requested: number
  approved: number | null
  status: 'requested' | 'approved' | 'declined' | 'paid'
  reason: string
  requested_on: string
  decided_on: string | null
  decided_by: string | null
}
export interface DeliveryRoute {
  key: string
  name: string
  status: string
  rule_change?: string
  needs?: string
  blocks_reachable?: number
  blocks?: number
  estimate?: boolean
  note?: string
  summary?: string
  [k: string]: unknown
}
export interface AuditVerify {
  valid?: boolean
  ok?: boolean
  entries?: number
  checked?: number
  broken_at?: number | null
  first_bad?: number | null
  detail?: string
  message?: string
}
export type ReportKind = 'projects' | 'outcomes' | 'verified_savings' | 'grants' | 'charges' | 'audit_log'
