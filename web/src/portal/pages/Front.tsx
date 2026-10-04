import { Link } from 'react-router'
import { Callout } from '@/portal/components/ui/callout'
import { Card } from '@/portal/components/ui/card'

const PORTALS = [
  { title: 'Government', text: 'Run the programme: projects, billing, the reserve and grants. Oversight sees outcomes, areas and the audit log.' },
  { title: 'Utility', text: 'Meters, network impact, bulk readings, charge files and remittance for distributors, retailers and gas networks.' },
  { title: 'Property', text: 'Landlords, strata committees and community housing providers manage their blocks. Tenants see their own flat.' },
]

export default function Front() {
  return (
    <div className="mw-space-y-6">
      <section aria-labelledby="what" className="mw-max-w-3xl">
        <h1 id="what" className="nsw-h2">
          Upgrades for rented flats, repaid from the bill savings
        </h1>
        <p className="mw-mt-3 mw-text-lg">Meterwise finds hot blocks of rented flats in Western Sydney and designs an upgrade for each: a cool roof, heat pump hot water and reverse-cycle air conditioning. A capped charge on each flat's meter repays the cost out of the bill savings. Tenants pay nothing upfront and always keep part of the saving.</p>
        <div className="mw-mt-4 nsw-display-flex nsw-flex-wrap mw-gap-3">
          <Link to="/signin" className="nsw-button nsw-button--dark">
            Sign in
          </Link>
          <Link to="/finder" className="nsw-button nsw-button--dark-outline-solid">
            Find a block
          </Link>
        </div>
      </section>

      <section aria-labelledby="portals">
        <h2 id="portals" className="mw-mb-3">
          Sign in to your portal
        </h2>
        <ul className="nsw-display-grid mw-gap-3 mw-md-grid-cols-3">
          {PORTALS.map((p) => (
            <li key={p.title}>
              <Card to="/signin" title={`${p.title} portal`}>
                {p.text}
              </Card>
            </li>
          ))}
        </ul>
        <p className="mw-mt-3 mw-text-muted">Installers and funders sign in on the same page. Tenants use the access code from their housing provider.</p>
      </section>

      <section aria-labelledby="open">
        <h2 id="open" className="mw-mb-3">
          Open to everyone
        </h2>
        <ul className="nsw-display-grid mw-gap-3 mw-md-grid-cols-2">
          <li>
            <Card to="/finder" title="Block finder and deal builder">
              Pick a block on the map, see what an upgrade would cost and save, and share a one-page summary. No account needed.
            </Card>
          </li>
          <li>
            <Card to="/enquiry" title="Landlord or strata enquiry">
              Own or manage a block of rented flats? Ask for it to be considered for an upgrade.
            </Card>
          </li>
        </ul>
      </section>

      <Callout title="Every figure is a modelled estimate">
        Estimates are not quotes. Heat is satellite surface temperature, not the air inside a flat. The Trust and security page lists the controls in place.
      </Callout>
    </div>
  )
}
