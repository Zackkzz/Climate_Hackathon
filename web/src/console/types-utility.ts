// Types for the utility routes in docs/portals-contract.md.
import type { OrgRef } from './types'

export interface MeterRow {
  meter_id: string
  project_id: number
  address: string
  position: string
  stage: string
  charge_status: string
  charge_per_month: number
  commissioned_on: string | null
  has_gas: boolean
  retailer_customer: boolean
  last_reading_month: string | null
  reading_source: string | null
}

export interface NetworkTotals {
  projects: number
  flats: number
  peak_kw_before: number
  peak_kw_after: number
  peak_kw_after_without_roof: number
  annual_kwh_change: number
  gas_mj_avoided_per_year: number
  gas_connections_removed: number
  switchboard_upgrades_likely: number
}
export interface NetworkProject {
  project_id: number
  label: string
  stage: string
  flats: number
  commissioned_on: string | null
  peak_kw_before: number
  peak_kw_after: number
  peak_kw_after_without_roof?: number
  annual_kwh_change: number
  gas_mj_avoided_per_year: number
  switchboard_upgrade_likely: boolean
}
export interface NetworkImpact {
  as_of: string
  area: string
  totals: NetworkTotals
  by_project: NetworkProject[]
  forecast: { month: string; projects_commissioning: number; added_peak_kw: number; added_annual_kwh: number }[]
  basis: string
}

export interface UtilitySummary {
  org: OrgRef
  meters: { total: number; active_charges: number; paused: number }
  billing: { month: string; to_bill: number; billed: number; remitted: number; outstanding: number }
  network: NetworkTotals
  open: { gas_disconnections: number; supply_requests: number; readings_overdue_meters: number }
}

export type GasStatus = 'requested' | 'scheduled' | 'completed' | 'cancelled'
export interface GasDisconnection {
  id: number
  project_id: number
  meters: number
  requested_on: string
  status: GasStatus
  scheduled_for: string | null
  completed_on: string | null
  note: string
  label?: string
}
export type SupplyStatus = 'open' | 'approved' | 'not_needed' | 'completed'
export interface SupplyRequest {
  id: number
  project_id: number
  kind: string
  detail: string
  status: SupplyStatus
  raised_on: string
  response: string | null
  label?: string
}

export interface ReadingsResult {
  accepted: number
  rejected: { row: number; reason: string; meter_id?: string }[]
}
export interface RemittanceResult {
  month: string
  rows?: number
  total_received?: number
  total_due?: number
  posted?: number
  mismatches: { meter_id: string; expected?: number; amount?: number; received?: number; reason: string }[]
}
