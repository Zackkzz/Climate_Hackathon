import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { getBuildings, getMeta } from '@/api'
import { useAssess, useLoad, useShortlist } from '@/hooks'
import { decodeDeal, encodeDeal, newDeal, parseHash } from '@/state'
import type { Route, Sheet, Step } from '@/state'
import type { Deal } from '@/types'
import { DemoNotice } from '@/portal/components/DemoNotice'
import { Footer } from '@/portal/components/Footer'
import { SiteHeader, SkipLink } from '@/portal/components/Shell'
import { ErrorAlert, LoadingRows } from '@/portal/components/States'
import { Button } from '@/portal/components/ui/button'
import './finder.css'
import Build from './Build'
import Find from './Find'
import HowItWorks from './HowItWorks'
import Share from './Share'

const STEPS: { key: Step; n: number; label: string }[] = [
  { key: 'find', n: 1, label: 'Find a block' },
  { key: 'build', n: 2, label: 'Build the deal' },
  { key: 'share', n: 3, label: 'Share it' },
]
const TITLES: Record<Step, string> = { find: 'Find a block', build: 'Build the deal', share: 'Share it' }

/** The public block finder and deal builder. State lives in the URL hash (#/find, #/build?..., #/share?...) so shared links keep working. */
export default function Finder() {
  const meta = useLoad(getMeta)
  const buildings = useLoad(getBuildings)
  const shortlist = useShortlist()
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash).route)
  const [deal, setDeal] = useState<Deal | null>(null)
  const [ready, setReady] = useState(false)
  const [how, setHow] = useState(false)
  const dealRef = useRef<Deal | null>(null)
  dealRef.current = deal
  const m = meta.data
  const metaRef = useRef(m)
  metaRef.current = m

  // restore from the link once the pilot data is known
  useEffect(() => {
    if (!m || ready) return
    const { route: rt, qs } = parseHash(window.location.hash)
    const d = decodeDeal(qs, m)
    if (d) setDeal(d)
    if (!d && rt.step !== 'find') {
      setRoute({ ...rt, step: 'find' })
      window.history.replaceState(null, '', '#/find')
    } else setRoute(rt)
    setReady(true)
  }, [m, ready])

  // follow back/forward and pasted links
  useEffect(() => {
    const onHash = () => {
      const mm = metaRef.current
      const { route: rt, qs } = parseHash(window.location.hash)
      if (mm && rt.step !== 'find') {
        const d = decodeDeal(qs, mm)
        const cur = dealRef.current
        if (d && (!cur || encodeDeal(cur, mm) !== encodeDeal(d, mm))) setDeal(d)
        if (!d && !cur) {
          setRoute({ ...rt, step: 'find' })
          return
        }
      }
      setRoute(rt)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // keep the URL in step with the deal so the link always reopens what is on screen
  useEffect(() => {
    if (!m || !ready || !deal || route.step === 'find') return
    const qs = encodeDeal(deal, m, route.step === 'share' ? route.sheet : undefined)
    const next = `#/${route.step}?${qs}`
    if (window.location.hash !== next) window.history.replaceState(null, '', next)
  }, [deal, m, ready, route])

  useEffect(() => {
    document.title = `${TITLES[route.step]} | Meterwise`
    window.scrollTo({ top: 0 })
  }, [route.step])

  const assess = useAssess(route.step === 'find' ? null : deal)

  const go = useCallback((step: Step, d: Deal | null = dealRef.current, sheet: Sheet = 'tenant') => {
    const mm = metaRef.current
    if (!mm) return
    const qs = d && step !== 'find' ? '?' + encodeDeal(d, mm, step === 'share' ? sheet : undefined) : ''
    const next = `#/${step}${qs}`
    if (window.location.hash === next) setRoute({ step, how: false, sheet })
    else window.location.hash = next
  }, [])

  const startDeal = (id: string) => {
    if (!m) return
    const d = newDeal(m, id)
    setDeal(d)
    go('build', d)
  }
  const startOwn = (own: NonNullable<Deal['own']>) => {
    if (!m) return
    const d = { ...newDeal(m, null), own }
    setDeal(d)
    go('build', d)
  }

  const hasDeal = deal !== null
  const ready2 = !!m && !!buildings.data && ready

  return (
    <div className="nsw-display-flex mw-min-h-svh nsw-flex-column">
      <DemoNotice />
      <SkipLink />
      <SiteHeader />
      <div className="no-print mw-finder-bar nsw-display-flex nsw-flex-wrap nsw-align-items-center mw-gap-x-4 mw-gap-y-1 mw-border-b mw-bg-white mw-px-3 mw-py-1 mw-sm-px-4">
        <nav aria-label="Steps" className="mw-order-last nsw-display-flex mw-min-w-0 mw-basis-full nsw-align-items-center mw-sm-order-none mw-sm-basis-auto mw-sm-flex-1">
          <ol className="nsw-display-flex nsw-flex-wrap nsw-align-items-center mw-gap-1">
            {STEPS.map((s) => {
              const current = s.key === route.step
              const disabled = s.key !== 'find' && !hasDeal
              return (
                <li key={s.key}>
                  <Button variant={current ? 'secondary' : 'ghost'} size="sm" disabled={disabled} aria-current={current ? 'step' : undefined} title={disabled ? 'Pick a block first' : undefined} onClick={() => go(s.key)} className="nsw-text-nowrap">
                    {s.n}. {s.label}
                  </Button>
                </li>
              )
            })}
          </ol>
        </nav>
        <nav aria-label="Finder links" className="mw-ml-auto nsw-display-flex nsw-flex-wrap nsw-align-items-center mw-gap-x-3 nsw-small">
          <Button variant="link" className="mw-h-auto mw-p-0" onClick={() => setHow(true)}>
            How it works
          </Button>
          <Link to="/signin">Programme sign in</Link>
        </nav>
      </div>

      <main id="main" tabIndex={-1} className="mw-flex-1">
        {(meta.error || buildings.error) && (
          <div className="mw-mx-auto mw-max-w-xl mw-p-6">
            <ErrorAlert
              error={meta.error ?? buildings.error}
              title="We could not load the map data"
              onRetry={() => {
                meta.retry()
                buildings.retry()
              }}
            />
          </div>
        )}
        {!meta.error && !buildings.error && !ready2 && (
          <div className="mw-mx-auto mw-max-w-xl mw-p-6">
            <LoadingRows rows={4} label="Loading Meterwise" />
          </div>
        )}
        {ready2 && m && buildings.data && (
          <>
            {route.step === 'find' && <Find meta={m} buildings={buildings.data} shortlist={shortlist} onBuild={startDeal} onBuildOwn={startOwn} />}
            {route.step === 'build' && deal && <Build deal={deal} meta={m} buildings={buildings.data} assess={assess} shortlist={shortlist} onChange={setDeal} onChangeBlock={() => go('find')} onShare={() => go('share', deal, route.sheet)} />}
            {route.step === 'share' && deal && <Share assess={assess} sheet={route.sheet} onSheet={(s) => setRoute((r) => ({ ...r, sheet: s }))} onBack={() => go('build')} />}
          </>
        )}
      {route.step !== 'find' && (
        <p className="no-print mw-mx-auto mw-max-w-4xl mw-px-4 mw-pt-4 nsw-small mw-text-muted">
          Meterwise is a screening tool, not engineering or financial advice. Every figure is a modelled estimate, not a quote. Heat is satellite surface temperature, not the air inside a flat.
        </p>
      )}
      </main>

      <Footer />
      {how && m && <HowItWorks meta={m} onClose={() => setHow(false)} />}
    </div>
  )
}
