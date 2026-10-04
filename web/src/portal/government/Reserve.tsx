import type { ColumnDef } from '@tanstack/react-table'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router'
import { api } from '@/console/api'
import type { ReserveEntry } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money, num } from '@/format'
import { ChartBox } from '@/portal/components/ChartBox'
import { DataTable } from '@/portal/components/DataTable'
import { Figures, PageHeader } from '@/portal/components/PageHeader'
import { Confirm } from '@/portal/components/Confirm'
import { NumberField, TextField } from '@/portal/components/fields'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { Button } from '@/portal/components/ui/button'
import { Form } from '@/portal/components/ui/form'
import { useAction } from '@/portal/lib/actions'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/portal/components/ui/chart'
import { usePageTitle } from './shared'

const KIND: Record<string, string> = {
  contribution: 'Contribution',
  pause_cover: 'Cover for paused charges',
  true_up_refund: 'Refund after savings check',
  arrears_cover: 'Cover for unpaid charges',
  grant_top_up: 'Grant top-up',
}
const OUT = ['pause_cover', 'true_up_refund', 'arrears_cover']
const topUpSchema = z.object({
  amount: z.coerce.number({ message: 'Enter an amount in dollars.' }).positive('The amount must be more than $0.').max(10_000_000, 'That is more than the grant pool can give. Enter up to $10,000,000.'),
  note: z.string().trim().max(200, 'Keep the note under 200 characters.').optional(),
})

function TopUp({ onDone }: { onDone: () => void }) {
  const act = useAction()
  const form = useForm<z.input<typeof topUpSchema>, unknown, z.output<typeof topUpSchema>>({ resolver: zodResolver(topUpSchema), defaultValues: { amount: '' as unknown as number, note: '' } })
  const submit = form.handleSubmit(async (v) => {
    const r = await act.run(() => api.topUpReserve(v.amount, v.note ?? ''), 'Reserve topped up from the grant pool')
    if (r) {
      form.reset({ amount: '' as unknown as number, note: '' })
      onDone()
    }
  })
  return (
    <Form {...form}>
      <form className="mw-mb-4 mw-space-y-3 mw-border mw-bg-white mw-p-4" noValidate onSubmit={(e) => e.preventDefault()} aria-label="Top up the reserve">
        <h2 className="nsw-text-semibold">Top up the reserve</h2>
        <p className="mw-text-muted">Move money from the grant pool into the reserve, for example to cover a shortfall.</p>
        <div className="nsw-display-grid mw-gap-3 mw-sm-grid-cols-2">
          <NumberField control={form.control} name="amount" label="Amount ($)" min={0} step={100} />
          <TextField control={form.control} name="note" label="Note (optional)" />
        </div>
        <ErrorAlert error={act.error} title="We could not top up the reserve" />
        <Confirm
          title="Top up the reserve?"
          description={`This moves ${form.watch('amount') ? '$' + form.watch('amount') : 'this amount'} from the grant pool into the reserve. It is recorded in the audit log.`}
          confirmLabel="Top up"
          onConfirm={() => submit()}
        >
          <Button type="button" disabled={act.busy} onClick={(e) => { if (!form.formState.isValid && !topUpSchema.safeParse(form.getValues()).success) { e.preventDefault(); e.stopPropagation(); void submit() } }}>
            {act.busy ? 'Working' : 'Top up'}
          </Button>
        </Confirm>
      </form>
    </Form>
  )
}

const signed = (e: ReserveEntry) => (OUT.includes(e.kind) ? -Math.abs(e.amount) : e.amount)

export default function Reserve() {
  usePageTitle('Reserve')
  const res = useRes(() => api.reserve(), [])
  const columns = useMemo<ColumnDef<ReserveEntry>[]>(
    () => [
      { accessorKey: 'month', header: 'Month' },
      { id: 'kind', header: 'What', accessorFn: (e) => KIND[e.kind] ?? e.kind, cell: ({ row }) => <span>{KIND[row.original.kind] ?? row.original.kind}{row.original.note && <span className="nsw-display-block nsw-small mw-text-muted">{row.original.note}</span>}</span> },
      { id: 'project', header: 'Project', accessorFn: (e) => e.project_id ?? '', cell: ({ row }) => (row.original.project_id ? <Link to={`/government/projects/${row.original.project_id}`}>Project {row.original.project_id}</Link> : 'None'), meta: { csv: (e: ReserveEntry) => e.project_id ?? '' } },
      { id: 'amount', header: 'Amount', accessorFn: signed, cell: ({ getValue }) => money(getValue<number>()), meta: { numeric: true } },
      { accessorKey: 'balance_after', header: 'Balance', cell: ({ row }) => money(row.original.balance_after), meta: { numeric: true, csv: (e: ReserveEntry) => e.balance_after } },
    ],
    [],
  )
  return (
    <div>
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Reserve' }]} title="Loss reserve" description="A small part of every charge goes into a reserve. It covers paused charges, unpaid charges and refunds, so tenants and funders are protected." />
      <Gate res={res}>
        {(r) => {
          const byMonth = new Map<string, number>()
          for (const e of r.entries) byMonth.set(e.month, e.balance_after)
          const series = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, balance]) => ({ month, balance }))
          const paid = r.entries.filter((e) => OUT.includes(e.kind)).reduce((s, e) => s + Math.abs(e.amount), 0)
          return (
            <>
              <TopUp onDone={res.reload} />
              <Figures label="Reserve" items={[{ label: 'Balance', value: money(r.balance) }, { label: 'Entries', value: num(r.entries.length) }, { label: 'Paid out so far', value: money(paid) }]} />
              <div className="mw-mb-4">
                <ChartBox
                  title="Reserve balance over time"
                  description="The balance at the end of each month."
                  chart={
                    series.length === 0 ? (
                      <p className="mw-text-muted">Nothing has gone in or out of the reserve yet.</p>
                    ) : (
                      <ChartContainer config={{ balance: { label: 'Balance', color: 'var(--chart-1)' } }} className="mw-h-64 nsw-width-100" role="img" aria-label={`Reserve balance by month. Latest balance ${money(series[series.length - 1].balance)}.`}>
                        <LineChart data={series} margin={{ left: 8, right: 16, top: 16 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="month" tickMargin={6} />
                          <YAxis tickFormatter={(v: number) => money(v)} width={70} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line dataKey="balance" type="monotone" stroke="var(--color-balance)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                        </LineChart>
                      </ChartContainer>
                    )
                  }
                  table={{ columns: [{ label: 'Month' }, { label: 'Balance', numeric: true }], rows: series.map((s) => [s.month, money(s.balance)]) }}
                />
              </div>
              <DataTable columns={columns} data={[...r.entries].reverse()} caption="Reserve entries" getRowId={(e) => String(e.id)} csvName="reserve-entries" searchPlaceholder="Search entries" emptyTitle="No reserve entries" emptyText="Entries appear after the first billing run." />
            </>
          )
        }}
      </Gate>
    </div>
  )
}
