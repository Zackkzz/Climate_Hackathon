// Types used by the project page that are not in the programme contract's main object list.
export type { DataConsent } from './consent'
export interface OwnerConsentBody {
  signed: true
  name: string
  resolution?: { meeting_date: string; votes_for: number; votes_against: number; kind: 'ordinary' }
}
