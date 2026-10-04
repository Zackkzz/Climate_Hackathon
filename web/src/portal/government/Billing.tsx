import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { Download } from '@/portal/components/icons'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/console/api'
import type { BillingRun } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money, num } from '@/format'
import { Confirm } from '@/portal/components/Confirm'
import { DataTable } from '@/portal/components/DataTable'
import { Figures, PageHeader, Panel } from '@/portal/components/PageHeader'
import { ErrorAlert } from '@/portal/components/States'
import { TextField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Form } from '@/portal/components/ui/form'
import { useAction } from '@/portal/lib/actions'
import { saveText } from '@/portal/lib/csv'
import { usePageTitle } from './shared'

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Enter a month like 2027-03.') })

function monthName(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

export default function Billing() {
  usePageTitle('Billing')
  const clock = useRes(() => api.clock().catch(() => null), [])
  const run = useAction()
  const exp = useAction()
  const [runs, setRuns] = useState<BillingRun[]>([])
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { month: '' } })
  const month = form.watch('month')

  useEffect(() => {
    if (clock.data && !form.getValues('month')) form.setValue('month', clock.data.month)
  }, [clock.data, form])

  const doRun = async () => {
    const ok = await form.trigger()
    if (!ok) return
    const r = await run.run(() => api.runBilling(form.getValues('month')), 'Billing run done')
    if (r) setRuns((cur) => [r, ...cur.filter((x) => x.month !== r.month)])
  }
  const doExport = async () => {
    if (!(await form.trigger())) return
    const t = await exp.run(() => api.billingExport(form.getValues('month')))
    if (t !== undefined) saveText(`meterwise-billing-${form.getValues('month')}.csv`, t)
  }

  const columns = useMemo<ColumnDef<BillingRun>[]>(
    () => [
      { accessorKey: 'month', header: 'Month', cell: ({ row }) => monthName(row.original.month) },
      { accessorKey: 'flats_billed', header: 'Flats billed', meta: { numeric: true } },
      { accessorKey: 'billed', header: 'Billed', cell: ({ row }) => money(row.original.billed), meta: { numeric: true, csv: (r) => r.billed } },
      { accessorKey: 'paused_flats', header: 'Paused flats', meta: { numeric: true } },
      { accessorKey: 'reserve_contribution', header: 'Added to reserve', cell: ({ row }) => money(row.original.reserve_contribution), meta: { numeric: true, csv: (r) => r.reserve_contribution } },
    ],
    [],
  )
  const last = runs[0]

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Billing' }]} title="Billing" description="Each month the programme works out the charge on every flat's meter. A paused charge is not billed. Running a month twice changes nothing the second time." />
      <Panel title="Choose a month" description={clock.data ? `The programme month is ${monthName(clock.data.month)}.` : undefined}>
        <Form {...form}>
          <form className="nsw-display-flex nsw-flex-wrap nsw-align-items-end mw-gap-3" noValidate onSubmit={(e) => e.preventDefault()}>
            <TextField control={form.control} name="month" label="Month" type="month" className="mw-w-48" />
            <Confirm title={`Run billing for ${month && /^\d{4}-\d{2}$/.test(month) ? monthName(month) : 'this month'}?`} description={<p>This bills every active flat for the month and moves part of the charges into the reserve. It cannot be undone, but running the same month again does nothing.</p>} confirmLabel="Run billing" onConfirm={doRun}>
              <Button type="button" disabled={run.busy}>
                {run.busy ? 'Running' : 'Run billing for this month'}
              </Button>
            </Confirm>
            <Button type="button" variant="outline" onClick={() => void doExport()} disabled={exp.busy}>
              <Download aria-hidden="true" /> Download rent ledger (CSV)
            </Button>
          </form>
        </Form>
        <div className="mw-mt-3 mw-space-y-2">
          <ErrorAlert error={run.error} title="Billing did not run" />
          <ErrorAlert error={exp.error} title="We could not make the file" />
        </div>
      </Panel>
      <div className="mw-mt-4">
        {last && (
          <Figures
            label={`Result for ${monthName(last.month)}`}
            items={[
              { label: 'Month', value: monthName(last.month) },
              { label: 'Flats billed', value: num(last.flats_billed) },
              { label: 'Billed', value: money(last.billed) },
              { label: 'Paused flats', value: num(last.paused_flats), tone: last.paused_flats ? 'warn' : undefined },
              { label: 'Added to reserve', value: money(last.reserve_contribution) },
            ]}
          />
        )}
        <h2 className="mw-mb-2 nsw-text-semibold">Runs this session</h2>
        <DataTable columns={columns} data={runs} caption="Billing runs" getRowId={(r) => r.month} csvName="billing-runs" searchPlaceholder="Search runs" emptyTitle="No billing runs yet" emptyText="Run billing for a month and the result shows here." />
      </div>
    </div>
  )
}
