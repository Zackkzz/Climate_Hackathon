// A walk-up block of flats drawn with its front wall cut away: roof and ceiling in section, two flats a floor either side
// of the stair, hot water and air conditioning on the side balconies. Drawn once for each side of the comparison.
import { useId } from 'react'
import type { ReactNode } from 'react'
import { heatTint, roofHeat } from '@/upgrade'
import type { BlockState, RoofModel } from '@/upgrade'

export const VIEW_W = 640
const FH = 108 // one storey, floor slab included
const SLAB = 8
const ROOF_H = 78
const SKY = 56
const GROUND = 26
const BREAK_H = 30

// Left half; the right half is the mirror image about x = 320.
const X = { bal: 14, wall: 70, room: 84, party: 284, stair: 288, eave: 46, ridge: 216 }

const C = {
  ink: '#0b2a4a',
  inkSoft: '#48525c',
  added: '#00828a',
  addedFill: '#e0f2f3',
  old: '#dde2e8',
  slab: '#c4cbd3',
  rail: '#8a94a0',
  baluster: '#c4cbd3',
  brick: '#a75f48',
  mortar: '#dcc0b2',
  attic: '#f1e9dd',
  truss: '#cdb89f',
  roof: { dark: '#3b4046', light: '#d3cbbd', cool: '#f8fafb' },
  glass: '#e4eef9',
  bench: '#e8e2d8',
  benchTop: '#cfc6b8',
  pot: '#9aa5b1',
  sun: '#fbc547',
  ray: '#a8650a',
  heat: '#c2410c',
  gas: '#1d64d8',
  gasCore: '#b9d4ff',
  pipe: '#b0841c',
  batts: '#f3dc8f',
  ground: '#eef1f4',
}

export interface Floor {
  y: number
  top: boolean
}

export interface Geometry {
  h: number
  eave: number
  ridge: number
  ground: number
  floors: Floor[]
  /** Top of the band that stands for the floors not drawn (blocks taller than four storeys). */
  breakY: number | null
  hidden: number
}

/** Up to four storeys are drawn in full; taller blocks show the top floor, a break and the two lowest floors. */
export function geometry(storeys: number): Geometry {
  const s = Math.max(1, Math.round(storeys))
  const drawn = s <= 4 ? s : 3
  const eave = SKY + ROOF_H
  const floors: Floor[] = []
  let y = eave
  let breakY: number | null = null
  for (let i = 0; i < drawn; i++) {
    floors.push({ y, top: i === 0 })
    y += FH
    if (i === 0 && s > 4) {
      breakY = y
      y += BREAK_H
    }
  }
  return { h: y + GROUND, eave, ridge: SKY, ground: y, floors, breakY, hidden: s - drawn }
}

/** Where the temperature badge for a floor is centred, in drawing units: on the wall between the heater and the bench. */
export function badgeAnchor(f: Floor) {
  return { left: 167, right: VIEW_W - 167, y: f.y + 84 }
}

/** Where the "more floors" note sits, in drawing units: on the break band, just inside the left wall. */
export function breakAnchor(g: Geometry): { x: number; y: number } | null {
  return g.breakY === null ? null : { x: X.room + 8, y: g.breakY + BREAK_H / 2 }
}

/** Where the comparison handle sits, in drawing units: half way down, or on the floor below the break band, clear of its note. */
export function handleY(g: Geometry): number {
  const below = g.breakY === null ? undefined : g.floors.find((f) => f.y > (g.breakY ?? 0))
  return below ? below.y + FH / 2 : g.h / 2
}

const slopeY = (x: number, g: Geometry) => g.eave - ((x - X.eave) * ROOF_H) / (X.ridge - X.eave)

/** A wavy downward heat path. */
function squiggle(x: number, y0: number, y1: number): string {
  let d = `M${x} ${y0}`
  let y = y0
  let s = 1
  while (y + 8 <= y1) {
    d += ` q${3.2 * s} 4 0 8`
    y += 8
    s = -s
  }
  return d
}

// ---------- equipment, drawn standing on y = 0 ----------

