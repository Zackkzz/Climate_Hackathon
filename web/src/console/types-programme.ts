// Types for the government-manager pages. Enquiries come from docs/portals-contract.md.
export interface Enquiry {
  id: number
  name: string
  email: string
  phone?: string | null
  org_kind: string
  address: string
  flats: number
  message?: string | null
  status?: string
  received_on?: string
  created_on?: string
  project_id?: number | null
}
export interface Grant {
  id: number
  project_id: number
  requested: number
  approved: number | null
  status: 'requested' | 'approved' | 'declined' | 'paid'
  reason: string
  requested_on: string
  decided_on?: string | null
  decided_by?: string | null
}
