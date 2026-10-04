// A menu button. The design system has no menu component (its popover and utility list are for other jobs), so this is a
// small WAI-ARIA menu button pattern in React: the trigger has aria-haspopup="menu" and aria-expanded; the menu has
// role="menu" with menuitem and menuitemcheckbox children; Up, Down, Home, End move, Escape closes and returns focus,
// Tab or a click outside closes. Styling is local (see mw-menu in utilities.css) and uses the system's tokens.
import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useId, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { cn } from '@/portal/lib/utils'

const Ctx = createContext<{ open: boolean; setOpen: (o: boolean) => void; menuId: string; btn: React.RefObject<HTMLElement | null> } | null>(null)

export function DropdownMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const menuId = useId().replace(/:/g, '')
  const btn = useRef<HTMLElement | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  return (
    <Ctx.Provider value={{ open, setOpen, menuId, btn }}>
      <div className="mw-menu-root" ref={root}>
        {children}
      </div>
    </Ctx.Provider>
  )
}

export function DropdownMenuTrigger({ children }: { asChild?: boolean; children: ReactNode }) {
  const c = useContext(Ctx)!
  const only = Children.only(children) as ReactElement<Record<string, unknown>>
  if (!isValidElement(only)) return <>{children}</>
  return cloneElement(only, {
    ref: c.btn,
    'aria-haspopup': 'menu',
    'aria-expanded': c.open,
    'aria-controls': c.open ? c.menuId : undefined,
    onClick: () => c.setOpen(!c.open),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        c.setOpen(true)
      }
    },
  } as object)
}

export function DropdownMenuContent({ children, align = 'start', className }: { children: ReactNode; align?: 'start' | 'end'; className?: string }) {
  const c = useContext(Ctx)!
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (c.open) ref.current?.querySelector<HTMLElement>('[role^=menuitem]')?.focus()
  }, [c.open])
  if (!c.open) return null
  const close = () => {
    c.setOpen(false)
    c.btn.current?.focus()
  }
  const onKey = (e: React.KeyboardEvent) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [])
    const i = items.findIndex((x) => x === document.activeElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(i + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(i - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1]?.focus()
    } else if (e.key === 'Tab') c.setOpen(false)
  }
  return (
    <div id={c.menuId} ref={ref} role="menu" className={cn('mw-menu', align === 'end' && 'mw-menu--end', className)} onKeyDown={onKey}>
      <MenuClose.Provider value={close}>{children}</MenuClose.Provider>
    </div>
  )
}
const MenuClose = createContext<() => void>(() => {})

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <div className="mw-menu__label">{children}</div>
}
export function DropdownMenuSeparator() {
  return <hr className="mw-menu__sep" />
}
export function DropdownMenuItem({ children, onSelect }: { children: ReactNode; onSelect?: (e: Event) => void }) {
  const close = useContext(MenuClose)
  return (
    <button
      type="button"
      role="menuitem"
      className="mw-menu__item"
      onClick={(e) => {
        const ev = e.nativeEvent
        onSelect?.(ev)
        if (!ev.defaultPrevented) close()
      }}
    >
      {children}
    </button>
  )
}
export function DropdownMenuCheckboxItem({ children, checked, onCheckedChange, onSelect }: { children: ReactNode; checked: boolean; onCheckedChange?: (v: boolean) => void; onSelect?: (e: Event) => void }) {
  const close = useContext(MenuClose)
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      className="mw-menu__item"
      onClick={(e) => {
        const ev = e.nativeEvent
        onSelect?.(ev)
        onCheckedChange?.(!checked)
        if (!ev.defaultPrevented) close()
      }}
    >
      <span className="material-icons nsw-material-icons mw-icon" aria-hidden="true">
        {checked ? 'check_box' : 'check_box_outline_blank'}
      </span>
      {children}
    </button>
  )
}
