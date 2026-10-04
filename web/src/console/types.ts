// Types for docs/programme-contract.md and docs/analysis-contract.md.
import type { AssessRequest, AssessResponse } from '../types'

export type Role = 'manager' | 'government' | 'utility' | 'owner' | 'installer' | 'funder' | 'tenant'
export interface MfaRequired {
  mfa_required: true
  ticket: string
}
export interface OrgRef {
  id: number
  name: string
  kind?: string
  example?: boolean
}
export interface User {
  id?: number
  name: string
  email?: string
  role: Role
  org?: OrgRef | null
  flat_id?: number
  project_id?: number
}
export interface LoginResponse {
  token: string
  user: User
}
export interface TenantLoginResponse {
  token: string
  flat_id: number
  project_id: number
}
export interface DemoUser {
  role: Role
  name: string
  email?: string
  password?: string
  org?: string | OrgRef | null
  code?: string
}

export type Stage = 'screened' | 'audit' | 'offer' | 'consent' | 'procurement' | 'installation' | 'commissioned' | 'active' | 'closed'
export const STAGES: Stage[] = ['screened', 'audit', 'offer', 'consent', 'procurement', 'installation', 'commissioned', 'active', 'closed']

export interface Programme {
  id: number
  name: string
  example?: boolean
  route: 'community_housing' | 'council_rates' | 'meter_attached'
  route_status: 'usable_now' | 'needs_rule_change'
  finance: { cost_of_capital: number; term_years: number; savings_share_to_charge: number; reserve: number }
  capital_committed: number
  capital_deployed: number
  grant_pool: number
  grant_used: number
  reserve_balance: number
  repaid_to_date: number
  arrears: number
}

export interface ProjectSummary {
  net_capex: number
  funding_gap: number
  grant_allocated: number
  fully_funded: boolean
  charge_per_month_building: number
  tenant_net_saving_per_month: number
  co2e_t_per_year_saved: number
}
export interface ConsentSummary {
  owner_signed: boolean
  tenants_total: number
  tenants_agreed: number
  tenants_declined: number
  threshold: number
}
export interface Project {
  id: number
  programme_id: number
  building_id: string
  label: string
  stage: Stage
  stage_since: string
  owner_org: OrgRef
  installer_org: OrgRef | null
  flats: number
  heat_band: string
  summary: ProjectSummary
  consent: ConsentSummary
  next_step: string
  blocked_by: string[]
  flags: string[]
}

export interface AuditChange {
  field: string
  from: unknown
  to: unknown
}
export interface Audit {
  visited_on: string
  by: string
  storeys: number
  flats: number
  roof_m2: number
  roof_condition: 'sound' | 'needs_repair' | 'unsuitable'
  roof_colour: string
  existing?: Record<string, string>
  switchboard_amps: number
  hot_water_layout: 'per_flat' | 'shared'
  gas_meters: number
  notes: string
  changes?: AuditChange[]
}

