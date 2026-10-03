import { lazy, Suspense, useId, useMemo, useState } from 'react'
import { portfolio } from '../api'
import { heatWord, money, num1, plural, rentedPhrase } from '../format'
import { HEAT_COLORS, HEAT_ORDER } from '../heat'
import { useLoad } from '../hooks'
import type { BuildingCollection, BuildingFeature, Deal, Meta } from '../types'
import { Icon } from './Icons'
import { EmptyBlock, ErrorBlock, LoadingBlock, NumberStepper } from './ui'

const MapView = lazy(() => import('./MapView'))

type Own = NonNullable<Deal['own']>

interface Props {
  meta: Meta
  buildings: BuildingCollection
  shortlist: { ids: string[]; toggle: (id: string) => void; remove: (id: string) => void }
  onBuild: (id: string) => void
  onBuildOwn: (own: Own) => void
}

function HeatChip({ band }: { band: BuildingFeature['properties']['heat_band'] }) {
  return (
    <span className="heat-chip">
      <span className="swatch" style={{ background: HEAT_COLORS[band] }} />
      {heatWord(band)}
    </span>
  )
}

function Legend() {
  return (
    <div className="legend" aria-label="Map legend: from cooler than most to among the hottest">
      <div className="legend-bar" aria-hidden="true">
        {HEAT_ORDER.map((b) => (
          <span key={b} style={{ background: HEAT_COLORS[b] }} />
        ))}
      </div>
      <div className="legend-labels">
        <span>Cooler than most</span>
        <span>Among the hottest</span>
      </div>
    </div>
  )
}

function SelectedCard({ f, onBuild, shortlisted, onShortlist }: { f: BuildingFeature; onBuild: () => void; shortlisted: boolean; onShortlist: () => void }) {
  const p = f.properties
  return (
    <div className="select-card" aria-live="polite">
      <div className="select-card-head">
        <h3>{p.label}</h3>
        <HeatChip band={p.heat_band} />
      </div>
      <p>
        About {plural(p.flats_est, 'flat')}, {plural(p.storeys, 'storey')}
        {p.storeys_source === 'assumed' ? ' (assumed)' : ''}. {rentedPhrase(p.renter_share)[0].toUpperCase() + rentedPhrase(p.renter_share).slice(1)}.
      </p>
      <div className="row gap">
        <button className="btn btn-primary" onClick={onBuild}>
          Build the deal <Icon name="chevron" size={18} />
        </button>
        <button className={'btn btn-ghost' + (shortlisted ? ' on' : '')} onClick={onShortlist} aria-pressed={shortlisted}>
          <Icon name="bookmark" size={18} /> {shortlisted ? 'On shortlist' : 'Shortlist'}
        </button>
      </div>
    </div>
  )
}

