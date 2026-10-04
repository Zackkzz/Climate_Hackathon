import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts'
import { z } from 'zod'
import { useUser } from '@/console/auth'
import { govApi } from '@/console/api-gov'
import type { Outcomes as OutcomesT, Target } from '@/console/types-gov'
import { useRes } from '@/console/useRes'
import { money, num, num1 } from '@/format'
import { ChartBox } from '@/portal/components/ChartBox'
import { Facts, Figures, PageHeader, Panel } from '@/portal/components/PageHeader'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { SimulatedBadge, StatusBadge } from '@/portal/components/Status'
import { NumberField, TextField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/portal/components/ui/chart'
import type { ChartConfig } from '@/portal/components/ui/chart'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/portal/components/ui/dialog'
import { Form } from '@/portal/components/ui/form'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/portal/components/ui/table'
import { useAction } from '@/portal/lib/actions'

const UNIT: Record<string, (n: number) => string> = {
  flats_upgraded: (n) => num(n),
  co2e_t_per_year: (n) => `${num1(n)} t`,
  tenant_saving_per_year: (n) => money(n),
  grant_spent: (n) => money(n),
}
const fmtT = (k: string, n: number) => (UNIT[k] ?? num)(n)

const schema = z.object({
  targets: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      target: z.coerce.number({ message: 'Enter a number.' }).min(0, 'The target cannot be negative.'),
      by: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the form 2028-06 (year, dash, month).'),
    }),
  ),
})
type In = z.input<typeof schema>
type Out = z.output<typeof schema>

