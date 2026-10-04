import { http } from './api'
import type { Enquiry, Grant } from './types-programme'
import type { Project } from './types'

export const progApi = {
  enquiries: () => http.get<Enquiry[]>('/api/programme/enquiries'),
  convertEnquiry: (id: number) => http.post<Project | { project_id: number }>(`/api/programme/enquiries/${id}/convert`),
  grants: () => http.get<Grant[]>('/api/government/grants'),
}