function OwnBlockForm({ meta, pin, pickMode, setPickMode, onCancel, onSubmit }: { meta: Meta; pin: { lat: number; lon: number } | null; pickMode: boolean; setPickMode: (v: boolean) => void; onCancel: () => void; onSubmit: (o: Own) => void }) {
  const [storeys, setStoreys] = useState(3)
  const [flats, setFlats] = useState(12)
  const [roofKnown, setRoofKnown] = useState(false)
  const [roof, setRoof] = useState(300)
  const idRoof = useId()
  const flatArea = 65
  const estimate = Math.round(((flats / storeys) * flatArea * 1.15) / 10) * 10
  const roofUsed = roofKnown ? roof : estimate
  const loc = pin ?? meta.pilot.centre
  return (
    <form
      className="own-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ storeys, flats, roof_m2: roofUsed, flat_area_m2: flatArea, lat: loc.lat, lon: loc.lon })
      }}
    >
      <h3>Enter your own block</h3>
      <p className="muted small">A few details are enough. You can change them later.</p>
      <NumberStepper label="Storeys" value={storeys} min={1} max={12} onChange={setStoreys} />
      <NumberStepper label="Flats" value={flats} min={1} max={200} onChange={setFlats} />
      <div className="stepper-field">
        <label htmlFor={idRoof}>Roof area</label>
        <div className="row gap wrap">
          <input id={idRoof} type="number" min={20} max={5000} value={roofKnown ? roof : estimate} disabled={!roofKnown} onChange={(e) => setRoof(Math.max(20, Number(e.target.value) || 20))} className="num-input" /> <span className="muted">m²</span>
          <label className="check">
            <input type="checkbox" checked={!roofKnown} onChange={(e) => setRoofKnown(!e.target.checked)} /> I don't know, estimate it
          </label>
        </div>
      </div>
      <div className="pin-row">
        <button type="button" className={'btn btn-secondary' + (pickMode ? ' on' : '')} onClick={() => setPickMode(!pickMode)}>
          <Icon name="pin" size={18} /> {pickMode ? 'Tap the map...' : pin ? 'Move the spot' : 'Choose the spot on the map'}
        </button>
        <span className="muted small">{pin ? 'Spot chosen.' : 'Optional. Without it we use the middle of the pilot area.'}</span>
      </div>
      <div className="row gap">
        <button className="btn btn-primary" type="submit">
          Build the deal <Icon name="chevron" size={18} />
        </button>
        <button className="btn btn-ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function ShortlistView({ ids, buildings, remove, onOpen }: { ids: string[]; buildings: BuildingCollection; remove: (id: string) => void; onOpen: (id: string) => void }) {
  const key = ids.join(',')
  const state = useLoad(() => (ids.length ? portfolio({ building_ids: ids }) : Promise.resolve(null)), key)
  if (ids.length === 0) {
    return (
      <EmptyBlock title="Your shortlist is empty">
        Select a block on the map and press Shortlist. Then compare capital needed and funding gaps here.
      </EmptyBlock>
    )
  }
  if (state.error) return <ErrorBlock message={state.error} onRetry={state.retry} title="Couldn't compare the shortlist" />
  if (!state.data) return <LoadingBlock text="Comparing your shortlist..." />
  const { results, totals } = state.data
  const byId = new Map(buildings.features.map((f) => [f.properties.id, f.properties]))
  return (
    <div className={'shortlist' + (state.loading ? ' updating' : '')}>
      <p className="muted small">Each block gets the standard package with default settings. Figures are estimated.</p>
      <div className="table-wrap">
        <table className="data-table short-table">
          <thead>
            <tr>
              <th scope="col">Block</th>
              <th scope="col" className="r">Capital needed</th>
              <th scope="col" className="r">Gap</th>
              <th scope="col" className="r">CO₂e t/yr</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.building_id}>
                <th scope="row">
                  <button className="link-btn" onClick={() => onOpen(r.building_id)}>
                    {r.label}
                  </button>
                  <div className="muted small row between-inline">
                    <span>
                      {plural(r.flats, 'flat')} · {byId.get(r.building_id) ? heatWord(byId.get(r.building_id)?.heat_band) : ''}
                    </span>
                    <button className="link-btn small" aria-label={`Remove ${r.label} from shortlist`} onClick={() => remove(r.building_id)}>
                      Remove
                    </button>
                  </div>
                </th>
                <td className="r">{money(r.net_capex)}</td>
                <td className={'r' + (r.funding_gap > 0 ? ' warn-text' : ' good-text')}>{r.funding_gap > 0 ? money(r.funding_gap) : 'None'}</td>
                <td className="r">{num1(r.co2e_t_per_year_saved)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">
                Total: {plural(totals.buildings, 'block')}, {plural(totals.flats, 'flat')}
              </th>
              <td className="r">{money(totals.net_capex)}</td>
              <td className={'r' + (totals.funding_gap > 0 ? ' warn-text' : ' good-text')}>{totals.funding_gap > 0 ? money(totals.funding_gap) : 'None'}</td>
              <td className="r">{num1(totals.co2e_t_per_year_saved)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted small">
        {totals.fully_funded_count} of {totals.buildings} blocks can be fully repaid from bill savings.
      </p>
    </div>
  )
}

const LIST_LIMIT = 40
const isMobile = () => window.matchMedia('(max-width: 960px)').matches

