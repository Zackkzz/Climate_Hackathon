// NSW Design System progress indicator (.nsw-progress-indicator), with role="progressbar".
import type { HTMLAttributes } from 'react'
import { cn } from '@/portal/lib/utils'

export function Progress({ value = 0, className, ...props }: HTMLAttributes<HTMLDivElement> & { value?: number }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} className={cn('nsw-progress-indicator', className)} {...props}>
      <div className="nsw-progress-indicator__bar" style={{ width: `${v}%` }} />
    </div>
  )
}
