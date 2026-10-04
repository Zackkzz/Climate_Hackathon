// "What changes in the building": the block drawn now and with the upgrade, compared with a divider the reader drags,
// and the same changes listed item by item with the modelled energy for each.
import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { ChevronsLeftRight, Thermometer } from 'lucide-react'
import { num, num1 } from '@/format'
import type { AssessResponse, Existing, Package } from '@/types'
import { blockStates, changeRows, floorTemps, roofModel } from '@/upgrade'
import type { BlockState, ChangeRow, FloorTemps, Side } from '@/upgrade'
import { Panel } from './PageHeader'
import { Button } from './ui/button'
import { Batts, BlockDrawing, Cooktop, Flame, GasMeter, Heater, HotWaterUnit, OutdoorUnit, SplitHead, VIEW_W, badgeAnchor, breakAnchor, geometry, handleY } from './BlockDrawing'
import './block.css'

const STOPS: { label: string; pos: number }[] = [
  { label: 'Now', pos: 100 },
  { label: 'Compare', pos: 50 },
  { label: 'With the upgrade', pos: 0 },
]

const clamp = (v: number) => Math.min(100, Math.max(0, v))

const deg = (t: number) => `${num1(t)}°C`

/** The temperature badges in words, for screen readers. */
function tempsText(t: FloorTemps): string {
  const pair = (p: Record<Side, number>) => (num1(p.now) === num1(p.after) ? `${deg(p.now)} now and with the upgrade` : `${deg(p.now)} now, ${deg(p.after)} with the upgrade`)
  return ` Top-floor flats: ${pair(t.top)}.` + (t.lower ? ` Lower flats: ${pair(t.lower)}.` : '')
}

function valueText(pos: number): string {
  if (pos >= 99) return 'Showing the block now'
  if (pos <= 1) return 'Showing the block with the upgrade'
  return `Now on the left, with the upgrade on the right, divided ${Math.round(pos)}% of the way across`
}

function TempBadge({ x, y, h, t }: { x: number; y: number; h: number; t: number }) {
  return (
    <span
      className="pointer-events-none absolute inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 whitespace-nowrap rounded-sm border border-navy-900/25 bg-white/95 px-1 py-0.5 text-[11px] font-semibold leading-none text-foreground @lg:px-1.5 @lg:text-[13px]"
      style={{ left: `${(x / VIEW_W) * 100}%`, top: `${(y / h) * 100}%` }}
    >
      <Thermometer className="hidden size-3.5 text-[#c2410c] @md:block" aria-hidden="true" />
      {deg(t)}
    </span>
  )
}

interface LayerProps {
  side: Side
  states: Record<Side, BlockState>
  storeys: number
  result: AssessResponse | null
  clip?: number
  glide: boolean
}

function Layer({ side, states, storeys, result, clip, glide }: LayerProps) {
  const g = geometry(storeys)
  const temps = floorTemps(result)
  const t = { top: temps?.top[side] ?? null, lower: temps?.lower?.[side] ?? null }
  const model = roofModel(result)
  const s = states[side]
  const absorb = Math.round(model.absorb[s.roof] * 100)
  return (
    <div aria-hidden="true" className={'absolute inset-0 bg-card' + (glide ? ' bc-glide' : '')} style={clip === undefined ? undefined : { clipPath: `inset(0 0 0 ${clip}%)` }}>
      <BlockDrawing state={s} gasNow={states.now.gasConnected} storeys={storeys} model={model} temps={t} className="block h-full w-full" />
      {temps &&
        g.floors.map((f) => {
          const a = badgeAnchor(f)
          const v = f.top ? t.top : t.lower ?? t.top
          if (v == null) return null
          return (
            <span key={f.y}>
              <TempBadge x={a.left} y={a.y} h={g.h} t={v} />
              <TempBadge x={a.right} y={a.y} h={g.h} t={v} />
            </span>
          )
        })}
      <span
        className={'pointer-events-none absolute top-10 hidden max-w-[18%] text-balance text-xs font-medium leading-snug @xl:block ' + (side === 'now' ? 'left-[1.5%] text-left' : 'right-[1.5%] text-right')}
      >
        {s.roof === 'cool' ? 'Cool roof absorbs' : `${s.roof === 'dark' ? 'Dark' : 'Light'} roof absorbs`} about {absorb}% of the sun
      </span>
    </div>
  )
}

