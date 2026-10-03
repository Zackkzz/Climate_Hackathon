import type { Meta } from '../types'
import { Icon } from './Icons'
import { Modal } from './ui'

export default function HowItWorks({ meta, onClose }: { meta: Meta; onClose: () => void }) {
  return (
    <Modal title="How Meterwise works" onClose={onClose} wide>
      <div className="how">
        <section>
          <h3>The problem</h3>
          <p>
            In a rented flat, the landlord pays for upgrades but the tenant gets the cheaper bills, so nobody upgrades. Old gas hot water, plug-in heaters and hot dark roofs stay, and renters swelter and overpay.
          </p>
          <p>Meterwise shows how an investor can pay for the upgrade instead, and be repaid from the savings through a small fixed monthly charge tied to each flat, not to the tenant. The tenant still ends up better off.</p>
        </section>

        <section>
          <h3>Three steps</h3>
          <ol className="how-steps">
            <li>
              <span className="n">1</span>
              <div>
                <strong>Find a block.</strong> The map colours rented walk-up blocks by how hot the ground gets in summer. Pick one, or enter your own.
              </div>
            </li>
            <li>
              <span className="n">2</span>
              <div>
                <strong>Build the deal.</strong> Say what is in the flats now, switch upgrades on and off, and watch the bill, the heatwave and the repayment change.
              </div>
            </li>
            <li>
              <span className="n">3</span>
              <div>
                <strong>Share it.</strong> Print one page each for the tenant, the owner and the funder, or send a link that reopens the same deal.
              </div>
            </li>
          </ol>
        </section>

        <section>
          <h3>What the deal means</h3>
          <p>
            The monthly charge is capped, so a flat's new bill plus the charge is set to come out lower than its old bill. The charge is tied to the flat, not to the person, so it stays when tenants change. The landlord and the tenant pay nothing upfront.
          </p>
        </section>

        <section>
          <h3>How this could really happen</h3>
          <p className="muted small">A plan to explore, not something that has been agreed.</p>
          <ul>
            <li>
              <strong>Community housing providers:</strong> they own whole blocks and already have upgrade funding, so this is possible now.
            </li>
            <li>
              <strong>Council rates charge for private strata blocks:</strong> needs a NSW law change, because current upgrade agreements only cover strata buildings above 20 lots.
            </li>
            <li>
              <strong>A charge on the meter through the network tariff:</strong> needs national energy rule changes.
            </li>
          </ul>
        </section>

        <section className="limits">
          <h3>Honest limits</h3>
          <ul>
            <li>This is a screening tool. It is not engineering advice, financial advice or a quote.</li>
            <li>Heat on the map is satellite land-surface temperature on hot days. It is not the air temperature inside a flat.</li>
            <li>Every dollar and degree figure is a modelled estimate. Real buildings, prices and weather will differ.</li>
            <li>Number of flats and storeys are estimates unless marked as mapped. Change them if you know better.</li>
            <li>Collecting the charge needs a real route (see below). Meterwise does not provide one, and none of these routes is agreed yet.</li>
          </ul>
        </section>

        {meta.data_notes.length > 0 && (
          <section>
            <h3>About the data</h3>
            <ul>
              {meta.data_notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3>Credits</h3>
          <ul className="credits">
            {meta.credits?.map((c) => (
              <li key={c.name}>
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.name} <Icon name="external" size={12} />
                  </a>
                ) : (
                  c.name
                )}
                {c.used_for ? `: ${c.used_for}` : ''}
                {c.licence ? ` (${c.licence})` : ''}
              </li>
            ))}
            <li>
              Basemap by{' '}
              <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
                OpenFreeMap
              </a>
              , map data ©{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                OpenStreetMap contributors
              </a>{' '}
              (ODbL), drawn with MapLibre GL JS (BSD-3-Clause).
            </li>
            <li>Interface built with React and Vite (MIT). Icons and logo drawn for Meterwise.</li>
          </ul>
        </section>
      </div>
    </Modal>
  )
}
