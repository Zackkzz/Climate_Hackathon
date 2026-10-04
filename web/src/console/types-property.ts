// Property portal types (docs/portals-contract.md, property routes and data consent).
import type { OrgRef, Project, ProjectDetail } from './types'

export interface PropertyAction {
  project_id: number
  label: string
  kind: string
  text: string
}
export interface PropertySummary {
  org: OrgRef
  blocks: Project[]
  actions: PropertyAction[]
  charges: { month: string; flats_active: number; billed: number; collected: number; arrears: number }
  faults_open: number
  consent_pending: number
}
export type { DataConsent } from './consent'
export interface Resolution {
  meeting_date: string
  votes_for: number
  votes_against: number
  kind: 'ordinary'
}
export type PropertyProject = ProjectDetail & { resolution?: Resolution | null }
export interface Enquiry {
  id: number
  name: string
  email: string
  phone?: string
  org_kind: string
  address: string
  flats: number
  message?: string
  created_on: string
  status: 'new' | 'converted'
  project_id?: number | null
}
export interface PersonalData {
  flat_id: number
  unit: string
  tenant_name: string | null
  tenancy_start: string
  meter_id: string
  ledger_entries: number
  readings: number
  data_consent: unknown
  generated_on: string
}
