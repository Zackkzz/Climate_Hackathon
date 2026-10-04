import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Circle, Clock, Info } from '@/portal/components/icons'
import { Badge } from '@/portal/components/ui/badge'
import type { BadgeTone } from '@/portal/components/ui/badge'
import type { Stage } from '@/console/types'

export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'info'
const LABEL: Record<Tone, string> = { good: 'success', warn: 'warning', bad: 'error', neutral: 'neutral', info: 'info' }
const ICON = { good: CheckCircle2, warn: Clock, bad: AlertCircle, neutral: Circle, info: Info }

/** A status label (.nsw-status-label) with an icon and words, so it never relies on colour alone. */
export function StatusBadge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const I = ICON[tone]
  return (
    <Badge tone={LABEL[tone] as BadgeTone} className="mw-status">
      <I className="mw-icon--inline" />
      {children}
    </Badge>
  )
}

export const STAGE_LABEL: Record<Stage, string> = {
  screened: 'Screened',
  audit: 'Site check',
  offer: 'Offer',
  consent: 'Consent',
  procurement: 'Quotes',
  installation: 'Installation',
  commissioned: 'Commissioned',
  active: 'Active',
  closed: 'Closed',
}
const STAGE_TONE: Record<Stage, Tone> = { screened: 'neutral', audit: 'info', offer: 'info', consent: 'warn', procurement: 'info', installation: 'info', commissioned: 'good', active: 'good', closed: 'neutral' }
export function StageBadge({ stage }: { stage: Stage }) {
  return <StatusBadge tone={STAGE_TONE[stage] ?? 'neutral'}>{STAGE_LABEL[stage] ?? stage}</StatusBadge>
}

/** Marks organisations and people that are made up for the demo. */
export function ExampleBadge({ children = 'Example' }: { children?: ReactNode }) {
  return (
    <Badge tone="outline" title="Made up for the demo">
      {children}
    </Badge>
  )
}
/** Marks data that comes from a simulator, not a real meter. */
export function SimulatedBadge({ label = 'Simulated' }: { label?: string }) {
  return (
    <Badge tone="outline" title="From a simulator, not a real meter">
      {label}
    </Badge>
  )
}