export function Flame({ x, y, h = 8 }: { x: number; y: number; h?: number }) {
  const w = h * 0.62
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M0 0 C${-w} ${-h * 0.35} ${-w * 0.35} ${-h * 0.75} 0 ${-h} C${w * 0.35} ${-h * 0.75} ${w} ${-h * 0.35} 0 0 Z`} fill={C.gas} />
      <path d={`M0 -0.6 C${-w * 0.45} ${-h * 0.3} ${-w * 0.2} ${-h * 0.55} 0 ${-h * 0.68} C${w * 0.2} ${-h * 0.55} ${w * 0.45} ${-h * 0.3} 0 -0.6 Z`} fill={C.gasCore} />
    </g>
  )
}

export function HotWaterUnit({ kind }: { kind: string }) {
  if (kind === 'heat_pump') {
    return (
      <g>
        <rect x={0} y={-34} width={18} height={33} rx={5} fill="#fff" stroke={C.added} strokeWidth={1.75} />
        <rect x={-2} y={-48} width={22} height={14} rx={3} fill={C.addedFill} stroke={C.added} strokeWidth={1.75} />
        <circle cx={9} cy={-41} r={4.6} fill="#fff" stroke={C.added} strokeWidth={1.2} />
        <path d="M4.4 -41h9.2M9 -45.6v9.2" stroke={C.added} strokeWidth={1} />
        <path d="M3 -1v1M15 -1v1" stroke={C.ink} strokeWidth={1.5} />
      </g>
    )
  }
  if (kind === 'gas_instant') {
    return (
      <g>
        <rect x={2} y={-50} width={16} height={22} rx={2} fill={C.old} stroke={C.ink} strokeWidth={1.5} />
        <rect x={6} y={-42} width={8} height={9} rx={1} fill={C.roof.dark} />
        <Flame x={10} y={-34} h={6} />
        <path d="M6 -28v26M14 -28v26" stroke={C.inkSoft} strokeWidth={1.5} />
      </g>
    )
  }
  const gas = kind === 'gas_storage'
  return (
    <g>
      {gas && (
        <>
          <rect x={7} y={-54} width={4} height={10} fill={C.old} stroke={C.ink} strokeWidth={1.2} />
          <rect x={5} y={-56} width={8} height={3} rx={1} fill={C.old} stroke={C.ink} strokeWidth={1.2} />
        </>
      )}
      <rect x={0} y={-45} width={18} height={44} rx={5} fill={C.old} stroke={C.ink} strokeWidth={1.5} />
      {gas ? (
        <>
          <rect x={4.5} y={-14} width={9} height={9} rx={1.5} fill={C.roof.dark} />
          <Flame x={9} y={-5.5} h={7} />
        </>
      ) : (
        <path d="M10.5 -30l-5 9h4l-1.5 8 5.5-10h-4l1.5-7z" fill={C.ink} />
      )}
      <path d="M3 -1v1M15 -1v1" stroke={C.ink} strokeWidth={1.5} />
    </g>
  )
}

/** Outdoor half of a split system. */
export function OutdoorUnit() {
  return (
    <g>
      <rect x={0} y={-21} width={24} height={20} rx={2} fill="#fff" stroke={C.added} strokeWidth={1.75} />
      <circle cx={10} cy={-11} r={6.5} fill="none" stroke={C.added} strokeWidth={1.2} />
      <path d="M10 -17.5v13M3.5 -11h13" stroke={C.added} strokeWidth={0.9} />
      <path d="M19.5 -17v12" stroke={C.added} strokeWidth={1} strokeDasharray="1.5 1.5" />
      <path d="M3 -1v1M21 -1v1" stroke={C.ink} strokeWidth={1.5} />
    </g>
  )
}

/** Indoor half of a split system, high on the wall. Drawn hanging from y = 0. */
export function SplitHead() {
  return (
    <g>
      <rect x={0} y={0} width={46} height={12} rx={4} fill="#fff" stroke={C.added} strokeWidth={1.75} />
      <path d="M5 8.5h36" stroke={C.added} strokeWidth={1} />
    </g>
  )
}

export function Heater({ kind }: { kind: string }) {
  if (kind === 'gas_heater') {
    return (
      <g>
        <rect x={0} y={-28} width={26} height={27} rx={2} fill={C.old} stroke={C.ink} strokeWidth={1.5} />
        <rect x={6} y={-21} width={14} height={12} rx={1} fill={C.roof.dark} />
        <Flame x={13} y={-10.5} h={8} />
        <path d="M3 -1v1M23 -1v1" stroke={C.ink} strokeWidth={1.5} />
      </g>
    )
  }
  if (kind === 'electric_resistive') {
    return (
      <g>
        <rect x={0} y={-22} width={24} height={18} rx={3} fill={C.old} stroke={C.ink} strokeWidth={1.5} />
        <path d="M6 -19v12M10 -19v12M14 -19v12M18 -19v12" stroke={C.inkSoft} strokeWidth={1.2} />
        <circle cx={4} cy={-2} r={1.8} fill={C.ink} />
        <circle cx={20} cy={-2} r={1.8} fill={C.ink} />
      </g>
    )
  }
  return null
}

/** A pot on the hob. y = 0 is the benchtop. */
export function Cooktop({ kind }: { kind: string }) {
  const pot = (
    <g>
      <rect x={10} y={-16} width={22} height={12} rx={2} fill={C.pot} stroke={C.ink} strokeWidth={1.3} />
      <path d="M8 -14h2M32 -14h2" stroke={C.ink} strokeWidth={1.5} />
    </g>
  )
  if (kind === 'gas') {
    return (
      <g>
        <path d="M2 -2.5h38" stroke={C.ink} strokeWidth={2} />
        <Flame x={8} y={-3} h={8} />
        <Flame x={34} y={-3} h={8} />
        <Flame x={21} y={-3} h={5} />
        {pot}
      </g>
    )
  }
  if (kind === 'induction') {
    return (
      <g>
        <rect x={0} y={-4} width={42} height={4} rx={1} fill="#1f2328" stroke={C.added} strokeWidth={1.5} />
        <circle cx={38.5} cy={-2} r={0.9} fill={C.added} />
        {pot}
      </g>
    )
  }
  return (
    <g>
      <rect x={1} y={-4} width={40} height={4} rx={1} fill="#3b4046" />
      <path d="M13 -4.5h16" stroke="#d9480f" strokeWidth={1.6} />
      {pot}
    </g>
  )
}

export function GasMeter({ removed }: { removed?: boolean }) {
  if (removed) return <rect x={0} y={0} width={13} height={16} rx={2} fill="none" stroke={C.rail} strokeWidth={1.2} strokeDasharray="2.5 2" />
  return (
    <g>
      <rect x={0} y={0} width={13} height={16} rx={2} fill={C.old} stroke={C.ink} strokeWidth={1.4} />
      <circle cx={6.5} cy={6} r={3.4} fill="#fff" stroke={C.ink} strokeWidth={1} />
      <path d="M6.5 6l1.8-1.6" stroke={C.ink} strokeWidth={0.9} />
    </g>
  )
}

/** Insulation batts lying on the ceiling. y = 0 is the ceiling. */
export function Batts({ x0, x1 }: { x0: number; x1: number }) {
  const w = 30
  const n = Math.floor((x1 - x0 + 2) / (w + 2))
  const pad = (x1 - x0 - n * (w + 2) + 2) / 2
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x0 + pad + i * (w + 2)} y={-11} width={w} height={10.5} rx={4} fill={C.batts} stroke={C.added} strokeWidth={1.2} />
      ))}
    </g>
  )
}

// ---------- the block ----------

function Flat({ s, y }: { s: BlockState; y: number }) {
  const floor = y + FH - SLAB
  return (
    <g>
      {/* window on the back wall */}
      <rect x={150} y={y + 26} width={50} height={40} fill={C.glass} stroke={C.ink} strokeWidth={1.5} />
      <path d={`M175 ${y + 26}v40`} stroke={C.ink} strokeWidth={1.2} />
      <rect x={146} y={y + 66} width={58} height={3} fill={C.benchTop} stroke={C.ink} strokeWidth={1} />
      {s.cooling === 'old_ac' && (
        <g transform={`translate(160 ${y + 48})`}>
          <rect x={0} y={0} width={30} height={17} rx={1.5} fill={C.old} stroke={C.ink} strokeWidth={1.4} />
          <path d="M4 5h22M4 9h22M4 13h22" stroke={C.inkSoft} strokeWidth={1} />
        </g>
      )}
      {s.cooling === 'reverse_cycle' && (
        <g className="bc-in">
          <path d={`M${X.wall} ${y + 14}H92`} stroke={C.added} strokeWidth={1.5} />
          <g transform={`translate(92 ${y + 8})`}>
            <SplitHead />
          </g>
        </g>
      )}
      {s.heating !== 'reverse_cycle' && (
        <g transform={`translate(94 ${floor})`}>
          <Heater kind={s.heating} />
        </g>
      )}
      {/* kitchen bench and cooktop */}
      <rect x={214} y={floor - 30} width={64} height={30} fill={C.bench} stroke={C.ink} strokeWidth={1.3} />
      <path d={`M235 ${floor - 26}v24M256 ${floor - 26}v24`} stroke={C.inkSoft} strokeWidth={1} />
      <rect x={210} y={floor - 33} width={72} height={4} fill={C.benchTop} stroke={C.ink} strokeWidth={1.2} />
      <g transform={`translate(225 ${floor - 33})`} className={s.cooktop === 'induction' ? 'bc-in' : undefined}>
        <Cooktop kind={s.cooktop} />
      </g>
    </g>
  )
}

function Balcony({ s, y, gasNow }: { s: BlockState; y: number; gasNow: boolean }) {
  const floor = y + FH - SLAB
  const rc = s.cooling === 'reverse_cycle'
  return (
    <g>
      <rect x={X.bal} y={floor} width={X.wall - X.bal} height={6} fill={C.slab} stroke={C.ink} strokeWidth={1} />
      {Array.from({ length: 7 }, (_, i) => (
        <path key={i} d={`M${22 + i * 7} ${floor - 33}V${floor}`} stroke={C.baluster} strokeWidth={1} />
      ))}
      <path d={`M${X.bal} ${floor - 34}H${X.wall}`} stroke={C.rail} strokeWidth={2} />
      <rect x={X.bal} y={floor - 34} width={3} height={34} fill={C.rail} />
      {gasNow && (
        <g transform={`translate(46 ${floor - 62})`}>
          {s.gasConnected && <path d={`M13 8H${X.wall - 46}`} stroke={C.pipe} strokeWidth={2.2} />}
          {s.gasConnected && s.hotWater.startsWith('gas') && <path d="M3 16v6h-8" fill="none" stroke={C.pipe} strokeWidth={2.2} />}
          <GasMeter removed={!s.gasConnected} />
        </g>
      )}
      {rc && (
        <g className="bc-in">
          <path d={`M${X.wall} ${y + 14}H64V${floor - 21}`} fill="none" stroke={C.added} strokeWidth={1.5} />
          <g transform={`translate(43 ${floor})`}>
            <OutdoorUnit />
          </g>
        </g>
      )}
      <g transform={`translate(21 ${floor})`} className={s.hotWater === 'heat_pump' ? 'bc-in' : undefined}>
        <HotWaterUnit kind={s.hotWater} />
      </g>
    </g>
  )
}

/** One half of the building interior (a flat and its balcony) for every floor drawn. */
function Half({ s, g, gasNow, temps }: { s: BlockState; g: Geometry; gasNow: boolean; temps: (top: boolean) => number | null }) {
  return (
    <g>
      {g.floors.map((f) => (
        <g key={f.y}>
          <rect x={X.room} y={f.y} width={X.party - X.room} height={FH - SLAB} className="bc-tint" style={{ fill: heatTint(temps(f.top)) }} />
          <Flat s={s} y={f.y} />
          <Balcony s={s} y={f.y} gasNow={gasNow} />
        </g>
      ))}
    </g>
  )
}

export interface DrawingProps {
  state: BlockState
  /** Whether the block has gas now, so the meters are drawn on both sides of the comparison. */
  gasNow: boolean
  storeys: number
  model: RoofModel
  /** Hottest indoor temperature for top-floor and lower flats on this side, or null before the numbers are in. */
  temps: { top: number | null; lower: number | null }
  className?: string
}

export function BlockDrawing({ state: s, gasNow, storeys, model, temps, className }: DrawingProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const g = geometry(storeys)
  const heat = roofHeat(s, model)
  const roofColour = C.roof[s.roof]
  const t = (top: boolean) => (top ? temps.top : temps.lower ?? temps.top)

  // three rays of sun on each slope; the reflected share bounces back, the rest heats the roof
  const rayX = [164, 188, 212]
  const nReflect = Math.round(rayX.length * heat.reflected)
  const nAbsorb = rayX.length - nReflect
  const roomRatio = s.insulated || s.roof !== 'dark' ? heat.toRoom : 1
  const nRoom = Math.min(nAbsorb, Math.round(rayX.length * roomRatio))
  const roomOpacity = nRoom > 0 ? Math.max(0.4, Math.min(1, (rayX.length * roomRatio) / nRoom)) : 0
  const ang = Math.atan(ROOF_H / (X.ridge - X.eave)) * 2
  const reflect = [-Math.sin(ang), -Math.cos(ang)]

  const halfContent = (mirror: boolean): ReactNode => {
    const rays = rayX.map((x, i) => {
      const yHit = slopeY(x, g) - 7
      const reflected = i < nReflect
      const absorbedIdx = i - nReflect
      const toRoom = !reflected && absorbedIdx >= nAbsorb - nRoom
      return (
        <g key={x}>
          <path d={`M${x} 10V${yHit - 3}`} stroke={C.ray} strokeWidth={1.8} markerEnd={`url(#${uid}-ray)`} />
          {reflected && <path className="bc-in" d={`M${x} ${yHit}l${reflect[0] * 24} ${reflect[1] * 24}`} stroke={C.ray} strokeWidth={1.8} markerEnd={`url(#${uid}-ray)`} />}
          {!reflected && (
            <path
              d={squiggle(x, yHit + 15, toRoom ? g.eave + 22 : g.eave - (s.insulated ? 14 : 2))}
              fill="none"
              stroke={C.heat}
              strokeWidth={1.8}
              strokeLinecap="round"
              opacity={toRoom ? roomOpacity : 0.9}
              markerEnd={toRoom ? `url(#${uid}-heat)` : undefined}
            />
          )}
        </g>
      )
    })
    return (
      <g transform={mirror ? `translate(${VIEW_W} 0) scale(-1 1)` : undefined}>
        <Half s={s} g={g} gasNow={gasNow} temps={t} />
        {rays}
      </g>
    )
  }

  const roofLine = `M${X.eave - 6} ${g.eave + 3}L${X.ridge} ${g.ridge}H${VIEW_W - X.ridge}L${VIEW_W - X.eave + 6} ${g.eave + 3}`
  const wallH = g.ground - g.eave

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${g.h}`} className={className} aria-hidden="true" focusable="false">
      <defs>
        <pattern id={`${uid}-brick`} width={14} height={10} patternUnits="userSpaceOnUse">
          <rect width={14} height={10} fill={C.brick} />
          <path d="M0 0.5h14M0 5.5h14M3.5 0.5v5M10.5 5.5v5" stroke={C.mortar} strokeWidth={1} />
        </pattern>
        <pattern id={`${uid}-breeze`} width={16} height={16} patternUnits="userSpaceOnUse">
          <rect width={16} height={16} fill="#f3efe8" />
          <rect x={1} y={1} width={14} height={14} fill="none" stroke="#d5ccbf" strokeWidth={1} />
          <circle cx={8} cy={8} r={4.2} fill="#fff" stroke="#d5ccbf" strokeWidth={1} />
        </pattern>
        <marker id={`${uid}-ray`} viewBox="0 0 10 10" refX={6} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={C.ray} />
        </marker>
        <marker id={`${uid}-heat`} viewBox="0 0 10 10" refX={6} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={C.heat} />
        </marker>
      </defs>

      {/* sun */}
      <g transform={`translate(${VIEW_W / 2} 27)`}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4
          return <path key={i} d={`M${Math.cos(a) * 19} ${Math.sin(a) * 19}L${Math.cos(a) * 24} ${Math.sin(a) * 24}`} stroke={C.ray} strokeWidth={1.8} strokeLinecap="round" />
        })}
        <circle r={14} fill={C.sun} stroke={C.ray} strokeWidth={1.5} />
      </g>

      {/* roof space in section */}
      <path d={`M${X.eave} ${g.eave}L${X.ridge} ${g.ridge}H${VIEW_W - X.ridge}L${VIEW_W - X.eave} ${g.eave}Z`} fill={C.attic} />
      {[150, 235, 320, 405, 490].map((x) => (
        <path key={x} d={`M${x} ${g.eave}V${Math.max(g.ridge, x < 320 ? slopeY(x, g) : slopeY(VIEW_W - x, g)) + 6}`} stroke={C.truss} strokeWidth={2} />
      ))}
      <path d={`M${X.wall} ${g.eave}H${VIEW_W - X.wall}`} stroke={C.ink} strokeWidth={2} />
      {s.insulated && (
        <g className="bc-in" transform={`translate(0 ${g.eave})`}>
          <Batts x0={X.room} x1={VIEW_W - X.room} />
        </g>
      )}

      {/* walls, floors and the stair */}
      <rect x={X.wall} y={g.eave} width={X.room - X.wall} height={wallH} fill={`url(#${uid}-brick)`} stroke={C.ink} strokeWidth={1.5} />
      <rect x={VIEW_W - X.room} y={g.eave} width={X.room - X.wall} height={wallH} fill={`url(#${uid}-brick)`} stroke={C.ink} strokeWidth={1.5} />
      {g.floors.map((f, i) => (
        <g key={f.y}>
          <rect x={X.stair} y={f.y} width={VIEW_W - 2 * X.stair} height={FH - SLAB} fill={`url(#${uid}-breeze)`} />
          <path
            d={stairPath(f.y, i % 2 === 1)}
            fill={C.slab}
            stroke={C.ink}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <rect x={X.party} y={f.y} width={X.stair - X.party} height={FH - SLAB} fill={C.slab} />
          <rect x={VIEW_W - X.stair} y={f.y} width={X.stair - X.party} height={FH - SLAB} fill={C.slab} />
          <rect x={X.room} y={f.y + FH - SLAB} width={VIEW_W - 2 * X.room} height={SLAB} fill={C.slab} stroke={C.ink} strokeWidth={1.2} />
        </g>
      ))}
      {g.breakY !== null && <BreakBand y={g.breakY} />}

      {halfContent(false)}
      {halfContent(true)}

      {/* roof covering on top of everything it shades */}
      <path d={roofLine} fill="none" style={{ stroke: s.roof === 'cool' ? C.added : C.ink }} strokeWidth={12} strokeLinejoin="round" className="bc-roof" />
      <path d={roofLine} fill="none" style={{ stroke: roofColour }} strokeWidth={8} strokeLinejoin="round" className="bc-roof" />

      {/* ground */}
      <rect x={0} y={g.ground} width={VIEW_W} height={GROUND} fill={C.ground} />
      <path d={`M0 ${g.ground}H${VIEW_W}`} stroke={C.ink} strokeWidth={2} />
    </svg>
  )
}

