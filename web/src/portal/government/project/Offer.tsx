import { useState } from 'react'
import { money, num, num1, pct } from '@/format'
import type { Schedule, Sizing } from '@/console/types'
import { DataTable } from '@/portal/components/DataTable'
import { EmptyState } from '@/portal/components/States'
import { Facts, Panel } from '@/portal/components/PageHeader'
import { StatusBadge } from '@/portal/components/Status'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/portal/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/portal/components/ui/table'
import { monthLabelAu } from '@/portal/lib/dates'
import { DocumentList } from './Documents'
import type { TabProps } from './shared'

const POS: Record<string, string> = { top: 'Top-floor flats', lower: 'Lower-floor flats' }

function SizingTables({ s }: { s: Sizing }) {
  const e = s.electrical
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border" role="region" aria-label="Right-sized air conditioners" tabIndex={0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flats</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Size without the roof</TableHead>
              <TableHead className="text-right">Size with the package</TableHead>
              <TableHead className="text-right">Cost each, without</TableHead>
              <TableHead className="text-right">Cost each, with</TableHead>
              <TableHead className="text-right">Load cut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.groups.map((g) => (
              <TableRow key={g.position}>
                <TableCell>{POS[g.position] ?? g.position}</TableCell>
                <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                <TableCell className="text-right tabular-nums">{num1(g.unit_kw_without_roof)} kW</TableCell>
                <TableCell className="text-right tabular-nums">{num1(g.unit_kw_with_package)} kW</TableCell>
                <TableCell className="text-right tabular-nums">{money(g.unit_cost_without_roof)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(g.unit_cost_with_package)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(g.reduction_pct)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Facts
        items={[
          { label: 'Saved by right-sizing', value: money(s.capex_saved_by_right_sizing) },
          { label: 'Hot water', value: `${s.hot_water.units} units of ${num1(s.hot_water.kw_each)} kW. ${s.hot_water.note}` },
          { label: 'Each flat supply', value: e.flat_supply_ok ? <StatusBadge tone="good">Supply is enough</StatusBadge> : <StatusBadge tone="warn">Supply upgrade likely</StatusBadge> },
          { label: 'Switchboard', value: e.switchboard_upgrade_likely ? <StatusBadge tone="warn">Upgrade likely</StatusBadge> : <StatusBadge tone="good">No upgrade likely</StatusBadge> },
          { label: 'Building peak', value: `${num1(e.building_peak_kw_after)} kW with the package, ${num1(e.building_peak_kw_after_without_roof)} kW without the roof, ${num1(e.building_peak_kw_before)} kW now` },
          { label: 'Note', value: `${e.note}${e.kind === 'assumption' ? ' (an assumption)' : ''}` },
        ]}
      />
      {s.warnings.length > 0 && (
        <ul className="list-disc pl-5">
          {s.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ScheduleView({ sc }: { sc: Schedule }) {
  const [pos, setPos] = useState(sc.groups[0]?.position ?? 'top')
  const g = sc.groups.find((x) => x.position === pos) ?? sc.groups[0]
  return (
    <div className="space-y-3">
      <Facts
        items={[
          { label: 'Term', value: `${sc.term_years} years, ${monthLabelAu(sc.start)} to ${monthLabelAu(sc.end)}` },
          { label: 'Whole block', value: `${money(sc.building.charge_per_month)} a month. Total repaid ${money(sc.building.total_repaid)}, of which interest ${money(sc.building.total_interest)}.` },
          { label: 'Reserve', value: `${money(sc.reserve.contribution_total)} over the term. ${sc.reserve.note}` },
        ]}
      />
      {sc.equipment_life_check && sc.equipment_life_check.some((x) => !x.ok) && (
        <p className="text-warning">Some equipment may not last the whole term: {sc.equipment_life_check.filter((x) => !x.ok).map((x) => `${x.key.replace(/_/g, ' ')} (${x.life_years} years)`).join(', ')}.</p>
      )}
      {g && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="sched-group" className="text-sm">
              Charge schedule for
            </label>
            <Select value={g.position} onValueChange={setPos}>
              <SelectTrigger id="sched-group" size="sm" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sc.groups.map((x) => (
                  <SelectItem key={x.position} value={x.position}>
                    {POS[x.position] ?? x.position} ({x.count} flats)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {money(g.charge_per_month)} a month on {money(g.principal_per_flat)} each
            </span>
          </div>
          <DataTable
            caption="Charge schedule"
            data={g.rows}
            getRowId={(r) => String(r.n)}
            pageSize={10}
            searchPlaceholder="Search the schedule by month"
            csvName={`charge-schedule-${g.position}`}
            columns={[
              { accessorKey: 'n', header: 'No.', meta: { numeric: true } },
              { id: 'month', header: 'Month', accessorFn: (r) => monthLabelAu(r.month), meta: { csv: (r) => r.month } },
              { accessorKey: 'charge', header: 'Charge', cell: ({ row }) => money(row.original.charge), meta: { numeric: true } },
              { accessorKey: 'interest', header: 'Interest', cell: ({ row }) => money(row.original.interest), meta: { numeric: true } },
              { accessorKey: 'principal', header: 'Principal', cell: ({ row }) => money(row.original.principal), meta: { numeric: true } },
              { accessorKey: 'balance', header: 'Balance', cell: ({ row }) => money(row.original.balance), meta: { numeric: true } },
            ]}
          />
        </>
      )}
    </div>
  )
}

export default function Offer({ p }: TabProps) {
  const a = p.assessment
  if (!a) {
    return (
      <EmptyState title="No offer has been issued yet">
        The offer is made when the project moves to the Offer stage. It freezes the assessment, the equipment sizing and the charge schedule, and makes the documents.
      </EmptyState>
    )
  }
  const items = a.package.items.filter((i) => i.selected)
  return (
    <div className="space-y-4">
      <Panel title="Frozen assessment" description="These figures were fixed when the offer was issued.">
        <div className="overflow-x-auto border" role="region" aria-label="Upgrade costs" tabIndex={0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Upgrade</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Rebate</TableHead>
                <TableHead className="text-right">Net cost</TableHead>
                <TableHead className="text-right">Saves a year</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.key}>
                  <TableCell>
                    {i.label}
                    <div className="text-sm text-muted-foreground">{i.note}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(i.capex)}</TableCell>
                  <TableCell className="text-right tabular-nums">{i.rebate > 0 ? `-${money(i.rebate)}` : '-'}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(i.net_capex)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(i.saving_per_year)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{money(a.package.capex_total)}</TableCell>
                <TableCell className="text-right tabular-nums">{a.package.rebates_total > 0 ? `-${money(a.package.rebates_total)}` : '-'}</TableCell>
                <TableCell className="text-right tabular-nums">{money(a.package.net_capex)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="mt-2">
          The capped charges can repay {money(a.package.max_fundable_capex)}. {a.package.fully_funded ? 'The package is fully funded.' : `That leaves a gap of ${money(a.package.funding_gap)}.`}
        </p>
      </Panel>

      <Panel title="Charge on each flat's meter">
        <div className="overflow-x-auto border" role="region" aria-label="Charges by group of flats" tabIndex={0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flats</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Saves a year</TableHead>
                <TableHead className="text-right">Charge a month</TableHead>
                <TableHead className="text-right">Tenant keeps a month</TableHead>
                <TableHead>Bill neutral</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.flat_groups.map((g) => (
                <TableRow key={g.position}>
                  <TableCell>{g.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(g.count)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(g.saving_per_year)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(g.charge_per_month)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(g.net_saving_per_month)}</TableCell>
                  <TableCell>{g.bill_neutral ? <StatusBadge tone="good">Yes</StatusBadge> : <StatusBadge tone="bad">No</StatusBadge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel title="Right-sized equipment">{p.sizing ? <SizingTables s={p.sizing} /> : <p className="text-muted-foreground">No sizing was saved with the offer.</p>}</Panel>
      <Panel title="Charge schedule">{p.schedule ? <ScheduleView sc={p.schedule} /> : <p className="text-muted-foreground">No schedule was saved with the offer.</p>}</Panel>
      <Panel title="Documents">
        <DocumentList projectId={p.id} />
      </Panel>
    </div>
  )
}
