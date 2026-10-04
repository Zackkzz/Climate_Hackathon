import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { api } from '@/console/api'
import type { MvRun, Overview, Project, Reserve } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money, num } from '@/format'
import { ChartBox, LegendKey } from '@/portal/components/ChartBox'
import { DataTable } from '@/portal/components/DataTable'
import { Figures, PageHeader, Panel } from '@/portal/components/PageHeader'
import { Gate } from '@/portal/components/States'
import { StageBadge, STAGE_LABEL } from '@/portal/components/Status'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/portal/components/ui/chart'
import type { ChartConfig } from '@/portal/components/ui/chart'
import { monthLabel } from '@/portal/lib/dates-p2'
import { STAGES } from '@/console/types'

interface Loaded {
  overview: Overview
  reserve: Reserve
  projects: Project[]
  mv: Record<number, MvRun[]>
}

async function load(): Promise<Loaded> {
  const [overview, reserve, projects] = await Promise.all([api.overview(), api.reserve(), api.projects()])
  const mv: Record<number, MvRun[]> = {}
  await Promise.all(
    projects.map(async (p) => {
      try {
        mv[p.id] = await api.mv(p.id)
      } catch {
        mv[p.id] = []
      }
    }),
  )
  return { overview, reserve, projects, mv }
}

const latest = (runs: MvRun[] | undefined) => (runs && runs.length ? runs[runs.length - 1] : null)

const moneyCfg = { billed: { label: 'Billed', color: 'var(--chart-2)' }, collected: { label: 'Collected', color: 'var(--chart-1)' } } satisfies ChartConfig
const pipeCfg = { count: { label: 'Projects', color: 'var(--chart-1)' } } satisfies ChartConfig
const mvCfg = { modelled: { label: 'Modelled', color: 'var(--chart-2)' }, verified: { label: 'Measured', color: 'var(--chart-1)' } } satisfies ChartConfig

