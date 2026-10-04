import { Link } from 'react-router'
import { assess } from '@/api'
import { num, num1 } from '@/format'
import { useLoad } from '@/hooks'
import type { AssessResponse, Existing, Package } from '@/types'
import { BlockUpgrade } from '@/portal/components/BlockUpgrade'
import { Figures } from '@/portal/components/PageHeader'
import { Button } from '@/portal/components/ui/button'
import { Callout } from '@/portal/components/ui/callout'
import { Card } from '@/portal/components/ui/card'

const PORTALS = [
  { title: 'Government', text: 'Run the programme: projects, billing, the reserve and grants. Oversight sees outcomes, areas and the audit log.' },
  { title: 'Utility', text: 'Meters, network impact, bulk readings, charge files and remittance for distributors, retailers and gas networks.' },
  { title: 'Property', text: 'Landlords, strata committees and community housing providers manage their blocks. Tenants see their own flat.' },
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

      <section aria-labelledby="changes">
        <h2 id="changes">What changes in a typical block</h2>
        <p className="mw-mb-3 mw-mt-1 mw-max-w-3xl mw-text-muted">
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
              <p className="nsw-small mw-text-muted">
                The modelled figures did not load. The drawing still shows what changes.{' '}
                <Button variant="link" className="mw-h-auto mw-p-0" onClick={typical.retry}>
                  Try again
                </Button>
              </p>
            ) : (
              <p className="nsw-small mw-text-muted" role="status">
                Working out the figures for this block...
              </p>
            )
          }
        />
        <p className="mw-mt-3">
          <Link to="/finder" className="nsw-text-semibold">
            Try other upgrades on a real block in the finder
          </Link>
        </p>
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
