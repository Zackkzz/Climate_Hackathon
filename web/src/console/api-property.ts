import { http } from './api'
import { consentApi } from './consent'
import type { Enquiry, PropertyProject, PropertySummary, Resolution } from './types-property'

const P = '/api/programme'

export const propertyApi = {
  summary: () => http.get<PropertySummary>('/api/property/summary'),
  project: (id: number) => http.get<PropertyProject>(`${P}/projects/${id}`),
  strataConsent: (id: number, name: string, resolution: Resolution) => http.post<PropertyProject>(`${P}/projects/${id}/consent/owner`, { signed: true, name, resolution }),
  dataConsent: consentApi.get,
  setDataConsent: consentApi.set,
  personalData: (flatId: number) => http.get<Record<string, unknown>>(`${P}/flats/${flatId}/personal-data`),
  erase: (flatId: number, includeCurrent = false) => http.post<{ flat_id: number; tenancies_erased: number; kept: string }>(`${P}/flats/${flatId}/personal-data/erase`, includeCurrent ? { include_current: true } : {}),
  enquiries: () => http.get<Enquiry[]>(`${P}/enquiries`),
  convertEnquiry: (id: number) => http.post<{ project_id: number }>(`${P}/enquiries/${id}/convert`),
}
