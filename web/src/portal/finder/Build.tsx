import { useId, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { money, moneyApprox, num, num1 } from '@/format'
import type { Async } from '@/hooks'
import { balanceFor, makeVerdict, weekComfort, ITEM_BENEFIT, ITEM_SHORT } from '@/verdict'
import type { GroupSel } from '@/verdict'
import { dealToRequest } from '@/state'
import type { AssessResponse, BuildingCollection, Deal, Existing, Finance, Meta, Package, PackageKey, Tariff } from '@/types'
import { PACKAGE_KEYS } from '@/types'
import { ChartBox, LegendKey } from '@/portal/components/ChartBox'
import { Figures, Panel } from '@/portal/components/PageHeader'
import { ErrorAlert, LoadingRows } from '@/portal/components/States'
import { Alert, AlertDescription, AlertTitle } from '@/portal/components/ui/alert'
import { Button } from '@/portal/components/ui/button'
import { Checkbox } from '@/portal/components/ui/checkbox'
import { Input } from '@/portal/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/portal/components/ui/select'
import { Switch } from '@/portal/components/ui/switch'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/portal/components/ui/table'
import { RiskPanel, SizingPanel } from './Analysis'

const TITLES: Record<PackageKey, string> = {
  cool_roof: 'Cool roof',
  heat_pump_hot_water: 'Heat pump hot water',
  reverse_cycle: 'Reverse-cycle air conditioning',
  induction_cooktop: 'Induction cooktop',
  ceiling_insulation: 'Ceiling insulation',
  disconnect_gas: 'Disconnect gas',
}

/** Which gas appliances would still be left, given what is in the flats and what goes in. */
export function gasLeft(ex: Existing, pk: Package): string[] {
  const left: string[] = []
  if (ex.hot_water !== 'electric_storage' && !pk.heat_pump_hot_water) left.push(ITEM_SHORT.heat_pump_hot_water)
  if (ex.heating === 'gas_heater' && !pk.reverse_cycle) left.push(ITEM_SHORT.reverse_cycle)
  if (ex.cooktop === 'gas' && !pk.induction_cooktop) left.push(ITEM_SHORT.induction_cooktop)
  return left
}

/** Gas can only be disconnected when no gas appliance is left. */
export function normalise(d: Deal): Deal {
  if (d.package.disconnect_gas && gasLeft(d.existing, d.package).length > 0) return { ...d, package: { ...d.package, disconnect_gas: false } }
  return d
}

// ---------- inputs ----------
function OptionSelect({ label, options, value, onChange }: { label: string; options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  const id = useId()
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.key} value={o.key}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function CountField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const id = useId()
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input id={id} type="number" inputMode="numeric" min={min} max={max} value={Number.isFinite(value) ? value : ''} className="tabular-nums" onChange={(e) => e.target.value !== '' && Number.isFinite(Number(e.target.value)) && onChange(Math.min(max, Math.max(min, Math.round(Number(e.target.value)))))} />
    </div>
  )
}

function UpgradeRow({ k, on, onToggle, disabledReason, result }: { k: PackageKey; on: boolean; onToggle: () => void; disabledReason: string | null; result: AssessResponse | null }) {
  const raw = result?.package.items.find((i) => i.key === k)
  const item = raw ? (raw.selected ? raw : { ...raw, capex: raw.capex_if_selected ?? raw.capex, rebate: raw.rebate_if_selected ?? raw.rebate, saving_per_year: raw.saving_per_year_if_selected ?? raw.saving_per_year }) : undefined
  const id = useId()
  return (
    <li className="flex items-start gap-3 border-b py-2.5 last:border-b-0">
      <Switch id={id} checked={on} onCheckedChange={onToggle} disabled={!!disabledReason} aria-describedby={`${id}-d`} className="mt-1" />
      <div className="min-w-0">
        <label htmlFor={id} className="font-medium">
          {TITLES[k]}
        </label>
        <p id={`${id}-d`} className="text-sm text-muted-foreground">
          {disabledReason ?? ITEM_BENEFIT[k]}
          {!disabledReason && item && item.capex > 0 && (
            <>
              {' '}
              {item.rebate > 0 ? `${money(item.capex - item.rebate)} for the block, after ${money(item.rebate)} rebate.` : `${money(item.capex)} for the block.`}
              {item.saving_per_year > 0 && ` ${on ? 'Saves' : 'Would save'} about ${money(item.saving_per_year)} a year in bills.`}
            </>
          )}
        </p>
      </div>
    </li>
  )
}

