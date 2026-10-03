import { useEffect, useRef, useState } from 'react'
import { money } from '../format'
import type { Async } from '../hooks'
import { balanceFor, makeVerdict } from '../verdict'
import type { GroupSel } from '../verdict'
import type { AssessResponse, BuildingCollection, Deal, Meta } from '../types'
import { Icon } from './Icons'
import Inputs from './Inputs'
import { DealBalance, StatTiles, VerdictBanner, WarningsBox } from './result/Balance'
import { HeatwaveChart, MonthlyChart } from './result/Charts'
import { AssumptionsCard, CostBreakdown, ImpactCard } from './result/Money'
import { ErrorBlock } from './ui'

interface Props {
  deal: Deal
  meta: Meta
  buildings: BuildingCollection
  assess: Async<AssessResponse> & { updating: boolean }
  shortlist: { ids: string[]; toggle: (id: string) => void }
  onChange: (d: Deal) => void
  onChangeBlock: () => void
  onShare: () => void
}

function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Working out the deal">
      <div className="sk sk-verdict" />
      <div className="sk sk-card" />
      <div className="sk sk-tiles" />
      <div className="sk sk-card" />
    </div>
  )
}

function LiveStrip({ r, targetRef }: { r: AssessResponse; targetRef: React.RefObject<HTMLDivElement | null> }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = targetRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisible(!e.isIntersecting), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [targetRef])
  const v = makeVerdict(r)
  const b = balanceFor(r, 'avg')
  return (
    <div className={'live-strip ' + v.tone + (visible ? ' show' : '')} aria-hidden={!visible}>
      <span className="dot" />
      <span className="live-text">
        {v.tone === 'good' ? `Works. Tenants keep ${money(b.keep)} a month` : v.tone === 'empty' ? 'Switch on an upgrade' : `${money(r.package.funding_gap)} short. Tenants keep ${money(Math.max(0, b.keep))} a month`}
      </span>
      <button className="btn btn-primary small-btn" tabIndex={visible ? 0 : -1} onClick={() => targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        See result
      </button>
    </div>
  )
}

export default function DealStep({ deal, meta, buildings, assess, shortlist, onChange, onChangeBlock, onShare }: Props) {
  const [sel, setSel] = useState<GroupSel>('avg')
  const topRef = useRef<HTMLDivElement>(null)
  const r = assess.data

  // clamp the picked group when the building has only one floor
  const hasLower = r?.flat_groups.some((g) => g.position === 'lower') ?? true
  const effectiveSel: GroupSel = !hasLower && sel === 'lower' ? 'avg' : sel

  const feature = deal.buildingId ? buildings.features.find((f) => f.properties.id === deal.buildingId) : null
  const base = feature
    ? { label: feature.properties.label, flats: feature.properties.flats_est, storeys: feature.properties.storeys }
    : { label: 'Your own block', flats: deal.own?.flats ?? 1, storeys: deal.own?.storeys ?? 1 }
  const bid = deal.buildingId
  const shortlisted = bid ? shortlist.ids.includes(bid) : null

  // own blocks keep flats and storeys in `own`; edits go there
  const handleChange = (d: Deal) => {
    if (!d.buildingId && d.own) {
      const own = { ...d.own, flats: d.flats ?? d.own.flats, storeys: d.storeys ?? d.own.storeys }
      onChange({ ...d, own, flats: undefined, storeys: undefined })
    } else onChange(d)
  }
  const ownDeal: Deal = !deal.buildingId && deal.own ? { ...deal, flats: deal.own.flats, storeys: deal.own.storeys } : deal

  return (
    <section className="build" aria-label="Build the deal">
      <div className="build-in">
        <Inputs
          deal={ownDeal}
          meta={meta}
          result={r}
          base={base}
          onChange={handleChange}
          onChangeBlock={onChangeBlock}
          shortlisted={shortlisted}
          onShortlist={() => bid && shortlist.toggle(bid)}
        />
      </div>

      <div className="build-out">
        <div ref={topRef} className="result-anchor" />
        {assess.error && !r && <ErrorBlock message={assess.error} onRetry={assess.retry} title="We couldn't work out the deal" />}
        {!r && !assess.error && <Skeleton />}
        {r && (
          <div className={'result' + (assess.updating ? ' updating' : '')}>
            <div className="updating-pill" aria-hidden={!assess.updating}>
              <span className="spinner-dot" /> Updating
            </div>
            {assess.error && (
              <div className="inline-error" role="alert">
                <Icon name="alert" size={18} />
                <span>{assess.error} The numbers below are from your last successful update.</span>
                <button className="btn btn-secondary small-btn" onClick={assess.retry}>
                  Try again
                </button>
              </div>
            )}
            <VerdictBanner r={r} />
            <WarningsBox r={r} />
            <DealBalance r={r} sel={effectiveSel} onSel={setSel} />
            <StatTiles r={r} />
            <HeatwaveChart r={r} />
            <MonthlyChart r={r} />
            <CostBreakdown r={r} />
            <ImpactCard r={r} />
            <AssumptionsCard r={r} />
            <div className="cta-row">
              <button className="btn btn-primary big" onClick={onShare}>
                Share this deal <Icon name="chevron" size={20} />
              </button>
              <p className="muted small">Next: a one-page summary for the tenant, the owner and the funder.</p>
            </div>
          </div>
        )}
      </div>
      {r && <LiveStrip r={r} targetRef={topRef} />}
    </section>
  )
}
