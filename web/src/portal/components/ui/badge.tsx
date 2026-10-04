// NSW Design System status label (.nsw-status-label).
import type { HTMLAttributes } from 'react'
import { cn } from '@/portal/lib/utils'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'outline'

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn('nsw-status-label', tone !== 'neutral' && tone !== 'outline' && `nsw-status-label--${tone}`, tone === 'outline' && 'mw-status-dashed', className)} {...props} />
}