function Slider({ label, help, value, min, max, step, format, onChange }: { label: string; help: string; value: number; min: number; max: number; step: number; format: (n: number) => string; onChange: (n: number) => void }) {
  const id = useId()
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <output htmlFor={id} className="tabular-nums">
          {format(value)}
        </output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-6 w-full accent-primary" />
      <p className="text-sm text-muted-foreground">{help}</p>
    </div>
  )
}

function NumField({ label, help, value, step, unit, onChange }: { label: string; help: string; value: number; step: number; unit: string; onChange: (n: number) => void }) {
  const id = useId()
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" min={0} step={step} value={value} className="w-28 tabular-nums" onChange={(e) => e.target.value !== '' && onChange(Math.max(0, Number(e.target.value)))} />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      <p className="text-sm text-muted-foreground">{help}</p>
    </div>
  )
}

function Inputs({ deal, meta, result, base, onChange, onChangeBlock, shortlisted, onShortlist }: { deal: Deal; meta: Meta; result: AssessResponse | null; base: { label: string; flats: number; storeys: number }; onChange: (d: Deal) => void; onChangeBlock: () => void; shortlisted: boolean | null; onShortlist: () => void }) {
  const set = (patch: Partial<Deal>) => onChange(normalise({ ...deal, ...patch }))
  const setEx = (k: keyof Existing, v: string) => set({ existing: { ...deal.existing, [k]: v } })
  const setPk = (k: PackageKey) => set({ package: { ...deal.package, [k]: !deal.package[k] } })
  const setFin = (patch: Partial<Finance>) => set({ finance: { ...deal.finance, ...patch } })
  const setTar = (patch: Partial<Tariff>) => set({ tariff: { ...deal.tariff, ...patch } })
  const o = meta.options
  const flats = deal.flats ?? base.flats
  const storeys = deal.storeys ?? base.storeys
  const left = gasLeft(deal.existing, deal.package)
  const finDef = JSON.stringify(deal.finance) === JSON.stringify(meta.defaults.finance) && JSON.stringify(deal.tariff) === JSON.stringify(meta.defaults.tariff)
  return (
    <div className="space-y-3">
      <Panel
        title={base.label}
        description="Your block"
        actions={
          <Button variant="outline" size="sm" onClick={onChangeBlock}>
            Change block
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <CountField label="Flats" value={flats} min={1} max={200} onChange={(n) => set({ flats: n })} />
          <CountField label="Storeys" value={storeys} min={1} max={12} onChange={(n) => set({ storeys: n })} />
        </div>
        {shortlisted !== null && (
          <Button variant="outline" size="sm" className="mt-3" aria-pressed={shortlisted} onClick={onShortlist}>
            {shortlisted ? 'On your shortlist' : 'Add to shortlist'}
          </Button>
        )}
      </Panel>

      <Panel title="What's in the flats now?" description="Pick what is there today. This sets the starting bill.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <OptionSelect label="Hot water" options={o.hot_water} value={deal.existing.hot_water} onChange={(k) => setEx('hot_water', k)} />
          <OptionSelect label="Heating" options={o.heating} value={deal.existing.heating} onChange={(k) => setEx('heating', k)} />
          <OptionSelect label="Cooling" options={o.cooling} value={deal.existing.cooling} onChange={(k) => setEx('cooling', k)} />
          <OptionSelect label="Cooktop" options={o.cooktop} value={deal.existing.cooktop} onChange={(k) => setEx('cooktop', k)} />
          <OptionSelect label="Roof" options={o.roof} value={deal.existing.roof} onChange={(k) => setEx('roof', k)} />
        </div>
      </Panel>

      <Panel title="What goes in?" description="Switch upgrades on and off. The result updates as you go.">
        <ul>
          {PACKAGE_KEYS.map((k) => (
            <UpgradeRow key={k} k={k} on={deal.package[k]} onToggle={() => setPk(k)} disabledReason={k === 'disconnect_gas' && left.length > 0 ? `Needs ${left.join(' and ')} first, so no gas appliance is left` : null} result={result} />
          ))}
        </ul>
      </Panel>

      <details className="border bg-card">
        <summary className="cursor-pointer px-4 py-2.5 font-semibold">Advanced: finance terms and prices</summary>
        <div className="space-y-4 border-t p-4">
          <h3 className="font-semibold">Finance</h3>
          <Slider label="Investor's return needed" help="What the investor needs to earn on the money each year." value={Math.round(deal.finance.cost_of_capital * 1000) / 10} min={0} max={12} step={0.5} format={(n) => `${n.toFixed(1)}% a year`} onChange={(n) => setFin({ cost_of_capital: n / 100 })} />
          <Slider label="Repayment period" help="How long the monthly charge stays tied to the flat. Longer means a smaller charge." value={deal.finance.term_years} min={5} max={25} step={1} format={(n) => `${n} years`} onChange={(n) => setFin({ term_years: n })} />
          <Slider
            label="Share of the saving the tenant keeps, at least"
            help="The monthly charge never takes more than the rest of a flat's saving."
            value={Math.round((1 - deal.finance.savings_share_to_charge) * 100)}
            min={0}
            max={60}
            step={5}
            format={(n) => `${n}%`}
            onChange={(n) => setFin({ savings_share_to_charge: Math.round((1 - n / 100) * 100) / 100 })}
          />
          <Slider label="Cushion for gaps" help="Extra added to what must be repaid, to cover empty flats and admin costs." value={Math.round(deal.finance.reserve * 100)} min={0} max={20} step={1} format={(n) => `${n}%`} onChange={(n) => setFin({ reserve: n / 100 })} />
          <label className="flex items-start gap-2">
            <Checkbox checked={deal.finance.apply_rebates} onCheckedChange={(c) => setFin({ apply_rebates: !!c })} className="mt-0.5" />
            <span>
              Count government rebates
              <span className="block text-sm text-muted-foreground">Rebates cut the cost of eligible upgrades. Turn off to see the deal without them.</span>
            </span>
          </label>
          <h3 className="font-semibold">Prices</h3>
          <NumField label="Electricity" help="Price per unit of electricity." value={deal.tariff.electricity_c_per_kwh} step={0.5} unit="c/kWh" onChange={(n) => setTar({ electricity_c_per_kwh: n })} />
          <NumField label="Electricity fixed charge" help="Daily charge just for being connected." value={deal.tariff.electricity_supply_c_per_day} step={1} unit="c/day" onChange={(n) => setTar({ electricity_supply_c_per_day: n })} />
          <NumField label="Gas" help="Price per megajoule of gas." value={deal.tariff.gas_c_per_mj} step={0.1} unit="c/MJ" onChange={(n) => setTar({ gas_c_per_mj: n })} />
          <NumField label="Gas fixed charge" help="Daily charge for the gas connection. Disconnecting gas removes it." value={deal.tariff.gas_supply_c_per_day} step={1} unit="c/day" onChange={(n) => setTar({ gas_supply_c_per_day: n })} />
          <Button variant="outline" size="sm" disabled={finDef} onClick={() => set({ finance: { ...meta.defaults.finance }, tariff: { ...meta.defaults.tariff } })}>
            Reset to defaults
          </Button>
        </div>
      </details>
    </div>
  )
}

// ---------- results ----------
function Verdict({ r }: { r: AssessResponse }) {
  const v = makeVerdict(r)
  return (
    <Alert variant={v.tone === 'bad' ? 'destructive' : 'default'} role="status" className={v.tone === 'good' ? 'border-success/50 bg-success-bg' : v.tone === 'warn' ? 'border-warning/50 bg-warning-bg' : ''}>
      <AlertTitle className="text-base">{v.headline}</AlertTitle>
      <AlertDescription>
        <p>{v.detail}</p>
        {v.hints.length > 0 && (
          <ul className="mt-1 list-disc pl-5">
            {v.hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  )
}

function Warnings({ r }: { r: AssessResponse }) {
  if (r.warnings.length === 0) return null
  const first = r.warnings.slice(0, 3)
  const rest = r.warnings.slice(3)
  return (
    <Panel title="Things to know">
      <ul className="list-disc space-y-1 pl-5">
        {first.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-primary underline">Show {rest.length} more</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {rest.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  )
}

function GroupsTable({ r }: { r: AssessResponse }) {
  return (
    <div className="overflow-x-auto border" role="region" aria-label="Monthly figures for each group of flats" tabIndex={0}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Flats</TableHead>
            <TableHead className="text-right">Bill now</TableHead>
            <TableHead className="text-right">New bill</TableHead>
            <TableHead className="text-right">Monthly charge</TableHead>
            <TableHead className="text-right">Tenant keeps</TableHead>
            <TableHead>Better off?</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {r.flat_groups.map((g) => (
            <TableRow key={g.position}>
              <TableCell>
                {g.label} ({g.count})
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(g.baseline.bill_per_year / 12)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(g.upgraded.bill_per_year / 12)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(g.charge_per_month)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{money(g.net_saving_per_month)}</TableCell>
              <TableCell>{g.bill_neutral ? 'Yes' : 'No, pays more'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function DealBalance({ r, sel, onSel }: { r: AssessResponse; sel: GroupSel; onSel: (g: GroupSel) => void }) {
  const b = balanceFor(r, sel)
  const hasLower = r.flat_groups.some((g) => g.position === 'lower')
  const top = r.flat_groups.find((g) => g.position === 'top')
  const lower = r.flat_groups.find((g) => g.position === 'lower')
  const scale = Math.max(b.old, b.energy + b.charge, 1)
  const w = (v: number) => `${Math.max(0, (v / scale) * 100)}%`
  const better = b.keep >= 0.5
  const worse = b.keep < -0.5
  const who = sel === 'top' ? 'top-floor flat' : sel === 'lower' ? 'lower-floor flat' : 'average flat'
  return (
    <ChartBox
      title="The deal balance"
      description={`Monthly bill for an ${who}, estimated`}
      chart={
        <div>
          {hasLower && (
            <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Which flat to show">
              {([['avg', 'Average flat'], ['top', `Top floor${top ? ` (${top.count})` : ''}`], ['lower', `Lower floors${lower ? ` (${lower.count})` : ''}`]] as [GroupSel, string][]).map(([k, label]) => (
                <Button key={k} size="sm" variant={sel === k ? 'default' : 'outline'} aria-pressed={sel === k} onClick={() => onSel(k)}>
                  {label}
                </Button>
              ))}
            </div>
          )}
          <div className="bars" role="img" aria-label={`For an ${who}: the old bill is ${money(b.old)} a month. The new bill is ${money(b.energy)} plus a fixed monthly charge of ${money(b.charge)}.`}>
            <div className="bar-row">
              <div className="text-sm">Bill now</div>
              <div className="bar-track">
                <div className="bar-seg old" style={{ width: w(b.old) }}>
                  {money(b.old)}
                </div>
              </div>
            </div>
            <div className="bar-row">
              <div className="text-sm">Bill after</div>
              <div className="bar-track">
                <div className="bar-seg energy" style={{ width: w(b.energy) }}>
                  {b.energy / scale > 0.14 ? money(b.energy) : ''}
                </div>
                <div className="bar-seg charge" style={{ width: w(b.charge) }}>
                  {b.charge / scale > 0.1 ? money(b.charge) : ''}
                </div>
                {better && (
                  <div className="bar-seg keep" style={{ width: w(b.keep) }}>
                    {b.keep / scale > 0.1 ? `+${money(b.keep)}` : ''}
                  </div>
                )}
              </div>
            </div>
          </div>
          <ul className="bar-legend" aria-hidden="true">
            <li>
              <i className="sw old" /> Bill now
            </li>
            <li>
              <i className="sw energy" /> New energy bill
            </li>
            <li>
              <i className="sw charge" /> Fixed monthly charge
            </li>
            {better && (
              <li>
                <i className="sw keep" /> Tenant keeps
              </li>
            )}
          </ul>
          <p className={'mt-2 ' + (worse ? 'font-medium text-destructive' : 'font-medium')}>
            {worse ? (
              <>This {who} would pay about {moneyApprox(-b.keep)} a month more.</>
            ) : (
              <>
                The tenant keeps {money(Math.max(0, b.keep))} a month <span className="font-normal text-muted-foreground">(about {moneyApprox(Math.max(0, b.keep) * 12)} a year)</span>
              </>
            )}
          </p>
        </div>
      }
      table={{
        columns: [{ label: 'Item' }, { label: 'Per month', numeric: true }],
        rows: [['Bill now', money(b.old)], ['New energy bill', money(b.energy)], ['Fixed monthly charge', money(b.charge)], ['Tenant keeps', money(b.keep)]],
      }}
    />
  )
}

const AX = { fontSize: 13, fill: '#1b1f23' }

function HeatwaveChart({ r }: { r: AssessResponse }) {
  const hw = r.heatwave
  const wc = weekComfort(r)
  const n = Math.min(hw.outdoor_c.length, hw.indoor_top_baseline_c.length, hw.indoor_top_upgraded_c.length)
  if (n < 2) return null
  const start = new Date(hw.start)
  const day = (h: number) => {
    const d = new Date(start)
    if (Number.isNaN(d.getTime())) return `Day ${Math.floor(h / 24) + 1}`
    d.setHours(d.getHours() + h)
    return d.toLocaleDateString('en-AU', { weekday: 'short' })
  }
  const hourLabel = (h: number) => {
    const d = new Date(start)
    if (Number.isNaN(d.getTime())) return `Hour ${h}`
    d.setHours(d.getHours() + h)
    return d.toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', hour12: true })
  }
  const rows = Array.from({ length: n }, (_, i) => ({ h: i, outdoor: hw.outdoor_c[i], before: hw.indoor_top_baseline_c[i], after: hw.indoor_top_upgraded_c[i] }))
  const diff = wc.peakOld - wc.peakNew
  const ticks = Array.from({ length: Math.ceil(n / 24) }, (_, i) => i * 24)
  return (
    <ChartBox
      title="Staying cool in the hottest week"
      description={
        diff >= 0.3
          ? `During the hottest week, a top-floor flat peaks ${diff.toFixed(1)}° cooler (${wc.peakOld.toFixed(1)}° down to ${wc.peakNew.toFixed(1)}°). It spends ${num(wc.hoursOld - wc.hoursNew)} fewer hours above 30°C (${num(wc.hoursOld)} hours down to ${num(wc.hoursNew)}). No air conditioning is running.`
          : 'In the hottest week, the upgrade changes the indoor temperature of a top-floor flat very little. No air conditioning is running.'
      }
      chart={
        <div role="img" aria-label={`Hourly temperatures over the hottest week. Outside peaks at ${Math.max(...hw.outdoor_c).toFixed(0)} degrees. Inside a top-floor flat with no air conditioning, the old roof peaks at ${wc.peakOld.toFixed(1)} degrees and the upgraded flat at ${wc.peakNew.toFixed(1)} degrees.`}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="#d3d8dd" vertical={false} />
              <XAxis dataKey="h" ticks={ticks} tickFormatter={day} tick={AX} />
              <YAxis unit="°" tick={AX} width={44} domain={['dataMin - 2', 'dataMax + 2']} tickFormatter={(v: number) => String(Math.round(v))} />
              <ReferenceLine y={30} stroke="#50575e" strokeDasharray="2 4" label={{ value: '30°C', position: 'insideTopLeft', fontSize: 12, fill: '#50575e' }} />
              <Tooltip labelFormatter={(h) => hourLabel(Number(h))} formatter={(v) => `${Number(v).toFixed(1)}°C`} />
              <Line dataKey="outdoor" name="Outside" stroke="#50575e" strokeWidth={1.5} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
              <Line dataKey="before" name="Inside, old roof" stroke="#b5651d" strokeWidth={2} strokeDasharray="8 4" dot={false} isAnimationActive={false} />
              <Line dataKey="after" name="Inside, upgraded" stroke="#0b4f7c" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      }
      legend={
        <>
          <LegendKey label="Outside" color="#50575e" dashed />
          <LegendKey label="Inside, old roof (long dashes)" color="#b5651d" dashed />
          <LegendKey label="Inside, upgraded (solid)" color="#0b4f7c" />
        </>
      }
      table={{
        columns: [{ label: 'Hour' }, { label: 'Outside (°C)', numeric: true }, { label: 'Inside, old roof (°C)', numeric: true }, { label: 'Inside, upgraded (°C)', numeric: true }],
        rows: rows.map((x) => [hourLabel(x.h), x.outdoor.toFixed(1), x.before.toFixed(1), x.after.toFixed(1)]),
      }}
    />
  )
}

function MonthlyChart({ r }: { r: AssessResponse }) {
  const rows = r.monthly.map((m) => ({ label: m.label, before: Math.round(m.baseline_bill), after: Math.round(m.upgraded_bill), charge: Math.round(m.charge) }))
  return (
    <ChartBox
      title="Month by month"
      description="Bill for an average flat each month: before, and after the upgrade with the fixed monthly charge."
      chart={
        <div role="img" aria-label="Monthly bill before the upgrade, and after it with the monthly charge. The same figures are in the table.">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <defs>
                <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill="#fff" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="#0b4f7c" strokeWidth="3" />
                </pattern>
              </defs>
              <CartesianGrid stroke="#d3d8dd" vertical={false} />
              <XAxis dataKey="label" tick={AX} />
              <YAxis tick={AX} width={52} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip formatter={(v) => `$${v}`} />
              <Legend wrapperStyle={{ fontSize: 14 }} />
              <Bar dataKey="before" name="Bill before" fill="#cfd4d9" stroke="#50575e" isAnimationActive={false} />
              <Bar dataKey="after" name="Energy bill after" stackId="a" fill="#0b4f7c" isAnimationActive={false} />
              <Bar dataKey="charge" name="Monthly charge (hatched)" stackId="a" fill="url(#hatch)" stroke="#0b4f7c" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      }
      table={{
        columns: [{ label: 'Month' }, { label: 'Bill before', numeric: true }, { label: 'Energy bill after', numeric: true }, { label: 'Monthly charge', numeric: true }, { label: 'After, with charge', numeric: true }],
        rows: rows.map((x) => [x.label, `$${x.before}`, `$${x.after}`, `$${x.charge}`, `$${x.after + x.charge}`]),
      }}
    />
  )
}

function Costs({ r }: { r: AssessResponse }) {
  const p = r.package
  const sel = p.items.filter((i) => i.selected)
  const pctFund = p.net_capex > 0 ? Math.min(100, (p.max_fundable_capex / p.net_capex) * 100) : 100
  return (
    <Panel title="What it costs and who pays">
      {sel.length === 0 ? (
        <p className="text-muted-foreground">Nothing is switched on yet.</p>
      ) : (
        <div className="overflow-x-auto border" role="region" aria-label="Cost of each upgrade" tabIndex={0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Upgrade</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Rebate</TableHead>
                <TableHead className="text-right">Net cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sel.map((i) => (
                <TableRow key={i.key}>
                  <TableCell>
                    {i.label}
                    <div className="text-sm text-muted-foreground">{i.note}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(i.capex)}</TableCell>
                  <TableCell className="text-right tabular-nums">{i.rebate > 0 ? `-${money(i.rebate)}` : '-'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(i.net_capex)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{money(p.capex_total)}</TableCell>
                <TableCell className="text-right tabular-nums">{p.rebates_total > 0 ? `-${money(p.rebates_total)}` : '-'}</TableCell>
                <TableCell className="text-right tabular-nums">{money(p.net_capex)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      <div className="mt-3 space-y-1">
        <p>
          The fixed monthly charges can repay <strong>{money(p.max_fundable_capex)}</strong> of the {money(p.net_capex)} net cost.{' '}
          <span className={p.fully_funded ? 'font-medium text-success' : 'font-medium text-warning'}>{p.fully_funded ? 'Fully funded.' : `${money(p.funding_gap)} short.`}</span>
        </p>
        <div className="h-3 border bg-muted" role="img" aria-label={`The charges can repay ${Math.round(pctFund)}% of the net cost`}>
          <div className={'h-full ' + (p.fully_funded ? 'bg-success' : 'bg-warning')} style={{ width: `${pctFund}%` }} />
        </div>
      </div>
    </Panel>
  )
}

function Impact({ r }: { r: AssessResponse }) {
  const im = r.impact
  const baseGas = r.flat_groups.reduce((a, g) => a + g.count * g.baseline.gas_mj, 0)
  const upGas = r.flat_groups.reduce((a, g) => a + g.count * g.upgraded.gas_mj, 0)
  const gasCut = baseGas > 0 ? Math.round(((baseGas - upGas) / baseGas) * 100) : 0
  return (
    <Panel title="What it does for the climate">
      <Figures
        label="Climate impact"
        items={[
          { label: 'Tonnes of CO₂e a year', value: num1(im.co2e_t_per_year_saved), note: `Roughly ${num(Math.round(im.co2e_t_per_year_saved / 2.5))} petrol cars (about 2.5 tonnes a year each)` },
          { label: 'Gigajoules of gas avoided a year', value: num(im.gas_mj_per_year_avoided / 1000), note: baseGas > 0 ? `${gasCut}% of the gas these flats use now` : undefined },
          { label: 'Less energy used', value: `${Math.round(im.energy_reduction_pct)}%`, note: 'Across the whole block, estimated' },
        ]}
      />
      <p className="text-sm text-muted-foreground">Bill savings for the whole block: about {moneyApprox(im.bill_saving_per_year_building)} a year, before the monthly charge. All figures are modelled estimates.</p>
    </Panel>
  )
}

function Assumptions({ r }: { r: AssessResponse }) {
  return (
    <details className="border bg-card">
      <summary className="cursor-pointer px-4 py-2.5 font-semibold">What this assumes</summary>
      <div className="space-y-2 border-t p-4">
        <p className="text-sm text-muted-foreground">Every figure here is a modelled estimate, not a quote. Items marked "Sourced" link to where the number comes from; the rest are our own assumptions.</p>
        <div className="max-h-96 overflow-auto border" role="region" aria-label="Assumptions" tabIndex={0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assumption</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.assumptions.map((a) => (
                <TableRow key={a.key}>
                  <TableCell>{a.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {typeof a.value === 'number' ? (Number.isInteger(a.value) ? num(a.value) : String(a.value)) : a.value} {a.unit}
                  </TableCell>
                  <TableCell>
                    {a.kind === 'sourced' && a.source.startsWith('http') ? (
                      <a href={a.source} target="_blank" rel="noreferrer">
                        Sourced
                      </a>
                    ) : (
                      'Assumption'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </details>
  )
}

function StatFigures({ r }: { r: AssessResponse }) {
  const f = r.finance
  const funded = r.package.fully_funded
  return (
    <Figures
      label="Who pays what"
      items={[
        { label: 'Landlord pays upfront', value: money(f.owner_upfront_cost), note: funded ? 'No loan, no bill' : `Only if a grant covers the ${moneyApprox(r.package.funding_gap)} gap` },
        { label: 'Tenant pays upfront', value: money(f.tenant_upfront_cost), note: 'Pays only the fixed monthly charge' },
        {
          label: 'Investor is repaid',
          value: moneyApprox(f.total_repaid),
          note: `over ${f.term_years} years${f.investor_return_pct >= 0 ? `, about ${f.investor_return_pct.toFixed(1)}% a year` : `, a loss of about ${Math.abs(f.investor_return_pct).toFixed(1)}% a year`}${funded ? '' : ' (short of the full cost)'}`,
        },
      ]}
    />
  )
}

// ---------- the step ----------
export default function Build({ deal, meta, buildings, assess, shortlist, onChange, onChangeBlock, onShare }: {
  deal: Deal
  meta: Meta
  buildings: BuildingCollection
  assess: Async<AssessResponse> & { updating: boolean }
  shortlist: { ids: string[]; toggle: (id: string) => void }
  onChange: (d: Deal) => void
  onChangeBlock: () => void
  onShare: () => void
}) {
  const [sel, setSel] = useState<GroupSel>('avg')
  const topRef = useRef<HTMLDivElement>(null)
  const r = assess.data
  const hasLower = r?.flat_groups.some((g) => g.position === 'lower') ?? true
  const effectiveSel: GroupSel = !hasLower && sel === 'lower' ? 'avg' : sel
  const feature = deal.buildingId ? buildings.features.find((f) => f.properties.id === deal.buildingId) : null
  const base = feature ? { label: feature.properties.label, flats: feature.properties.flats_est, storeys: feature.properties.storeys } : { label: 'Your own block', flats: deal.own?.flats ?? 1, storeys: deal.own?.storeys ?? 1 }
  const bid = deal.buildingId
  const shortlisted = bid ? shortlist.ids.includes(bid) : null
  const handleChange = (d: Deal) => {
    if (!d.buildingId && d.own) onChange({ ...d, own: { ...d.own, flats: d.flats ?? d.own.flats, storeys: d.storeys ?? d.own.storeys }, flats: undefined, storeys: undefined })
    else onChange(d)
  }
  const ownDeal: Deal = !deal.buildingId && deal.own ? { ...deal, flats: deal.own.flats, storeys: deal.own.storeys } : deal
  const req = dealToRequest(deal)

  return (
    <div className="grid grid-cols-1 gap-4 p-3 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:p-5">
      <div className="min-w-0">
        <h1 className="mb-3 text-xl font-semibold tracking-tight">Build the deal</h1>
        <Inputs deal={ownDeal} meta={meta} result={r} base={base} onChange={handleChange} onChangeBlock={onChangeBlock} shortlisted={shortlisted} onShortlist={() => bid && shortlist.toggle(bid)} />
      </div>
      <div className="min-w-0 space-y-3" aria-busy={assess.updating}>
        <div ref={topRef} />
        {assess.error && !r && <ErrorAlert error={assess.error} onRetry={assess.retry} title="We could not work out the deal" />}
        {!r && !assess.error && <LoadingRows rows={6} label="Working out the deal" />}
        {r && (
          <>
            <div role="status" className="text-sm text-muted-foreground">
              {assess.updating ? 'Updating the result...' : ''}
            </div>
            {assess.error && <ErrorAlert error={`${assess.error} The numbers below are from your last successful update.`} onRetry={assess.retry} title="We could not update" />}
            <Verdict r={r} />
            <Warnings r={r} />
            <StatFigures r={r} />
            <Panel title="Each group of flats" description="Monthly figures, estimated">
              <GroupsTable r={r} />
            </Panel>
            <DealBalance r={r} sel={effectiveSel} onSel={setSel} />
            <HeatwaveChart r={r} />
            <MonthlyChart r={r} />
            <Costs r={r} />
            <SizingPanel req={req} />
            <RiskPanel req={req} currentShare={deal.finance.savings_share_to_charge} />
            <Impact r={r} />
            <Assumptions r={r} />
            <div className="flex flex-wrap items-center gap-3 border bg-card p-3">
              <Button size="lg" onClick={onShare}>
                Share this deal
              </Button>
              <p className="text-sm text-muted-foreground">Next: a one-page summary for the tenant, the owner and the funder.</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
