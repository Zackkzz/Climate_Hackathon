import { useId } from 'react'
import type { ReactNode } from 'react'
import { money } from '../format'
import { ITEM_BENEFIT, ITEM_SHORT } from '../verdict'
import type { AssessResponse, Deal, Existing, Finance, Meta, Package, PackageKey, Tariff } from '../types'
import { PACKAGE_KEYS } from '../types'
import { Icon } from './Icons'
import { NumberStepper, SelectField } from './ui'

const TITLES: Record<PackageKey, string> = {
  cool_roof: 'Cool roof',
  heat_pump_hot_water: 'Heat pump hot water',
  reverse_cycle: 'Reverse-cycle air conditioning',
  induction_cooktop: 'Induction cooktop',
  ceiling_insulation: 'Ceiling insulation',
  disconnect_gas: 'Disconnect gas',
}

/** Which gas appliances would still be left, given what is in the flats and what goes in. */
export function gasLeft(ex: Existing, pk: Package): string[] {
  const left: string[] = []
  if (ex.hot_water !== 'electric_storage' && !pk.heat_pump_hot_water) left.push(ITEM_SHORT.heat_pump_hot_water)
  if (ex.heating === 'gas_heater' && !pk.reverse_cycle) left.push(ITEM_SHORT.reverse_cycle)
  if (ex.cooktop === 'gas' && !pk.induction_cooktop) left.push(ITEM_SHORT.induction_cooktop)
  return left
}

/** Gas can only be disconnected when no gas appliance is left. */
export function normalise(d: Deal): Deal {
  if (d.package.disconnect_gas && gasLeft(d.existing, d.package).length > 0) {
    return { ...d, package: { ...d.package, disconnect_gas: false } }
  }
  return d
}

interface Props {
  deal: Deal
  meta: Meta
  result: AssessResponse | null
  base: { label: string; flats: number; storeys: number }
  onChange: (d: Deal) => void
  onChangeBlock: () => void
  shortlisted: boolean | null
  onShortlist: () => void
}

function UpgradeCard({ k, on, onToggle, disabledReason, result }: { k: PackageKey; on: boolean; onToggle: () => void; disabledReason: string | null; result: AssessResponse | null }) {
  const raw = result?.package.items.find((i) => i.key === k)
  // When an upgrade is off, show what it would cost and save, if the backend says so.
  const item = raw
    ? raw.selected
      ? raw
      : {
          ...raw,
          capex: raw.capex_if_selected ?? raw.capex,
          rebate: raw.rebate_if_selected ?? raw.rebate,
          saving_per_year: raw.saving_per_year_if_selected ?? raw.saving_per_year,
        }
    : undefined
  const id = useId()
  return (
    <div className={'upgrade' + (on ? ' on' : '') + (disabledReason ? ' disabled' : '')}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        disabled={!!disabledReason}
        onClick={onToggle}
        className="upgrade-btn"
      >
        <span className="up-icon">
          <Icon name={k} size={26} />
        </span>
        <span className="up-body">
          <span className="up-title" id={`${id}-t`}>
            {TITLES[k]}
          </span>
          <span className="up-benefit" id={`${id}-d`}>
            {disabledReason ?? ITEM_BENEFIT[k]}
          </span>
          {!disabledReason && item && item.capex > 0 && (
            <span className="up-cost">
              {item.rebate > 0 ? (
                <>
                  <strong>{money(item.capex - item.rebate)}</strong> for the block, after {money(item.rebate)} rebate
                </>
              ) : (
                <>
                  <strong>{money(item.capex)}</strong> for the block
                </>
              )}
              {item.saving_per_year > 0 && <span className="up-save"> · {on ? 'saves' : 'would save'} about {money(item.saving_per_year)} a year in bills</span>}
            </span>
          )}
        </span>
        <span className="switch" aria-hidden="true">
          <span className="knob">{on && <Icon name="check" size={14} />}</span>
        </span>
      </button>
    </div>
  )
}

function Slider({ label, help, value, min, max, step, format, onChange }: { label: string; help: string; value: number; min: number; max: number; step: number; format: (n: number) => string; onChange: (n: number) => void }) {
  const id = useId()
  return (
    <div className="field">
      <div className="field-top">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <p className="help">{help}</p>
    </div>
  )
}

function NumField({ label, help, value, step, unit, onChange }: { label: string; help: string; value: number; step: number; unit: string; onChange: (n: number) => void }) {
  const id = useId()
  return (
    <div className="field">
      <div className="field-top">
        <label htmlFor={id}>{label}</label>
        <span className="unit-input">
          <input id={id} type="number" min={0} step={step} value={value} onChange={(e) => e.target.value !== '' && onChange(Math.max(0, Number(e.target.value)))} />
          <span>{unit}</span>
        </span>
      </div>
      <p className="help">{help}</p>
    </div>
  )
}

function Block({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="in-block">
      <h3>{title}</h3>
      {hint && <p className="muted small hint">{hint}</p>}
      {children}
    </section>
  )
}