function EditTargets({ targets, open, onOpenChange, onSaved }: { targets: Target[]; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const act = useAction()
  const [pending, setPending] = useState<Out | null>(null)
  const form = useForm<In, unknown, Out>({ resolver: zodResolver(schema), defaultValues: { targets: targets.map((t) => ({ key: t.key, label: t.label, target: t.target, by: t.by })) } })
  useEffect(() => {
    if (open) {
      form.reset({ targets: targets.map((t) => ({ key: t.key, label: t.label, target: t.target, by: t.by })) })
      setPending(null)
      act.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{pending ? 'Save these targets?' : 'Edit targets'}</DialogTitle>
          <DialogDescription>{pending ? 'The new targets replace the old ones for everyone who uses this portal.' : 'Set what the programme should reach and by when.'}</DialogDescription>
        </DialogHeader>
        {pending ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Goal</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.targets.map((t) => (
                  <TableRow key={t.key}>
                    <TableCell>{t.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtT(t.key, t.target)}</TableCell>
                    <TableCell>{t.by}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ErrorAlert error={act.error} title="We could not save the targets" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setPending(null)}>
                Back
              </Button>
              <Button
                disabled={act.busy}
                onClick={async () => {
                  const r = await act.run(() => govApi.setTargets(pending.targets), 'Targets saved')
                  if (r !== undefined) {
                    onOpenChange(false)
                    onSaved()
                  }
                }}
              >
                {act.busy ? 'Saving' : 'Confirm and save'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => setPending(v))} className="space-y-4" noValidate>
              {targets.map((t, i) => (
                <fieldset key={t.key} className="grid gap-2 border p-3 sm:grid-cols-2">
                  <legend className="px-1 text-sm font-medium">{t.label}</legend>
                  <NumberField control={form.control} name={`targets.${i}.target`} label="Goal" step={t.key === 'co2e_t_per_year' ? 0.1 : 1} min={0} />
                  <TextField control={form.control} name={`targets.${i}.by`} label="By (year-month)" placeholder="2028-06" />
                </fieldset>
              ))}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit">Review changes</Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}

const chartConfig = { pct: { label: 'Progress to target', color: 'var(--chart-1)' } } satisfies ChartConfig

function Body({ o, reload, canEdit }: { o: OutcomesT; reload: () => void; canEdit: boolean }) {
  const [edit, setEdit] = useState(false)
  const rows = o.targets.map((t) => ({ ...t, pct: t.target > 0 ? Math.round((t.actual / t.target) * 100) : 0 }))
  const v = o.impact_verified
  return (
    <>
      <Figures
        label="Reach and money"
        items={[
          { label: 'Flats upgraded', value: num(o.reach.flats_upgraded), note: `${num(o.reach.projects_active)} active projects` },
          { label: 'Blocks in the pipeline', value: num(o.reach.blocks_in_pipeline) },
          { label: 'Renting households', value: num(o.reach.households_renting_est), note: 'Estimate' },
          { label: 'Grant spent', value: money(o.money.grant_spent), note: `of ${money(o.money.grant_committed)}` },
          { label: 'Capital deployed', value: money(o.money.capital_deployed), note: `${money(o.money.repaid)} repaid` },
          { label: 'Cost per flat', value: money(o.money.cost_per_flat), note: o.money.grant_per_tonne_co2e ? `${money(o.money.grant_per_tonne_co2e)} grant per tonne CO2e` : undefined },
        ]}
      />

      <Panel
        title="Targets"
        description={`As at ${o.as_of}`}
        actions={
          canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
              <Pencil aria-hidden="true" /> Edit targets
            </Button>
          )
        }
        className="mb-4"
      >
        <div className="overflow-x-auto border" role="region" aria-label="Targets and progress" tabIndex={0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Target</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Goal</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="min-w-40">Progress</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.key}>
                  <TableCell className="font-medium">{t.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtT(t.key, t.actual)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtT(t.key, t.target)}</TableCell>
                  <TableCell>{t.by}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-24 border bg-muted" role="img" aria-label={`${t.pct} percent of the goal`}>
                        <div className="h-full bg-primary" style={{ width: `${Math.min(100, t.pct)}%` }} />
                      </div>
                      <span className="tabular-nums">{t.pct}%</span>
                    </div>
                  </TableCell>
                  <TableCell>{t.pct >= 100 ? <StatusBadge tone="good">Met</StatusBadge> : t.pct >= 50 ? <StatusBadge tone="info">Under way</StatusBadge> : <StatusBadge tone="warn">Behind</StatusBadge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <ChartBox
          title="Progress to each target"
          description="Percent of the goal reached. The dashed line is the goal."
          chart={
            <ChartContainer config={chartConfig} className="h-64 w-full" role="img" aria-label="Bar chart of percent progress to each target">
              <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 40 }} accessibilityLayer>
                <CartesianGrid horizontal={false} />
                <YAxis dataKey="label" type="category" width={110} tick={{ fontSize: 12 }} interval={0} />
                <XAxis type="number" domain={[0, (m: number) => Math.max(100, m)]} unit="%" />
                <ReferenceLine x={100} stroke="var(--foreground)" strokeDasharray="5 4" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="pct" fill="var(--color-pct)">
                  <LabelList dataKey="pct" position="right" formatter={(x: unknown) => `${String(x)}%`} />
                </Bar>
              </BarChart>
            </ChartContainer>
          }
          table={{ columns: [{ label: 'Target' }, { label: 'Actual', numeric: true }, { label: 'Goal', numeric: true }, { label: 'Percent', numeric: true }], rows: rows.map((t) => [t.label, fmtT(t.key, t.actual), fmtT(t.key, t.target), `${t.pct}%`]) }}
        />

        <Panel title="Modelled and measured" description="Measured figures come from the savings check on each project." actions={<SimulatedBadge label="Simulated meters" />}>
          <div className="overflow-x-auto" role="region" aria-label="Modelled and measured impact" tabIndex={0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Measure</TableHead>
                  <TableHead className="text-right">Modelled</TableHead>
                  <TableHead className="text-right">Measured</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Tenant savings a year</TableCell>
                  <TableCell className="text-right tabular-nums">{money(o.impact_modelled.tenant_saving_per_year)}</TableCell>
                  <TableCell className="text-right tabular-nums">{v ? money(v.tenant_saving_per_year) : 'Not yet'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Emissions cut a year</TableCell>
                  <TableCell className="text-right tabular-nums">{num1(o.impact_modelled.co2e_t_per_year)} t</TableCell>
                  <TableCell className="text-right tabular-nums">{v ? `${num1(v.co2e_t_per_year)} t` : 'Not yet'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Share of the modelled saving achieved</TableCell>
                  <TableCell className="text-right">-</TableCell>
                  <TableCell className="text-right tabular-nums">{v ? `${Math.round(v.realisation_rate * 100)}%` : 'Not yet'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div className="mt-3">
            <Facts
              items={[
                { label: 'Gas avoided', value: `${num(o.impact_modelled.gas_mj_per_year_avoided / 1000)} GJ a year (modelled)` },
                { label: 'Energy cut', value: `${num1(o.impact_modelled.energy_reduction_pct)}% (modelled)` },
                { label: 'Hot hours avoided', value: `${num(o.impact_modelled.top_floor_hours_above_30c_avoided)} hours over 30 C in top-floor flats a year (modelled)` },
                { label: 'Projects measured', value: v ? num(v.projects) : '0' },
              ]}
            />
          </div>
        </Panel>
      </div>

      <Panel title="Protections for tenants" description="What has happened to protect tenants so far.">
        <Facts
          items={[
            { label: 'Charges paused', value: `${num(o.protections.charges_paused_months)} flat-months, while equipment was faulty` },
            { label: 'Charge corrections', value: `${num(o.protections.true_ups)} after savings checks, ${money(o.protections.refunded)} refunded` },
            { label: 'Tenants worse off', value: `${num(o.protections.tenants_worse_off_verified)} where savings are measured` },
            { label: 'Open faults and complaints', value: num(o.protections.complaints_open) },
          ]}
        />
      </Panel>

      <EditTargets targets={o.targets} open={edit} onOpenChange={setEdit} onSaved={reload} />
    </>
  )
}

export default function Outcomes() {
  const user = useUser()
  const res = useRes(() => govApi.outcomes(), [])
  useEffect(() => {
    document.title = 'Outcomes | Government | Meterwise'
  }, [])
  return (
    <>
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Outcomes' }]} title="Outcomes" description="What the programme has reached, what it has cost, and how it compares with its targets." />
      <Gate res={res} rows={6}>
        {(o) => <Body o={o} reload={res.reload} canEdit={user?.role === 'government'} />}
      </Gate>
    </>
  )
}
