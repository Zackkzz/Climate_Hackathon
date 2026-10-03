import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { money, num } from '../../format'
import { weekComfort } from '../../verdict'
import type { AssessResponse } from '../../types'

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(720)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => setW(Math.max(300, Math.min(760, Math.round(el.clientWidth))))
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function niceStep(range: number, ticks: number) {
  const raw = range / ticks
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / pow
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow
}

function dayName(start: string, dayIndex: number): string {
  const d = new Date(start)
  if (Number.isNaN(d.getTime())) return `Day ${dayIndex + 1}`
  d.setDate(d.getDate() + dayIndex)
  return d.toLocaleDateString('en-AU', { weekday: 'short' })
}

function hourLabel(start: string, h: number): string {
  const d = new Date(start)
  if (Number.isNaN(d.getTime())) return `Hour ${h}`
  d.setHours(d.getHours() + h)
  return d.toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', hour12: true })
}

export function HeatwaveChart({ r }: { r: AssessResponse }) {
  const hw = r.heatwave
  const wc = weekComfort(r)
  const n = Math.min(hw.outdoor_c.length, hw.indoor_top_baseline_c.length, hw.indoor_top_upgraded_c.length)
  const [wrapRef, W] = useWidth()
  const H = W < 500 ? 300 : 320
  const m = { l: 40, r: 10, t: 14, b: 34 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const [hover, setHover] = useState<number | null>(null)

  const geo = useMemo(() => {
    const all = [...hw.outdoor_c, ...hw.indoor_top_baseline_c, ...hw.indoor_top_upgraded_c].slice(0, n * 3)
    const lo = Math.floor(Math.min(...all, 30) / 5) * 5 - 0
    const hi = Math.ceil(Math.max(...all, 30) / 5) * 5
    const x = (i: number) => m.l + (n <= 1 ? 0 : (i / (n - 1)) * iw)
    const y = (v: number) => m.t + ih - ((v - lo) / (hi - lo)) * ih
    const line = (arr: number[]) => arr.slice(0, n).map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    const ticks: number[] = []
    for (let v = lo; v <= hi; v += 5) ticks.push(v)
    return { lo, hi, x, y, line, ticks }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hw, n, W])

  if (n < 2) return null

  const diff = wc.peakOld - wc.peakNew
  const hoursSaved = wc.hoursOld - wc.hoursNew
  const days = Math.ceil(n / 24)

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * iw
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / iw) * (n - 1)))))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + (e.shiftKey ? 6 : 1)))
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? 1) - (e.shiftKey ? 6 : 1)))
    else if (e.key === 'Escape') setHover(null)
    else return
    e.preventDefault()
  }

  const alt = `Hourly temperatures over the hottest week. Outside peaks at ${Math.max(...hw.outdoor_c).toFixed(0)} degrees. Inside a top-floor flat with no air conditioning, the old roof peaks at ${wc.peakOld.toFixed(1)} degrees and the upgraded flat at ${wc.peakNew.toFixed(1)} degrees.`

  const hx = hover === null ? 0 : geo.x(hover)
  const tipRight = hover !== null && hover > n * 0.65

  return (
    <section className="card" aria-labelledby="heat-h">
      <h3 id="heat-h">Staying cool in the hottest week</h3>
      <p className="lede">
        {diff >= 0.3 ? (
          <>
            During the hottest week, a top-floor flat peaks <strong>{diff.toFixed(1)}° cooler</strong> ({wc.peakOld.toFixed(1)}° down to {wc.peakNew.toFixed(1)}°). It spends{' '}
            <strong>{num(hoursSaved)} fewer hours</strong> above 30°C ({num(wc.hoursOld)} hours down to {num(wc.hoursNew)}).
          </>
        ) : (
          <>This package changes the heat in top-floor flats very little. Switch on the cool roof or ceiling insulation to help them in a heatwave.</>
        )}
      </p>
      <div ref={wrapRef} className="chart-box" tabIndex={0} onKeyDown={onKey} aria-label={`${alt} Use the left and right arrow keys to read values hour by hour.`} role="group">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={alt}>
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={geo.y(t)} y2={geo.y(t)} className="grid" />
              <text x={m.l - 8} y={geo.y(t) + 4} textAnchor="end" className="axis-text">
                {t}°
              </text>
            </g>
          ))}
          {Array.from({ length: days }, (_, d) => {
            const x0 = geo.x(Math.min(n - 1, d * 24))
            const x1 = geo.x(Math.min(n - 1, (d + 1) * 24))
            return (
              <g key={d}>
                {d % 2 === 1 && <rect x={x0} y={m.t} width={x1 - x0} height={ih} className="day-band" />}
                <text x={(x0 + x1) / 2} y={H - 12} textAnchor="middle" className="axis-text">
                  {dayName(hw.start, d)}
                </text>
              </g>
            )
          })}
          <line x1={m.l} x2={W - m.r} y1={geo.y(30)} y2={geo.y(30)} className="ref-30" />
          <text x={W - m.r - 2} y={geo.y(30) - 5} textAnchor="end" className="axis-text ref-text">
            30°C
          </text>
          <path d={geo.line(hw.outdoor_c)} className="ln outdoor" />
          <path d={geo.line(hw.indoor_top_baseline_c)} className="ln old" />
          <path d={geo.line(hw.indoor_top_upgraded_c)} className="ln new" />
          {hover !== null && (
            <g>
              <line x1={hx} x2={hx} y1={m.t} y2={m.t + ih} className="cursor" />
              <circle cx={hx} cy={geo.y(hw.outdoor_c[hover])} r="4" className="dot outdoor" />
              <circle cx={hx} cy={geo.y(hw.indoor_top_baseline_c[hover])} r="4.500" className="dot old" />
              <circle cx={hx} cy={geo.y(hw.indoor_top_upgraded_c[hover])} r="4.500" className="dot new" />
              <g transform={`translate(${tipRight ? hx - 168 : hx + 12},${m.t + 4})`}>
                <rect width="156" height="82" rx="8" className="tip" />
                <text x="10" y="18" className="tip-title">
                  {hourLabel(hw.start, hover)}
                </text>
                <text x="10" y="38" className="tip-row">
                  <tspan className="k outdoor">Outside</tspan> {hw.outdoor_c[hover].toFixed(1)}°
                </text>
                <text x="10" y="56" className="tip-row">
                  <tspan className="k old">Old roof</tspan> {hw.indoor_top_baseline_c[hover].toFixed(1)}°
                </text>
                <text x="10" y="74" className="tip-row">
                  <tspan className="k new">Upgraded</tspan> {hw.indoor_top_upgraded_c[hover].toFixed(1)}°
                </text>
              </g>
            </g>
          )}
          <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      </div>
      <ul className="chart-legend">
        <li>
          <i className="sw-line outdoor" /> Outside
        </li>
        <li>
          <i className="sw-line old" /> Top-floor flat, old roof
        </li>
        <li>
          <i className="sw-line new" /> Top-floor flat, upgraded
        </li>
      </ul>
      <p className="muted small">Modelled estimate for a top-floor flat with the air conditioning off, so it shows what the roof and ceiling do on their own. {hw.label}.</p>
    </section>
  )
}

