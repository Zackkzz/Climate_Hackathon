// Panels backed by the analysis routes: right-sized equipment, "how sure is this?", local weather.
import { useRef, useState } from 'react'
import { api, downloadText } from '@/console/api'
import type { Microclimate, Risk, Sizing } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money, num, num1, pct } from '@/format'
import type { AssessRequest } from '@/types'
import { ChartBox } from '@/portal/components/ChartBox'
import { Panel } from '@/portal/components/PageHeader'
import { ErrorAlert, LoadingRows } from '@/portal/components/States'
import { Button } from '@/portal/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/portal/components/ui/table'

const POS: Record<string, string> = { top: 'Top-floor flats', lower: 'Lower-floor flats' }
const posLabel = (p: string) => POS[p] ?? p

function useDebounced<T>(req: AssessRequest, call: (r: AssessRequest) => Promise<T>, enabled = true, delay = 500) {
  const key = JSON.stringify(req)
  const latest = useRef(key)
  latest.current = key
  return useRes<T | null>(async () => {
    if (!enabled) return null
    await new Promise((r) => setTimeout(r, delay))
    if (latest.current !== key) throw new Error('Superseded')
    return call(JSON.parse(key) as AssessRequest)
  }, [key, enabled])
}

const realError = (e: string | null) => (e && e !== 'Superseded' ? e : null)