/** The drawing with its divider. Left of the divider is the block now, right of it the block with the upgrade. */
function Compare({ states, storeys, result, pos, setPos, glide, setGlide }: { states: Record<Side, BlockState>; storeys: number; result: AssessResponse | null; pos: number; setPos: (p: number) => void; glide: boolean; setGlide: (g: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const g = geometry(storeys)
  const brk = breakAnchor(g)

  const moveTo = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (r && r.width > 0) setPos(clamp(((clientX - r.left) / r.width) * 100))
  }
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    // The handle drags with any pointer. Elsewhere only a mouse moves the divider, so a finger can still scroll the page.
    const onHandle = (e.target as Element).closest('[role="slider"]') !== null
    if (e.button !== 0 || (!onHandle && e.pointerType !== 'mouse')) return
    e.preventDefault()
    setGlide(false)
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    if (onHandle) (e.target as HTMLElement).closest<HTMLElement>('[role="slider"]')?.focus()
    else moveTo(e.clientX)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e.clientX)
  }
  const onUp = () => {
    dragging.current = false
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 25 : 5
    const next: Record<string, number> = { ArrowLeft: pos - step, ArrowDown: pos - step, ArrowRight: pos + step, ArrowUp: pos + step, PageDown: pos - 25, PageUp: pos + 25, Home: 0, End: 100 }
    if (!(e.key in next)) return
    e.preventDefault()
    setGlide(true)
    setPos(clamp(next[e.key]))
  }

  return (
    <div
      ref={box}
      className="@container relative w-full cursor-ew-resize select-none overflow-hidden"
      style={{ aspectRatio: `${VIEW_W} / ${g.h}` }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <Layer side="now" states={states} storeys={storeys} result={result} glide={false} />
      <Layer side="after" states={states} storeys={storeys} result={result} clip={pos} glide={glide} />
      {brk && (
        <span aria-hidden="true" className="pointer-events-none absolute -translate-y-1/2 whitespace-nowrap bg-white px-1 text-[11px] text-muted-foreground @lg:text-xs" style={{ left: `${(brk.x / VIEW_W) * 100}%`, top: `${(brk.y / g.h) * 100}%` }}>
          {g.hidden} more {g.hidden === 1 ? 'floor' : 'floors'}
          <span className="hidden @md:inline"> like the ones below</span>
        </span>
      )}
      {/* On a narrow drawing the tags shrink and the second one shortens, so they stay clear of the sun's rays. */}
      <span aria-hidden="true" className={'pointer-events-none absolute left-1 top-1 rounded-sm border bg-white px-1 text-[11px] font-semibold transition-opacity @md:left-2 @md:top-2 @md:px-1.5 @md:py-0.5 @md:text-xs @lg:text-sm ' + (pos > 14 ? 'opacity-100' : 'opacity-0')}>Now</span>
      <span aria-hidden="true" className={'pointer-events-none absolute right-1 top-1 rounded-sm border border-teal-bar bg-teal-soft px-1 text-[11px] font-semibold text-teal transition-opacity @md:right-2 @md:top-2 @md:px-1.5 @md:py-0.5 @md:text-xs @lg:text-sm ' + (pos < 86 ? 'opacity-100' : 'opacity-0')}>
        <span className="@md:hidden">Upgraded</span>
        <span className="hidden @md:inline">With the upgrade</span>
      </span>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Compare the block now and with the upgrade"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={valueText(pos)}
        className={'group absolute inset-y-0 z-10 w-11 -translate-x-1/2 touch-none focus-visible:shadow-none focus-visible:outline-none' + (glide ? ' bc-glide' : '')}
        style={{ left: `${pos}%` }}
        onKeyDown={onKey}
      >
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-navy-900" />
        {/* At either end the knob moves in from the edge, so it and its focus ring stay whole. */}
        <div
          className={'absolute left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-navy-900 bg-white text-navy-900 group-focus-visible:ring-[3px] group-focus-visible:ring-ring group-focus-visible:ring-offset-2' + (glide ? ' bc-glide' : '')}
          style={{ top: `${(handleY(g) / g.h) * 100}%`, marginLeft: `calc(max(0px, 1.5rem - ${pos}cqw) + min(0px, 100cqw - 1.5rem - ${pos}cqw))` }}
        >
          <ChevronsLeftRight className="size-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

// ---------- the list of changes ----------

function Glyph({ children, box }: { children: ReactNode; box: string }) {
  return (
    <svg viewBox={box} className="size-9 shrink-0" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

const ROOF_FILL = { dark: '#3b4046', light: '#d3cbbd', cool: '#f8fafb' }

function RowGlyph({ row, s }: { row: ChangeRow; s: BlockState }) {
  switch (row.key) {
    case 'roof':
      return (
        <Glyph box="0 0 40 40">
          <path d="M3 30L14 12H26L37 30" fill="none" stroke={s.roof === 'cool' ? '#00828a' : '#0b2a4a'} strokeWidth={8} strokeLinejoin="round" />
          <path d="M3 30L14 12H26L37 30" fill="none" stroke={ROOF_FILL[s.roof]} strokeWidth={5} strokeLinejoin="round" />
        </Glyph>
      )
    case 'ceiling':
      return (
        <Glyph box="0 0 40 40">
          {s.insulated ? <g transform="translate(0 27)"><Batts x0={2} x1={38} /></g> : null}
          <path d="M2 27.5H38" stroke="#0b2a4a" strokeWidth={2} />
        </Glyph>
      )
    case 'hot_water':
      return (
        <Glyph box="-10 -58 38 60">
          <HotWaterUnit kind={s.hotWater} />
        </Glyph>
      )
    case 'heat_cool':
      return s.heating === 'reverse_cycle' ? (
        <Glyph box="-2 -20 52 52">
          <SplitHead />
          <g transform="translate(13 30)">
            <OutdoorUnit />
          </g>
        </Glyph>
      ) : (
        <Glyph box="-8 -34 42 36">
          <Heater kind={s.heating} />
          {s.heating === 'none' && <path d="M2 -1H26" stroke="#8a94a0" strokeWidth={1.5} strokeDasharray="3 3" />}
        </Glyph>
      )
    case 'cooktop':
      return (
        <Glyph box="-2 -26 46 28">
          <Cooktop kind={s.cooktop} />
        </Glyph>
      )
    case 'gas':
      return (
        <Glyph box="-8 -6 30 30">
          <GasMeter removed={!s.gasConnected} />
          {s.gasConnected && <Flame x={18} y={22} h={7} />}
        </Glyph>
      )
  }
}

function ChangeList({ rows, states }: { rows: ChangeRow[]; states: Record<Side, BlockState> }) {
  return (
    <div className="@container">
      <div className="hidden border-b pb-1.5 text-sm font-semibold text-muted-foreground @2xl:grid @2xl:grid-cols-[11rem_1fr_1fr] @2xl:gap-x-5" aria-hidden="true">
        <span />
        <span>Now</span>
        <span>With the upgrade</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.key} className="grid gap-x-5 gap-y-1 border-b py-3 last:border-b-0 @2xl:grid-cols-[11rem_1fr_1fr]">
            <div className="flex items-start gap-2.5">
              <RowGlyph row={row} s={row.changed ? states.after : states.now} />
              <div className="min-w-0">
                <h3 className="text-base font-semibold">{row.title}</h3>
                {row.note && <p className="text-sm text-muted-foreground">{row.note}</p>}
              </div>
            </div>
            <div className="text-sm">
              <p>
                <span className="font-semibold @2xl:sr-only">Now: </span>
                {row.now}
              </p>
              {row.energy?.now && <p className="mt-0.5 text-muted-foreground">{row.energy.now}</p>}
            </div>
            <div className={'text-sm ' + (row.changed ? 'border-l-2 border-teal-bar pl-2.5' : 'text-muted-foreground')}>
              <p>
                <span className="font-semibold @2xl:sr-only">With the upgrade: </span>
                {row.after}
              </p>
              {row.energy?.after && <p className="mt-0.5 font-medium text-teal">{row.energy.after}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Key() {
  const sw = 'inline-flex items-center gap-1.5'
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-label="Key to the drawing">
      <li className={sw}>
        <svg width="16" height="12" aria-hidden="true">
          <rect x="1" y="1" width="14" height="10" rx="2" fill="#e0f2f3" stroke="#00828a" strokeWidth="1.75" />
        </svg>
        Added by the upgrade
      </li>
      <li className={sw}>
        <svg width="12" height="14" viewBox="-6 -12 12 14" aria-hidden="true">
          <Flame x={0} y={1} h={12} />
        </svg>
        Burns gas
      </li>
      <li className={sw}>
        <svg width="14" height="16" aria-hidden="true">
          <path d="M7 1q3.2 3 0 6t0 6" fill="none" stroke="#c2410c" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Heat from the roof
      </li>
      <li className={sw}>
        <svg width="16" height="14" aria-hidden="true">
          <path d="M2 2L8 12L14 2" fill="none" stroke="#a8650a" strokeWidth="1.8" />
        </svg>
        Sun reflected off the roof
      </li>
    </ul>
  )
}

export interface BlockUpgradeProps {
  existing: Existing
  pkg: Package
  storeys: number
  flats: number
  /** The assessment for the same block and package; the drawing shows the equipment without it. */
  result: AssessResponse | null
  title?: string
  description?: ReactNode
  /** Shown between the drawing and the list, e.g. the headline figures. */
  figures?: ReactNode
}

export function BlockUpgrade({ existing, pkg, storeys, flats, result, title, description, figures }: BlockUpgradeProps) {
  const [pos, setPos] = useState(50)
  const [glide, setGlide] = useState(false)
  const states = blockStates(existing, pkg)
  const rows = changeRows(states, result)
  const g = geometry(storeys)
  const temps = floorTemps(result)
  const perFloor = flats / Math.max(1, storeys)
  return (
    <Panel
      title={title}
      description={description}
      actions={
        <div role="group" aria-label="Show the block" className="flex flex-wrap gap-1">
          {STOPS.map((s) => {
            const on = Math.round(pos) === s.pos
            return (
              <Button
                key={s.label}
                size="sm"
                variant={on ? 'default' : 'outline'}
                aria-pressed={on}
                onClick={() => {
                  setGlide(true)
                  setPos(s.pos)
                }}
              >
                {s.label}
              </Button>
            )
          })}
        </div>
      }
    >
      {/* On a wide panel the figures sit beside the drawing, so the drawing stays a readable size. */}
      <div className="@container">
        <div className={'grid gap-4' + (figures ? ' @4xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)] @4xl:items-start' : '')}>
          <figure className="mx-auto w-full max-w-[45rem] space-y-2">
            <Compare states={states} storeys={storeys} result={result} pos={pos} setPos={setPos} glide={glide} setGlide={setGlide} />
            <figcaption className="space-y-2">
              <Key />
              <p className="text-sm text-muted-foreground">
                The block with its front wall cut away. Drag the handle to compare. Every flat gets the same equipment; the drawing shows two flats a floor, and this block has {num(flats)} flats on {num(storeys)} {storeys === 1 ? 'floor' : 'floors'}
                {perFloor > 2.5 ? `, about ${num(perFloor)} a floor` : ''}.
                {result ? ' Numbers in the flats are the hottest it gets indoors over a year of local weather, with no air conditioning running.' : ''}
                {temps && <span className="sr-only">{tempsText(temps)}</span>}
                {g.hidden > 0 ? ` ${g.hidden} middle ${g.hidden === 1 ? 'floor is' : 'floors are'} left out of the drawing.` : ''}
              </p>
            </figcaption>
          </figure>
          {figures && <div className="min-w-0">{figures}</div>}
        </div>
      </div>
      <div className="mt-4">
        <ChangeList rows={rows} states={states} />
      </div>
    </Panel>
  )
}