export function MonthlyChart({ r }: { r: AssessResponse }) {
  const rows = r.monthly
  const uid = useId().replace(/:/g, '')
  const [wrapRef, W] = useWidth()
  const H = W < 500 ? 260 : 280
  const m = { l: 44, r: 6, t: 14, b: 30 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const maxV = Math.max(...rows.map((x) => Math.max(x.baseline_bill, x.upgraded_bill + x.charge)), 10)
  const step = niceStep(maxV, 4)
  const top = Math.ceil(maxV / step) * step
  const y = (v: number) => m.t + ih - (v / top) * ih
  const gw = iw / rows.length
  const bw = Math.min(22, gw * 0.36)
  const ticks: number[] = []
  for (let v = 0; v <= top + 0.001; v += step) ticks.push(v)
  const avgOld = rows.reduce((a, x) => a + x.baseline_bill, 0) / rows.length
  const avgNew = rows.reduce((a, x) => a + x.upgraded_bill + x.charge, 0) / rows.length
  const yearOld = rows.reduce((a, x) => a + x.baseline_bill, 0)
  const yearNew = rows.reduce((a, x) => a + x.upgraded_bill + x.charge, 0)
  const alt = `Month by month bills for an average flat. Old bills average ${money(avgOld)} a month; new bills including the meter charge average ${money(avgNew)} a month.`

  return (
    <section className="card" aria-labelledby="month-h">
      <h3 id="month-h">Month by month</h3>
      <p className="lede">
        Over the year, the new bills plus the meter charge come to <strong>{money(yearOld - yearNew)} less</strong> than now for an average flat (estimated). In mild months the meter charge can make a bill a little higher, and in summer and winter it is much lower.
      </p>
      <div ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={alt}>
        <defs>
          <pattern id={`${uid}-stripe`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="stripe-bg" />
            <rect width="2.500" height="6" className="stripe-fg" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="axis-text">
              ${t}
            </text>
          </g>
        ))}
        {rows.map((x, i) => {
          const cx = m.l + gw * i + gw / 2
          const gap = 3
          const energyH = ih - (y(x.upgraded_bill) - m.t)
          const chargeH = ih - (y(x.charge) - m.t)
          return (
            <g key={x.month}>
              <title>{`${x.label}: bill now ${money(x.baseline_bill)}; after, ${money(x.upgraded_bill)} plus ${money(x.charge)} meter charge`}</title>
              <rect x={cx - bw - gap / 2} y={y(x.baseline_bill)} width={bw} height={ih - (y(x.baseline_bill) - m.t)} rx="3" className="bar-old" />
              <rect x={cx + gap / 2} y={y(x.upgraded_bill)} width={bw} height={energyH} className="bar-energy" />
              <rect x={cx + gap / 2} y={y(x.upgraded_bill) - chargeH} width={bw} height={chargeH} rx="3" fill={`url(#${uid}-stripe)`} className="bar-charge" />
              <text x={cx} y={H - 10} textAnchor="middle" className="axis-text">
                {x.label}
              </text>
            </g>
          )
        })}
      </svg>
      </div>
      <ul className="chart-legend">
        <li>
          <i className="sw old" /> Bill now
        </li>
        <li>
          <i className="sw energy" /> New energy bill
        </li>
        <li>
          <i className="sw charge" /> Monthly charge on the meter
        </li>
      </ul>
      <div className="sr-only">
      <table>
        <caption>Monthly bills for an average flat</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Bill now</th>
            <th>New energy bill</th>
            <th>Meter charge</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.month}>
              <td>{x.label}</td>
              <td>{money(x.baseline_bill)}</td>
              <td>{money(x.upgraded_bill)}</td>
              <td>{money(x.charge)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  )
}
