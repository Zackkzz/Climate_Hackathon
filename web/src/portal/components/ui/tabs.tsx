// NSW Design System tabs (.nsw-tabs). Implemented in React, not with the package's tabs script, so that tab state lives
// in the component and the panels mount and unmount with it. WAI-ARIA tabs pattern: role=tablist, role=tab with
// aria-selected and aria-controls, role=tabpanel with aria-labelledby, roving tabindex, Left/Right/Home/End keys.
import { createContext, useContext, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/portal/lib/utils'

const Ctx = createContext<{ value: string; set: (v: string) => void; base: string } | null>(null)
const tabId = (base: string, v: string) => `${base}-tab-${v}`
const panelId = (base: string, v: string) => `${base}-panel-${v}`

export function Tabs({ value, onValueChange, children, className }: { value: string; onValueChange: (v: string) => void; children: ReactNode; className?: string }) {
  const base = useId().replace(/:/g, '')
  return (
    <Ctx.Provider value={{ value, set: onValueChange, base }}>
      <div className={cn('nsw-tabs', className)}>{children}</div>
    </Ctx.Provider>
  )
}

export function TabsList({ children, className, ...rest }: { children: ReactNode; className?: string; 'aria-label'?: string }) {
  const ref = useRef<HTMLUListElement>(null)
  const onKey = (e: KeyboardEvent) => {
    const tabs = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role=tab]') ?? [])
    const i = tabs.findIndex((t) => t === document.activeElement)
    if (i < 0) return
    let n = -1
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = tabs.length - 1
    if (n >= 0) {
      e.preventDefault()
      tabs[n].focus()
      tabs[n].click()
    }
  }
  return (
    <div className={cn('nsw-tabs__list-wrapper mw-tabs-wrapper', className)}>
      <ul ref={ref} className="nsw-tabs__list" role="tablist" onKeyDown={onKey} {...rest}>
        {children}
      </ul>
    </div>
  )
}

export function TabsTrigger({ value, children, className, id, ...rest }: { value: string; children: ReactNode; className?: string; id?: string; 'aria-controls'?: string }) {
  const c = useContext(Ctx)!
  const active = c.value === value
  return (
    <li role="presentation">
      <a
        href={`#${panelId(c.base, value)}`}
        role="tab"
        id={id ?? tabId(c.base, value)}
        aria-selected={active}
        aria-controls={rest['aria-controls'] ?? panelId(c.base, value)}
        tabIndex={active ? 0 : -1}
        className={cn(active && 'active', className)}
        onClick={(e) => {
          e.preventDefault()
          c.set(value)
        }}
      >
        {children}
      </a>
    </li>
  )
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const c = useContext(Ctx)!
  if (c.value !== value) return null
  return (
    <div id={panelId(c.base, value)} role="tabpanel" aria-labelledby={tabId(c.base, value)} tabIndex={0} className={cn('nsw-tabs__content nsw-tabs__content--flush', className)}>
      {children}
    </div>
  )
}
