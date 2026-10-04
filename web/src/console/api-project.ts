import { http } from './api'
import { consentApi } from './consent'
import type { OwnerConsentBody } from './types-project'
import type { ProjectDetail } from './types'

const P = '/api/programme'

export const projectApi = {
  dataConsent: consentApi.get,
  setDataConsent: consentApi.set,
  ownerConsent: (id: number, body: OwnerConsentBody) => http.post<ProjectDetail>(`${P}/projects/${id}/consent/owner`, body),
}
