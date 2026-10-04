import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { api } from '@/console/api'
import { progApi } from '@/console/api-programme'
import { useRes } from '@/console/useRes'
import { money } from '@/format'
import { DataTable } from '@/portal/components/DataTable'
import { Figures, PageHeader } from '@/portal/components/PageHeader'
import { ErrorAlert, LoadingRows } from '@/portal/components/States'
import { StatusBadge } from '@/portal/components/Status'
import type { Tone } from '@/portal/components/Status'
import { Button } from '@/portal/components/ui/button'
import { usePageTitle } from './shared'

interface Row {
  id: string
  kind: string
  tone: Tone
  what: string
  detail: string
  to: string
  action: string
}

export default function WorkQueue() {
  usePageTitle('Work queue')
  const projects = useRes(() => api.projects(), [])
  const faults = useRes(() => api.faults({ status: 'open' }), [])
  const enquiries = useRes(() => progApi.enquiries().catch(() => []), [])
  const grants = useRes(() => progApi.grants().catch(() => []), [])

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    for (const p of projects.data ?? []) {
      if (p.stage === 'closed') continue
      const flags = p.flags.includes('true_up_due') ? 'A savings check is due. ' : ''
      if (p.blocked_by.length > 0)
        out.push({ id: `p${p.id}`, kind: 'Blocked project', tone: 'warn', what: p.label, detail: `${flags}${p.blocked_by.join(' ')}`, to: `/government/projects/${p.id}`, action: 'Open project' })
      else if (p.stage !== 'active' || flags)
        out.push({ id: `p${p.id}`, kind: 'Next step', tone: 'info', what: p.label, detail: `${flags}${p.next_step}`, to: `/government/projects/${p.id}`, action: 'Open project' })
    }
    for (const f of faults.data ?? [])
      out.push({ id: `f${f.id}`, kind: 'Open fault', tone: 'bad', what: `Project ${f.project_id}, flat ${f.flat_id}`, detail: `${f.description}${f.charge_paused ? ' The charge is paused.' : ''}`, to: '/government/faults', action: 'Go to faults' })
    for (const e of enquiries.data ?? [])
      if (!e.project_id && (e.status ?? 'new') === 'new') out.push({ id: `e${e.id}`, kind: 'New enquiry', tone: 'info', what: e.address, detail: `${e.name}, ${e.flats} flats`, to: '/government/enquiries', action: 'Review enquiry' })
    for (const g of grants.data ?? [])
      if (g.status === 'requested') out.push({ id: `g${g.id}`, kind: 'Grant requested', tone: 'warn', what: `Project ${g.project_id}`, detail: `${money(g.requested)} requested. ${g.reason}`, to: '/government/grants', action: 'Go to grants' })
    return out
  }, [projects.data, faults.data, enquiries.data, grants.data])

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { accessorKey: 'kind', header: 'Kind', cell: ({ row }) => <StatusBadge tone={row.original.tone}>{row.original.kind}</StatusBadge> },
      { accessorKey: 'what', header: 'What' },
      { accessorKey: 'detail', header: 'What needs to happen', cell: ({ row }) => <span className="mw-ws-normal">{row.original.detail}</span> },
      {
        id: 'go',
        header: 'Go to',
        enableSorting: false,
        meta: { label: 'Go to', csv: (r) => r.to },
        cell: ({ row }) => (
          <Button asChild variant="outline" size="sm">
            <Link to={row.original.to} aria-label={`${row.original.action}: ${row.original.what}`}>
              {row.original.action}
            </Link>
          </Button>
        ),
      },
    ],
    [],
  )

  const loading = projects.data === null && !projects.error
  const err = projects.error ?? faults.error
  const ps = projects.data ?? []
  const active = ps.filter((p) => p.stage === 'active').length
  const toAct = ps.filter((p) => p.blocked_by.length > 0).length

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Work queue' }]} title="Work queue" description="Everything that needs a decision or an action, with a link to where it is done." />
      {err && <ErrorAlert error={err} onRetry={() => { projects.reload(); faults.reload() }} title="We could not load the work queue" />}
      {loading ? (
        <LoadingRows label="Loading the work queue" />
      ) : (
        <>
          <Figures
            label="Summary"
            items={[
              { label: 'Items to do', value: rows.length },
              { label: 'Projects', value: ps.length },
              { label: 'Blocked projects', value: toAct, tone: toAct ? 'warn' : undefined },
              { label: 'Active projects', value: active },
              { label: 'Open faults', value: faults.data?.length ?? 0, tone: (faults.data?.length ?? 0) > 0 ? 'bad' : undefined },
              { label: 'New enquiries', value: (enquiries.data ?? []).filter((e) => !e.project_id && (e.status ?? 'new') === 'new').length },
            ]}
          />
          <DataTable columns={columns} data={rows} caption="Work queue" getRowId={(r) => r.id} searchPlaceholder="Search the work queue" csvName="work-queue" emptyTitle="Nothing needs doing" emptyText="All projects are moving and there are no open faults or enquiries." />
        </>
      )}
    </div>
  )
}