export type ConsentState = 'pending' | 'agreed' | 'declined'
export interface Flat {
  id: number
  project_id: number
  unit: string
  position: 'top' | 'lower'
  meter_id: string
  tenant_name: string | null
  tenancy_start: string
  consent: ConsentState
  charge_per_month: number
  charge_status: 'not_started' | 'active' | 'paused' | 'ended'
  paused_reason: string | null
  balance_owing: number
  principal_remaining: number
  months_billed: number
  access_code?: string
}
export interface LedgerEntry {
  id: number
  flat_id: number
  month: string
  at: string
  kind: 'charge' | 'payment' | 'pause_credit' | 'true_up_refund' | 'adjustment' | 'write_off'
  amount: number
  balance_after: number
  note: string
}
export interface QuoteItem {
  key: string
  label: string
  qty: number
  unit_price: number
  total: number
}
export interface Quote {
  id: number
  project_id: number
  installer_org: OrgRef
  submitted_on: string
  valid_until: string
  items: QuoteItem[]
  total: number
  modelled_total: number
  status: 'submitted' | 'accepted' | 'declined' | 'withdrawn'
  note: string
}
export interface ChecklistItem {
  key: string
  label: string
  done: boolean
  by: string | null
  at: string | null
}
export interface WorkOrder {
  id: number
  project_id: number
  installer_org: OrgRef
  scheduled_start: string
  completed_on: string | null
  checklist: ChecklistItem[]
  warranty_years: number
}
export interface Fault {
  id: number
  flat_id: number
  project_id: number
  item: string
  description: string
  reported_by: string
  opened_on: string
  resolved_on: string | null
  status: 'open' | 'resolved'
  charge_paused: boolean
  months_paused: number
}
export interface Reading {
  month: string
  electricity_kwh: number
  gas_mj: number
  indoor_hours_above_30c: number | null
  mean_outdoor_c: number | null
  source: 'simulated' | 'uploaded' | 'utility'
}
export interface VerifyResult {
  method: string
  baseline_fit?: { r2: number; months: number }
  post_months: number
  modelled_saving_per_month: number
  verified_saving_per_month: number
  realisation_rate: number
  uncertainty_per_month: number
  confidence: string
  tenant_net_per_month: number
  bill_neutral_verified: boolean
  comfort?: { hours_above_30c_before: number; hours_above_30c_after: number }
  by_month?: { month: string; expected_baseline_cost: number; actual_cost: number; saving: number }[]
  true_up?: { action: 'none' | 'reduce_charge' | 'refund_from_reserve'; new_charge_per_month: number; refund: number; reason: string }
  flags?: string[]
}
export interface MvRun {
  id: number
  project_id: number
  run_on: string
  period: { from: string; to: string }
  source: string
  flats_verified: number
  modelled_saving_per_month: number
  verified_saving_per_month: number
  realisation_rate: number
  bill_neutral_flats: number
  true_ups: { flat_id: number; action: string; old_charge: number; new_charge: number; refund: number }[]
  reserve_drawn: number
  by_flat: { flat_id: number; unit: string; result: VerifyResult }[]
}
export interface ReserveEntry {
  id: number
  at: string
  month: string
  kind: 'contribution' | 'pause_cover' | 'true_up_refund' | 'arrears_cover' | 'grant_top_up'
  amount: number
  balance_after: number
  project_id: number | null
  note: string
}
export interface Reserve {
  balance: number
  entries: ReserveEntry[]
}
export interface Doc {
  kind: string
  title: string
  flat_id?: number
  url: string
  generated_at: string
}
export interface StageHistory {
  stage: string
  at: string
  by: string
  note: string
}

// ---- analysis ----
export interface Assumption {
  key: string
  label: string
  value: number | string
  unit: string
  source: string
  kind: 'sourced' | 'assumption'
}
export interface SizingGroup {
  position: string
  count: number
  design_cooling_kw_without_roof: number
  design_cooling_kw_with_package: number
  reduction_pct: number
  unit_kw_without_roof: number
  unit_kw_with_package: number
  unit_cost_without_roof: number
  unit_cost_with_package: number
  design_heating_kw: number
}
export interface Sizing {
  groups: SizingGroup[]
  hot_water: { system: string; units: number; kw_each: number; note: string }
  electrical: {
    per_flat_added_amps: number
    typical_supply_amps: number
    flat_supply_ok: boolean
    building_peak_kw_before: number
    building_peak_kw_after: number
    building_peak_kw_after_without_roof: number
    switchboard_upgrade_likely: boolean
    upgrade_cost_avoided: number
    note: string
    kind: string
  }
  capex_saved_by_right_sizing: number
  assumptions: Assumption[]
  warnings: string[]
}
export interface ScheduleRow {
  n: number
  month: string
  charge: number
  interest: number
  principal: number
  balance: number
}
export interface Schedule {
  term_years: number
  months: number
  start: string
  end: string
  groups: { position: string; count: number; principal_per_flat: number; charge_per_month: number; rows: ScheduleRow[] }[]
  building: { principal: number; charge_per_month: number; total_repaid: number; total_interest: number }
  reserve: { rate: number; contribution_total: number; note: string }
  cool_roof_ageing?: Record<string, unknown>
  equipment_life_check?: { key: string; life_years: number; term_years: number; ok: boolean }[]
}
export interface Pctl {
  p10: number
  p50: number
  p90: number
}
export interface Risk {
  runs: number
  seed: number
  groups: { position: string; net_saving_per_month: Pctl; prob_tenant_worse_off: number; prob_saving_below_charge: number }[]
  building: { prob_fully_funded: number; funding_gap: Pctl }
  drivers: { key: string; label: string; share_of_variance: number }[]
  inputs_varied: { key: string; label: string; low: number; high: number; distribution: string; source: string }[]
  safe_share: { savings_share_to_charge: number; meaning: string }
}
export interface Microclimate {
  building_id: string
  heat_anomaly_c: number
  heat_band: string
  air_temp_adjustment: { day_c: number; night_c: number; method: string; kind: string }
  base_weather: { source: string; year: number; grid_km: number }
  summer: {
    mean_max_c_base: number
    mean_max_c_local: number
    days_over_35_base: number
    days_over_35_local: number
    cooling_degree_hours_base: number
    cooling_degree_hours_local: number
  }
  monthly: { month: number; label: string; mean_max_c_base: number; mean_max_c_local: number }[]
  notes: string[]
}

