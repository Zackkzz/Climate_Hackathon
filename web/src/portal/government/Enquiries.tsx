import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { progApi } from '@/console/api-programme'
import type { Enquiry } from '@/console/types-programme'
import { useRes } from '@/console/useRes'
import { Confirm } from '@/portal/components/Confirm'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader } from '@/portal/components/PageHeader'
import { ErrorAlert } from '@/portal/components/States'
import { StatusBadge } from '@/portal/components/Status'
import { Button } from '@/portal/components/ui/button'
import { useAction } from '@/portal/lib/actions'
import { usePageTitle } from './shared'

const KIND: Record<string, string> = { landlord: 'Landlord', strata: 'Strata committee', community_housing: 'Community housing provider' }

export default function Enquiries() {
  usePageTitle('Enquiries')
  const res = useRes(() => progApi.enquiries(), [])
  const act = useAction()
  const nav = useNavigate()

  const convert = async (e: Enquiry) => {
    const r = await act.run(() => progApi.convertEnquiry(e.id), 'Project started from the enquiry')
    if (r) {
      const id = 'project_id' in r ? r.project_id : 'id' in r ? r.id : null
      if (id) nav(`/government/projects/${id}`)
      else res.reload()
    }
  }

  const columns = useMemo<ColumnDef<Enquiry>[]>(
    () => [
      { accessorKey: 'received_on', header: 'Received', accessorFn: (e) => e.received_on ?? e.created_on ?? '' },
      { accessorKey: 'address', header: 'Block' },
      { accessorKey: 'flats', header: 'Flats', meta: { numeric: true } },
      { id: 'kind', header: 'From', accessorFn: (e) => KIND[e.org_kind] ?? e.org_kind },
      { accessorKey: 'name', header: 'Contact', cell: ({ row }) => <span>{row.original.name}<span className="block text-sm text-muted-foreground">{row.original.email}</span></span>, meta: { csv: (e: Enquiry) => `${e.name} <${e.email}>` } },
      { accessorKey: 'message', header: 'Message', cell: ({ row }) => <span className="block min-w-40 whitespace-normal">{row.original.message}</span> },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (e) => (e.project_id ? 'Project started' : e.status === 'converted' ? 'Project started' : 'New'),
        cell: ({ getValue }) => <StatusBadge tone={getValue<string>() === 'New' ? 'warn' : 'good'}>{getValue<string>()}</StatusBadge>,
      },
      {
        id: 'act',
        header: 'Action',
        enableSorting: false,
        meta: { label: 'Action', csv: () => '' },
        cell: ({ row }) =>
          row.original.project_id ? (
            <Link to={`/government/projects/${row.original.project_id}`}>Open project</Link>
          ) : (
            <Confirm title="Start a project from this enquiry?" description={<p>This starts a project on the nearest pilot building to {row.original.address}. You can change the building later in the site check.</p>} confirmLabel="Start project" onConfirm={() => convert(row.original)}>
              <Button size="sm" variant="outline" disabled={act.busy} aria-label={`Start a project for ${row.original.address}`}>
                Start project
              </Button>
            </Confirm>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [act.busy],
  )

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Enquiries' }]} title="Enquiries" description="Landlords and strata committees who have asked for their block to be considered." />
      {res.error && <ErrorAlert error={res.error} onRetry={res.reload} title="We could not load enquiries" />}
      <ErrorAlert error={act.error} title="We could not start the project" />
      <DataTable columns={columns} data={res.data ?? []} caption="Enquiries" loading={res.data === null && !res.error} getRowId={(e) => String(e.id)} csvName="enquiries" searchPlaceholder="Search enquiries" emptyTitle="No enquiries yet" emptyText="Enquiries from the public enquiry form show here." initialSort={[{ id: 'received_on', desc: true }]} />
    </div>
  )
}
