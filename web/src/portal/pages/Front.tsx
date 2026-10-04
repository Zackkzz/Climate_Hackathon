import { Link } from 'react-router'

const PORTALS = [
  { to: '/signin', title: 'Government', text: 'Council programme officers run projects, billing and the reserve. State and council oversight see outcomes, grants and audit.' },
  { to: '/signin', title: 'Utility', text: 'Distributors, retailers and gas networks see meters, network impact, bulk readings, charge files and remittance.' },
  { to: '/signin', title: 'Property', text: 'Landlords, strata committees and community housing providers manage their blocks. Tenants see their own flat.' },
]

export default function Front() {
  return (
    <div className="space-y-6">
      <section aria-labelledby="what">
        <h1 id="what" className="text-2xl font-semibold tracking-tight">
          Meterwise
        </h1>
        <p className="mt-2 max-w-2xl">
          Meterwise helps councils and housing providers upgrade rented flats in Western Sydney. Upgrades are a cool roof, heat pump hot water and reverse-cycle air conditioning. They are repaid by a capped charge on each flat's meter, taken from the bill savings. Tenants pay nothing upfront and keep part of the saving.
        </p>
        <p className="mt-2 max-w-2xl text-muted-foreground">This is a prototype. Every organisation, person and meter reading in it is an example.</p>
      </section>

      <section aria-labelledby="sign">
        <h2 id="sign" className="mb-2 text-lg font-semibold">
          Sign in to your portal
        </h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {PORTALS.map((p) => (
            <li key={p.title} className="border bg-card p-4">
              <h3 className="font-semibold">{p.title} portal</h3>
              <p className="mt-1 text-muted-foreground">{p.text}</p>
              <p className="mt-3">
                <Link to={p.to}>Sign in to the {p.title.toLowerCase()} portal</Link>
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-muted-foreground">Tenants and installers also sign in on the same page. Tenants use an access code.</p>
      </section>

      <section aria-labelledby="open">
        <h2 id="open" className="mb-2 text-lg font-semibold">
          Without an account
        </h2>
        <ul className="list-disc space-y-1 pl-5">
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
