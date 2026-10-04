import type { ColumnDef } from '@tanstack/react-table'
import { ShieldCheck } from '@/portal/components/icons'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { govApi } from '@/console/api-gov'
import type { AuditLogEntry } from '@/console/types'
import type { AuditVerify } from '@/console/types-gov'
import { useRes } from '@/console/useRes'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader } from '@/portal/components/PageHeader'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { Alert, AlertDescription, AlertTitle } from '@/portal/components/ui/alert'
import { Button } from '@/portal/components/ui/button'
import { useAction } from '@/portal/lib/actions'

type Row = AuditLogEntry & { hash?: string }

function VerifyResult({ v }: { v: AuditVerify }) {
  const bad = v.broken_at ?? v.first_bad
  const ok = v.valid ?? v.ok ?? bad == null
  const n = v.entries ?? v.checked
  return (
    <Alert variant={ok ? 'default' : 'destructive'} role="status" className="mw-mb-3">
      <ShieldCheck aria-hidden="true" />
      <AlertTitle>{ok ? 'The audit log chain is intact' : 'The audit log chain is broken'}</AlertTitle>
      <AlertDescription>
        {ok ? `${n ?? 'All'} entries were checked. Each one carries the hash of the one before, and none has been changed or removed.` : `The chain breaks at entry ${bad ?? 'unknown'}. Entries from there on cannot be trusted. Report this to your security contact.`}
        {(v.detail ?? v.message) && <span> {v.detail ?? v.message}</span>}
      </AlertDescription>
    </Alert>
  )
}

export default function AuditLog() {
  const res = useRes(() => govApi.auditLog(1000), [])
  const verify = useAction()
  const [result, setResult] = useState<AuditVerify | null>(null)
  const [role, setRole] = useState('all')
  useEffect(() => {
    document.title = 'Audit log | Government | Meterwise'
  }, [])

  const cols = useMemo<ColumnDef<Row>[]>(
    () => [
      { accessorKey: 'at', header: 'When', meta: { label: 'When' }, cell: (c) => <span className="nsw-text-nowrap">{c.getValue<string>().replace('T', ' ').replace('Z', '')}</span> },
      { accessorKey: 'by', header: 'Who', meta: { label: 'Who' } },
      { accessorKey: 'role', header: 'Role', meta: { label: 'Role' } },
      { accessorKey: 'action', header: 'Action', meta: { label: 'Action' }, cell: (c) => c.getValue<string>().replace(/_/g, ' ') },
      { accessorKey: 'project_id', header: 'Project', meta: { label: 'Project', csv: (r) => r.project_id ?? '' }, cell: (c) => (c.getValue<number | null>() ? <Link to={`/government/projects/${c.getValue<number>()}`}>Project {c.getValue<number>()}</Link> : '-') },
      { accessorKey: 'detail', header: 'Detail', meta: { label: 'Detail' } },
      { accessorKey: 'hash', header: 'Hash', meta: { label: 'Hash', csv: (r) => r.hash ?? '' }, cell: (c) => <code className="nsw-small">{(c.getValue<string | undefined>() ?? '').slice(0, 10)}</code> },
    ],
    [],
  )

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Government', to: '/government' }, { label: 'Audit log' }]}
        title="Audit log"
        description="A record of sign-ins, reads of tenant data, exports and every change. Newest first. Each entry carries the hash of the one before it."
        actions={
          <Button
            disabled={verify.busy}
            onClick={async () => {
              const r = await verify.run(() => govApi.verifyAudit())
              if (r) setResult(r)
            }}
          >
            <ShieldCheck aria-hidden="true" /> {verify.busy ? 'Checking' : 'Verify the chain'}
          </Button>
        }
      />
      <ErrorAlert error={verify.error} title="We could not verify the chain" />
      {result && <VerifyResult v={result} />}
      {res.data === null && res.error && /cannot use this|access/i.test(res.error) ? (
        <p className="mw-border nsw-fill-white mw-p-4 mw-text-muted">Your role can check that the log has not been changed, but cannot read individual entries. Use the button above.</p>
      ) : (
      <Gate res={res} rows={8}>
        {(rows) => {
          const roles = [...new Set(rows.map((r) => r.role))]
          const shown = role === 'all' ? rows : rows.filter((r) => r.role === role)
          return (
            <DataTable
              columns={cols}
              data={shown as Row[]}
              caption="Audit log"
              csvName="audit-log"
              pageSize={50}
              searchPlaceholder="Search the audit log"
              emptyTitle="No entries yet"
              filters={
                <div className="nsw-display-flex nsw-align-items-center mw-gap-2">
                  <label htmlFor="al-role" className="nsw-small mw-text-muted">
                    Role
                  </label>
                  <select id="al-role" className="mw-h-9 mw-border mw-border-strong nsw-fill-white mw-px-2" value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="all">All roles</option>
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              }
            />
          )
        }}
      </Gate>
      )}
    </>
  )
}
