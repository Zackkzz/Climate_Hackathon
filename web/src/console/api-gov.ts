import { http, qs } from './api'
import type { AuditLogEntry } from './types'
import type { Areas, AuditVerify, DeliveryRoute, Grant, Outcomes, ReportKind, Target } from './types-gov'

export const govApi = {
  outcomes: () => http.get<Outcomes>('/api/government/outcomes'),
  setTargets: (targets: Pick<Target, 'key' | 'label' | 'target' | 'by'>[]) => http.put<unknown>('/api/government/targets', { targets }),
  areas: () => http.get<Areas>('/api/government/areas'),
  grants: () => http.get<Grant[]>('/api/government/grants'),
  requestGrant: (project_id: number, requested: number, reason: string) => http.post<Grant>('/api/government/grants', { project_id, requested, reason }),
  decideGrant: (id: number, status: 'approved' | 'declined', approved: number, note: string) => http.post<Grant>(`/api/government/grants/${id}/decide`, { approved, status, note }),
  routes: () => http.get<DeliveryRoute[] | { routes: DeliveryRoute[] }>('/api/government/routes'),
  report: async (kind: ReportKind) => (await http.send('GET', `/api/government/reports/${kind}.csv`, undefined, { raw: true })).text ?? '',
  auditLog: (limit = 500) => http.get<AuditLogEntry[]>(`/api/programme/audit-log${qs({ limit })}`),
  verifyAudit: () => http.get<AuditVerify>('/api/programme/audit-log/verify'),
}
