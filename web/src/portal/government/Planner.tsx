import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { toast } from '@/portal/components/ui/sonner'
import { z } from 'zod'
import { api } from '@/console/api'
import type { PlanResult } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money, num, num1 } from '@/format'
import { Confirm } from '@/portal/components/Confirm'
import { DataTable } from '@/portal/components/DataTable'
import { Figures, PageHeader, Panel } from '@/portal/components/PageHeader'
import { ErrorAlert } from '@/portal/components/States'
import { CheckField, NumberField, SelectField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Form } from '@/portal/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/portal/components/ui/select'
import { useAction } from '@/portal/lib/actions'
import { ownerOrgs, usePageTitle } from './shared'

const OBJ = [
  { value: 'tenant_saving', label: 'Tenant savings' },
  { value: 'co2', label: 'Emissions cut' },
  { value: 'heat_relief', label: 'Heat relief' },
  { value: 'flats_reached', label: 'Flats reached' },
]
const schema = z.object({
  capital_budget: z.coerce.number({ message: 'Enter a capital budget in dollars.' }).min(0, 'The budget cannot be negative.').max(1e9, 'That budget is too large.'),
  grant_budget: z.coerce.number({ message: 'Enter a grant budget in dollars.' }).min(0, 'The budget cannot be negative.').max(1e9, 'That budget is too large.'),
  objective: z.enum(['tenant_saving', 'co2', 'heat_relief', 'flats_reached']),
  bulk: z.boolean(),
})
type In = z.input<typeof schema>
type Sel = PlanResult['selected'][number]
type Not = PlanResult['not_selected'][number]

