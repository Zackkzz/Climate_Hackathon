import { money, moneyApprox } from '../../format'
import { balanceFor, makeVerdict } from '../../verdict'
import type { GroupSel, Verdict } from '../../verdict'
import type { AssessResponse } from '../../types'
import { Icon } from '../Icons'
import { AnimatedNumber, Segmented } from '../ui'

export function VerdictBanner({ r }: { r: AssessResponse }) {
  const v: Verdict = makeVerdict(r)
  return (
    <div className={`verdict ${v.tone}`} role="status" aria-live="polite">
      <div className="verdict-icon" aria-hidden="true">
        <Icon name={v.tone === 'good' ? 'check' : v.tone === 'empty' ? 'info' : 'alert'} size={26} />
      </div>
      <div>
        <h2 className="verdict-head">{v.headline}</h2>
        <p className="verdict-detail">{v.detail}</p>
        {v.hints.length > 0 && (
          <ul className="hints">
            {v.hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function WarningsBox({ r }: { r: AssessResponse }) {
  const w = r.warnings
  if (w.length === 0) return null
  const first = w.slice(0, 3)
  const rest = w.slice(3)
  const item = (x: string) => (
    <li key={x}>
      <Icon name="info" size={16} /> <span>{x}</span>
    </li>
  )
  return (
    <section className="card warn-box" aria-label="Things to know">
      <h3>Things to know</h3>
      <ul className="warnings">{first.map(item)}</ul>
      {rest.length > 0 && (
        <details>
          <summary className="link-btn">Show {rest.length} more</summary>
          <ul className="warnings">{rest.map(item)}</ul>
        </details>
      )}
    </section>
  )
}

export function GroupPicker({ r, value, onChange }: { r: AssessResponse; value: GroupSel; onChange: (g: GroupSel) => void }) {
  const hasLower = r.flat_groups.some((g) => g.position === 'lower')
  if (!hasLower) return null
  const top = r.flat_groups.find((g) => g.position === 'top')
  const lower = r.flat_groups.find((g) => g.position === 'lower')
  return (
    <Segmented<GroupSel>
      label="Which flat to show"
      value={value}
      onChange={onChange}
      options={[
        { key: 'avg', label: 'Average flat' },
        { key: 'top', label: `Top floor${top ? ` (${top.count})` : ''}` },
        { key: 'lower', label: `Lower floors${lower ? ` (${lower.count})` : ''}` },
      ]}
    />
  )
}

const mo = (n: number) => money(n)

export function DealBalance({ r, sel, onSel }: { r: AssessResponse; sel: GroupSel; onSel: (g: GroupSel) => void }) {
  const b = balanceFor(r, sel)
  const newTotal = b.energy + b.charge
  const scale = Math.max(b.old, newTotal, 1)
  const w = (v: number) => `${Math.max(0, (v / scale) * 100)}%`
  const better = b.keep >= 0.5
  const worse = b.keep < -0.5
  const who = sel === 'top' ? 'top-floor flat' : sel === 'lower' ? 'lower-floor flat' : 'average flat'
  const summary = `For an ${who}: the old bill is ${mo(b.old)} a month. The new bill is ${mo(b.energy)} plus a fixed monthly charge of ${mo(b.charge)}. ${
    better ? `The tenant keeps ${mo(b.keep)} a month.` : worse ? `The tenant would pay ${mo(-b.keep)} a month more.` : 'The tenant breaks even.'
  }`
  return (
    <section className="card balance" aria-labelledby="balance-h">
      <div className="card-head">
        <div>
          <h3 id="balance-h">The deal balance</h3>
          <p className="muted small">Monthly bill for an {who}, estimated</p>
        </div>
        <GroupPicker r={r} value={sel} onChange={onSel} />
      </div>
      <div className="balance-chart" role="img" aria-label={summary}>
        <div className="bal-row">
          <div className="bal-label">Bill now</div>
          <div className="bar-track">
            <div className="bar old" style={{ width: w(b.old) }}>
              <span className="bar-text">
                <AnimatedNumber value={b.old} format={mo} /> a month
              </span>
            </div>
          </div>
        </div>
        <div className="bal-row">
          <div className="bal-label">Bill after</div>
          <div className="bar-track">
            <div className="bar energy" style={{ width: w(b.energy) }}>
              {b.energy / scale > 0.16 && (
                <span className="bar-text">
                  <AnimatedNumber value={b.energy} format={mo} />
                </span>
              )}
            </div>
            <div className="bar charge" style={{ width: w(b.charge) }}>
              {b.charge / scale > 0.1 && (
                <span className="bar-text dark">
                  <AnimatedNumber value={b.charge} format={mo} />
                </span>
              )}
            </div>
            {better && (
              <div className="bar keep" style={{ width: w(b.keep) }}>
                {b.keep / scale > 0.1 && <span className="bar-text keep-text">+{mo(b.keep)}</span>}
              </div>
            )}
          </div>
        </div>
        <ul className="bal-legend" aria-hidden="true">
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
      </div>
      <p className={'balance-call ' + (worse ? 'bad' : 'good')}>
        {worse ? (
          <>
            This {who} would pay about <strong>{moneyApprox(-b.keep)} a month more</strong>.
          </>
        ) : (
          <>
            The tenant keeps <strong><AnimatedNumber value={Math.max(0, b.keep)} format={mo} /> a month</strong>
            <span className="muted"> (about {moneyApprox(Math.max(0, b.keep) * 12)} a year)</span>
          </>
        )}
      </p>
    </section>
  )
}

export function StatTiles({ r }: { r: AssessResponse }) {
  const f = r.finance
  const funded = r.package.fully_funded
  return (
    <div className="tiles" role="list">
      <div className="tile" role="listitem">
        <div className="tile-label">Landlord pays upfront</div>
        <div className="tile-num">{money(f.owner_upfront_cost)}</div>
        <div className="tile-sub">{funded ? 'No loan, no bill' : `Only if a grant covers the ${moneyApprox(r.package.funding_gap)} gap`}</div>
      </div>
      <div className="tile" role="listitem">
        <div className="tile-label">Tenant pays upfront</div>
        <div className="tile-num">{money(f.tenant_upfront_cost)}</div>
        <div className="tile-sub">Pays only the fixed monthly charge</div>
      </div>
      <div className="tile invest" role="listitem">
        <div className="tile-label">Investor is repaid</div>
        <div className="tile-num">
          <AnimatedNumber value={f.total_repaid} format={(n) => moneyApprox(n)} />
        </div>
        <div className="tile-sub">
          over {f.term_years} years{f.investor_return_pct >= 0 ? `, about ${f.investor_return_pct.toFixed(1)}% a year` : `, a loss of about ${Math.abs(f.investor_return_pct).toFixed(1)}% a year`}{funded ? '' : ' (short of the full cost)'}
        </div>
      </div>
    </div>
  )
}
