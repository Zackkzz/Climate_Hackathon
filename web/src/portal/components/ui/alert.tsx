// NSW Design System in-page alert (.nsw-in-page-alert). variant="destructive" is the error alert.
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/portal/lib/utils'

export type AlertVariant = 'default' | 'destructive' | 'warning' | 'success'
const KIND: Record<AlertVariant, { cls: string; icon: string }> = {
  default: { cls: 'info', icon: 'info' },
  destructive: { cls: 'error', icon: 'cancel' },
  warning: { cls: 'warning', icon: 'warning' },
  success: { cls: 'success', icon: 'check_circle' },
}

export function Alert({ variant = 'default', className, children, ...props }: HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant }) {
  const k = KIND[variant]
  return (
    <div className={cn('nsw-in-page-alert', `nsw-in-page-alert--${k.cls}`, className)} {...props}>
      <span className="material-icons nsw-material-icons nsw-in-page-alert__icon" aria-hidden="true">
        {k.icon}
      </span>
      <div className="nsw-in-page-alert__content">{children}</div>
    </div>
  )
}
export function AlertTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('nsw-in-page-alert__title', className)}>{children}</p>
}
export function AlertDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mw-alert-body', className)}>{children}</div>
}
