import { useState } from 'react'
import { money, moneyApprox, num, num1 } from '../format'
import type { Async } from '../hooks'
import type { Sheet } from '../state'
import { balanceFor, weekComfort } from '../verdict'
import type { BalanceView } from '../verdict'
import type { AssessResponse, PackageKey } from '../types'
import { Icon, Logo } from './Icons'
import { DemoTag, ErrorBlock, LoadingBlock } from './ui'
import { USE_MOCK } from '../api'

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
  const newTotal = b.energy + b.charge
  const scale = Math.max(b.old, newTotal, 1)
  const w = (v: number) => `${Math.max(0, (v / scale) * 100)}%`
  return (
    <div className="balance-chart static">
      <div className="bal-row">
        <div className="bal-label">Now</div>
        <div className="bar-track">
          <div className="bar old" style={{ width: w(b.old) }}>
            <span className="bar-text">{money(b.old)}</span>
          </div>
        </div>
      </div>
      <div className="bal-row">
        <div className="bal-label">After</div>
        <div className="bar-track">
          <div className="bar energy" style={{ width: w(b.energy) }}>
            <span className="bar-text">{money(b.energy)}</span>
          </div>
          <div className="bar charge" style={{ width: w(b.charge) }}>
            <span className="bar-text dark">{money(b.charge)}</span>
          </div>
          {b.keep > 0.5 && (
            <div className="bar keep" style={{ width: w(b.keep) }}>
              <span className="bar-text keep-text">+{money(b.keep)}</span>
            </div>
          )}
        </div>
      </div>
      <ul className="bal-legend">
        <li>
          <i className="sw old" /> Bill now
        </li>
        <li>
          <i className="sw energy" /> New energy bill
        </li>
        <li>
          <i className="sw charge" /> Meter charge
        </li>
        <li>
          <i className="sw keep" /> You keep
        </li>
      </ul>
    </div>
  )
}

function SheetFrame({ title, subtitle, active, children, id }: { title: string; subtitle: string; active: boolean; children: React.ReactNode; id: string }) {
  const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <article className={'sheet' + (active ? ' is-active' : '')} id={`sheet-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} hidden={!active}>
      <header className="sheet-head">
        <div className="sheet-brand">
          <Logo size={26} /> <strong>Meter<span>wise</span></strong>
          {USE_MOCK && <DemoTag />}
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
          <div className="s-lab">the meter charge runs</div>
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
        Your electricity and gas bill is estimated to fall from <strong>{money(avg.old)}</strong> to <strong>{money(avg.energy)}</strong> a month. A fixed charge of <strong>{money(avg.charge)}</strong> a month appears on your electricity meter. Together that is{' '}
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
              <th className="r" scope="col">Meter charge</th>
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

      <h3>If you move out</h3>
      <p>The charge belongs to the electricity meter, not to you. When you leave, it stays with the flat and the next tenant gets the same deal. There is nothing to pay off or settle when you go.</p>
    </SheetFrame>
  )
}

function OwnerSheet({ r, active }: { r: AssessResponse; active: boolean }) {
  const sel = r.package.items.filter((i) => i.selected)
  const wc = weekComfort(r)
  const diff = wc.peakOld - wc.peakNew
  return (
    <SheetFrame id="owner" active={active} title="Upgrade your building without paying for it" subtitle={`For the owner of ${r.building.label} (${r.building.flats} flats, ${r.building.storeys} ${r.building.storeys === 1 ? 'storey' : 'storeys'})`}>
      <div className="sheet-stats">
        <div>
          <div className="s-num good">{money(r.finance.owner_upfront_cost)}</div>
          <div className="s-lab">you pay upfront</div>
        </div>
        <div>
          <div className="s-num">No loan</div>
          <div className="s-lab">nothing to borrow or repay</div>
        </div>
        <div>
          <div className="s-num">{moneyApprox(r.package.capex_total)}</div>
          <div className="s-lab">of equipment installed (before rebates)</div>
        </div>
      </div>

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
        An investor, such as a utility, council, community housing provider or green bank, pays for the work ({moneyApprox(r.package.net_capex)} after rebates). They are repaid by a fixed monthly charge of about {money(r.finance.charge_per_month_building / Math.max(1, r.building.flats))} on each flat's electricity meter for {r.finance.term_years} years. Each tenant's new bill plus the charge is lower than their old bill.
      </p>

      <h3>What you are asked to agree to</h3>
      <ul className="sheet-list">
        <li>Let the installers in on dates agreed with your tenants.</li>
        <li>Allow the monthly charge to be attached to each flat's electricity meter for {r.finance.term_years} years. It stays with the meter when tenants change.</li>
        <li>Keep the new equipment in place and connected for that time.</li>
        <li>Tell new tenants, and any buyer, about the charge.</li>
        <li>If the building has an owners corporation, get its approval for roof and outside work.</li>
      </ul>

      <h3>What you get</h3>
      <ul className="sheet-list">
        <li>Modern, efficient equipment in every flat at no cost to you.</li>
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
    <svg viewBox={`0 0 ${W} ${H}`} className="chart repay" role="img" aria-label={`Cumulative repayments reach ${money(yearly * years)} over ${years} years against ${money(cap)} of capital`}>
      {Array.from({ length: years }, (_, i) => {
        const cum = yearly * (i + 1)
        return (
          <g key={i}>
            <rect x={m.l + i * bw + 2} y={y(cum)} width={Math.max(2, bw - 4)} height={m.t + ih - y(cum)} rx="2" className={cum >= cap ? 'bar-energy' : 'bar-charge-solid'} />
            {(years <= 15 || i % 2 === 1) && (
              <text x={m.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="axis-text">
                {i + 1}
              </text>
            )}
          </g>
        )
      })}
      <line x1={m.l} x2={W - m.r} y1={y(cap)} y2={y(cap)} className="ref-30" />
      <text x={m.l + 2} y={y(cap) - 4} textAnchor="start" className="axis-text ref-text">
        Capital {moneyApprox(cap)}
      </text>
    </svg>
  )
}

function FunderSheet({ r, active }: { r: AssessResponse; active: boolean }) {
  const f = r.finance
  const p = r.package
  const sel = p.items.filter((i) => i.selected)
  return (
    <SheetFrame id="funder" active={active} title={`A repayment stream from ${r.building.flats} flats' meters`} subtitle={`For funders: ${r.building.label}`}>
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
          <div className="s-num">{f.investor_return_pct.toFixed(1)}%</div>
          <div className="s-lab">estimated return a year</div>
        </div>
        <div>
          <div className={'s-num ' + (p.fully_funded ? 'good' : 'warn')}>{p.fully_funded ? 'Covered' : moneyApprox(p.funding_gap)}</div>
          <div className="s-lab">{p.fully_funded ? 'cost repaid by the charges' : 'not repaid by the charges'}</div>
        </div>
      </div>

      <h3>How you are repaid</h3>
      <p>
        A fixed monthly charge on each flat's electricity meter, about {money(f.charge_per_month_building)} a month across the building ({money(f.charge_per_month_building * 12)} a year). Each charge is capped so the tenant keeps at least {Math.round((1 - f.savings_share_to_charge) * 100)}% of their bill saving. The cost of capital used is {(f.cost_of_capital * 100).toFixed(1)}% with a {Math.round(f.reserve * 100)}% reserve.
      </p>
      <RepayChart r={r} />
      <p className="chart-note">Cumulative repayments by year, against the capital (line). Bars turn dark once the capital is covered.</p>

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
        <li>Collecting the charge on the meter needs an agreement with the energy retailer or network. This tool does not provide one.</li>
        <li>Energy prices and rebates can change, and equipment may not perform as modelled.</li>
        {!p.fully_funded && <li>As set up, the charges repay {moneyApprox(p.max_fundable_capex)} of {moneyApprox(p.net_capex)}. The rest of {moneyApprox(p.funding_gap)} needs a grant or a different package.</li>}
      </ul>

      <h3>Impact</h3>
      <p>
        About {num1(r.impact.co2e_t_per_year_saved)} tonnes of CO₂e avoided a year, {num(r.impact.gas_mj_per_year_avoided / 1000)} gigajoules of gas no longer burned, and {Math.round(r.impact.energy_reduction_pct)}% less energy used across the block.
      </p>
    </SheetFrame>
  )
}

