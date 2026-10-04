import { api } from '@/console/api'
import type { ProjectDetail, Role } from '@/console/types'

export interface TabProps {
  p: ProjectDetail
  role: Role
  onChange: (p: ProjectDetail) => void
}

/** Fetch the project again and hand it to the page. Used after any change made below the project level. */
export async function refetch({ p, onChange }: TabProps) {
  onChange(await api.project(p.id))
}

export const canManage = (role: Role) => role === 'manager'
export const canEdit = (role: Role) => role === 'manager' || role === 'owner'

export const CONSENT_LABEL = { pending: 'Waiting', agreed: 'Agreed', declined: 'Declined' } as const
export const CHARGE_LABEL = { not_started: 'Not started', active: 'Active', paused: 'Paused', ended: 'Ended' } as const

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
export const dateText = (label: string) => `${label} must be a date like 2027-03-15.`
