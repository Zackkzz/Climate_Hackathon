import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/portal/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, type, ...props }, ref) {
  return <input ref={ref} type={type} className={cn('nsw-form__input', type === 'file' && 'mw-file-input', className)} {...props} />
})
