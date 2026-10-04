import { useEffect } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { utilityApi } from '@/console/api-utility'
import type { NetworkImpact as NI } from '@/console/types-utility'
import { useRes } from '@/console/useRes'
import { num, num1 } from '@/format'
import { ChartBox } from '@/portal/components/ChartBox'
import { Figures, PageHeader, Panel } from '@/portal/components/PageHeader'
import { Gate } from '@/portal/components/States'
import { ChartContainer } from '@/portal/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/portal/components/ui/table'

const config = {
  before: { label: 'Before', color: '#0b4f7c' },
  after: { label: 'After, with the package', color: '#0b4f7c' },
  without: { label: 'After, without the cool roof', color: '#50575e' },
}

/** Swatches that match the bar patterns, so the legend does not depend on colour. */
function PatternKey() {
  return (
    <ul className="nsw-display-flex nsw-flex-wrap mw-gap-x-5 mw-gap-y-1 nsw-small" aria-label="Key">
      {[
        { id: 'k-solid', label: 'Before (solid)', fill: '#0b4f7c' },
        { id: 'k-hatch', label: 'After, with the package (diagonal stripes)', fill: 'url(#pat-hatch)' },
        { id: 'k-dots', label: 'After, without the cool roof (dots)', fill: 'url(#pat-dots)' },
      ].map((k) => (
        <li key={k.id} className="nsw-display-inline-flex nsw-align-items-center mw-gap-1_5">
          <svg width="22" height="14" aria-hidden="true">
            <Defs />
            <rect x="0.5" y="0.5" width="21" height="13" fill={k.fill} stroke="#0b4f7c" />
          </svg>
          {k.label}
        </li>
      ))}
    </ul>
  )
}

function Defs() {
  return (
    <defs>
      <pattern id="pat-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="#ffffff" />
        <rect width="3" height="6" fill="#0b4f7c" />
      </pattern>
      <pattern id="pat-dots" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="#ffffff" />
        <circle cx="3" cy="3" r="1.6" fill="#50575e" />
      </pattern>
    </defs>
  )
}

function short(s: string) {
  return s.length > 26 ? s.slice(0, 25) + '...' : s
}

export default function NetworkImpact() {
  useEffect(() => {
    document.title = 'Network impact | Meterwise'
  }, [])
  const res = useRes(() => utilityApi.network(), [])
  return (
    <>
      <PageHeader crumbs={[{ label: 'Utility', to: '/utility' }, { label: 'Network impact' }]} title="Network impact" description="How the upgrades change demand on your network, building by building, and what is coming next." />
      <Gate res={res} rows={6}>
        {(n) => <Body n={n} />}
      </Gate>
    </>
  )
}

