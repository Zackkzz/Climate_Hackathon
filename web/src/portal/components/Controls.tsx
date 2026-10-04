// Renders the response of GET /api/government/controls without assuming its exact shape: objects become sections,
// lists become lists, true and false become "On" and "Off". Used by the Trust and security page and the IT assurance page.
import { Check, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
import { api } from '@/console/api'
import { useRes } from '@/console/useRes'
import { Gate } from './States'

const label = (k: string) => {
  const s = k.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function Value({ v, depth }: { v: unknown; depth: number }): ReactNode {
  if (v === null || v === undefined) return <span className="text-muted-foreground">Not set</span>
  if (typeof v === 'boolean')
    return v ? (
      <span className="inline-flex items-center gap-1 font-medium text-success">
        <Check className="size-4" aria-hidden="true" /> On
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 font-medium text-warning">
        <Minus className="size-4" aria-hidden="true" /> Off
      </span>
    )
  if (typeof v === 'string' || typeof v === 'number') return <span>{String(v)}</span>
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-muted-foreground">None</span>
    return (
      <ul className="list-disc space-y-0.5 pl-5">
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
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(10rem,16rem)_1fr]">
      {Object.entries(o).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{label(k)}</dt>
          <dd className="min-w-0 pb-1 sm:pb-0">
            <Value v={v} depth={depth} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ControlsView({ data }: { data: unknown }) {
  if (!data || typeof data !== 'object') return <p className="text-muted-foreground">No controls were reported.</p>
  const entries = Object.entries(data as Record<string, unknown>)
  return (
    <div className="space-y-4">
      {entries.map(([k, v]) => (
        <section key={k} className="border bg-card" aria-labelledby={`ctl-${k}`}>
          <h3 id={`ctl-${k}`} className="border-b px-4 py-2 text-base font-semibold">
            {label(k)}
          </h3>
          <div className="p-4">
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
