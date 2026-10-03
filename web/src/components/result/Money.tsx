import { money, moneyApprox, num, num1 } from '../../format'
import type { AssessResponse } from '../../types'
import { Icon } from '../Icons'

export function CostBreakdown({ r }: { r: AssessResponse }) {
  const p = r.package
  const sel = p.items.filter((i) => i.selected)
  const pctFund = p.net_capex > 0 ? Math.min(100, (p.max_fundable_capex / p.net_capex) * 100) : 100
  return (
    <section className="card" aria-labelledby="cost-h">
      <h3 id="cost-h">What it costs and who pays</h3>
      {sel.length === 0 ? (
        <p className="muted">Nothing is switched on yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table cost-table">
            <thead>
              <tr>
                <th scope="col">Upgrade</th>
                <th scope="col" className="r">Cost</th>
                <th scope="col" className="r">Rebate</th>
                <th scope="col" className="r">Net cost</th>
              </tr>
            </thead>
            <tbody>
              {sel.map((i) => (
                <tr key={i.key}>
                  <th scope="row">
                    {i.label}
                    <div className="muted small">{i.note}</div>
                  </th>
                  <td className="r">{money(i.capex)}</td>
                  <td className="r">{i.rebate > 0 ? `-${money(i.rebate)}` : '-'}</td>
                  <td className="r strong">{money(i.net_capex)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="r">{money(p.capex_total)}</td>
                <td className="r">{p.rebates_total > 0 ? `-${money(p.rebates_total)}` : '-'}</td>
                <td className="r strong">{money(p.net_capex)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="fund">
        <div className="fund-text">
          <span>
            The fixed monthly charges can repay <strong>{money(p.max_fundable_capex)}</strong> of the {money(p.net_capex)} net cost.
          </span>
          <span className={p.fully_funded ? 'good-text' : 'warn-text'}>{p.fully_funded ? 'Fully funded' : `${money(p.funding_gap)} short`}</span>
        </div>
        <div className="fund-track" role="img" aria-label={`The charges can repay ${Math.round(pctFund)}% of the net cost`}>
          <div className={'fund-fill ' + (p.fully_funded ? 'good' : 'warn')} style={{ width: `${pctFund}%` }} />
        </div>
      </div>
    </section>
  )
}

export function ImpactCard({ r }: { r: AssessResponse }) {
  const im = r.impact
  const cars = Math.round(im.co2e_t_per_year_saved / 2.5)
  const baseGas = r.flat_groups.reduce((a, g) => a + g.count * g.baseline.gas_mj, 0)
  const upGas = r.flat_groups.reduce((a, g) => a + g.count * g.upgraded.gas_mj, 0)
  const gasCut = baseGas > 0 ? Math.round(((baseGas - upGas) / baseGas) * 100) : 0
  return (
    <section className="card impact" aria-labelledby="impact-h">
      <h3 id="impact-h">What it does for the climate</h3>
      <div className="impact-grid">
        <div>
          <div className="big">{num1(im.co2e_t_per_year_saved)}</div>
          <div className="big-label">tonnes of CO₂e a year</div>
          {cars >= 1 && <div className="muted small">Roughly {num(cars)} petrol {cars === 1 ? 'car' : 'cars'} off the road (at about 2.5 tonnes a year each).</div>}
        </div>
        <div>
          <div className="big">{num(im.gas_mj_per_year_avoided / 1000)}</div>
          <div className="big-label">gigajoules of gas avoided a year</div>
          {baseGas > 0 && <div className="muted small">{gasCut}% of the gas these flats use now.</div>}
        </div>
        <div>
          <div className="big">{Math.round(im.energy_reduction_pct)}%</div>
          <div className="big-label">less energy used</div>
          <div className="muted small">Across the whole block, estimated.</div>
        </div>
      </div>
      <p className="muted small">
        Bill savings for the whole block: about {moneyApprox(im.bill_saving_per_year_building)} a year, before the monthly charge. All figures are modelled estimates.
      </p>
    </section>
  )
}

export function AssumptionsCard({ r }: { r: AssessResponse }) {
  return (
    <details className="card assumptions">
      <summary>
        <span>What this assumes</span>
        <Icon name="chevron_down" size={20} />
      </summary>
      <p className="muted small">Every figure here is a modelled estimate, not a quote. Items marked "Sourced" link to where the number comes from; the rest are our own assumptions.</p>
      <ul className="assume-list">
        {r.assumptions.map((a) => (
          <li key={a.key}>
            <span className="a-label">{a.label}</span>
            <span className="a-value">
              {typeof a.value === 'number' ? (Number.isInteger(a.value) ? num(a.value) : String(a.value)) : a.value} {a.unit}
            </span>
            {a.kind === 'sourced' && a.source.startsWith('http') ? (
              <a className="tag sourced" href={a.source} target="_blank" rel="noreferrer">
                Sourced <Icon name="external" size={12} />
              </a>
            ) : (
              <span className="tag assumed">Assumption</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
