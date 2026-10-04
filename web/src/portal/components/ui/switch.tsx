// The design system has no switch. This is a checkbox with role="switch": same keyboard behaviour, announced as on or off.
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/portal/lib/utils'

export function Switch({ checked, onCheckedChange, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked' | 'role'> & { checked?: boolean; onCheckedChange?: (v: boolean) => void }) {
  return <input type="checkbox" role="switch" className={cn('mw-switch', className)} checked={!!checked} onChange={(e) => onCheckedChange?.(e.target.checked)} {...props} />
}
