import type { ColumnDef } from '@tanstack/react-table'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { propertyApi } from '@/console/api-property'
import type { PropertyAction, PropertySummary } from '@/console/types-property'
import { useRes } from '@/console/useRes'
import { money } from '@/format'
import { DataTable } from '@/portal/components/DataTable'
import { EmptyState, Gate } from '@/portal/components/States'
import { Figures, PageHeader, Panel } from '@/portal/components/PageHeader'
import { StatusBadge } from '@/portal/components/Status'
import { fmtMonth } from './common'

const KIND: Record<string, string> = {
  site_visit: 'Site visit',
  sign_consent: 'Sign consent',
  tenant_consent: 'Tenant consent',
  record_payments: 'Payments',
  tenancy_change: 'Tenancy change',
  fault: 'Fault',
}
const TAB: Record<string, string> = { sign_consent: 'consent', tenant_consent: 'consent', record_payments: 'flats', tenancy_change: 'flats', fault: 'faults' }

const cols: ColumnDef<PropertyAction>[] = [
  { accessorKey: 'kind', header: 'Task', cell: ({ row }) => <StatusBadge tone={row.original.kind === 'fault' ? 'bad' : 'warn'}>{KIND[row.original.kind] ?? row.original.kind}</StatusBadge>, meta: { csv: (r) => KIND[r.kind] ?? r.kind } },
  { accessorKey: 'label', header: 'Block' },
  { accessorKey: 'text', header: 'What to do' },
  {
    id: 'go',
    header: 'Open',
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => <Link to={`/property/blocks/${row.original.project_id}/${TAB[row.original.kind] ?? 'summary'}`}>Open block {row.original.project_id}</Link>,
    meta: { label: 'Open', csv: (r) => r.project_id },
  },
]

export default function Todo() {
  useEffect(() => {
    document.title = 'To do | Property | Meterwise'
  }, [])
  const res = useRes<PropertySummary>(() => propertyApi.summary(), [])
  return (
    <>
      <PageHeader crumbs={[{ label: 'Property' }, { label: 'To do' }]} title="To do" description="What needs your attention across your blocks." />
      <Gate res={res}>
        {(s) => (
          <>
            <Panel title={`Tasks (${s.actions.length})`} className="mb-4">
              <DataTable
                columns={cols}
                data={s.actions}
                caption="To do list"
                csvName="meterwise-to-do"
                searchPlaceholder="Search tasks"
                emptyTitle="Nothing to do right now"
                emptyText="When a block needs a signature, a payment record or a visit, it will show here."
                pageSize={10}
              />
            </Panel>
            <Figures
              label={`Charges for ${fmtMonth(s.charges.month)}`}
              items={[
                { label: 'Month', value: fmtMonth(s.charges.month) },
                { label: 'Flats paying a charge', value: s.charges.flats_active },
                { label: 'Billed', value: money(s.charges.billed) },
                { label: 'Collected', value: money(s.charges.collected) },
                { label: 'Behind on charges', value: money(s.charges.arrears), tone: s.charges.arrears > 0 ? 'warn' : undefined },
                { label: 'Open faults', value: s.faults_open, note: `${s.consent_pending} tenant answers pending`, tone: s.faults_open > 0 ? 'warn' : undefined },
              ]}
            />
            {s.blocks.length === 0 && <EmptyState title="No blocks yet">When your enquiry becomes a project, it will appear under My blocks.</EmptyState>}
          </>
        )}
      </Gate>
    </>
  )
}
