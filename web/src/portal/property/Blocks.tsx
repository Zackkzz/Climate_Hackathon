import type { ColumnDef } from '@tanstack/react-table'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { propertyApi } from '@/console/api-property'
import type { Project } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money } from '@/format'
import { DataTable } from '@/portal/components/DataTable'
import { Gate } from '@/portal/components/States'
import { PageHeader } from '@/portal/components/PageHeader'
import { STAGE_LABEL, StageBadge, StatusBadge } from '@/portal/components/Status'

const FLAG: Record<string, string> = { charge_paused: 'Charge paused', true_up_due: 'Charge check due' }

const cols: ColumnDef<Project>[] = [
  { accessorKey: 'label', header: 'Block', cell: ({ row }) => <Link to={`/property/blocks/${row.original.id}`}>{row.original.label}</Link> },
  { accessorKey: 'stage', header: 'Stage', cell: ({ row }) => <StageBadge stage={row.original.stage} />, meta: { csv: (r) => STAGE_LABEL[r.stage] } },
  { accessorKey: 'flats', header: 'Flats', meta: { numeric: true } },
  { accessorKey: 'next_step', header: 'Next step' },
  {
    id: 'blocked',
    header: 'Blocked by',
    accessorFn: (r) => r.blocked_by.join('; '),
    cell: ({ row }) => (row.original.blocked_by.length ? <ul className="mw-list-disc mw-pl-4">{row.original.blocked_by.map((b, i) => <li key={i}>{b}</li>)}</ul> : ''),
    meta: { label: 'Blocked by' },
  },
  {
    id: 'flags',
    header: 'Flags',
    accessorFn: (r) => r.flags.map((f) => FLAG[f] ?? f).join('; '),
    cell: ({ row }) => (
      <span className="nsw-display-flex nsw-flex-wrap mw-gap-1">
        {row.original.flags.map((f) => (
          <StatusBadge key={f} tone="warn">
            {FLAG[f] ?? f.replace(/_/g, ' ')}
          </StatusBadge>
        ))}
      </span>
    ),
    meta: { label: 'Flags' },
  },
  { id: 'charge', header: 'Charge a month (block)', accessorFn: (r) => r.summary.charge_per_month_building, cell: ({ row }) => money(row.original.summary.charge_per_month_building), meta: { numeric: true, label: 'Charge a month (block)' } },
]

export default function Blocks() {
  useEffect(() => {
    document.title = 'My blocks | Property | Meterwise'
  }, [])
  const res = useRes(() => propertyApi.summary(), [])
  return (
    <>
      <PageHeader crumbs={[{ label: 'Property', to: '/property' }, { label: 'My blocks' }]} title="My blocks" description="Every block your organisation owns that is in the programme." />
      <Gate res={res}>
        {(s) => <DataTable columns={cols} data={s.blocks} caption="My blocks" csvName="meterwise-my-blocks" searchPlaceholder="Search blocks" emptyTitle="No blocks yet" emptyText="Blocks appear here once an enquiry has become a project." getRowId={(r) => String(r.id)} />}
      </Gate>
    </>
  )
}
