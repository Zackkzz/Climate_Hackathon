import { useEffect } from 'react'
import { Link } from 'react-router'
import { cleanName } from '@/portal/lib/labels'
import { utilityApi } from '@/console/api-utility'
import { useRes } from '@/console/useRes'
import { money, num } from '@/format'
import { Facts, Figures, PageHeader, Panel } from '@/portal/components/PageHeader'
import { Gate } from '@/portal/components/States'
import { StatusBadge } from '@/portal/components/Status'

function monthName(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

export default function Summary() {
  useEffect(() => {
    document.title = 'Utility summary | Meterwise'
  }, [])
  const res = useRes(() => utilityApi.summary(), [])
  return (
    <>
      <PageHeader crumbs={[{ label: 'Utility' }, { label: 'Summary' }]} title="Summary" description="What needs your attention first, then the meters and money for the month." />
      <Gate res={res} rows={6}>
        {(s) => {
          const work = [
            { n: s.open.gas_disconnections, to: '/utility/gas', label: 'Gas disconnections to action', none: 'No gas disconnections are waiting.' },
            { n: s.open.supply_requests, to: '/utility/supply', label: 'Supply requests to answer', none: 'No supply requests are open.' },
            { n: s.open.readings_overdue_meters, to: '/utility/readings', label: 'Meters with readings overdue', none: 'Every active meter has a recent reading.' },
          ]
          return (
            <div className="mw-space-y-4">
              <Panel title="Work to do" description={cleanName(s.org.name)}>
                <ul className="mw-divide-y mw-border">
                  {work.map((w) => (
                    <li key={w.to} className="nsw-display-flex nsw-flex-wrap nsw-align-items-center nsw-justify-content-between mw-gap-2 mw-px-3 mw-py-2">
                      <span className="nsw-display-flex nsw-align-items-center mw-gap-3">
                        {w.n > 0 ? <StatusBadge tone="warn">{num(w.n)} to do</StatusBadge> : <StatusBadge tone="good">Up to date</StatusBadge>}
                        <span>{w.n > 0 ? w.label : w.none}</span>
                      </span>
                      <Link to={w.to}>{w.n > 0 ? 'Open the list' : 'View the list'}</Link>
                    </li>
                  ))}
                </ul>
              </Panel>

              <div>
                <h2 className="mw-mb-2 nsw-text-semibold">Billing for {monthName(s.billing.month)}</h2>
                <Figures
                  label="Billing for the month"
                  items={[
                    { label: 'To bill', value: money(s.billing.to_bill) },
                    { label: 'Billed', value: money(s.billing.billed) },
                    { label: 'Remitted', value: money(s.billing.remitted) },
                    { label: 'Outstanding', value: money(s.billing.outstanding), tone: s.billing.outstanding > 0 ? 'warn' : undefined, note: 'Owed across all flats' },
                  ]}
                />
                <p className="nsw-small">
                  <Link to="/utility/charges">Charge file and remittance</Link>
                </p>
              </div>

              <div>
                <h2 className="mw-mb-2 nsw-text-semibold">Meters</h2>
                <Figures
                  label="Meters"
                  items={[
                    { label: 'Meters in the programme', value: num(s.meters.total) },
                    { label: 'Charges active', value: num(s.meters.active_charges) },
                    { label: 'Charges paused', value: num(s.meters.paused), tone: s.meters.paused > 0 ? 'warn' : undefined },
                  ]}
                />
                <p className="nsw-small">
                  <Link to="/utility/meters">See every meter</Link>
                </p>
              </div>

              <Panel title="Network in brief" description="Modelled, not a network study.">
                <Facts
                  items={[
                    { label: 'Projects commissioned or underway', value: num(s.network.projects) },
                    { label: 'Flats', value: num(s.network.flats) },
                    { label: 'Peak demand', value: `${s.network.peak_kw_before} kW before, ${s.network.peak_kw_after} kW after` },
                    { label: 'Switchboard upgrades likely', value: num(s.network.switchboard_upgrades_likely) },
                  ]}
                />
                <p className="mw-mt-2 nsw-small">
                  <Link to="/utility/network">Network impact in full</Link>
                </p>
              </Panel>
            </div>
          )
        }}
      </Gate>
    </>
  )
}