/** A flight of stairs filling one storey of the stairwell. */
function stairPath(y: number, flip: boolean): string {
  const steps = 8
  const x0 = X.stair + 4
  const x1 = VIEW_W - X.stair - 4
  const floor = y + FH - SLAB
  const run = (x1 - x0) / steps
  const rise = (FH - SLAB - 6) / steps
  const pts: string[] = []
  for (let i = 0; i < steps; i++) {
    const xa = flip ? x1 - i * run : x0 + i * run
    const xb = flip ? x1 - (i + 1) * run : x0 + (i + 1) * run
    const yy = floor - (i + 1) * rise
    pts.push(`${xa} ${yy}`, `${xb} ${yy}`)
  }
  const start = flip ? x1 : x0
  return `M${start} ${floor}L${pts.join('L')}L${flip ? x0 : x1} ${floor - (steps - 1) * rise + 6}L${start + (flip ? -10 : 10)} ${floor}Z`
}

/** The break line that stands for floors not drawn. */
function BreakBand({ y }: { y: number }) {
  const mid = y + BREAK_H / 2
  const zig = `M${X.room} ${mid}H300l6 -8l8 16l6 -8H${VIEW_W - X.room}`
  return (
    <g>
      <rect x={X.room} y={y} width={VIEW_W - 2 * X.room} height={BREAK_H} fill="#fff" />
      <path d={zig} fill="none" stroke={C.ink} strokeWidth={1.2} />
    </g>
  )
}
