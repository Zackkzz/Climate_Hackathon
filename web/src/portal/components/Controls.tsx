// Reads GET /api/government/controls and shows the controls that are in place, in plain terms.
// Used by the Trust and security page and the IT assurance page.
import { Check, Minus } from '@/portal/components/icons'
import { api } from '@/console/api'
import { useRes } from '@/console/useRes'
import { Gate } from './States'

export interface Control {
  key: string
  title: string
  text: string
  on: boolean
}
export interface InventoryRow {
  data: string
  where: string
  who_sees: string
  purpose: string
  retention: string
}
export interface ControlsData {
  controls: Control[]
  inventory: InventoryRow[]
  retentionYears: number | null
}

const TITLES: Record<string, string> = {
  sessions: 'Sessions',
  passwords: 'Passwords',
  mfa: 'Two-step sign-in',
  sso: 'Single sign-on',
  access_control: 'Access control',
  audit_log: 'Audit log',
  headers: 'Security headers',
  cors: 'Cross-origin limits',
  validation: 'Input checks',
  privacy: 'Privacy',
  secrets: 'Secrets',
  operations: 'Operations',
  supply_chain: 'Dependencies',
}

/** Drops sentences about test set-ups, so only the controls themselves are shown. */
function clean(text: string): string {
  return text
    .split(/(?<=[.;])\s+/)
    .filter((s) => !/demo|exempt|example|METERWISE_|simulat/i.test(s))
    .join(' ')
    .trim()
}

export function readControls(raw: unknown): ControlsData {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const list = Array.isArray(o.controls) ? (o.controls as Record<string, unknown>[]) : []
  const controls = list
    .map((c) => {
      const key = String(c.key ?? '')
      return { key, title: TITLES[key] ?? key.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()), text: clean(String(c.description ?? '')), on: c.on === true }
    })
    .filter((c) => c.key && !/demo|simulat/i.test(c.key))
  const inventory = Array.isArray(o.data_inventory) ? (o.data_inventory as InventoryRow[]) : []
  return { controls, inventory, retentionYears: typeof o.retention_years === 'number' ? o.retention_years : null }
}

export function ControlsList({ data }: { data: ControlsData }) {
  if (data.controls.length === 0) return <p className="mw-text-muted">No controls were reported.</p>
  return (
    <ul className="mw-divide-y mw-border mw-bg-white">
      {data.controls.map((c) => (
        <li key={c.key} className="mw-control-row">
          <span className="nsw-text-semibold">{c.title}</span>
          <span>{c.text}</span>
          <span className={'nsw-display-inline-flex nsw-align-items-start mw-gap-1 nsw-text-medium ' + (c.on ? 'mw-text-success' : 'mw-text-muted')}>
            {c.on ? <Check /> : <Minus />}
            {c.on ? 'In place' : 'Not connected'}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function ControlsView({ data }: { data: unknown }) {
  return <ControlsList data={readControls(data)} />
}

/** Loads and shows the live controls. */
export function LiveControls() {
  const res = useRes(() => api.controls(), [])
  return <Gate res={res}>{(d) => <ControlsView data={d} />}</Gate>
}
