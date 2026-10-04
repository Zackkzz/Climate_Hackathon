// Loading placeholder: a quiet grey block (the system's own loader is used for page-level loading).
import type { HTMLAttributes } from 'react'
import { cn } from '@/portal/lib/utils'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('mw-skeleton', className)} {...props} />
}