function Body({ n }: { n: NI }) {
  const t = n.totals
  const data = n.by_project.map((p) => ({ name: short(p.label), before: p.peak_kw_before, after: p.peak_kw_after, without: p.peak_kw_after_without_roof ?? p.peak_kw_before }))
  const fc = n.forecast.map((f) => ({ name: f.month, kw: f.added_peak_kw }))
  return (
    <div className="mw-space-y-4">
      <p className="mw-text-muted">
        {n.area}, as at {n.as_of}.
      </p>
      <Figures
        label="Network totals"
        items={[
          { label: 'Projects', value: num(t.projects), note: `${num(t.flats)} flats` },
          { label: 'Peak demand before', value: `${num1(t.peak_kw_before)} kW` },
          { label: 'Peak demand after', value: `${num1(t.peak_kw_after)} kW`, note: `${num1(t.peak_kw_after_without_roof)} kW without cool roofs` },
          { label: 'Yearly electricity change', value: `${t.annual_kwh_change >= 0 ? '+' : ''}${num(t.annual_kwh_change)} kWh` },
          { label: 'Gas avoided a year', value: `${num(t.gas_mj_avoided_per_year / 1000)} GJ`, note: `${num(t.gas_connections_removed)} connections removed` },
          { label: 'Switchboard upgrades likely', value: num(t.switchboard_upgrades_likely), tone: t.switchboard_upgrades_likely > 0 ? 'warn' : undefined },
        ]}
      />
      <ChartBox
        title="Peak demand by building"
        description="Modelled design-day peak, in kilowatts. Lower is better."
        legend={<PatternKey />}
        chart={
          n.by_project.length === 0 ? (
            <p className="mw-text-muted">No project has reached installation yet.</p>
          ) : (
            <ChartContainer config={config} className="mw-aspect-auto nsw-width-100" style={{ height: Math.max(200, data.length * 96 + 40) }}>
              <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 8, bottom: 8 }} accessibilityLayer>
                <Defs />
                <CartesianGrid horizontal={false} />
                <YAxis type="category" dataKey="name" width={170} tickLine={false} tick={{ fontSize: 13 }} />
                <XAxis type="number" unit=" kW" tick={{ fontSize: 13 }} />
                <Bar dataKey="before" name="Before" fill="#0b4f7c" isAnimationActive={false}>
                  <LabelList dataKey="before" position="right" fontSize={12} />
                </Bar>
                <Bar dataKey="after" name="After" fill="url(#pat-hatch)" stroke="#0b4f7c" isAnimationActive={false}>
                  <LabelList dataKey="after" position="right" fontSize={12} />
                </Bar>
                <Bar dataKey="without" name="Without roof" fill="url(#pat-dots)" stroke="#50575e" isAnimationActive={false}>
                  <LabelList dataKey="without" position="right" fontSize={12} />
                </Bar>
              </BarChart>
            </ChartContainer>
          )
        }
        table={{
          columns: [{ label: 'Building' }, { label: 'Flats', numeric: true }, { label: 'Before (kW)', numeric: true }, { label: 'After (kW)', numeric: true }, { label: 'After, no cool roof (kW)', numeric: true }, { label: 'Electricity change (kWh a year)', numeric: true }, { label: 'Switchboard upgrade likely' }],
          rows: n.by_project.map((p) => [p.label, p.flats, p.peak_kw_before, p.peak_kw_after, p.peak_kw_after_without_roof ?? p.peak_kw_before, p.annual_kwh_change, p.switchboard_upgrade_likely ? 'Yes' : 'No']),
        }}
      />
      <ChartBox
        title="Forecast: change in peak demand as projects commission"
        description="A negative number means the peak falls."
        chart={
          <ChartContainer config={{ kw: { label: 'Change in peak (kW)', color: '#0b4f7c' } }} className="mw-aspect-auto mw-h-64 nsw-width-100">
            <BarChart data={fc} margin={{ top: 20, right: 8, left: 8, bottom: 8 }} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 13 }} />
              <YAxis unit=" kW" tick={{ fontSize: 13 }} width={64} />
              <Bar dataKey="kw" name="Change in peak (kW)" fill="#0b4f7c" isAnimationActive={false}>
                <LabelList dataKey="kw" position="top" fontSize={12} />
              </Bar>
            </BarChart>
          </ChartContainer>
        }
        table={{
          columns: [{ label: 'Month' }, { label: 'Projects commissioning', numeric: true }, { label: 'Change in peak (kW)', numeric: true }, { label: 'Change in electricity (kWh a year)', numeric: true }],
          rows: n.forecast.map((f) => [f.month, f.projects_commissioning, f.added_peak_kw, f.added_annual_kwh]),
        }}
      />
      <Panel title="Buildings">
        <div className="nsw-overflow-x-auto mw-border" role="region" aria-label="Buildings and their commissioning dates" tabIndex={0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Building</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Commissioned</TableHead>
                <TableHead className="nsw-text-right">Gas avoided (GJ a year)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {n.by_project.map((p) => (
                <TableRow key={p.project_id}>
                  <TableCell>{p.label}</TableCell>
                  <TableCell>{p.stage}</TableCell>
                  <TableCell>{p.commissioned_on ?? 'Not yet'}</TableCell>
                  <TableCell className="nsw-text-right mw-tabular">{num(p.gas_mj_avoided_per_year / 1000)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
      <p className="nsw-small mw-text-muted">Basis: {n.basis}</p>
    </div>
  )
}
