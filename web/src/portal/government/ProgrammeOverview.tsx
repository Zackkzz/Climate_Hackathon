import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { api } from '@/console/api'
import type { Overview, Scenario } from '@/console/types'
import { STAGES } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money, num } from '@/format'
import { ChartBox } from '@/portal/components/ChartBox'
import { Confirm } from '@/portal/components/Confirm'
import { DataTable } from '@/portal/components/DataTable'
import { Facts, Figures, PageHeader, Panel } from '@/portal/components/PageHeader'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { STAGE_LABEL, SimulatedBadge, StatusBadge } from '@/portal/components/Status'
import { Button } from '@/portal/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/portal/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/portal/components/ui/select'
import { useAction } from '@/portal/lib/actions'
import { usePageTitle } from './shared'

const ROUTE: Record<string, string> = {
  community_housing: 'Route A: a community housing provider collects the charge',
  council_rates: 'Route B: the charge is collected with council rates',
  meter_attached: 'Route C: the charge is attached to the meter',
}

function monthName(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

function ClockControl({ onChange }: { onChange: () => void }) {
  const clock = useRes(() => api.clock(), [])
  const [scenario, setScenario] = useState<Scenario>('mixed')
  const act = useAction()
  const [last, setLast] = useState('')
  if (clock.error && !clock.data) return null // switched off outside the demo
  const adv = async (n: number) => {
    const r = await act.run(() => api.advanceClock(n, scenario))
    if (r) {
      setLast(`Moved to ${monthName(r.month)}. ${r.billing_runs} billing runs, ${r.payments} payments, ${r.faults_opened} faults opened, ${r.faults_resolved} resolved, ${r.mv_runs} savings checks.`)
      clock.reload()
      onChange()
    }
  }
  return (
    <Panel title="Demo clock" description="A demo control. It moves time forward with simulated data so you can see years of billing in seconds." actions={<SimulatedBadge label="Demo control" />}>
      <p className="mw-mb-3">
        The programme month is <strong>{clock.data ? monthName(clock.data.month) : '...'}</strong>.
      </p>
      <div className="nsw-display-flex nsw-flex-wrap nsw-align-items-end mw-gap-3">
        <div className="nsw-display-flex nsw-flex-column mw-gap-1_5">
          <label htmlFor="scn" className="nsw-small nsw-text-medium">
            How the equipment performs
          </label>
          <Select value={scenario} onValueChange={(v) => setScenario(v as Scenario)}>
            <SelectTrigger id="scn" className="mw-w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="as_modelled">As modelled</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
              <SelectItem value="underperforming">Underperforming</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {[1, 3, 12].map((n) => (
          <Button key={n} variant="outline" disabled={act.busy} onClick={() => void adv(n)}>
            Advance {n} {n === 1 ? 'month' : 'months'}
          </Button>
        ))}
        <Confirm
          title="Reset the demo?"
          description={<p>This wipes every change and goes back to the starting example. It cannot be undone.</p>}
          confirmLabel="Reset demo"
          destructive
          onConfirm={async () => {
            const r = await act.run(() => api.resetClock(), 'Demo reset')
            if (r !== undefined) {
              setLast('')
              clock.reload()
              onChange()
            }
          }}
        >
          <Button variant="outline" disabled={act.busy}>
            Reset demo
          </Button>
        </Confirm>
      </div>
      {act.busy && (
        <p role="status" className="mw-mt-2 mw-text-muted">
          Working through the months
        </p>
      )}
      <div className="mw-mt-2">
        <ErrorAlert error={act.error} title="The clock did not move" />
      </div>
      {last && (
        <p role="status" className="mw-mt-2">
          {last}
        </p>
      )}
    </Panel>
  )
}

export default function ProgrammeOverview() {
  usePageTitle('Programme overview')
  const res = useRes<Overview>(() => api.overview(), [])
  const stageCols = useMemo<ColumnDef<{ stage: string; count: number }>[]>(() => [{ accessorKey: 'stage', header: 'Stage' }, { accessorKey: 'count', header: 'Projects', meta: { numeric: true } }], [])

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Programme overview' }]} title="Programme overview" description="Where the programme stands: projects, money, savings and billing." />
      <Gate res={res}>
        {(o) => {
          const p = o.programme
          const stages = STAGES.map((s) => ({ stage: STAGE_LABEL[s], count: o.pipeline[s] ?? 0 }))
          const monthly = o.monthly.slice(-24)
          return (
            <div className="mw-space-y-4">
              <Panel title={p.name} actions={p.example ? <StatusBadge tone="neutral">Example programme</StatusBadge> : undefined}>
                <Facts
                  items={[
                    { label: 'Delivery route', value: ROUTE[p.route] ?? p.route },
                    { label: 'Route status', value: <StatusBadge tone={p.route_status === 'usable_now' ? 'good' : 'warn'}>{p.route_status === 'usable_now' ? 'Can be used now' : 'Needs a rule change first'}</StatusBadge> },
                    { label: 'Terms', value: `${p.finance.term_years} years at ${(p.finance.cost_of_capital * 100).toFixed(1)}%. Charge takes up to ${Math.round(p.finance.savings_share_to_charge * 100)}% of the saving. ${Math.round(p.finance.reserve * 100)}% goes to the reserve.` },
                  ]}
                />
              </Panel>
              <Figures
                label="Money"
                items={[
                  { label: 'Deployed', value: money(o.money.deployed), note: `of ${money(p.capital_committed)} committed` },
                  { label: 'Repaid', value: money(o.money.repaid), note: `${money(o.money.interest)} interest` },
                  { label: 'Behind on charges', value: money(o.money.arrears), tone: o.money.arrears > 0 ? 'warn' : undefined },
                  { label: 'Reserve', value: money(o.money.reserve) },
                  { label: 'Grant used', value: money(o.money.grant_used), note: `of ${money(p.grant_pool)}` },
                  { label: 'Flats with a charge', value: num(o.flats.active_charges), note: `${num(o.flats.total)} flats, ${num(o.flats.paused)} paused` },
                ]}
              />
              <ClockControl onChange={res.reload} />

              <div className="nsw-display-grid mw-grid-cols-1 mw-gap-4 mw-lg-grid-cols-2 mw-children-min-0">
                <ChartBox
                  title="Projects by stage"
                  chart={
                    <ChartContainer config={{ count: { label: 'Projects', color: 'var(--chart-1)' } }} className="mw-h-64 nsw-width-100" role="img" aria-label={`Projects by stage: ${stages.map((s) => `${s.stage} ${s.count}`).join(', ')}`}>
                      <BarChart data={stages} layout="vertical" margin={{ left: 8, right: 28 }}>
                        <CartesianGrid horizontal={false} />
                        <YAxis dataKey="stage" type="category" width={92} tickLine={false} />
                        <XAxis type="number" allowDecimals={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="var(--color-count)" isAnimationActive={false}>
                          <LabelList dataKey="count" position="right" />
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  }
                  table={{ columns: [{ label: 'Stage' }, { label: 'Projects', numeric: true }], rows: stages.map((s) => [s.stage, s.count]) }}
                />
                <Panel title="Pipeline counts">
                  <DataTable columns={stageCols} data={stages} caption="Pipeline counts table" getRowId={(s) => s.stage} csvName="pipeline-counts" searchPlaceholder="Search stages" pageSize={10} />
                </Panel>
              </div>

              <Panel title="Modelled and measured savings" actions={<SimulatedBadge label="Measured on simulated meters" />}>
                <Facts
                  items={[
                    { label: 'Modelled', value: `${money(o.modelled.tenant_saving_per_year)} a year saved by tenants. ${o.modelled.co2e_t_per_year.toFixed(1)} tonnes of CO2e a year avoided.` },
                    {
                      label: 'Measured',
                      value: o.verified.projects > 0 ? `${money(o.verified.tenant_saving_per_year)} a year across ${o.verified.projects} projects${o.verified.realisation_rate !== null ? `, which is ${Math.round(o.verified.realisation_rate * 100)}% of the modelled saving` : ''}.` : 'Not yet. A project needs about a year of readings first.',
                    },
                  ]}
                />
              </Panel>

              <ChartBox
                title="Billed and collected each month"
                description="Billed is the outlined bar. Collected is the solid bar."
                chart={
                  monthly.length === 0 ? (
                    <p className="mw-text-muted">No charges have been billed yet. Advance the demo clock to see billing.</p>
                  ) : (
                    <ChartContainer config={{ billed: { label: 'Billed', color: 'var(--chart-1)' }, collected: { label: 'Collected', color: 'var(--chart-1)' } }} className="mw-h-72 nsw-width-100" role="img" aria-label={`Billed and collected each month. Latest ${monthName(monthly[monthly.length - 1].month)}: billed ${money(monthly[monthly.length - 1].billed)}, collected ${money(monthly[monthly.length - 1].collected)}.`}>
                      <BarChart data={monthly} margin={{ left: 8, right: 8 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="month" tickFormatter={(m: string) => monthName(m)} minTickGap={16} />
                        <YAxis tickFormatter={(v: number) => money(v)} width={70} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="billed" fill="var(--card)" stroke="var(--chart-1)" strokeWidth={2} isAnimationActive={false} />
                        <Bar dataKey="collected" fill="var(--chart-1)" isAnimationActive={false} />
                      </BarChart>
                    </ChartContainer>
                  )
                }
                legend={
                  <>
                    <span className="nsw-display-inline-flex nsw-align-items-center mw-gap-1_5">
                      <span className="nsw-display-inline-block mw-size-3 mw-border-2 mw-border-brand nsw-fill-white" aria-hidden="true" /> Billed (outlined)
                    </span>
                    <span className="nsw-display-inline-flex nsw-align-items-center mw-gap-1_5">
                      <span className="nsw-display-inline-block mw-size-3 mw-bg-brand" aria-hidden="true" /> Collected (solid)
                    </span>
                  </>
                }
                table={{ columns: [{ label: 'Month' }, { label: 'Billed', numeric: true }, { label: 'Collected', numeric: true }, { label: 'Paused', numeric: true }, { label: 'Reserve', numeric: true }], rows: monthly.map((m) => [monthName(m.month), money(m.billed), money(m.collected), money(m.paused), money(m.reserve_balance)]) }}
              />
            </div>
          )
        }}
      </Gate>
    </div>
  )
}