// ---------- sizing ----------
export function SizingView({ s }: { s: Sizing }) {
  const e = s.electrical
  return (
    <div className="mw-space-y-3">
      <div className="nsw-overflow-x-auto mw-border" role="region" aria-label="Air conditioner sizes" tabIndex={0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flats</TableHead>
              <TableHead className="nsw-text-right">Air conditioner without the roof</TableHead>
              <TableHead className="nsw-text-right">With the roof</TableHead>
              <TableHead className="nsw-text-right">Cost difference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.groups.map((g) => (
              <TableRow key={g.position}>
                <TableCell>
                  <div className="nsw-text-medium">{posLabel(g.position)}</div>
                  <div className="nsw-small mw-text-muted">
                    {g.count} flats. Cooling load {num1(g.design_cooling_kw_without_roof)} kW falls to {num1(g.design_cooling_kw_with_package)} kW ({pct(g.reduction_pct)} less).
                  </div>
                </TableCell>
                <TableCell className="nsw-text-right mw-tabular">
                  {num1(g.unit_kw_without_roof)} kW
                  <div className="nsw-small mw-text-muted">{money(g.unit_cost_without_roof)} each</div>
                </TableCell>
                <TableCell className="nsw-text-right mw-tabular">
                  {num1(g.unit_kw_with_package)} kW
                  <div className="nsw-small mw-text-muted">{money(g.unit_cost_with_package)} each</div>
                </TableCell>
                <TableCell className="nsw-text-right nsw-text-medium mw-tabular">
                  {g.unit_cost_with_package <= g.unit_cost_without_roof ? `${money(g.unit_cost_without_roof - g.unit_cost_with_package)} less each` : `${money(g.unit_cost_with_package - g.unit_cost_without_roof)} more each`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {s.capex_saved_by_right_sizing > 0 ? (
        <p className="nsw-text-medium">
          A smaller air conditioner saves <strong>{money(s.capex_saved_by_right_sizing)}</strong> in total.
        </p>
      ) : (
        <p className="nsw-text-medium">
          Right-sizing saves <strong>$0</strong> here. The cool roof does cut the cooling load, but winter heating sets the size of the unit, so the air conditioner does not get smaller. Adding ceiling insulation is what lets it shrink.
        </p>
      )}
      <div>
        <h3 className="nsw-text-semibold">Hot water</h3>
        <p>
          {s.hot_water.units} unit{s.hot_water.units === 1 ? '' : 's'} of {num1(s.hot_water.kw_each)} kW each. {s.hot_water.note}
        </p>
      </div>
      <div>
        <h3 className="nsw-text-semibold">Switchboard check</h3>
        <p className={e.flat_supply_ok && !e.switchboard_upgrade_likely ? 'nsw-text-medium mw-text-success' : 'nsw-text-medium mw-text-warning'}>
          {e.flat_supply_ok ? 'Each flat can take the new equipment on its existing supply' : 'Some flats may need a supply upgrade'}.{' '}
          {e.switchboard_upgrade_likely ? 'The building switchboard probably needs an upgrade.' : 'The building switchboard probably does not need an upgrade.'}
        </p>
        <p className="nsw-small mw-text-muted">
          Each flat adds about {num1(e.per_flat_added_amps)} amps (typical supply {num(e.typical_supply_amps)} A). Building peak demand is {num1(e.building_peak_kw_after)} kW with the roof, against {num1(e.building_peak_kw_after_without_roof)} kW without it
          {e.upgrade_cost_avoided > 0 ? `. The roof avoids about ${money(e.upgrade_cost_avoided)} of switchboard work` : ''}. {e.note}
          {e.kind === 'assumption' ? ' This is an assumption.' : ''}
        </p>
      </div>
      {s.warnings.length > 0 && (
        <ul className="mw-list-disc mw-pl-5 nsw-small">
          {s.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SizingPanel({ req }: { req: AssessRequest }) {
  const res = useDebounced(req, (r) => api.sizing(r))
  const err = realError(res.error)
  return (
    <Panel title="Right-sized equipment" description="A cooler roof means the top-floor flats need a smaller air conditioner. That can cost less to buy and run.">
      {res.data === null && err ? <ErrorAlert error={err} onRetry={res.reload} title="We could not size the equipment" /> : res.data ? <SizingView s={res.data} /> : <LoadingRows rows={3} label="Sizing the equipment" />}
    </Panel>
  )
}

// ---------- risk ----------
/** One row per group of flats: the middle 8 in 10 outcomes as a bar, the most likely as a tick, and the part of the
 * scale below $0 (the tenant is worse off) shaded. Laid out in HTML so text stays readable at any width. */
function BandChart({ r }: { r: Risk }) {
  const lo = Math.min(0, ...r.groups.map((g) => g.net_saving_per_month.p10))
  const hi = Math.max(1, ...r.groups.map((g) => g.net_saving_per_month.p90))
  const pad = (hi - lo) * 0.06
  const min = lo - pad
  const max = hi + pad
  const at = (v: number) => `${((v - min) / (max - min)) * 100}%`
  const zero = at(0)
  return (
    <div className="mw-band" role="img" aria-label={r.groups.map((g) => `${posLabel(g.position)}: most likely ${money(g.net_saving_per_month.p50)} a month, range ${money(g.net_saving_per_month.p10)} to ${money(g.net_saving_per_month.p90)}`).join('. ')}>
      <ul className="mw-band__key" aria-hidden="true">
        <li><span className="mw-band__swatch mw-band__swatch--range" />Middle 8 in 10 outcomes</li>
        <li><span className="mw-band__swatch mw-band__swatch--mid" />Most likely</li>
        <li><span className="mw-band__swatch mw-band__swatch--loss" />Worse off than now (below $0)</li>
      </ul>
      {r.groups.map((g) => {
        const p = g.net_saving_per_month
        return (
          <div key={g.position} className="mw-band__row" aria-hidden="true">
            <div className="mw-band__label">{posLabel(g.position)}</div>
            <div className="mw-band__track">
              <span className="mw-band__loss" style={{ width: zero }} />
              <span className="mw-band__zero" style={{ left: zero }} />
              <span className="mw-band__range" style={{ left: at(p.p10), width: `calc(${at(p.p90)} - ${at(p.p10)})` }} />
              <span className="mw-band__mid" style={{ left: at(p.p50) }} />
            </div>
            <div className="mw-band__values">
              Most likely <strong>{money(p.p50)}</strong> a month, from {money(p.p10)} to {money(p.p90)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function RiskView({ r, currentShare }: { r: Risk; currentShare?: number }) {
  const worst = Math.max(...r.groups.map((g) => g.prob_tenant_worse_off))
  const safe = r.safe_share.savings_share_to_charge
  const within = currentShare !== undefined && currentShare <= safe + 0.005
  return (
    <div className="mw-space-y-3">
      <p className="mw-text-lg">
        Chance a tenant ends up worse off: <strong className={worst > 0.1 ? 'mw-text-warning' : 'mw-text-success'}>{pct(worst * 100)}</strong>.
      </p>
      <p>
        Safe share of the saving to take as the charge: <strong>{pct(safe * 100)}</strong>
        {currentShare !== undefined && <> (the deal now allows {pct(currentShare * 100)})</>}. About 95 in 100 tenants end up no worse off at the safe share.
        {currentShare !== undefined && <span className={within ? ' nsw-text-medium mw-text-success' : ' nsw-text-medium mw-text-warning'}> {within ? 'The deal is within the safe share.' : 'The deal is above the safe share.'}</span>}
      </p>
      <ChartBox
        title="Range of what a tenant keeps each month"
        description={`The bar shows the middle 8 in 10 outcomes. The dark line is the most likely. We reran the bill sums ${num(r.runs)} times with the uncertain inputs changed.`}
        chart={<BandChart r={r} />}
        table={{
          columns: [{ label: 'Flats' }, { label: 'Low (1 in 10)', numeric: true }, { label: 'Most likely', numeric: true }, { label: 'High (9 in 10)', numeric: true }, { label: 'Chance worse off', numeric: true }],
          rows: r.groups.map((g) => [posLabel(g.position), money(g.net_saving_per_month.p10), money(g.net_saving_per_month.p50), money(g.net_saving_per_month.p90), pct(g.prob_tenant_worse_off * 100)]),
        }}
      />
      <p>Chance the package is fully funded: {pct(r.building.prob_fully_funded * 100)}.</p>
      <div>
        <h3 className="nsw-text-semibold">What moves the result most</h3>
        <div className="mw-mt-1 nsw-overflow-x-auto mw-border" role="region" aria-label="What moves the result most" tabIndex={0}>
          <Table className="mw-table--full">
            <TableHeader>
              <TableRow>
                <TableHead>Input</TableHead>
                <TableHead className="nsw-text-right">Share of the uncertainty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.drivers.slice(0, 5).map((d) => (
                <TableRow key={d.key}>
                  <TableCell>{d.label}</TableCell>
                  <TableCell className="nsw-text-right mw-tabular">{pct(d.share_of_variance * 100)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

export function RiskPanel({ req, currentShare }: { req: AssessRequest; currentShare?: number }) {
  const [on, setOn] = useState(false)
  const res = useDebounced(req, (r) => api.risk({ ...r, runs: 500, seed: 1 }), on, 700)
  const err = realError(res.error)
  return (
    <Panel title="How sure is this?" description="Real homes use more or less energy than a model assumes. This shows the range of what a tenant could keep, not just one number.">
      {!on && <Button variant="outline" onClick={() => setOn(true)}>Check how sure this is</Button>}
      {on && res.data === null && err && <ErrorAlert error={err} onRetry={res.reload} title="We could not run the check" />}
      {on && res.data === null && !err && <LoadingRows rows={3} label="Rerunning the sums 500 times" />}
      {on && res.data && <RiskView r={res.data} currentShare={currentShare} />}
    </Panel>
  )
}

// ---------- microclimate ----------
export function MicroclimatePanel({ id }: { id: string }) {
  const res = useRes<Microclimate>(() => api.microclimate(id), [id])
  const [dl, setDl] = useState<'idle' | 'busy' | 'fail'>('idle')
  const m = res.data
  const download = async () => {
    setDl('busy')
    try {
      downloadText(`${id}-weather.epw`, await api.epw(id))
      setDl('idle')
    } catch {
      setDl('fail')
    }
  }
  return (
    <div className="mw-mt-3 mw-border-t mw-pt-3" aria-live="polite">
      <h3 className="nsw-text-semibold">Local summer weather</h3>
      {res.loading && !m && <p className="nsw-small mw-text-muted">Looking up the local weather...</p>}
      {res.error && !m && <p className="nsw-small mw-text-muted">Local weather isn't available for this block right now.</p>}
      {m && (
        <div className="mw-space-y-2">
          <p>
            Hottest-day average is <strong>{num1(m.summer.mean_max_c_local)} °C</strong> here, against {num1(m.summer.mean_max_c_base)} °C for the wider area. Days over 35 °C: <strong>{m.summer.days_over_35_local}</strong> here, {m.summer.days_over_35_base} for the area.
          </p>
          <p className="nsw-small mw-text-muted">
            We add {num1(m.air_temp_adjustment.day_c)} °C by day and {num1(m.air_temp_adjustment.night_c)} °C by night to the area's weather{m.air_temp_adjustment.kind === 'assumption' ? ' (an assumption)' : ''}. {m.air_temp_adjustment.method}
          </p>
          <Button variant="outline" size="sm" onClick={() => void download()} disabled={dl === 'busy'}>
            {dl === 'busy' ? 'Preparing' : 'Download the weather file (.epw)'}
          </Button>
          {dl === 'fail' && <p className="nsw-small nsw-text-medium mw-text-warning">We could not make the weather file. Try again.</p>}
        </div>
      )}
    </div>
  )
}
