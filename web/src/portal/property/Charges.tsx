import type { ColumnDef } from '@tanstack/react-table'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { api } from '@/console/api'
import { propertyApi } from '@/console/api-property'
import type { Flat } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money } from '@/format'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader } from '@/portal/components/PageHeader'
import { Gate } from '@/portal/components/States'
import { ChargeBadge } from './common'
import { ExportBar } from './FlatsTab'

type Row = Flat & { block: string }

export default function Charges() {
  useEffect(() => {
    document.title = 'Charges | Property | Meterwise'
  }, [])
  const res = useRes<{ rows: Row[]; month: string }>(async () => {
    const s = await propertyApi.summary()
    const lists = await Promise.all(s.blocks.filter((b) => ['commissioned', 'active', 'closed'].includes(b.stage)).map(async (b) => (await api.flats(b.id)).map((f) => ({ ...f, block: b.label }))))
    return { rows: lists.flat(), month: s.charges.month }
  }, [])
  const cols: ColumnDef<Row>[] = [
    { accessorKey: 'block', header: 'Block', cell: ({ row }) => <Link to={`/property/blocks/${row.original.project_id}/charges`}>{row.original.block}</Link>, meta: { csv: (r) => r.block } },
    { accessorKey: 'unit', header: 'Unit' },
    { accessorKey: 'charge_per_month', header: 'Charge a month', cell: ({ row }) => money(row.original.charge_per_month), meta: { numeric: true } },
    { accessorKey: 'charge_status', header: 'Status', cell: ({ row }) => <ChargeBadge s={row.original.charge_status} />, meta: { csv: (r) => r.charge_status } },
    { accessorKey: 'months_billed', header: 'Months billed', meta: { numeric: true } },
    { accessorKey: 'balance_owing', header: 'Balance owing', cell: ({ row }) => money(row.original.balance_owing), meta: { numeric: true } },
  ]
  return (
    <>
      <PageHeader crumbs={[{ label: 'Property', to: '/property' }, { label: 'Charges' }]} title="Charges" description="Every flat with a charge on the meter, across your blocks. Download the rent ledger to load into your own systems." />
      <Gate res={res}>
        {(d) => (
          <div className="mw-space-y-3">
            <ExportBar defaultMonth={d.month} />
            <DataTable columns={cols} data={d.rows} caption="Charges across my blocks" csvName="meterwise-charges" searchPlaceholder="Search flats or blocks" emptyTitle="No charges yet" emptyText="Charges start the month after a block is signed off as working." getRowId={(r) => String(r.id)} />
          </div>
        )}
      </Gate>
    </>
  )
}