export default function FindStep({ meta, buildings, shortlist, onBuild, onBuildOwn }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [tab, setTab] = useState<'top' | 'shortlist'>('top')
  const [own, setOwn] = useState(false)
  const [pickMode, setPickMode] = useState(false)
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null)
  const [sheet, setSheet] = useState<'peek' | 'mid' | 'open'>('peek')
  const [basemapFailed, setBasemapFailed] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const ranked = useMemo(() => [...buildings.features].sort((a, b) => b.properties.quick_score - a.properties.quick_score), [buildings])
  const selected = selectedId ? buildings.features.find((f) => f.properties.id === selectedId) ?? null : null

  const select = (id: string | null) => {
    setSelectedId(id)
    if (id) {
      if (isMobile()) setSheet('mid')
      setOwn(false)
      setPickMode(false)
      setTab('top')
    }
  }

  return (
    <section className="find" aria-label="Find a block">
      <div className="find-map">
        <Suspense fallback={<LoadingBlock text="Loading the map..." />}>
          <MapView
            data={buildings}
            selectedId={selectedId}
            hoverId={hoverId}
            onSelect={select}
            onHover={setHoverId}
            pickMode={pickMode}
            pin={pin}
            onPick={(lat, lon) => {
              setPin({ lat, lon })
              setPickMode(false)
            }}
            bbox={meta.pilot.bbox}
            bottomPad={!isMobile() ? 0 : sheet === 'peek' ? 170 : sheet === 'mid' ? 350 : 480}
            onBasemapFailed={() => setBasemapFailed(true)}
          />
        </Suspense>
        <Legend />
        {basemapFailed && <div className="map-note">The street map could not load. Buildings are still shown.</div>}
      </div>

      <aside className={'find-panel ' + sheet} aria-label="Blocks to look at first">
        <button className="sheet-handle" onClick={() => setSheet(sheet === 'peek' ? 'open' : 'peek')} aria-expanded={sheet !== 'peek'}>
          <span className="grip" />
          <span className="sr-only">{sheet === 'peek' ? 'Expand list' : 'Collapse list'}</span>
        </button>
        <div className="panel-scroll">
          {own ? (
            <OwnBlockForm
              meta={meta}
              pin={pin}
              pickMode={pickMode}
              setPickMode={(v) => {
                setPickMode(v)
                if (v) setSheet('peek')
              }}
              onCancel={() => {
                setOwn(false)
                setPickMode(false)
              }}
              onSubmit={onBuildOwn}
            />
          ) : (
            <>
              <h2 className="panel-title">Where should we upgrade first?</h2>
              <p className="muted small peek-hint">Tap a block on the map, or pull this up for the list.</p>
              <p className="muted small heat-note">
                Colours show how much hotter the ground gets than the area's middle on hot summer days, measured by satellite. This is surface temperature, not the air inside a flat.
              </p>
              {selected && (
                <SelectedCard
                  f={selected}
                  onBuild={() => onBuild(selected.properties.id)}
                  shortlisted={shortlist.ids.includes(selected.properties.id)}
                  onShortlist={() => shortlist.toggle(selected.properties.id)}
                />
              )}
              <div className="tabs" role="tablist" aria-label="Block lists">
                <button role="tab" aria-selected={tab === 'top'} className={tab === 'top' ? 'on' : ''} onClick={() => setTab('top')}>
                  <Icon name="list" size={16} /> Top blocks
                </button>
                <button role="tab" aria-selected={tab === 'shortlist'} className={tab === 'shortlist' ? 'on' : ''} onClick={() => setTab('shortlist')}>
                  <Icon name="bookmark" size={16} /> Shortlist{shortlist.ids.length > 0 && <span className="count">{shortlist.ids.length}</span>}
                </button>
              </div>
              {tab === 'top' ? (
                ranked.length === 0 ? (
                  <EmptyBlock title="No blocks found">There are no apartment buildings in this area yet.</EmptyBlock>
                ) : (
                  <>
                  <ol className="block-list">
                    {(showAll ? ranked : ranked.slice(0, LIST_LIMIT)).map((f, i) => {
                      const p = f.properties
                      return (
                        <li key={p.id}>
                          <button
                            className={'block-item' + (p.id === selectedId ? ' on' : '')}
                            onClick={() => select(p.id)}
                            onMouseEnter={() => setHoverId(p.id)}
                            onMouseLeave={() => setHoverId(null)}
                            onFocus={() => setHoverId(p.id)}
                            onBlur={() => setHoverId(null)}
                            aria-pressed={p.id === selectedId}
                          >
                            <span className="rank">{i + 1}</span>
                            <span className="block-main">
                              <span className="block-name">{p.label}</span>
                              <span className="block-meta">
                                {plural(p.flats_est, 'flat')} · <HeatChip band={p.heat_band} /> · {p.renter_share === null ? 'renters unknown' : `${Math.round(p.renter_share * 100)}% rented`}
                              </span>
                            </span>
                            <span className="score" title="Screening score from heat and renter share">
                              {p.quick_score}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                  {!showAll && ranked.length > LIST_LIMIT && (
                    <button className="btn btn-ghost small-btn show-all" onClick={() => setShowAll(true)}>
                      Show all {ranked.length} blocks
                    </button>
                  )}
                  </>
                )
              ) : (
                <ShortlistView ids={shortlist.ids} buildings={buildings} remove={shortlist.remove} onOpen={(id) => select(id)} />
              )}
              <button
                className="link-btn own-link"
                onClick={() => {
                  setOwn(true)
                  setSelectedId(null)
                }}
              >
                It's not on the map? Enter your own block
              </button>
            </>
          )}
        </div>
      </aside>
    </section>
  )
}
