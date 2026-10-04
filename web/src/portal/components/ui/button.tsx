// NSW Design System button (.nsw-button). Variants map onto the system's own modifiers.
import { Children, cloneElement, isValidElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { cn } from '@/portal/lib/utils'

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
export type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-sm'

const VARIANT: Record<ButtonVariant, string> = {
  default: 'nsw-button--dark',
  destructive: 'nsw-button--danger',
  outline: 'nsw-button--dark-outline-solid',
  secondary: 'nsw-button--light',
  ghost: 'nsw-button--dark-outline mw-btn-quiet',
  link: 'mw-link-button',
}

export function buttonClass(variant: ButtonVariant = 'default', size: ButtonSize = 'default', className?: string) {
  return cn(
    variant === 'link' ? undefined : 'nsw-button',
    VARIANT[variant],
    'mw-btn',
    (size === 'sm' || size === 'xs' || size === 'icon-sm') && 'nsw-button--small',
    (size === 'icon' || size === 'icon-sm') && 'mw-btn-icon',
    className,
  )
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  type,
  children,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize; asChild?: boolean }) {
  const cls = buttonClass(variant, size, className)
  if (asChild) {
    const only = Children.only(children) as ReactElement<{ className?: string }>
    if (isValidElement(only)) return cloneElement(only, { ...props, className: cn(cls, only.props.className) } as object)
  }
  return (
    <button type={type ?? 'button'} className={cls} {...props}>
      {children}
    </button>
  )
}
