import { money, moneyApprox, num, num1 } from '@/format'
import type { Async } from '@/hooks'
import type { Sheet } from '@/state'
import { balanceFor, weekComfort } from '@/verdict'
import type { BalanceView } from '@/verdict'
import type { AssessResponse, PackageKey } from '@/types'
import { toast } from '@/portal/components/ui/sonner'
import { ErrorAlert, LoadingRows } from '@/portal/components/States'
import { Button } from '@/portal/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/portal/components/ui/tabs'

interface Props {
  assess: Async<AssessResponse>
  sheet: Sheet
  onSheet: (s: Sheet) => void
  onBack: () => void
}

const TABS: { key: Sheet; label: string; sub: string }[] = [
  { key: 'tenant', label: 'For the tenant', sub: 'What changes and what you pay' },
  { key: 'owner', label: 'For the owner', sub: '$0 upfront, what you agree to' },
  { key: 'funder', label: 'For the funder', sub: 'Capital, repayment, risks' },
]

const TENANT_WHAT: Record<PackageKey, string> = {
  cool_roof: 'The roof gets a reflective coating, so top-floor flats stay cooler in summer. Lower floors will not notice a difference inside.',
  heat_pump_hot_water: 'A heat pump hot water unit replaces the old hot water system. You get the same hot water for far less energy.',
  reverse_cycle: 'A reverse-cycle air conditioner cools in summer and heats in winter, using far less electricity than a plug-in heater.',
  induction_cooktop: 'An electric induction cooktop replaces the gas cooktop. It heats quickly and wipes clean.',
  ceiling_insulation: 'Insulation in the ceiling keeps heat out in summer and in during winter (top-floor flats).',
  disconnect_gas: 'The gas is disconnected, so the fixed gas charge disappears from your bills.',
}

const OWNER_WHAT: Record<PackageKey, string> = {
  cool_roof: 'Reflective coating over the whole roof. Cuts roof heat for the top floor.',
  heat_pump_hot_water: 'A heat pump hot water unit in each flat, replacing the old system.',
  reverse_cycle: 'A reverse-cycle air conditioner in each flat.',
  induction_cooktop: 'An induction cooktop in each flat, replacing gas.',
  ceiling_insulation: 'Ceiling insulation above top-floor flats.',
  disconnect_gas: 'The building is disconnected from gas, which removes its fixed charge.',
}

function Bars({ b }: { b: BalanceView }) {
  const scale = Math.max(b.old, b.energy + b.charge, 1)
  const w = (v: number) => `${Math.max(0, (v / scale) * 100)}%`
  return (
    <div>
      <div className="bars">
        <div className="bar-row">
          <div>Now</div>
          <div className="bar-track">
            <div className="bar-seg old" style={{ width: w(b.old) }}>{money(b.old)}</div>
          </div>
        </div>
        <div className="bar-row">
          <div>After</div>
          <div className="bar-track">
            <div className="bar-seg energy" style={{ width: w(b.energy) }}>{money(b.energy)}</div>
            <div className="bar-seg charge" style={{ width: w(b.charge) }}>{money(b.charge)}</div>
            {b.keep > 0.5 && <div className="bar-seg keep" style={{ width: w(b.keep) }}>+{money(b.keep)}</div>}
          </div>
        </div>
      </div>
      <ul className="bar-legend">
        <li><i className="sw old" /> Bill now</li>
        <li><i className="sw energy" /> New energy bill</li>
        <li><i className="sw charge" /> Monthly charge</li>
        <li><i className="sw keep" /> You keep</li>
      </ul>
    </div>
  )
}

function SheetFrame({ title, subtitle, active, children, id }: { title: string; subtitle: string; active: boolean; children: React.ReactNode; id: string }) {
  const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <article className={'sheet' + (active ? ' is-active' : '')} id={`sheet-${id}`} hidden={!active}>
      <header className="sheet-head">
        <div className="sheet-brand">
          <strong>Meterwise</strong>
        </div>
        <div className="sheet-date">{date}</div>
      </header>
      <h2 className="sheet-title">{title}</h2>
      <p className="sheet-sub">{subtitle}</p>
      {children}
      <footer className="sheet-foot">
        Estimated by Meterwise from satellite surface temperatures, typical weather and typical energy use. This is a modelled estimate, not a quote, an engineering report or financial advice. Actual savings depend on how you use energy.
      </footer>
    </article>
  )
}

