import type { LabelHTMLAttributes } from 'react'
import { cn } from '@/portal/lib/utils'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('nsw-form__label', className)} {...props} />
}
