// Shared by the Areas page's Google map and its OpenStreetMap fallback (AreasOsmMap in finder/OsmMap.tsx).
import type { BuildingPoint } from '@/console/types-gov'
import type { Stage } from '@/console/types'
import { heatWord } from '@/format'
import { HEAT_COLORS, HEAT_ORDER } from '@/heat'
import type { HeatBand } from '@/types'
import { STAGE_LABEL } from '@/portal/components/Status'

const LIVE = ['commissioned', 'active', 'closed']
// Project rings in NSW brand colours: dark for built or active, blue for the pipeline.
export const RING = { live: '#002664', pipeline: '#146cfd' }

export type Ring = 'none' | 'live' | 'pipeline'
export const ringOf = (p: BuildingPoint): Ring => (p.project_stage ? (LIVE.includes(p.project_stage) ? 'live' : 'pipeline') : 'none')
export const titleOf = (p: BuildingPoint) =>
  `${p.building_id}: ${heatWord(p.heat_band)}, about ${p.flats_est} flats${p.project_stage ? `, project at ${STAGE_LABEL[p.project_stage as Stage] ?? p.project_stage}` : ', no project'}`

/** How a building's dot is drawn on either map: hotter bands are bigger and drawn on top, a ring marks a project. */
export function dotStyle(band: string, ring: Ring) {
  const i = Math.max(0, HEAT_ORDER.indexOf(band as HeatBand))
  return {
    radius: 4 + i,
    fill: HEAT_COLORS[band as HeatBand] ?? '#cdd3d6',
    stroke: ring === 'none' ? '#495054' : RING[ring],
    strokeWidth: ring === 'none' ? 1 : 3,
    z: i + (ring === 'none' ? 0 : 10),
  }
}