function TenantSheet({ r, active }: { r: AssessResponse; active: boolean }) {
  const sel = r.package.items.filter((i) => i.selected)
  const wc = weekComfort(r)
  const avg = balanceFor(r, 'avg')
  const diff = wc.peakOld - wc.peakNew
  const two = r.flat_groups.length > 1
  return (
    <SheetFrame id="tenant" active={active} title="Lower bills and a cooler flat, with nothing to pay upfront" subtitle={`For tenants at ${r.building.label}`}>
      <div className="sheet-stats">
        <div>
          <div className="s-num">{money(r.finance.tenant_upfront_cost)}</div>
          <div className="s-lab">you pay upfront</div>
        </div>
        <div>
          <div className="s-num good">{money(Math.max(0, avg.keep))}</div>
          <div className="s-lab">a month you keep, on average</div>
        </div>
        <div>
          <div className="s-num">{r.finance.term_years} years</div>
          <div className="s-lab">the monthly charge runs</div>
        </div>
      </div>

      <h3>What changes in your flat</h3>
      {sel.length === 0 ? (
        <p>No upgrades are chosen yet.</p>
      ) : (
        <ul className="sheet-list">
          {sel.map((i) => (
            <li key={i.key}>
              <strong>{i.label}.</strong> {TENANT_WHAT[i.key]}
            </li>
          ))}
        </ul>
      )}

      <h3>What you pay</h3>
      <p>
        Your electricity and gas bill is estimated to fall from <strong>{money(avg.old)}</strong> to <strong>{money(avg.energy)}</strong> a month. A fixed monthly charge of <strong>{money(avg.charge)}</strong>, tied to the flat and not to you, is added. Together that is{' '}
        <strong>{money(avg.keep)} a month less</strong> than now{avg.keep > 0 ? ', so you come out ahead over the year' : ''}.
      </p>
      <Bars b={avg} />
      {two && (
        <table className="sheet-table">
          <thead>
            <tr>
              <th scope="col">Your flat</th>
              <th className="r" scope="col">Bill now</th>
              <th className="r" scope="col">New bill</th>
              <th className="r" scope="col">Monthly charge</th>
              <th className="r" scope="col">You keep</th>
            </tr>
          </thead>
          <tbody>
            {r.flat_groups.map((g) => (
              <tr key={g.position}>
                <th scope="row">{g.label}</th>
                <td className="r">{money(g.baseline.bill_per_year / 12)}</td>
                <td className="r">{money(g.upgraded.bill_per_year / 12)}</td>
                <td className="r">{money(g.charge_per_month)}</td>
                <td className="r strong">{money(g.net_saving_per_month)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {diff >= 0.3 && (
        <>
          <h3>In a heatwave</h3>
          <p>
            In the hottest week of a typical year, a top-floor flat peaks about <strong>{diff.toFixed(1)} degrees cooler</strong> and spends {num(wc.hoursOld - wc.hoursNew)} fewer hours above 30°C, before you switch on any air conditioning.
          </p>
        </>
      )}

      {(() => {
        const c = r.flat_groups.find((g) => g.position === 'top')?.comfort
        if (!c?.period_label) return null
        return (
          <p>
            Over the whole year, with no air conditioning running, a top-floor flat is estimated to spend {num(c.hours_above_30c_baseline)} hours above 30°C, falling to {num(c.hours_above_30c_upgraded)} with the upgrade.
          </p>
        )
      })()}

      <h3>If you move out</h3>
      <p>The charge is tied to the flat, not to you. When you leave, it stays with the flat and the next tenant gets the same deal. There is nothing to pay off or settle when you go.</p>
    </SheetFrame>
  )
}

function GapCallout({ r, who }: { r: AssessResponse; who: 'owner' | 'funder' }) {
  const p = r.package
  const gc = p.gap_closers
  return (
    <div className="sheet-callout">
      <strong>Funding gap: {money(p.funding_gap)}.</strong> The fixed monthly charges can repay {money(p.max_fundable_capex)} of the {money(p.net_capex)} net cost.
      {who === 'owner'
        ? ' The rest needs a grant or other funding before the work goes ahead. Without it, you could be asked to contribute or to choose a smaller package.'
        : ' The rest needs a grant or another source of funds. Without it, an investor covering the full cost would not get its money back.'}
      {who === 'funder' && r.finance.total_repaid >= p.net_capex && (
        <> Repayments add up to {money(r.finance.total_repaid)} over {r.finance.term_years} years, but spread over that time they are worth about {money(p.max_fundable_capex)} of capital.</>
      )}
      {who === 'funder' && gc && (
        <>
          {' '}
          Ways to close it, each on its own: a grant of about {moneyApprox(gc.grant_needed ?? p.funding_gap)}
          {gc.cost_of_capital_for_full_funding != null ? `; a cost of capital of ${(gc.cost_of_capital_for_full_funding * 100).toFixed(1)}%` : ''}
          {gc.term_years_for_full_funding != null ? `; a term of ${Math.ceil(gc.term_years_for_full_funding)} years` : ''}.
        </>
      )}
    </div>
  )
}

function OwnerSheet({ r, active }: { r: AssessResponse; active: boolean }) {
  const sel = r.package.items.filter((i) => i.selected)
  const wc = weekComfort(r)
  const diff = wc.peakOld - wc.peakNew
  const funded = r.package.fully_funded
  const gap = r.package.funding_gap
  return (
    <SheetFrame id="owner" active={active} title="Upgrade your building without paying for it up front" subtitle={`For the owner of ${r.building.label} (${r.building.flats} flats, ${r.building.storeys} ${r.building.storeys === 1 ? 'storey' : 'storeys'})`}>
      <div className={'sheet-stats' + (funded ? '' : ' four')}>
        <div>
          <div className={'s-num ' + (funded ? 'good' : 'warn')}>{money(r.finance.owner_upfront_cost)}</div>
          <div className="s-lab">{funded ? 'you pay upfront' : `you pay upfront, if a grant or other funding covers the ${moneyApprox(gap)} gap`}</div>
        </div>
        <div>
          <div className="s-num">No loan</div>
          <div className="s-lab">nothing for you to borrow or repay</div>
        </div>
        <div>
          <div className="s-num">{moneyApprox(r.package.capex_total)}</div>
          <div className="s-lab">of equipment installed (before rebates)</div>
        </div>
        {!funded && (
          <div>
            <div className="s-num warn">{moneyApprox(gap)}</div>
            <div className="s-lab">funding gap still to find</div>
          </div>
        )}
      </div>
      {!funded && <GapCallout r={r} who="owner" />}

      <h3>What gets installed</h3>
      {sel.length === 0 ? (
        <p>No upgrades are chosen yet.</p>
      ) : (
        <ul className="sheet-list">
          {sel.map((i) => (
            <li key={i.key}>
              <strong>{i.label}.</strong> {OWNER_WHAT[i.key]}
            </li>
          ))}
        </ul>
      )}

      <h3>Who pays</h3>
      <p>
        An investor, such as a community housing provider, a council or a green bank, pays for the work ({moneyApprox(r.package.net_capex)} after rebates). They are repaid by a fixed monthly charge of about {money(r.finance.charge_per_month_building / Math.max(1, r.building.flats))} per flat for {r.finance.term_years} years, tied to the flat and not to the tenant. Each tenant's new bill plus the charge is lower than their old bill.
      </p>

      <h3>What you are asked to agree to</h3>
      <ul className="sheet-list">
        <li>Let the installers in on dates agreed with your tenants.</li>
        <li>Agree that the monthly charge stays tied to each flat for {r.finance.term_years} years, including when tenants change.</li>
        <li>Keep the new equipment in place and connected for that time.</li>
        <li>Tell new tenants, and any buyer, about the charge.</li>
        <li>If the building has an owners corporation, get its approval for roof and outside work.</li>
      </ul>

      <h3>What you get</h3>
      <ul className="sheet-list">
        <li>Modern, efficient equipment in every flat{funded ? ' at no cost to you' : ', with your share depending on how the gap is closed'}.</li>
        <li>Tenants who spend less running their flat: about {money(r.impact.bill_saving_per_year_building / Math.max(1, r.building.flats))} a year each, before the charge.</li>
        {diff >= 0.3 && <li>Top-floor flats that peak about {diff.toFixed(1)} degrees cooler in a heatwave.</li>}
        <li>About {num1(r.impact.co2e_t_per_year_saved)} tonnes less CO₂e a year from the building.</li>
      </ul>
    </SheetFrame>
  )
}

function RepayChart({ r }: { r: AssessResponse }) {
  const years = r.finance.term_years
  const yearly = r.finance.charge_per_month_building * 12
  const cap = r.package.net_capex
  const W = 560
  const H = 150
  const m = { l: 6, r: 6, t: 14, b: 22 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const max = Math.max(yearly * years, cap, 1)
  const bw = iw / years
  const y = (v: number) => m.t + ih - (v / max) * ih
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mw-h-auto nsw-width-100 mw-max-h-44" role="img" aria-label={`Cumulative repayments reach ${money(yearly * years)} over ${years} years against ${money(cap)} of capital`}>
      {Array.from({ length: years }, (_, i) => {
        const cum = yearly * (i + 1)
        return (
          <g key={i}>
            <rect x={m.l + i * bw + 2} y={y(cum)} width={Math.max(2, bw - 4)} height={m.t + ih - y(cum)} fill={cum >= cap && r.package.fully_funded ? '#0b4f7c' : '#8a939b'} />
            {(years <= 15 || i % 2 === 1) && (
              <text x={m.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="#1b1f23">
                {i + 1}
              </text>
            )}
          </g>
        )
      })}
      <line x1={m.l} x2={W - m.r} y1={y(cap)} y2={y(cap)} stroke="#b3261e" strokeDasharray="4 3" />
      <text x={m.l + 2} y={y(cap) - 4} textAnchor="start" fontSize="12" fill="#1b1f23">
        Capital {moneyApprox(cap)}
      </text>
    </svg>
  )
}

function FunderSheet({ r, active }: { r: AssessResponse; active: boolean }) {
  const f = r.finance
  const p = r.package
  const sel = p.items.filter((i) => i.selected)
  const ret = f.investor_return_pct
  return (
    <SheetFrame id="funder" active={active} title={`A repayment stream from ${r.building.flats} flats`} subtitle={`For funders: ${r.building.label}`}>
      <div className="sheet-stats four">
        <div>
          <div className="s-num">{moneyApprox(p.net_capex)}</div>
          <div className="s-lab">capital needed, after rebates</div>
        </div>
        <div>
          <div className="s-num">{moneyApprox(f.total_repaid)}</div>
          <div className="s-lab">repaid over {f.term_years} years</div>
        </div>
        <div>
          <div className={'s-num ' + (ret != null && ret < 0 ? 'warn' : '')}>
            {ret == null ? 'None' : `${ret < 0 ? '-' : ''}${Math.abs(ret).toFixed(1)}%`}
          </div>
          <div className="s-lab">{ret == null ? 'no return: nothing is lent' : ret < 0 ? 'estimated loss a year' : 'estimated return a year'}</div>
        </div>
        <div>
          <div className={'s-num ' + (p.fully_funded ? 'good' : 'warn')}>{p.fully_funded ? 'None' : moneyApprox(p.funding_gap)}</div>
          <div className="s-lab">{p.fully_funded ? 'funding gap' : 'funding gap, not repaid by the charges'}</div>
        </div>
      </div>
      {!p.fully_funded && <GapCallout r={r} who="funder" />}

      <h3>How you are repaid</h3>
      <p>
        A fixed monthly charge tied to each flat, about {money(f.charge_per_month_building)} a month across the building ({money(f.charge_per_month_building * 12)} a year). Each charge is capped so the tenant keeps at least {Math.round((1 - f.savings_share_to_charge) * 100)}% of their bill saving. The cost of capital used is {(f.cost_of_capital * 100).toFixed(1)}% with a {Math.round(f.reserve * 100)}% reserve.
      </p>
      <RepayChart r={r} />
      <p className="chart-note">
        {r.package.fully_funded
          ? 'Cumulative repayments by year, against the capital (line). Bars turn dark once the capital is covered.'
          : "Cumulative repayments by year, not adjusted for the cost of money, against the capital (line). Spread over the term they are worth less than they add up to, so they do not cover the capital."}
      </p>

      <h3>What the money buys</h3>
      <table className="sheet-table">
        <thead>
          <tr>
            <th scope="col">Upgrade</th>
            <th className="r" scope="col">Cost</th>
            <th className="r" scope="col">Rebate</th>
            <th className="r" scope="col">Net</th>
          </tr>
        </thead>
        <tbody>
          {sel.map((i) => (
            <tr key={i.key}>
              <th scope="row">{i.label}</th>
              <td className="r">{money(i.capex)}</td>
              <td className="r">{i.rebate ? `-${money(i.rebate)}` : '-'}</td>
              <td className="r strong">{money(i.net_capex)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className="r">{money(p.capex_total)}</td>
            <td className="r">{p.rebates_total ? `-${money(p.rebates_total)}` : '-'}</td>
            <td className="r strong">{money(p.net_capex)}</td>
          </tr>
        </tfoot>
      </table>

      <h3>Risks to weigh</h3>
      <ul className="sheet-list">
        <li>Savings may come in lower than modelled. The capped charge protects the tenant, so the shortfall falls on the repayments.</li>
        <li>Empty flats and late payments. The {Math.round(f.reserve * 100)}% reserve is meant to cover these.</li>
        <li>Collecting a charge tied to the flat needs a real route, such as a community housing provider, a council rates charge or a network tariff. Some need law or rule changes, and this tool does not provide one.</li>
        <li>Energy prices and rebates can change, and equipment may not perform as modelled.</li>
        {f.shortest_equipment_life_years != null && f.term_years > f.shortest_equipment_life_years * 0.8 && (
          <li>
            The {f.term_years}-year term is longer than 80% of the shortest equipment life ({f.shortest_equipment_life_years} years).
          </li>
        )}
      </ul>

      <h3>Impact</h3>
      <p>
        About {num1(r.impact.co2e_t_per_year_saved)} tonnes of CO₂e avoided a year, {num(r.impact.gas_mj_per_year_avoided / 1000)} gigajoules of gas no longer burned, and {Math.round(r.impact.energy_reduction_pct)}% less energy used across the block.
      </p>
    </SheetFrame>
  )
}

export default function Share({ assess, sheet, onSheet, onBack }: Props) {
  const r = assess.data
  const copy = async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied. Anyone with it can reopen this deal.')
    } catch {
      toast.error('Could not copy. Copy the address from your browser instead.')
    }
  }
  if (assess.error && !r) return <div className="mw-p-4"><ErrorAlert error={assess.error} onRetry={assess.retry} title="We could not prepare the sheets" /></div>
  if (!r) return <div className="mw-p-4"><LoadingRows rows={6} label="Preparing your sheets" /></div>
  return (
    <div className="mw-mx-auto mw-max-w-4xl mw-space-y-3 mw-p-3 mw-lg-p-5">
      <div className="no-print mw-space-y-3">
        <div className="nsw-display-flex nsw-flex-wrap nsw-align-items-start nsw-justify-content-between mw-gap-2">
          <div>
            <h1 className="mw-text-xl nsw-text-semibold">Share this deal</h1>
            <p className="mw-text-muted">Three one-page sheets from the same numbers, each written for the person reading it.</p>
          </div>
          <div className="nsw-display-flex nsw-flex-wrap mw-gap-2">
            <Button onClick={() => window.print()}>Print / Save as PDF</Button>
            <Button variant="outline" onClick={() => void copy()}>Copy link</Button>
            <Button variant="outline" onClick={onBack}>Back to the deal</Button>
          </div>
        </div>
        <Tabs value={sheet} onValueChange={(v) => onSheet(v as Sheet)}>
          <TabsList aria-label="Choose a sheet" className="mw-h-auto nsw-flex-wrap mw-p-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} id={`tab-${t.key}`} aria-controls={`sheet-${t.key}`} className="mw-h-auto nsw-flex-column nsw-align-items-start mw-py-1_5">
                <span className="nsw-text-semibold">{t.label}</span>
                <span className="nsw-small nsw-text-normal mw-text-muted">{t.sub}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div>
        <TenantSheet r={r} active={sheet === 'tenant'} />
        <OwnerSheet r={r} active={sheet === 'owner'} />
        <FunderSheet r={r} active={sheet === 'funder'} />
      </div>
      <p className="no-print nsw-text-center nsw-small mw-text-muted">Print settings: choose "Save as PDF", A4, and turn off headers and footers for the cleanest page.</p>
    </div>
  )
}