function Body({ d }: { d: Loaded }) {
  const o = d.overview
  const monthly = o.monthly.slice(-24)
  const pipeline = STAGES.map((s) => ({ stage: STAGE_LABEL[s], count: o.pipeline[s] ?? 0 }))
  const mvRows = d.projects.map((p) => ({ p, run: latest(d.mv[p.id]) })).filter((r) => r.run)
  const mvChart = mvRows.map((r) => ({ name: r.p.label.split(',')[0], modelled: Math.round(r.run!.modelled_saving_per_month), verified: Math.round(r.run!.verified_saving_per_month) }))

  const cols = useMemo<ColumnDef<{ p: Project; run: MvRun | null }>[]>(
    () => [
      { id: 'label', header: 'Block', accessorFn: (r) => r.p.label, cell: ({ row }) => <span className="nsw-text-medium">{row.original.p.label}</span> },
      { id: 'stage', header: 'Stage', accessorFn: (r) => STAGE_LABEL[r.p.stage], cell: ({ row }) => <StageBadge stage={row.original.p.stage} /> },
      { id: 'flats', header: 'Flats', accessorFn: (r) => r.p.flats, meta: { numeric: true } },
      { id: 'capex', header: 'Net cost', accessorFn: (r) => r.p.summary.net_capex, cell: ({ getValue }) => money(getValue<number>()), meta: { numeric: true } },
      { id: 'gap', header: 'Funding gap', accessorFn: (r) => r.p.summary.funding_gap, cell: ({ getValue }) => money(getValue<number>()), meta: { numeric: true } },
      { id: 'charge', header: 'Charges a month', accessorFn: (r) => r.p.summary.charge_per_month_building, cell: ({ getValue }) => money(getValue<number>()), meta: { numeric: true } },
      { id: 'mod', header: 'Modelled saving a month', accessorFn: (r) => r.run?.modelled_saving_per_month ?? null, cell: ({ getValue }) => (getValue<number | null>() === null ? <span className="mw-text-muted">Not yet</span> : money(getValue<number>())), meta: { numeric: true } },
      { id: 'ver', header: 'Measured saving a month', accessorFn: (r) => r.run?.verified_saving_per_month ?? null, cell: ({ getValue }) => (getValue<number | null>() === null ? <span className="mw-text-muted">Not yet</span> : money(getValue<number>())), meta: { numeric: true } },
      { id: 'rate', header: 'Share of modelled saving', accessorFn: (r) => (r.run ? Math.round(r.run.realisation_rate * 100) : null), cell: ({ getValue }) => (getValue<number | null>() === null ? <span className="mw-text-muted">Not yet</span> : `${getValue<number>()}%`), meta: { numeric: true, csv: (r) => (r.run ? Math.round(r.run.realisation_rate * 100) : '') } },
      { id: 'neutral', header: 'Flats no worse off', accessorFn: (r) => (r.run ? `${r.run.bill_neutral_flats} of ${r.run.flats_verified}` : ''), meta: { numeric: true } },
      { id: 'tu', header: 'Charge changes', accessorFn: (r) => r.run?.true_ups.length ?? 0, meta: { numeric: true } },
    ],
    [],
  )
  const rows = d.projects.map((p) => ({ p, run: latest(d.mv[p.id]) }))

  const rate = o.verified.realisation_rate
  return (
    <>
      <Figures
        label="Portfolio figures"
        items={[
          { label: 'Capital deployed', value: money(o.money.deployed), note: `of ${money(o.programme.capital_committed)} committed` },
          { label: 'Repaid so far', value: money(o.money.repaid), note: `${money(o.money.interest)} interest`, tone: 'good' },
          { label: 'Loss reserve', value: money(d.reserve.balance) },
          { label: 'Arrears', value: money(o.money.arrears), tone: o.money.arrears > 0 ? 'warn' : undefined, note: 'Unpaid charges' },
          { label: 'Grant used', value: money(o.money.grant_used), note: `of ${money(o.programme.grant_pool)}` },
          { label: 'Measured vs modelled', value: rate === null ? 'Not yet' : `${Math.round(rate * 100)}%`, note: `${o.verified.projects} projects checked` },
        ]}
      />

      <div className="nsw-display-grid mw-gap-4 mw-lg-grid-cols-2">
        <ChartBox
          title="Projects by stage"
          chart={
            <ChartContainer config={pipeCfg} className="mw-h-56 nsw-width-100">
              <BarChart data={pipeline} layout="vertical" margin={{ left: 8, right: 24 }} accessibilityLayer>
                <CartesianGrid horizontal={false} />
                <YAxis dataKey="stage" type="category" width={90} tickLine={false} axisLine={false} />
                <XAxis type="number" allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={0} label={{ position: 'right', fontSize: 12 }} />
              </BarChart>
            </ChartContainer>
          }
          table={{ columns: [{ label: 'Stage' }, { label: 'Projects', numeric: true }], rows: pipeline.map((r) => [r.stage, r.count]) }}
        />
        <ChartBox
          title="Billed and collected each month"
          description="Charges on flat meters, in dollars."
          legend={
            <>
              <LegendKey label="Billed (dashed)" color="var(--chart-2)" dashed />
              <LegendKey label="Collected (solid)" color="var(--chart-1)" />
            </>
          }
          chart={
            monthly.length === 0 ? (
              <p className="mw-text-muted">No charges have been billed yet.</p>
            ) : (
              <ChartContainer config={moneyCfg} className="mw-h-56 nsw-width-100">
                <LineChart data={monthly} margin={{ left: 4, right: 12 }} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m).slice(0, 3) + ' ' + m.slice(2, 4)} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tickFormatter={(v: number) => '$' + num(v)} width={56} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line dataKey="billed" stroke="var(--color-billed)" strokeWidth={2.5} strokeDasharray="6 4" dot={false} />
                  <Line dataKey="collected" stroke="var(--color-collected)" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ChartContainer>
            )
          }
          table={{ columns: [{ label: 'Month' }, { label: 'Billed', numeric: true }, { label: 'Collected', numeric: true }], rows: monthly.map((m) => [monthLabel(m.month), money(m.billed), money(m.collected)]) }}
        />
      </div>

      <div className="mw-mt-4">
        <ChartBox
          title="Measured savings against the model"
          description="Latest savings check for each project, per flat per month."
          legend={
            <>
              <span className="nsw-display-inline-flex nsw-align-items-center mw-gap-1_5">
                <svg width="14" height="14" aria-hidden="true">
                  <rect width="14" height="14" fill="var(--chart-2)" />
                </svg>
                Modelled (grey, left bar)
              </span>
              <span className="nsw-display-inline-flex nsw-align-items-center mw-gap-1_5">
                <svg width="14" height="14" aria-hidden="true">
                  <rect width="14" height="14" fill="var(--chart-1)" />
                </svg>
                Measured (blue, right bar)
              </span>
            </>
          }
          chart={
            mvChart.length === 0 ? (
              <p className="mw-text-muted">No project has a savings check yet. A project needs about a year of readings first.</p>
            ) : (
              <ChartContainer config={mvCfg} className="mw-h-60 nsw-width-100">
                <BarChart data={mvChart} margin={{ left: 4, right: 12 }} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" interval={0} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => '$' + v} width={48} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="modelled" fill="var(--color-modelled)" label={{ position: 'top', fontSize: 11 }} />
                  <Bar dataKey="verified" fill="var(--color-verified)" label={{ position: 'top', fontSize: 11 }} />
                </BarChart>
              </ChartContainer>
            )
          }
          table={{ columns: [{ label: 'Block' }, { label: 'Modelled a month', numeric: true }, { label: 'Measured a month', numeric: true }], rows: mvChart.map((r) => [r.name, money(r.modelled), money(r.verified)]) }}
        />
      </div>

      <div className="mw-mt-4">
        <Panel title="Projects" description="No tenant names are shown.">
          <DataTable columns={cols} data={rows} caption="Project figures" csvName="funder-projects" searchPlaceholder="Search projects" getRowId={(r) => String(r.p.id)} initialHidden={{ gap: false, charge: false, neutral: false }} emptyTitle="No projects" />
        </Panel>
      </div>
    </>
  )
}

export default function Funder() {
  const res = useRes(load, [])
  useEffect(() => {
    document.title = 'Portfolio | Meterwise'
  }, [])
  return (
    <div>
      <PageHeader crumbs={[{ label: 'Funder' }, { label: 'Portfolio' }]} title="Portfolio" description="Read-only view of money deployed and repaid, the reserve and how the upgrades perform." />
      <Gate res={res} rows={6}>
        {(d) => <Body d={d} />}
      </Gate>
    </div>
  )
}
