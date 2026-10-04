// NSW Design System select (.nsw-form__select): a native <select>, which gives the best keyboard and screen reader
// behaviour. The compound API of the old component (Select, SelectTrigger, SelectValue, SelectContent, SelectItem) is kept
// so pages do not change: Select collects the SelectItem elements it is given and the trigger renders the native control.
import { Children, createContext, isValidElement, useContext } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { cn } from '@/portal/lib/utils'

interface Opt {
  value: string
  label: ReactNode
  disabled?: boolean
}
const Ctx = createContext<{ value: string; onValueChange: (v: string) => void; options: Opt[]; placeholder?: string; disabled?: boolean } | null>(null)

function collect(children: ReactNode, out: Opt[], ph: { text?: string }) {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return
    const el = c as ReactElement<{ children?: ReactNode; value?: string; disabled?: boolean; placeholder?: string }>
    if (el.type === SelectItem) out.push({ value: el.props.value ?? '', label: el.props.children, disabled: el.props.disabled })
    else if (el.type === SelectValue && el.props.placeholder) ph.text = el.props.placeholder
    else if (el.props?.children) collect(el.props.children, out, ph)
  })
}

export function Select({ value, onValueChange, disabled, children }: { value?: string; onValueChange?: (v: string) => void; disabled?: boolean; children: ReactNode }) {
  const options: Opt[] = []
  const ph: { text?: string } = {}
  collect(children, options, ph)
  return <Ctx.Provider value={{ value: value ?? '', onValueChange: onValueChange ?? (() => {}), options, placeholder: ph.text, disabled }}>{children}</Ctx.Provider>
}

export function SelectTrigger({ className, id, size: _size, children: _children, ...aria }: { className?: string; id?: string; size?: string; children?: ReactNode } & Record<string, unknown>) {
  const c = useContext(Ctx)!
  const hasValue = c.options.some((o) => o.value === c.value)
  const textOf = (n: ReactNode) => (typeof n === 'string' || typeof n === 'number' ? String(n) : undefined)
  return (
    <select
      id={id}
      className={cn('nsw-form__select', className)}
      value={c.value}
      disabled={c.disabled}
      onChange={(e) => c.onValueChange(e.target.value)}
      {...(aria as Record<string, string>)}
    >
      {!hasValue && <option value="">{c.placeholder ?? 'Choose'}</option>}
      {c.options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {textOf(o.label) ?? o.value}
        </option>
      ))}
    </select>
  )
}
export function SelectValue(_p: { placeholder?: string }) {
  return null
}
export function SelectContent(_p: { children?: ReactNode }) {
  return null
}
export function SelectItem(_p: { value: string; children?: ReactNode; disabled?: boolean }) {
  return null
}
