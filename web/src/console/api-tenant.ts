import { http } from './api'
import { consentApi } from './consent'
import type { Fault, Flat } from './types'

export const tenantApi = {
  dataConsent: consentApi.get,
  setDataConsent: consentApi.set,
  flatConsent: (flatId: number, consent: 'agreed' | 'declined') => http.post<Flat>(`/api/programme/flats/${flatId}/consent`, { consent }),
  reportFault: (flatId: number, item: string, description: string) => http.post<Fault>(`/api/programme/flats/${flatId}/faults`, { item, description }),
}