export default function Inputs({ deal, meta, result, base, onChange, onChangeBlock, shortlisted, onShortlist }: Props) {
  const set = (patch: Partial<Deal>) => onChange(normalise({ ...deal, ...patch }))
  const setEx = (k: keyof Existing, v: string) => set({ existing: { ...deal.existing, [k]: v } })
  const setPk = (k: PackageKey) => set({ package: { ...deal.package, [k]: !deal.package[k] } })
  const setFin = (patch: Partial<Finance>) => set({ finance: { ...deal.finance, ...patch } })
  const setTar = (patch: Partial<Tariff>) => set({ tariff: { ...deal.tariff, ...patch } })
  const o = meta.options
  const flats = deal.flats ?? base.flats
  const storeys = deal.storeys ?? base.storeys
  const left = gasLeft(deal.existing, deal.package)
  const finDef = JSON.stringify(deal.finance) === JSON.stringify(meta.defaults.finance) && JSON.stringify(deal.tariff) === JSON.stringify(meta.defaults.tariff)

  return (
    <div className="inputs">
      <section className="in-block block-summary">
        <div className="row between">
          <div>
            <div className="eyebrow">Your block</div>
            <h2 className="block-title">{base.label}</h2>
          </div>
          <button className="link-btn" onClick={onChangeBlock}>
            Change block
          </button>
        </div>
        <div className="row gap wrap">
          <NumberStepper label="Flats" value={flats} min={1} max={200} onChange={(n) => set({ flats: n })} />
          <NumberStepper label="Storeys" value={storeys} min={1} max={12} onChange={(n) => set({ storeys: n })} />
        </div>
        {shortlisted !== null && (
          <button className={'btn btn-ghost small-btn' + (shortlisted ? ' on' : '')} aria-pressed={shortlisted} onClick={onShortlist}>
            <Icon name="bookmark" size={16} /> {shortlisted ? 'On your shortlist' : 'Add to shortlist'}
          </button>
        )}
      </section>

      <Block title="What's in the flats now?" hint="Pick what is there today. This sets the starting bill.">
        <div className="select-grid">
          <SelectField label="Hot water" options={o.hot_water} value={deal.existing.hot_water} onChange={(k) => setEx('hot_water', k)} />
          <SelectField label="Heating" options={o.heating} value={deal.existing.heating} onChange={(k) => setEx('heating', k)} />
          <SelectField label="Cooling" options={o.cooling} value={deal.existing.cooling} onChange={(k) => setEx('cooling', k)} />
          <SelectField label="Cooktop" options={o.cooktop} value={deal.existing.cooktop} onChange={(k) => setEx('cooktop', k)} />
          <SelectField label="Roof" options={o.roof} value={deal.existing.roof} onChange={(k) => setEx('roof', k)} />
        </div>
      </Block>

      <Block title="What goes in?" hint="Switch upgrades on and off. The result updates as you go.">
        <div className="upgrades">
          {PACKAGE_KEYS.map((k) => (
            <UpgradeCard
              key={k}
              k={k}
              on={deal.package[k]}
              onToggle={() => setPk(k)}
              disabledReason={k === 'disconnect_gas' && left.length > 0 ? `Needs ${left.join(' and ')} first, so no gas appliance is left` : null}
              result={result}
            />
          ))}
        </div>
      </Block>

      <details className="advanced">
        <summary>
          <span>Advanced: finance terms and prices</span>
          <Icon name="chevron_down" size={20} />
        </summary>
        <div className="adv-body">
          <h4>Finance</h4>
          <Slider
            label="Investor's return needed"
            help="What the investor needs to earn on the money each year."
            value={Math.round(deal.finance.cost_of_capital * 1000) / 10}
            min={0}
            max={12}
            step={0.5}
            format={(n) => `${n.toFixed(1)}% a year`}
            onChange={(n) => setFin({ cost_of_capital: n / 100 })}
          />
          <Slider
            label="Repayment period"
            help="How long the monthly charge stays tied to the flat. Longer means a smaller charge."
            value={deal.finance.term_years}
            min={5}
            max={25}
            step={1}
            format={(n) => `${n} years`}
            onChange={(n) => setFin({ term_years: n })}
          />
          <Slider
            label="Share of the saving the tenant keeps, at least"
            help="The monthly charge never takes more than the rest of a flat's saving."
            value={Math.round((1 - deal.finance.savings_share_to_charge) * 100)}
            min={0}
            max={60}
            step={5}
            format={(n) => `${n}%`}
            onChange={(n) => setFin({ savings_share_to_charge: Math.round((1 - n / 100) * 100) / 100 })}
          />
          <Slider
            label="Cushion for gaps"
            help="Extra added to what must be repaid, to cover empty flats and admin costs."
            value={Math.round(deal.finance.reserve * 100)}
            min={0}
            max={20}
            step={1}
            format={(n) => `${n}%`}
            onChange={(n) => setFin({ reserve: n / 100 })}
          />
          <label className="check big">
            <input type="checkbox" checked={deal.finance.apply_rebates} onChange={(e) => setFin({ apply_rebates: e.target.checked })} />
            <span>
              Count government rebates
              <span className="help">Rebates cut the cost of eligible upgrades. Turn off to see the deal without them.</span>
            </span>
          </label>
          <h4>Prices</h4>
          <NumField label="Electricity" help="Price per unit of electricity." value={deal.tariff.electricity_c_per_kwh} step={0.5} unit="c/kWh" onChange={(n) => setTar({ electricity_c_per_kwh: n })} />
          <NumField label="Electricity fixed charge" help="Daily charge just for being connected." value={deal.tariff.electricity_supply_c_per_day} step={1} unit="c/day" onChange={(n) => setTar({ electricity_supply_c_per_day: n })} />
          <NumField label="Gas" help="Price per megajoule of gas." value={deal.tariff.gas_c_per_mj} step={0.1} unit="c/MJ" onChange={(n) => setTar({ gas_c_per_mj: n })} />
          <NumField label="Gas fixed charge" help="Daily charge for the gas connection. Disconnecting gas removes it." value={deal.tariff.gas_supply_c_per_day} step={1} unit="c/day" onChange={(n) => setTar({ gas_supply_c_per_day: n })} />
          <button
            className="btn btn-ghost small-btn"
            disabled={finDef}
            onClick={() => set({ finance: { ...meta.defaults.finance }, tariff: { ...meta.defaults.tariff } })}
          >
            <Icon name="retry" size={16} /> Reset to defaults
          </button>
        </div>
      </details>
    </div>
  )
}
