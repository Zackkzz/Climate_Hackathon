// Renders the response of GET /api/government/controls without assuming its exact shape: objects become sections,
// lists become lists, true and false become "On" and "Off". Used by the Trust and security page and the IT assurance page.
import { Check, Minus } from '@/portal/components/icons'
import type { ReactNode } from 'react'
import { api } from '@/console/api'
import { useRes } from '@/console/useRes'
import { Gate } from './States'

const label = (k: string) => {
  const s = k.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function Value({ v, depth }: { v: unknown; depth: number }): ReactNode {
  if (v === null || v === undefined) return <span className="mw-text-muted">Not set</span>
  if (typeof v === 'boolean')
    return v ? (
      <span className="nsw-display-inline-flex nsw-align-items-center mw-gap-1 nsw-text-medium mw-text-success">
        <Check /> On
      </span>
    ) : (
      <span className="nsw-display-inline-flex nsw-align-items-center mw-gap-1 nsw-text-medium mw-text-warning">
        <Minus /> Off
      </span>
    )
  if (typeof v === 'string' || typeof v === 'number') return <span>{String(v)}</span>
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="mw-text-muted">None</span>
    return (
      <ul className="mw-list">
        {v.map((x, i) => (
          <li key={i}>{typeof x === 'object' && x !== null ? <Obj o={x as Record<string, unknown>} depth={depth + 1} /> : <Value v={x} depth={depth + 1} />}</li>
        ))}
      </ul>
    )
  }
  return <Obj o={v as Record<string, unknown>} depth={depth + 1} />
}

function Obj({ o, depth }: { o: Record<string, unknown>; depth: number }) {
  return (
    <dl className="mw-facts mw-facts--wide">
      {Object.entries(o).map(([k, v]) => (
        <div key={k} className="mw-contents">
          <dt className="mw-text-muted">{label(k)}</dt>
          <dd>
            <Value v={v} depth={depth} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ControlsView({ data }: { data: unknown }) {
  if (!data || typeof data !== 'object') return <p className="mw-text-muted">No controls were reported.</p>
  const entries = Object.entries(data as Record<string, unknown>)
  return (
    <div className="mw-space-y-4">
      {entries.map(([k, v]) => (
        <section key={k} className="mw-panel" aria-labelledby={`ctl-${k}`}>
          <h3 id={`ctl-${k}`} className="mw-panel__head nsw-h5">
            {label(k)}
          </h3>
          <div className="mw-panel__body">
            <Value v={v} depth={0} />
          </div>
        </section>
      ))}
    </div>
  )
}

/** Loads and shows the live controls. */
export function LiveControls() {
  const res = useRes(() => api.controls(), [])
  return <Gate res={res}>{(d) => <ControlsView data={d} />}</Gate>
}

/** What this prototype does not claim. Always shown, whatever the server says. */
export const NOT_CLAIMED = [
  'ISO/IEC 27001 certification',
  'SOC 2 report',
  'IRAP assessment of Meterwise or its hosting',
  'An independent penetration test',
  'A formal accessibility audit against WCAG 2.2 by an accredited auditor',
  'Essential Eight maturity assessment',
  'Accreditation under the Consumer Data Right',
  'Connection to a real identity provider (single sign-on is prepared, not connected)',
]