export default function ShareStep({ assess, sheet, onSheet, onBack }: Props) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const r = assess.data

  const copy = async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setCopied('ok')
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = url
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
        setCopied('ok')
      } catch {
        setCopied('fail')
      }
    }
    setTimeout(() => setCopied(null), 3000)
  }

  if (assess.error && !r) return <ErrorBlock message={assess.error} onRetry={assess.retry} title="We couldn't prepare the sheets" />
  if (!r) return <LoadingBlock text="Preparing your sheets..." />

  return (
    <section className="share" aria-label="Share it">
      <div className="share-controls no-print">
        <div className="share-top">
          <div>
            <h2>Share this deal</h2>
            <p className="muted">Three one-page sheets from the same numbers, each written for the person reading it.</p>
          </div>
          <div className="row gap wrap">
            <button className="btn btn-primary" onClick={() => window.print()}>
              <Icon name="print" size={18} /> Print / Save as PDF
            </button>
            <button className="btn btn-secondary" onClick={copy}>
              <Icon name="link" size={18} /> Copy link
            </button>
            <button className="btn btn-ghost" onClick={onBack}>
              Back to the deal
            </button>
          </div>
        </div>
        <div className="sr-only" aria-live="polite">
          {copied === 'ok' ? 'Link copied' : ''}
        </div>
        {copied && <div className={'toast ' + copied}>{copied === 'ok' ? 'Link copied. Anyone with it can reopen this deal.' : 'Could not copy. Copy the address from your browser instead.'}</div>}
        <div className="sheet-tabs" role="tablist" aria-label="Choose a sheet">
          {TABS.map((t) => (
            <button key={t.key} role="tab" id={`tab-${t.key}`} aria-selected={sheet === t.key} aria-controls={`sheet-${t.key}`} className={sheet === t.key ? 'on' : ''} onClick={() => onSheet(t.key)}>
              <span className="t-label">{t.label}</span>
              <span className="t-sub">{t.sub}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="sheets">
        <TenantSheet r={r} active={sheet === 'tenant'} />
        <OwnerSheet r={r} active={sheet === 'owner'} />
        <FunderSheet r={r} active={sheet === 'funder'} />
      </div>
      <p className="muted small no-print center">Print settings: choose "Save as PDF", A4, and turn off headers and footers for the cleanest page.</p>
    </section>
  )
}