export interface ProjectDetail extends Project {
  building: AssessResponse['building'] & Record<string, unknown>
  existing: Record<string, string>
  package: Record<string, boolean>
  finance: Record<string, number | boolean>
  tariff: Record<string, number>
  assessment: AssessResponse | null
  sizing: Sizing | null
  schedule: Schedule | null
  audit: Audit | null
  quotes: Quote[]
  work_order: WorkOrder | null
  flats_list: Flat[]
  stage_history: StageHistory[]
  mv: MvRun[]
}

export interface Overview {
  programme: Programme
  pipeline: Record<string, number>
  flats: { total: number; active_charges: number; paused: number }
  money: { deployed: number; repaid: number; interest: number; arrears: number; reserve: number; grant_used: number }
  verified: { projects: number; realisation_rate: number | null; tenant_saving_per_year: number; co2e_t_per_year: number }
  modelled: { tenant_saving_per_year: number; co2e_t_per_year: number }
  monthly: { month: string; billed: number; collected: number; paused: number; reserve_balance: number }[]
}
export interface Tender {
  project: Project
  items: { key: string; label: string; qty: number; modelled_unit_price: number }[]
  sizing: Sizing | null
  closes_on: string
}
export interface BillingRun {
  month: string
  flats_billed: number
  billed: number
  paused_flats: number
  reserve_contribution: number
}
export interface AuditLogEntry {
  at: string
  by: string
  role: string
  action: string
  project_id: number | null
  detail: string
}
export interface MyFlat {
  flat: Flat
  project: { label: string; stage: string }
  deal: {
    installed: { key: string; label: string }[]
    charge_per_month: number
    modelled_saving_per_month: number
    net_saving_per_month: number
    term_ends: string
  }
  verified: { verified_saving_per_month: number; realisation_rate: number; as_of: string } | null
  ledger: LedgerEntry[]
  faults: Fault[]
  documents: Doc[]
  protections: string[]
}
export interface ClockInfo {
  now: string
  month: string
  offset_months: number
}
export interface AdvanceResult {
  month: string
  billing_runs: number
  readings_added: number
  faults_opened: number
  faults_resolved: number
  payments: number
  mv_runs: number
}
export type Scenario = 'as_modelled' | 'mixed' | 'underperforming'

export interface PlanBody {
  building_ids?: string[]
  capital_budget: number
  grant_budget: number
  objective: 'tenant_saving' | 'co2' | 'heat_relief' | 'flats_reached'
  package?: Record<string, boolean>
  existing?: Record<string, string>
  finance?: Record<string, number | boolean>
  tariff?: Record<string, number>
  bulk?: boolean
}
export interface PlanResult {
  selected: {
    building_id: string
    label: string
    flats: number
    net_capex: number
    capital_used: number
    grant_used: number
    tenant_net_saving_per_month: number
    co2e_t_per_year_saved: number
    top_floor_hours_above_30c_avoided: number
    score: number
  }[]
  not_selected: { building_id: string; label: string; reason: string }[]
  totals: {
    buildings: number
    flats: number
    capital_used: number
    grant_used: number
    capital_left: number
    grant_left: number
    tenant_saving_per_year: number
    co2e_t_per_year_saved: number
    building_peak_kw_change: number
  }
  bulk: { applied: boolean; tiers: { item: string; units: number; discount_pct: number; kind: string }[]; capex_saved: number }
  method: string
}
export type SchedReq = AssessRequest & { start: string }
export type RiskReq = AssessRequest & { runs?: number; seed?: number }
