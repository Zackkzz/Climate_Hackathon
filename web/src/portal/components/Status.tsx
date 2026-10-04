import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Circle, Clock, Info } from 'lucide-react'
import { Badge } from '@/portal/components/ui/badge'
import type { Stage } from '@/console/types'

export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'info'
const CLS: Record<Tone, string> = {
  good: 'border-success/50 bg-success-bg text-success',
  warn: 'border-warning/50 bg-warning-bg text-warning',
  bad: 'border-destructive/50 bg-destructive/10 text-destructive',
  neutral: 'bg-muted text-foreground',
  info: 'border-primary/40 bg-accent text-accent-foreground',
}
const ICON = { good: CheckCircle2, warn: Clock, bad: AlertCircle, neutral: Circle, info: Info }

/** A status with an icon and words, so it never relies on colour alone. */
export function StatusBadge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const I = ICON[tone]
  return (
    <Badge variant="outline" className={'gap-1 rounded-sm text-sm font-medium ' + CLS[tone]}>
      <I className="size-3.5" aria-hidden="true" />
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
    <Badge variant="outline" className="rounded-sm border-dashed text-sm font-normal" title="Made up for the demo">
      {children}
    </Badge>
  )
}
/** Marks data that comes from a simulator, not a real meter. */
export function SimulatedBadge({ label = 'Simulated' }: { label?: string }) {
  return (
    <Badge variant="outline" className="rounded-sm border-dashed text-sm font-normal" title="From a simulator, not a real meter">
      {label}
    </Badge>
  )
}
