import type { ColumnDef } from '@tanstack/react-table'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { api } from '@/console/api'
import { useRes } from '@/console/useRes'
import { ControlsView, readControls } from '@/portal/components/Controls'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader } from '@/portal/components/PageHeader'
import { Gate } from '@/portal/components/States'
import { StatusBadge } from '@/portal/components/Status'
import type { Tone } from '@/portal/components/Status'

interface Row {
  n: number
  control: string
  where: 'Server' | 'Web app'
  status: string
  tone: Tone
  evidence: string
}

function derive(data: unknown): Row[] {
  const byKey = new Map(readControls(data).controls.map((c) => [c.key, c]))
  const server = (n: number, control: string, key: string, evidence: string): Row => {
    const c = byKey.get(key)
    if (!c) return { n, control, where: 'Server', status: 'Not reported by the server', tone: 'warn', evidence }
    return { n, control, where: 'Server', status: c.on ? 'In place' : 'Not connected', tone: c.on ? 'good' : 'neutral', evidence: c.text || evidence }
  }
  return [
    server(1, 'Sessions: 12-hour limit, 30-minute idle limit, sign-out revokes', 'sessions', 'Reported by the server.'),
    server(2, 'Passwords: length, common-password check, hashing, lockout, rate limit', 'passwords', 'Reported by the server.'),
    server(3, 'Two-step sign-in for staff', 'mfa', 'Reported by the server.'),
    server(4, 'Single sign-on (OpenID Connect)', 'sso', 'Reported by the server.'),
    server(5, 'Role and organisation checks on every route, default deny', 'access_control', 'Reported by the server.'),
    server(6, 'Append-only, hash-chained audit log', 'audit_log', 'Use Verify the chain on the audit log page.'),
    server(7, 'Security response headers', 'headers', 'Reported by the server.'),
    server(8, 'Cross-origin limits', 'cors', 'Reported by the server.'),
    server(9, 'Input validation, upload limits, CSV formula protection', 'validation', 'Reported by the server.'),
    server(10, 'Privacy: data limits, access request, erasure, retention', 'privacy', 'Reported by the server.'),
    server(11, 'Secrets from the environment only', 'secrets', 'Reported by the server.'),
    server(12, 'security.txt, health and ready routes, request log without personal data', 'operations', 'Reported by the server.'),
    server(13, 'Pinned dependencies and a software bill of materials', 'supply_chain', 'Reported by the server.'),
    { n: 14, control: 'WCAG 2.2 AA in the web app', where: 'Web app', status: 'Built to it', tone: 'good', evidence: 'Automated axe checks and keyboard walkthroughs on each release. See the accessibility statement for known limitations.' },
    { n: 15, control: 'No third-party scripts, fonts or trackers', where: 'Web app', status: 'In place', tone: 'good', evidence: 'Fonts and icons are bundled. The only outside request is map tiles in the block finder.' },
    { n: 16, control: 'Session timeout warning, tokens in memory and session storage only', where: 'Web app', status: 'In place', tone: 'good', evidence: 'A warning shows 5 minutes before sign-out, with a way to extend. Tokens are never put in addresses.' },
    { n: 17, control: 'Privacy notice, accessibility statement and terms in every footer', where: 'Web app', status: 'In place', tone: 'good', evidence: 'Footer links on every page, plus Trust and security.' },
  ]
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
            The security and privacy controls in place on this system, read live from the server. The public version is on the <Link to="/trust">Trust and security</Link> page.
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
  return (
    <div className="space-y-4">
      <DataTable columns={cols} data={rows} caption="Controls and their status" csvName="it-assurance-controls" searchPlaceholder="Search controls" pageSize={25} getRowId={(r) => String(r.n)} />
      <section aria-labelledby="raw-h">
        <h2 id="raw-h" className="mb-2 text-base font-semibold">
          Controls as reported by the server
        </h2>
        <ControlsView data={data} />
      </section>
    </div>
  )
}

