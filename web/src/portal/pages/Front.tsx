import { Link } from 'react-router'

const PORTALS = [
  { to: '/signin', title: 'Government', text: 'Council programme officers run projects, billing and the reserve. State and council oversight see outcomes, grants and audit.' },
  { to: '/signin', title: 'Utility', text: 'Distributors, retailers and gas networks see meters, network impact, bulk readings, charge files and remittance.' },
  { to: '/signin', title: 'Property', text: 'Landlords, strata committees and community housing providers manage their blocks. Tenants see their own flat.' },
]

export default function Front() {
  return (
    <div className="mw-space-y-6">
      <section aria-labelledby="what">
        <h1 id="what" className="mw-text-2xl nsw-text-semibold">
          Meterwise
        </h1>
        <p className="mw-mt-2 mw-max-w-2xl">
          Meterwise helps councils and housing providers upgrade rented flats in Western Sydney. Upgrades are a cool roof, heat pump hot water and reverse-cycle air conditioning. They are repaid by a capped charge on each flat's meter, taken from the bill savings. Tenants pay nothing upfront and keep part of the saving.
        </p>
        <p className="mw-mt-2 mw-max-w-2xl mw-text-muted">This is a prototype. Every organisation, person and meter reading in it is an example.</p>
      </section>

      <section aria-labelledby="sign">
        <h2 id="sign" className="mw-mb-2 mw-text-lg nsw-text-semibold">
          Sign in to your portal
        </h2>
        <ul className="nsw-display-grid mw-gap-3 mw-md-grid-cols-3">
          {PORTALS.map((p) => (
            <li key={p.title} className="mw-border nsw-fill-white mw-p-4">
              <h3 className="nsw-text-semibold">{p.title} portal</h3>
              <p className="mw-mt-1 mw-text-muted">{p.text}</p>
              <p className="mw-mt-3">
                <Link to={p.to}>Sign in to the {p.title.toLowerCase()} portal</Link>
              </p>
            </li>
          ))}
        </ul>
        <p className="mw-mt-3 mw-text-muted">Tenants and installers also sign in on the same page. Tenants use an access code.</p>
      </section>

      <section aria-labelledby="open">
        <h2 id="open" className="mw-mb-2 mw-text-lg nsw-text-semibold">
          Without an account
        </h2>
        <ul className="mw-list-disc mw-space-y-1 mw-pl-5">
          <li>
            <a href="/finder">Block finder and deal builder</a>. Find a hot block of rented flats and see what an upgrade would cost and save.
          </li>
          <li>
            <Link to="/enquiry">Landlord or strata enquiry</Link>. Ask for your block to be considered.
          </li>
        </ul>
      </section>
    </div>
  )
}