export default function Planner() {
  usePageTitle('Portfolio planner')
  const [result, setResult] = useState<PlanResult | null>(null)
  const plan = useAction()
  const create = useAction()
  const orgs = useRes(() => api.orgs(), [])
  const [owner, setOwner] = useState('')
  const [made, setMade] = useState<number | null>(null)
  const form = useForm<In, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { capital_budget: 1500000, grant_budget: 300000, objective: 'tenant_saving', bulk: true } })

  const ownerList = ownerOrgs(orgs.data ?? [])
  const ownerId = owner || (ownerList[0] ? String(ownerList[0].id) : '')

  const createAll = async () => {
    if (!result || !ownerId) return
    let n = 0
    setMade(0)
    const r = await create.run(async () => {
      for (const s of result.selected) {
        await api.createProject(s.building_id, Number(ownerId))
        n += 1
        setMade(n)
      }
      return n
    })
    if (r !== undefined) toast.success(`${r} projects started`)
  }

  const selCols = useMemo<ColumnDef<Sel>[]>(
    () => [
      { accessorKey: 'label', header: 'Block' },
      { accessorKey: 'flats', header: 'Flats', meta: { numeric: true } },
      { accessorKey: 'capital_used', header: 'Capital', cell: ({ row }) => money(row.original.capital_used), meta: { numeric: true, csv: (s: Sel) => s.capital_used } },
      { accessorKey: 'grant_used', header: 'Grant', cell: ({ row }) => money(row.original.grant_used), meta: { numeric: true, csv: (s: Sel) => s.grant_used } },
      { accessorKey: 'tenant_net_saving_per_month', header: 'Tenant keeps a month', cell: ({ row }) => money(row.original.tenant_net_saving_per_month), meta: { numeric: true, csv: (s: Sel) => s.tenant_net_saving_per_month } },
      { accessorKey: 'co2e_t_per_year_saved', header: 'CO2e a year (t)', cell: ({ row }) => num1(row.original.co2e_t_per_year_saved), meta: { numeric: true, csv: (s: Sel) => s.co2e_t_per_year_saved } },
      { accessorKey: 'top_floor_hours_above_30c_avoided', header: 'Hot hours avoided', cell: ({ row }) => num(row.original.top_floor_hours_above_30c_avoided), meta: { numeric: true, csv: (s: Sel) => s.top_floor_hours_above_30c_avoided } },
      { accessorKey: 'score', header: 'Score', cell: ({ row }) => row.original.score.toFixed(2), meta: { numeric: true, csv: (s: Sel) => s.score } },
    ],
    [],
  )
  const notCols = useMemo<ColumnDef<Not>[]>(() => [{ accessorKey: 'label', header: 'Block' }, { accessorKey: 'reason', header: 'Why it was left out', cell: ({ row }) => <span className="mw-ws-normal">{row.original.reason}</span> }], [])

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Portfolio planner' }]} title="Portfolio planner" description="Give a capital budget and a grant budget. The planner picks the blocks that do the most good within them, and says why it left the others out. Buying many units together can lower prices." />
      <Form {...form}>
        <form
          className="mw-mb-4 mw-border nsw-fill-white mw-p-4"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            setMade(null)
            const r = await plan.run(() => api.plan({ capital_budget: v.capital_budget, grant_budget: v.grant_budget, objective: v.objective, bulk: v.bulk }))
            if (r) setResult(r)
          })}
        >
          <div className="nsw-display-grid mw-gap-3 mw-sm-grid-cols-2 mw-lg-grid-cols-4">
            <NumberField control={form.control} name="capital_budget" label="Capital budget ($)" step={10000} min={0} />
            <NumberField control={form.control} name="grant_budget" label="Grant budget ($)" step={10000} min={0} />
            <SelectField control={form.control} name="objective" label="What matters most" options={OBJ} />
            <CheckField control={form.control} name="bulk" label="Count bulk-buying discounts" className="mw-sm-pt-7" />
          </div>
          <div className="mw-mt-3 mw-space-y-2">
            <ErrorAlert error={plan.error} title="We could not plan the portfolio" />
            <Button type="submit" disabled={plan.busy}>
              {plan.busy ? 'Planning' : 'Plan the portfolio'}
            </Button>
            {plan.busy && <p role="status" className="mw-text-muted">This can take up to 20 seconds.</p>}
          </div>
        </form>
      </Form>

      {result && (
        <div className="mw-space-y-4">
          <Figures
            label="Plan totals"
            items={[
              { label: 'Blocks chosen', value: num(result.totals.buildings), note: `${num(result.totals.flats)} flats` },
              { label: 'Capital used', value: money(result.totals.capital_used), note: `${money(result.totals.capital_left)} left` },
              { label: 'Grant used', value: money(result.totals.grant_used), note: `${money(result.totals.grant_left)} left` },
              { label: 'Tenant savings', value: `${money(result.totals.tenant_saving_per_year)} a year` },
              { label: 'Emissions cut', value: `${num1(result.totals.co2e_t_per_year_saved)} t a year` },
              { label: 'Saved by bulk buying', value: result.bulk.applied ? money(result.bulk.capex_saved) : 'Not counted' },
            ]}
          />
          <p className="mw-text-muted">{result.method}</p>
          <Panel title="Chosen blocks">
            <DataTable columns={selCols} data={result.selected} caption="Chosen blocks table" getRowId={(s) => s.building_id} csvName="planner-chosen" searchPlaceholder="Search chosen blocks" emptyTitle="No block fits" emptyText="No block fits these budgets." />
            {result.selected.length > 0 && (
              <div className="mw-mt-3 nsw-display-flex nsw-flex-wrap nsw-align-items-end mw-gap-3 mw-border-t mw-pt-3">
                <div className="nsw-display-flex nsw-flex-column mw-gap-1_5">
                  <label htmlFor="plan-owner" className="nsw-small nsw-text-medium">
                    Housing provider for the new projects
                  </label>
                  <Select value={ownerId} onValueChange={setOwner}>
                    <SelectTrigger id="plan-owner" className="mw-w-72">
                      <SelectValue placeholder="Choose a provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {ownerList.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Confirm title={`Start ${result.selected.length} projects?`} description={<p>This starts one project for each chosen block, at the screened stage, owned by the provider you picked. Nothing is charged to anyone.</p>} confirmLabel="Start projects" onConfirm={createAll}>
                  <Button disabled={create.busy || !ownerId || made === result.selected.length}>
                    {create.busy ? `Starting ${made ?? 0} of ${result.selected.length}` : made === result.selected.length ? 'Projects started' : `Start ${result.selected.length} projects`}
                  </Button>
                </Confirm>
                {made === result.selected.length && made > 0 && (
                  <p role="status" className="nsw-text-medium mw-text-success">
                    Done. <Link to="/government/projects">See them in the projects list</Link>.
                  </p>
                )}
              </div>
            )}
            <div className="mw-mt-2">
              <ErrorAlert error={create.error} title="Some projects were not started" />
            </div>
          </Panel>
          {result.not_selected.length > 0 && (
            <Panel title="Blocks left out">
              <DataTable columns={notCols} data={result.not_selected} caption="Left-out blocks table" getRowId={(s) => s.building_id} csvName="planner-left-out" searchPlaceholder="Search left-out blocks" />
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}
