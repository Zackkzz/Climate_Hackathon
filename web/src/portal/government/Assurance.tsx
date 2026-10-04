import type { ColumnDef } from '@tanstack/react-table'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { api } from '@/console/api'
import { useRes } from '@/console/useRes'
import { ControlsView, NOT_CLAIMED } from '@/portal/components/Controls'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader, Panel } from '@/portal/components/PageHeader'
import { Gate } from '@/portal/components/States'
import { StatusBadge } from '@/portal/components/Status'
import type { Tone } from '@/portal/components/Status'
import { Alert, AlertDescription, AlertTitle } from '@/portal/components/ui/alert'

interface Row {
  n: number
  control: string
  where: 'Server' | 'Web app'
  status: string
  tone: Tone
  evidence: string
}

/** All keys in the controls response, flattened to "a.b.c" with their values. */
function flatten(v: unknown, path = '', out: [string, unknown][] = []): [string, unknown][] {
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) flatten(x, path ? `${path}.${k}` : k, out)
  else out.push([path, v])
  return out
}

function derive(data: unknown): Row[] {
  const flat = flatten(data)
  const find = (re: RegExp) => flat.filter(([k]) => re.test(k))
  const anyFalse = (re: RegExp) => find(re).some(([, v]) => v === false)

  const server = (n: number, control: string, re: RegExp, evidence: string, extra?: (m: [string, unknown][]) => { status: string; tone: Tone } | null): Row => {
    const m = find(re)
    if (m.length === 0) return { n, control, where: 'Server', status: 'Not reported by the server', tone: 'warn', evidence }
    const e = extra?.(m)
    if (e) return { n, control, where: 'Server', ...e, evidence }
    return { n, control, where: 'Server', status: anyFalse(re) ? 'Partly on' : 'On', tone: anyFalse(re) ? 'warn' : 'good', evidence }
  }

  const rows: Row[] = [
    server(1, 'Sessions: 12-hour limit, 30-minute idle limit, sign-out revokes', /session/i, 'Section: sessions'),
    server(2, 'Passwords: 14 characters, common-password check, hashing, lockout, rate limit', /authentication|password|lockout/i, 'Section: authentication'),
    server(3, 'Multi-factor sign-in for staff', /multi_factor|mfa|totp/i, 'Section: multi_factor', (m) => {
      const exempt = m.some(([k, v]) => /exempt/i.test(k) && v === true)
      return exempt ? { status: 'On, but demo accounts are exempt', tone: 'warn' } : null
    }),
    server(4, 'Single sign-on readiness (OIDC)', /sso|oidc/i, 'Section: sso', (m) => {
      const configured = m.find(([k]) => /configured/i.test(k))
      return configured && configured[1] === false ? { status: 'Prepared, not connected', tone: 'warn' } : null
    }),
    server(5, 'Role and organisation checks on every route, default deny', /access_control|default_deny|role_checks/i, 'Section: access_control'),
    server(6, 'Append-only, hash-chained audit log', /audit/i, 'Section: audit_log. Use Verify the chain on the audit log page.'),
    server(7, 'Security response headers', /header/i, 'Section: response_headers'),
    server(8, 'CORS limits and demo switch', /cors|demo/i, 'Sections: secrets_and_config, demo_mode', (m) => {
      const on = m.some(([k, v]) => /demo_mode_on|demo_mode$/i.test(k) && v === true)
      return on ? { status: 'Demo mode is on', tone: 'warn' } : null
    }),
    server(9, 'Input validation, upload limits, CSV formula protection', /input|validation|csv/i, 'Section: input_handling'),
    server(10, 'Privacy: data limits, access request, erasure, retention, data inventory', /privacy|inventory|retention/i, 'Sections: privacy, data_inventory'),
    server(11, 'Secrets from the environment only', /secret/i, 'Section: secrets_and_config'),
    server(12, 'security.txt, health and ready routes, request log without personal data', /operations|security_txt|health/i, 'Section: operations'),
    server(13, 'Pinned dependencies and a software bill of materials', /dependenc|sbom/i, 'Section: operations'),
    { n: 14, control: 'WCAG 2.2 AA in the web app', where: 'Web app', status: 'Built to it, not audited', tone: 'info', evidence: 'Automated axe checks and keyboard walks. No formal audit. See the accessibility statement.' },
    { n: 15, control: 'No third-party scripts, fonts or trackers', where: 'Web app', status: 'On', tone: 'good', evidence: 'Fonts and icons are bundled. The only outside request is map tiles in the block finder.' },
    { n: 16, control: 'Session timeout warning, tokens in memory and session storage only', where: 'Web app', status: 'On', tone: 'good', evidence: 'A warning shows 5 minutes before sign-out, with a way to extend. Tokens are never put in addresses.' },
    { n: 17, control: 'Privacy notice, accessibility statement and terms in every footer', where: 'Web app', status: 'On', tone: 'good', evidence: 'Footer links on every page, plus Trust and security.' },
  ]
  return rows
}

export default function Assurance() {
  const res = useRes(() => api.controls(), [])
  useEffect(() => {
    document.title = 'IT assurance | Government | Meterwise'
  }, [])
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Government', to: '/government' }, { label: 'IT assurance' }]}
        title="IT assurance"
        description={
          <>
            What security and privacy controls this running system has switched on, read live from the server. The public version is on the <Link to="/trust">Trust and security</Link> page.
          </>
        }
      />
      <Gate res={res} rows={6}>
        {(data) => <Body data={data} />}
      </Gate>
    </>
  )
}

function Body({ data }: { data: unknown }) {
  const rows = derive(data)
  const cols: ColumnDef<Row>[] = [
    { accessorKey: 'n', header: 'No.', meta: { numeric: true } },
    { accessorKey: 'control', header: 'Control', meta: { label: 'Control' } },
    { accessorKey: 'where', header: 'Where', meta: { label: 'Where' } },
    { accessorKey: 'status', header: 'Status', meta: { label: 'Status' }, cell: ({ row }) => <StatusBadge tone={row.original.tone}>{row.original.status}</StatusBadge> },
    { accessorKey: 'evidence', header: 'Evidence', meta: { label: 'Evidence' } },
  ]
  const demo = flatten(data).some(([k, v]) => /demo_mode_on|demo_mode$/i.test(k) && v === true)
  return (
    <div className="space-y-4">
      {demo && (
        <Alert role="status">
          <AlertTitle>Demo mode is on</AlertTitle>
          <AlertDescription>Demo accounts skip the second sign-in step, and a demo clock and reset exist. A real deployment turns these off. Do not use this system for real data.</AlertDescription>
        </Alert>
      )}
      <DataTable columns={cols} data={rows} caption="Controls and their status" csvName="it-assurance-controls" searchPlaceholder="Search controls" pageSize={25} getRowId={(r) => String(r.n)} />
      <Panel title="What is not claimed" description="Whatever the controls above say, this prototype does not have the following.">
        <ul className="list-disc space-y-1 pl-5">
          {NOT_CLAIMED.map((n) => (
            <li key={n}>No {n.charAt(0).toLowerCase() + n.slice(1)}</li>
          ))}
        </ul>
        <p className="mt-2 text-muted-foreground">Building to a requirement is not the same as being assessed against it. The evidence column says what has been checked and how.</p>
      </Panel>
      <section aria-labelledby="raw-h">
        <h2 id="raw-h" className="mb-2 text-base font-semibold">
          Full list from the server
        </h2>
        <ControlsView data={data} />
      </section>
    </div>
  )
}

