import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { utilityApi } from '@/console/api-utility'
import type { MeterRow } from '@/console/types-utility'
import type { Stage } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money } from '@/format'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader } from '@/portal/components/PageHeader'
import { Gate } from '@/portal/components/States'
import { StageBadge, StatusBadge } from '@/portal/components/Status'
import { Button } from '@/portal/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/portal/components/ui/select'
import { saveText, toCsv } from '@/portal/lib/csv'

const STAGES = ['procurement', 'installation', 'commissioned', 'active', 'closed']
const STAGE_NAME: Record<string, string> = { procurement: 'Quotes', installation: 'Installation', commissioned: 'Commissioned', active: 'Active', closed: 'Closed' }
const CHARGE: Record<string, string> = { not_started: 'Not started', active: 'Active', paused: 'Paused', ended: 'Ended' }

function charge(s: string) {
  return <StatusBadge tone={s === 'active' ? 'good' : s === 'paused' ? 'warn' : 'neutral'}>{CHARGE[s] ?? s}</StatusBadge>
}

const columns: ColumnDef<MeterRow>[] = [
  { accessorKey: 'meter_id', header: 'Meter id', cell: (c) => <span className="font-mono text-sm">{c.getValue<string>()}</span> },
  { accessorKey: 'address', header: 'Address' },
  { accessorKey: 'position', header: 'Floor', cell: (c) => (c.getValue<string>() === 'top' ? 'Top' : 'Lower') },
  { accessorKey: 'stage', header: 'Project stage', cell: (c) => <StageBadge stage={c.getValue<string>() as Stage} />, meta: { csv: (r) => STAGE_NAME[r.stage] ?? r.stage } },
  { accessorKey: 'charge_status', header: 'Charge', cell: (c) => charge(c.getValue<string>()), meta: { csv: (r) => CHARGE[r.charge_status] ?? r.charge_status } },
  { accessorKey: 'charge_per_month', header: 'Charge a month', cell: (c) => money(c.getValue<number>()), meta: { numeric: true } },
  { accessorKey: 'commissioned_on', header: 'Commissioned', cell: (c) => c.getValue<string | null>() ?? 'Not yet' },
  { accessorKey: 'has_gas', header: 'Gas connected', cell: (c) => (c.getValue<boolean>() ? 'Yes' : 'No'), meta: { csv: (r) => (r.has_gas ? 'yes' : 'no') } },
  { accessorKey: 'retailer_customer', header: 'Our customer', cell: (c) => (c.getValue<boolean>() ? 'Yes' : 'No'), meta: { csv: (r) => (r.retailer_customer ? 'yes' : 'no') } },
  { accessorKey: 'last_reading_month', header: 'Last reading', cell: (c) => c.getValue<string | null>() ?? 'None' },
  { accessorKey: 'reading_source', header: 'Reading source', cell: (c) => c.getValue<string | null>() ?? '-' },
]

export default function Meters() {
  useEffect(() => {
    document.title = 'Meters | Meterwise'
  }, [])
  const res = useRes(() => utilityApi.meters(), [])
  const [stage, setStage] = useState('all')
  const [cs, setCs] = useState('all')
  const rows = useMemo(() => (res.data ?? []).filter((r) => (stage === 'all' || r.stage === stage) && (cs === 'all' || r.charge_status === cs)), [res.data, stage, cs])

  return (
    <>
      <PageHeader crumbs={[{ label: 'Utility', to: '/utility' }, { label: 'Meters' }]} title="Meters" description="Every meter in the programme in your network area. Search, filter, choose columns, tick rows and export." />
      <Gate res={res} rows={8}>
        {() => (
          <DataTable
            columns={columns}
            data={rows}
            caption="Meters"
            getRowId={(r) => r.meter_id}
            searchPlaceholder="Search meters by id or address"
            selectable
            csvName="meters"
            initialHidden={{ retailer_customer: false, commissioned_on: false }}
            emptyTitle="No meters yet"
            emptyText="Meters appear here once a project passes the offer stage."
            filters={
              <>
                <div>
                  <span className="sr-only" id="f-stage">
                    Project stage
                  </span>
                  <Select value={stage} onValueChange={setStage}>
                    <SelectTrigger aria-labelledby="f-stage" size="sm" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All stages</SelectItem>
                      {STAGES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STAGE_NAME[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <span className="sr-only" id="f-charge">
                    Charge status
                  </span>
                  <Select value={cs} onValueChange={setCs}>
                    <SelectTrigger aria-labelledby="f-charge" size="sm" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All charges</SelectItem>
                      {Object.entries(CHARGE).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            }
            bulkActions={(sel) => (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  saveText(
                    'selected-meters.csv',
                    toCsv(
                      ['meter_id', 'address', 'charge_per_month', 'charge_status'],
                      sel.map((r) => [r.meter_id, r.address, r.charge_per_month, r.charge_status]),
                    ),
                  )
                }
              >
                Export selected
              </Button>
            )}
          />
        )}
      </Gate>
    </>
  )
}
