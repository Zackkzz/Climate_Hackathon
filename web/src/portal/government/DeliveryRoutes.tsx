import type { ColumnDef } from '@tanstack/react-table'
import { useEffect } from 'react'
import { govApi } from '@/console/api-gov'
import type { DeliveryRoute } from '@/console/types-gov'
import { useRes } from '@/console/useRes'
import { num } from '@/format'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader } from '@/portal/components/PageHeader'
import { Gate } from '@/portal/components/States'
import { StatusBadge } from '@/portal/components/Status'

const nameOf = (r: DeliveryRoute) => String(r.name ?? r.title ?? r.key)
const changeOf = (r: DeliveryRoute) => String(r.rule_change ?? r.needs ?? r.summary ?? '')
const reachOf = (r: DeliveryRoute): number | null => {
  const v = r.blocks_reachable ?? r.blocks
  return typeof v === 'number' ? v : null
}

const cols: ColumnDef<DeliveryRoute>[] = [
  { id: 'name', accessorFn: nameOf, header: 'Route', meta: { label: 'Route' }, cell: (c) => <span className="font-medium">{c.getValue<string>()}</span> },
  {
    id: 'status',
    accessorFn: (r) => r.status,
    header: 'Status',
    meta: { label: 'Status', csv: (r) => (r.status === 'usable_now' ? 'Can be used now' : 'Needs a rule change') },
    cell: (c) => (c.getValue<string>() === 'usable_now' ? <StatusBadge tone="good">Can be used now</StatusBadge> : <StatusBadge tone="warn">Needs a rule change</StatusBadge>),
  },
  { id: 'change', accessorFn: changeOf, header: 'What has to change', meta: { label: 'What has to change' } },
  {
    id: 'reach',
    accessorFn: reachOf,
    header: 'Pilot blocks it could reach',
    meta: { numeric: true, label: 'Pilot blocks it could reach' },
    cell: ({ row }) => {
      const v = reachOf(row.original)
      return v === null ? '-' : `${num(v)}${row.original.estimate ? ' (estimate)' : ''}`
    },
  },
  { id: 'note', accessorFn: (r) => String(r.note ?? ''), header: 'Basis', meta: { label: 'Basis' } },
]

export default function DeliveryRoutes() {
  const res = useRes(async () => {
    const r = await govApi.routes()
    return Array.isArray(r) ? r : r.routes
  }, [])
  useEffect(() => {
    document.title = 'Delivery routes | Government | Meterwise'
  }, [])
  return (
    <>
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Delivery routes' }]} title="Delivery routes" description="Three ways a charge can be collected. Only Route A can be used today. Block counts are estimates from the dataset, not a register." />
      <Gate res={res} rows={4}>
        {(rows) => <DataTable columns={cols} data={rows} caption="Delivery routes" csvName="delivery-routes" getRowId={(r) => String(r.key)} searchPlaceholder="Search routes" emptyTitle="No routes reported" />}
      </Gate>
    </>
  )
}
