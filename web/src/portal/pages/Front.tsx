import { ArrowRight, Building2, Landmark, Zap } from 'lucide-react'
import { Link } from 'react-router'
import { assess } from '@/api'
import { num, num1 } from '@/format'
import { useLoad } from '@/hooks'
import type { AssessResponse, Existing, Package } from '@/types'
import { BlockUpgrade } from '@/portal/components/BlockUpgrade'
import { Callout, Figures } from '@/portal/components/PageHeader'
import { Button } from '@/portal/components/ui/button'

const PORTALS = [
  { title: 'Government', icon: Landmark, text: 'Run the programme: projects, billing, the reserve and grants. Oversight sees outcomes, areas and the audit log.' },
  { title: 'Utility', icon: Zap, text: 'Meters, network impact, bulk readings, charge files and remittance for distributors, retailers and gas networks.' },
  { title: 'Property', icon: Building2, text: 'Landlords, strata committees and community housing providers manage their blocks. Tenants see their own flat.' },
]

// The typical block used in the README and the validation report: a 3-storey, 12-flat walk-up in Penrith with the
// default package. Sent in full so the drawing and the numbers always describe the same thing.
const TYPICAL = { storeys: 3, flats: 12, roof_m2: 320, lat: -33.75, lon: 150.7, heat_anomaly_c: 2 }
const TYPICAL_EXISTING: Existing = { hot_water: 'gas_storage', heating: 'electric_resistive', cooling: 'none', cooktop: 'gas', roof: 'dark' }
const TYPICAL_PACKAGE: Package = { cool_roof: true, heat_pump_hot_water: true, reverse_cycle: true, induction_cooktop: false, ceiling_insulation: false, disconnect_gas: false }
const loadTypical = () => assess({ building: TYPICAL, existing: TYPICAL_EXISTING, package: TYPICAL_PACKAGE })

function typicalFigures(r: AssessResponse) {
  const c = r.flat_groups.find((g) => g.position === 'top')?.comfort
  const im = r.impact
  const items: { label: string; value: string; note?: string }[] = []
  if (c) {
    items.push({ label: 'Hottest it gets on the top floor', value: `${num1(c.peak_indoor_c_baseline)} to ${num1(c.peak_indoor_c_upgraded)}°C`, note: 'Over a year, with no air conditioning running' })
    items.push({
      label: 'Hours above 30°C on the top floor',
      value: `${num(c.hours_above_30c_baseline)} to ${num(c.hours_above_30c_upgraded)}`,
      note:
        c.hours_above_30c_upgraded_as_used != null
          ? `A year, with no air conditioning running. With the new air conditioner on from 2 to 11 pm when hot: ${num(c.hours_above_30c_upgraded_as_used)}.`
          : 'A year, with no air conditioning running',
    })
  }
  items.push({ label: 'Energy the block uses', value: `${Math.round(im.energy_reduction_pct)}% less`, note: 'Gas and electricity together' })
  items.push({
    label: 'Emissions a year',
    value: `${num1(im.co2e_t_per_year_saved)} t less`,
    note: im.co2e_t_per_year_baseline != null && im.co2e_t_per_year_upgraded != null ? `${num1(im.co2e_t_per_year_baseline)} t of CO₂e now, ${num1(im.co2e_t_per_year_upgraded)} t after` : 'Tonnes of CO₂e',
  })
  return items
}

export default function Front() {
  const typical = useLoad(loadTypical)
  const r = typical.data
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

      <section aria-labelledby="changes">
        <h2 id="changes">What changes in a typical block</h2>
        <p className="mb-3 mt-1 max-w-3xl text-muted-foreground">
          A three-storey block of 12 rented flats in Penrith, with gas hot water, plug-in heaters, no air conditioning and a dark roof. The upgrade adds a cool roof, heat pump hot water and reverse-cycle air conditioning. Every figure is a modelled estimate.
        </p>
        <BlockUpgrade
          existing={TYPICAL_EXISTING}
          pkg={TYPICAL_PACKAGE}
          storeys={TYPICAL.storeys}
          flats={TYPICAL.flats}
          result={r}
          figures={
            r ? (
              <Figures label="What the upgrade does for this block" items={typicalFigures(r)} />
            ) : typical.error ? (
              <p className="text-sm text-muted-foreground">
                The modelled figures did not load. The drawing still shows what changes.{' '}
                <Button variant="link" className="h-auto p-0 text-sm" onClick={typical.retry}>
                  Try again
                </Button>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground" role="status">
                Working out the figures for this block...
              </p>
            )
          }
        />
        <p className="mt-3">
          <Link to="/finder" className="font-semibold">
            Try other upgrades on a real block in the finder
          </Link>
        </p>
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
