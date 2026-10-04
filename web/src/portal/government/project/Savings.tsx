import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { sourceLabel } from '@/portal/lib/labels'
import { useForm } from 'react-hook-form'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { z } from 'zod'
import { api } from '@/console/api'
import type { MvRun, Reading } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money, num, num1, pct } from '@/format'
import { ChartBox, LegendKey } from '@/portal/components/ChartBox'
import { Confirm } from '@/portal/components/Confirm'
import { DataTable } from '@/portal/components/DataTable'
import { EmptyState, ErrorAlert, Gate } from '@/portal/components/States'
import { Facts, Figures, Panel } from '@/portal/components/PageHeader'
import { StatusBadge } from '@/portal/components/Status'
import { TextField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/portal/components/ui/chart'
import { Form } from '@/portal/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/portal/components/ui/select'
import { useAction } from '@/portal/lib/actions'
import { dateLabelAu, monthLabelAu } from '@/portal/lib/dates'
import { canEdit, canManage } from './shared'
import type { TabProps } from './shared'

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/
const runSchema = z
  .object({ from: z.string().regex(monthRe, 'Enter the first month as YYYY-MM, for example 2027-01.'), to: z.string().regex(monthRe, 'Enter the last month as YYYY-MM, for example 2027-12.') })
  .refine((v) => v.from <= v.to, { path: ['to'], message: 'The last month must not be before the first month.' })

function SourceBadge({ source, label }: { source: string; label?: string | null }) {
  return <StatusBadge tone="info">{sourceLabel(source, label)}</StatusBadge>
}

function Readings({ p, role }: TabProps) {
  const [flatId, setFlatId] = useState<string>(String(p.flats_list[0]?.id ?? ''))
  const res = useRes<Reading[]>(() => (flatId ? api.readings(Number(flatId)) : Promise.resolve([])), [flatId])
  const up = useAction()
  const file = useRef<HTMLInputElement>(null)
  const [fileErr, setFileErr] = useState<string | null>(null)
  if (p.flats_list.length === 0) return <EmptyState title="No flats">This project has no flats yet.</EmptyState>

  const upload = async (f: File | undefined) => {
    setFileErr(null)
    if (!f) return
    if (!/\.csv$/i.test(f.name)) return setFileErr('Choose a CSV file (a file name ending in .csv).')
    if (f.size > 1_000_000) return setFileErr('That file is too large. Keep it under 1 MB.')
    const text = await f.text()
    if (!/^month,electricity_kwh,gas_mj/i.test(text.trim())) return setFileErr('The first row must be: month,electricity_kwh,gas_mj,indoor_hours_above_30c')
    const r = await up.run(() => api.uploadReadings(Number(flatId), text), 'Readings uploaded')
    if (r !== undefined) res.reload()
    if (file.current) file.current.value = ''
  }

  return (
    <Panel title="Readings" description="Monthly meter readings for one flat. Each reading shows where it came from.">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="rd-flat" className="mb-1 block text-sm font-medium">
            Flat
          </label>
          <Select value={flatId} onValueChange={setFlatId}>
            <SelectTrigger id="rd-flat" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {p.flats_list.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  Flat {f.unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canEdit(role) && (
          <div>
            <label htmlFor="rd-file" className="mb-1 block text-sm font-medium">
              Upload readings (CSV)
            </label>
            <input id="rd-file" ref={file} type="file" accept=".csv,text/csv" disabled={up.busy} onChange={(e) => void upload(e.target.files?.[0])} className="block w-full max-w-xs border border-input bg-card p-1.5 text-base file:mr-3 file:border-0 file:bg-secondary file:px-3 file:py-1" aria-describedby="rd-file-help" />
          </div>
        )}
      </div>
      {canEdit(role) && (
        <p id="rd-file-help" className="mb-2 text-sm text-muted-foreground">
          Columns: month, electricity_kwh, gas_mj, indoor_hours_above_30c. Uploaded rows are labelled as uploaded.
        </p>
      )}
      {fileErr && <p className="mb-2 text-sm text-destructive" role="alert">{fileErr}</p>}
      <ErrorAlert error={up.error} title="We could not upload the readings" />
      <Gate res={res} rows={4}>
        {(rows) => (
          <DataTable<Reading>
            caption="Meter readings"
            data={rows}
            getRowId={(r) => r.month}
            csvName={`flat-${flatId}-readings`}
            pageSize={10}
            emptyTitle="No readings"
            emptyText="Readings appear once the flat is active, or when you upload them."
            searchPlaceholder="Search readings"
            initialSort={[{ id: 'month', desc: true }]}
            columns={[
              { id: 'month', header: 'Month', accessorFn: (r) => r.month, cell: ({ row }) => monthLabelAu(row.original.month), meta: { csv: (r) => r.month } },
              { accessorKey: 'electricity_kwh', header: 'Electricity (kWh)', cell: ({ row }) => num1(row.original.electricity_kwh), meta: { numeric: true } },
              { accessorKey: 'gas_mj', header: 'Gas (MJ)', cell: ({ row }) => num(row.original.gas_mj), meta: { numeric: true } },
              { accessorKey: 'indoor_hours_above_30c', header: 'Hours over 30 C', cell: ({ row }) => (row.original.indoor_hours_above_30c ?? '-'), meta: { numeric: true } },
              { accessorKey: 'mean_outdoor_c', header: 'Outdoor mean (C)', cell: ({ row }) => (row.original.mean_outdoor_c === null || row.original.mean_outdoor_c === undefined ? '-' : num1(row.original.mean_outdoor_c)), meta: { numeric: true } },
              { id: 'source', header: 'Source', accessorFn: (r) => r.source, cell: ({ row }) => <SourceBadge source={row.original.source} label={(row.original as { source_label?: string }).source_label} /> },
            ]}
          />
        )}
      </Gate>
    </Panel>
  )
}

function Result({ run, unit }: { run: MvRun; unit: (id: number) => string }) {
  const rows = run.by_flat.map((b) => ({ flat: `Flat ${unit(b.flat_id)}`, modelled: Math.round(b.result.modelled_saving_per_month * 10) / 10, verified: Math.round(b.result.verified_saving_per_month * 10) / 10 }))
  return (
    <div className="space-y-4">
      <Figures
        label="Savings check result"
        items={[
          { label: 'Modelled saving', value: `${money(run.modelled_saving_per_month)} a month` },
          { label: 'Measured saving', value: `${money(run.verified_saving_per_month)} a month` },
          { label: 'Realisation rate', value: pct(run.realisation_rate * 100), note: 'Measured as a share of modelled', tone: run.realisation_rate >= 0.85 ? 'good' : 'warn' },
          { label: 'Flats checked', value: num(run.flats_verified) },
          { label: 'Bill neutral flats', value: `${run.bill_neutral_flats} of ${run.flats_verified}`, tone: run.bill_neutral_flats < run.flats_verified ? 'warn' : 'good' },
          { label: 'Drawn from reserve', value: money(run.reserve_drawn) },
        ]}
      />
      <p className="text-sm text-muted-foreground">
        Period {monthLabelAu(run.period.from)} to {monthLabelAu(run.period.to)}, run on {dateLabelAu(run.run_on)}. Data source: {sourceLabel(run.source, (run as { source_label?: string }).source_label)}.
      </p>

      <ChartBox
        title="Modelled and measured saving by flat"
        description="Dollars a month. Hatched bars are modelled. Solid bars are measured."
        legend={
          <>
            <LegendKey label="Modelled (hatched)" color="var(--chart-2)" dashed />
            <LegendKey label="Measured (solid)" color="var(--chart-1)" />
          </>
        }
        table={{
          columns: [{ label: 'Flat' }, { label: 'Modelled ($ a month)', numeric: true }, { label: 'Measured ($ a month)', numeric: true }],
          rows: rows.map((r) => [r.flat, r.modelled, r.verified]),
        }}
        chart={
          <ChartContainer config={{ modelled: { label: 'Modelled', color: 'var(--chart-2)' }, verified: { label: 'Measured', color: 'var(--chart-1)' } }} className="h-64 w-full">
            <BarChart data={rows} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
              <defs>
                <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill="#ffffff" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-2)" strokeWidth="3" />
                </pattern>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="flat" tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `$${v}`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="modelled" fill="url(#hatch)" stroke="var(--chart-2)" strokeWidth={1.5} radius={0}>
                {rows.length <= 8 && <LabelList dataKey="modelled" position="top" fontSize={11} formatter={(v: unknown) => `$${v}`} />}
              </Bar>
              <Bar dataKey="verified" fill="var(--chart-1)" radius={0}>
                {rows.length <= 8 && <LabelList dataKey="verified" position="top" fontSize={11} formatter={(v: unknown) => `$${v}`} />}
              </Bar>
            </BarChart>
          </ChartContainer>
        }
      />

      <Panel title="Charge true-ups applied" description="The tenant must keep their share of the measured saving. If the charge is too high, it is cut and the difference is refunded from the reserve.">
        {run.true_ups.length === 0 ? (
          <p>No charge needed changing.</p>
        ) : (
          <DataTable
            caption="True-ups"
            data={run.true_ups}
            getRowId={(t) => String(t.flat_id)}
            searchPlaceholder="Search true-ups"
            columns={[
              { id: 'flat', header: 'Flat', accessorFn: (t) => `Flat ${unit(t.flat_id)}` },
              { id: 'action', header: 'What changed', accessorFn: (t) => (t.action === 'reduce_charge' ? 'Charge reduced' : t.action === 'refund_from_reserve' ? 'Refund from reserve' : t.action.replace(/_/g, ' ')) },
              { accessorKey: 'old_charge', header: 'Old charge', cell: ({ row }) => money(row.original.old_charge), meta: { numeric: true } },
              { accessorKey: 'new_charge', header: 'New charge', cell: ({ row }) => money(row.original.new_charge), meta: { numeric: true } },
              { accessorKey: 'refund', header: 'Refund', cell: ({ row }) => money(row.original.refund), meta: { numeric: true } },
            ]}
          />
        )}
      </Panel>

      <Panel title="Result for each flat">
        <DataTable
          caption="Measured savings by flat"
          data={run.by_flat}
          getRowId={(b) => String(b.flat_id)}
          csvName="measured-savings-by-flat"
          searchPlaceholder="Search flats"
          columns={[
            { id: 'flat', header: 'Flat', accessorFn: (b) => `Flat ${b.unit ?? unit(b.flat_id)}` },
            { id: 'mod', header: 'Modelled', accessorFn: (b) => b.result.modelled_saving_per_month, cell: ({ row }) => money(row.original.result.modelled_saving_per_month), meta: { numeric: true } },
            { id: 'ver', header: 'Measured', accessorFn: (b) => b.result.verified_saving_per_month, cell: ({ row }) => money(row.original.result.verified_saving_per_month), meta: { numeric: true } },
            { id: 'unc', header: 'Uncertainty (plus or minus)', accessorFn: (b) => b.result.uncertainty_per_month, cell: ({ row }) => money(row.original.result.uncertainty_per_month), meta: { numeric: true } },
            { id: 'rr', header: 'Realisation', accessorFn: (b) => b.result.realisation_rate, cell: ({ row }) => pct(row.original.result.realisation_rate * 100), meta: { numeric: true } },
            { id: 'conf', header: 'Confidence', accessorFn: (b) => b.result.confidence },
            { id: 'neutral', header: 'Bill neutral', accessorFn: (b) => (b.result.bill_neutral_verified ? 'Yes' : 'No'), cell: ({ row }) => (row.original.result.bill_neutral_verified ? <StatusBadge tone="good">Yes</StatusBadge> : <StatusBadge tone="bad">No</StatusBadge>) },
            { id: 'flags', header: 'Notes', accessorFn: (b) => (b.result.flags ?? []).join(' '), cell: ({ row }) => <>{(row.original.result.flags ?? []).map((f, i) => <div key={i}>{f}</div>)}</> },
          ]}
        />
        {run.by_flat[0] && <div className="mt-3"><Facts items={[{ label: 'Method', value: run.by_flat[0].result.method }]} /></div>}
      </Panel>
    </div>
  )
}

export default function Savings(props: TabProps) {
  const { p, role, onChange } = props
  const [chosen, setChosen] = useState<number | null>(null)
  const act = useAction()
  const form = useForm<z.input<typeof runSchema>, unknown, z.output<typeof runSchema>>({ resolver: zodResolver(runSchema), defaultValues: { from: '', to: '' } })
  const unit = (id: number) => p.flats_list.find((f) => f.id === id)?.unit ?? String(id)
  const runs = [...p.mv].sort((a, b) => b.run_on.localeCompare(a.run_on) || b.id - a.id)
  const shown = runs.find((r) => r.id === chosen) ?? runs[0]

  const submit = form.handleSubmit(async (v) => {
    const r = await act.run(() => api.runMv(p.id, v.from, v.to), 'Savings check done')
    if (r) {
      setChosen(r.id)
      onChange(await api.project(p.id))
    }
  })

  return (
    <div className="space-y-4">
      {canManage(role) && (
        <Panel title="Run a savings check" description="Compares the measured bills with what they would have been without the upgrade. It can cut a charge and refund tenants from the reserve.">
          <Form {...form}>
            <form className="flex flex-wrap items-start gap-3" noValidate onSubmit={(e) => e.preventDefault()} aria-label="Run a savings check">
              <TextField control={form.control} name="from" label="First month" placeholder="YYYY-MM" className="w-40" />
              <TextField control={form.control} name="to" label="Last month" placeholder="YYYY-MM" className="w-40" />
              <div className="pt-6">
                <Confirm title="Run the savings check?" description="If measured savings are lower than modelled, charges on some flats may be reduced and refunds paid from the reserve. This is logged." confirmLabel="Run the check" onConfirm={() => void submit()}>
                  <Button type="button" disabled={act.busy}>
                    {act.busy ? 'Running' : 'Run check'}
                  </Button>
                </Confirm>
              </div>
            </form>
          </Form>
          <div className="mt-2">
            <ErrorAlert error={act.error} title="We could not run the check" />
          </div>
        </Panel>
      )}

      {runs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="mv-run" className="text-sm font-medium">
            Show the check from
          </label>
          <Select value={String(shown?.id)} onValueChange={(v) => setChosen(Number(v))}>
            <SelectTrigger id="mv-run" className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {runs.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {monthLabelAu(r.period.from)} to {monthLabelAu(r.period.to)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {shown ? <Result run={shown} unit={unit} /> : <EmptyState title="No savings check yet">A check needs at least a few months of readings after the upgrade. Run one above once readings exist.</EmptyState>}
      <Readings {...props} />
    </div>
  )
}
