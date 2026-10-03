import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getBuildings, getMeta, USE_MOCK } from './api'
import DealStep from './components/DealStep'
import FindStep from './components/FindStep'
import HowItWorks from './components/HowItWorks'
import { Icon, Logo } from './components/Icons'
import ShareStep from './components/ShareStep'
import { DemoTag, ErrorBlock, LoadingBlock } from './components/ui'
import { useAssess, useLoad, useShortlist } from './hooks'
import { decodeDeal, encodeDeal, newDeal, parseHash } from './state'
import type { Route, Sheet, Step } from './state'
import type { Deal } from './types'

const STEPS: { key: Step; n: number; label: string }[] = [
  { key: 'find', n: 1, label: 'Find a block' },
  { key: 'build', n: 2, label: 'Build the deal' },
  { key: 'share', n: 3, label: 'Share it' },
]

const TITLES: Record<Step, string> = {
  find: 'Find a block',
  build: 'Build the deal',
  share: 'Share it',
}

export default function App() {
  const meta = useLoad(getMeta)
  const buildings = useLoad(getBuildings)
  const shortlist = useShortlist()
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash).route)
  const [deal, setDeal] = useState<Deal | null>(null)
  const [ready, setReady] = useState(false)
  const [how, setHow] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const dealRef = useRef<Deal | null>(null)
  dealRef.current = deal

  const m = meta.data
  const metaRef = useRef(m)
  metaRef.current = m

  // measure the header so the map can fill the rest of the screen
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ready, buildings.data])

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
    document.title = `${TITLES[route.step]} · Meterwise`
    window.scrollTo({ top: 0 })
  }, [route.step])

  const assess = useAssess(route.step === 'find' ? null : deal)

  const go = useCallback(
    (step: Step, d: Deal | null = dealRef.current, sheet: Sheet = 'tenant') => {
      const mm = metaRef.current
      if (!mm) return
      const qs = d && step !== 'find' ? '?' + encodeDeal(d, mm, step === 'share' ? sheet : undefined) : ''
      const next = `#/${step}${qs}`
      if (window.location.hash === next) setRoute({ step, how: false, sheet })
      else window.location.hash = next
    },
    [],
  )

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

  if (meta.error || buildings.error) {
    return (
      <div className="boot">
        <Logo size={56} />
        <ErrorBlock
          message={meta.error ?? buildings.error ?? ''}
          onRetry={() => {
            meta.retry()
            buildings.retry()
          }}
          title="We couldn't load the map data"
        />
      </div>
    )
  }
  if (!m || !buildings.data || !ready) {
    return (
      <div className="boot">
        <Logo size={56} />
        <LoadingBlock text="Loading Meterwise..." />
      </div>
    )
  }

  const hasDeal = deal !== null
  const canGo = (s: Step) => s === 'find' || hasDeal

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="app-header no-print" ref={headerRef}>
        <div className="brand">
          <Logo size={34} />
          <div>
            <div className="wordmark">
              Meter<span>wise</span>
            </div>
            <p className="promise">Upgrades for rented flats that pay for themselves on the bill</p>
          </div>
        </div>
        <nav className="stepper" aria-label="Steps">
          <ol>
            {STEPS.map((s) => {
              const state = s.key === route.step ? 'current' : STEPS.findIndex((x) => x.key === route.step) > s.n - 1 ? 'done' : 'todo'
              return (
                <li key={s.key} className={state}>
                  <button onClick={() => go(s.key)} disabled={!canGo(s.key)} aria-current={s.key === route.step ? 'step' : undefined} title={!canGo(s.key) ? 'Pick a block first' : undefined}>
                    <span className="step-n">{state === 'done' ? <Icon name="check" size={14} /> : s.n}</span>
                    <span className="step-l">{s.label}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
        <div className="header-actions">
          {USE_MOCK ? <DemoTag /> : m.pilot.is_fixture ? <DemoTag label="Example data" /> : null}
          <button className="link-btn" onClick={() => setHow(true)}>
            How it works
          </button>
        </div>
      </header>

      <main id="main" className={'step-' + route.step}>
        {route.step === 'find' && <FindStep meta={m} buildings={buildings.data} shortlist={shortlist} onBuild={startDeal} onBuildOwn={startOwn} />}
        {route.step === 'build' && deal && (
          <DealStep deal={deal} meta={m} buildings={buildings.data} assess={assess} shortlist={shortlist} onChange={setDeal} onChangeBlock={() => go('find')} onShare={() => go('share', deal, route.sheet)} />
        )}
        {route.step === 'share' && deal && (
          <ShareStep
            assess={assess}
            sheet={route.sheet}
            onSheet={(s) => {
              setRoute((r) => ({ ...r, sheet: s }))
            }}
            onBack={() => go('build')}
          />
        )}
      </main>

      {route.step !== 'find' && (
        <footer className="app-footer no-print">
          <p>
            Meterwise is a screening tool, not engineering or financial advice. Every figure is a modelled estimate, not a quote. Heat is satellite surface temperature, not the air inside a flat.
          </p>
        </footer>
      )}
      {how && <HowItWorks meta={m} onClose={() => setHow(false)} />}
    </div>
  )
}
