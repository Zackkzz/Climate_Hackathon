import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icons'
import { useReducedMotion } from '../hooks'

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="spinner" role="status" aria-label={label}>
      <span className="spinner-dot" />
    </span>
  )
}

export function LoadingBlock({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="state-block" role="status" aria-live="polite">
      <Spinner label={text} />
      <p>{text}</p>
    </div>
  )
}

export function ErrorBlock({ message, onRetry, title = "That didn't work" }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div className="state-block error" role="alert">
      <Icon name="alert" size={28} />
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-secondary" onClick={onRetry}>
          <Icon name="retry" size={18} /> Try again
        </button>
      )}
    </div>
  )
}

export function EmptyBlock({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state-block">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  )
}

export function DemoTag({ label = 'Demo data' }: { label?: string }) {
  return (
    <span className="demo-tag" title="The numbers on screen come from built-in demo data, not the real model.">
      {label}
    </span>
  )
}

/** Tweens a number on change unless the user prefers reduced motion. */
export function AnimatedNumber({ value, format, duration = 450 }: { value: number; format: (n: number) => string; duration?: number }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (reduced || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const e = 1 - Math.pow(1 - t, 3)
      const v = a + (value - a) * e
      from.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, reduced, duration])
  return <>{format(shown)}</>
}

export interface ChipOption {
  key: string
  label: string
}

export function ChipGroup({ legend, options, value, onChange }: { legend: string; options: ChipOption[]; value: string; onChange: (k: string) => void }) {
  return (
    <fieldset className="chip-field">
      <legend>{legend}</legend>
      <div className="chips" role="radiogroup" aria-label={legend}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={value === o.key}
            className={'chip' + (value === o.key ? ' on' : '')}
            onClick={() => onChange(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function SelectField({ label, options, value, onChange }: { label: string; options: ChipOption[]; value: string; onChange: (k: string) => void }) {
  const id = useId()
  return (
    <div className="select-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} className={value === o.key ? 'on' : ''} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function NumberStepper({ label, value, min, max, step = 1, onChange, suffix }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; suffix?: string }) {
  const id = useId()
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <div className="stepper-field">
      <label htmlFor={id}>{label}</label>
      <div className="num-stepper">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => onChange(clamp(value - step))} disabled={value <= min}>
          <Icon name="minus" size={18} />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (e.target.value !== '' && Number.isFinite(n)) onChange(clamp(Math.round(n)))
          }}
        />
        <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => onChange(clamp(value + step))} disabled={value >= max}>
          <Icon name="plus" size={18} />
        </button>
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
    </div>
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
