import { ArrowRight, Building2, Landmark, Zap } from 'lucide-react'
import { Link } from 'react-router'
import { Callout } from '@/portal/components/PageHeader'

const PORTALS = [
  { title: 'Government', icon: Landmark, text: 'Run the programme: projects, billing, the reserve and grants. Oversight sees outcomes, areas and the audit log.' },
  { title: 'Utility', icon: Zap, text: 'Meters, network impact, bulk readings, charge files and remittance for distributors, retailers and gas networks.' },
  { title: 'Property', icon: Building2, text: 'Landlords, strata committees and community housing providers manage their blocks. Tenants see their own flat.' },
]

export default function Front() {
  return (
    <div className="space-y-10">
      <section aria-labelledby="what" className="max-w-3xl">
        <h1 id="what" className="text-4xl">
          Upgrades for rented flats, repaid from the bill savings
        </h1>
        <p className="mt-3 text-xl leading-relaxed">
          Meterwise finds hot blocks of rented flats in Western Sydney and designs an upgrade for each: a cool roof, heat pump hot water and reverse-cycle air conditioning. A capped charge on each flat's meter repays the cost out of the bill savings. Tenants pay nothing upfront and always keep part of the saving.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/signin" className="inline-flex h-11 items-center gap-2 rounded-sm bg-primary px-5 font-semibold text-primary-foreground no-underline hover:bg-navy-800">
            Sign in <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link to="/finder" className="inline-flex h-11 items-center rounded-sm border border-input bg-card px-5 font-semibold text-foreground no-underline hover:bg-accent">
            Find a block
          </Link>
        </div>
      </section>

      <section aria-labelledby="portals">
        <h2 id="portals" className="mb-3">
          Sign in to your portal
        </h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {PORTALS.map((p) => (
            <li key={p.title} className="flex flex-col rounded-lg border border-t-4 border-t-navy-900 bg-card p-5">
              <p.icon className="size-6 text-navy-900" aria-hidden="true" />
              <h3 className="mt-2">{p.title} portal</h3>
              <p className="mt-1 flex-1 text-muted-foreground">{p.text}</p>
              <p className="mt-4">
                <Link to="/signin" className="font-semibold">
                  Sign in to the {p.title.toLowerCase()} portal
                </Link>
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-muted-foreground">Installers and funders sign in on the same page. Tenants use the access code from their housing provider.</p>
      </section>

      <section aria-labelledby="open" className="grid gap-4 md:grid-cols-2">
        <h2 id="open" className="sr-only">
          Open to everyone
        </h2>
        <div className="rounded-lg border bg-card p-5">
          <h3>Block finder and deal builder</h3>
          <p className="mt-1 text-muted-foreground">Pick a block on the map, see what an upgrade would cost and save, and share a one-page summary. No account needed.</p>
          <p className="mt-3">
            <Link to="/finder" className="font-semibold">
              Open the block finder
            </Link>
          </p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <h3>Landlord or strata enquiry</h3>
          <p className="mt-1 text-muted-foreground">Own or manage a block of rented flats? Ask for it to be considered for an upgrade.</p>
          <p className="mt-3">
            <Link to="/enquiry" className="font-semibold">
              Send an enquiry
            </Link>
          </p>
        </div>
      </section>

      <Callout tone="info" title="Every figure is a modelled estimate">
        Estimates are not quotes. Heat is satellite surface temperature, not the air inside a flat. The Trust and security page lists the controls in place.
      </Callout>
    </div>
  )
}
