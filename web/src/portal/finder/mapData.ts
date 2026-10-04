// Shared by the Google map (MapView) and the OpenStreetMap fallback (OsmMap): props, building geometry helpers, the pin.
import type { BuildingCollection, BuildingFeature } from '../../types'

export interface MapProps {
  data: BuildingCollection
  selectedId: string | null
  hoverId: string | null
  onSelect: (id: string | null) => void
  onHover: (id: string | null) => void
  pickMode: boolean
  pin: { lat: number; lon: number } | null
  onPick: (lat: number, lon: number) => void
  bottomPad: number
  /** Pilot area [west, south, east, north] from /api/meta; the first view fits this. */
  bbox?: [number, number, number, number]
}

export const PIN_SVG =
  '<svg width="30" height="38" viewBox="0 0 30 38" aria-hidden="true"><path d="M15 36S3 24.500 3 14.500a12 12 0 0 1 24 0C27 24.500 15 36 15 36z" fill="#002664" stroke="#fff" stroke-width="2.500"/><circle cx="15" cy="14.500" r="4.500" fill="#fff"/></svg>'
// Zoom at or above which a selected block counts as easy to see.
export const CLOSE_ZOOM = 17

export function centroid(f: BuildingFeature): [number, number] {
  const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]
  let x = 0
  let y = 0
  for (const [lx, ly] of ring) {
    x += lx
    y += ly
  }
  return [x / ring.length, y / ring.length]
}

export function polygons(data: BuildingCollection) {
  return { type: 'FeatureCollection' as const, features: data.features }
}

export function points(data: BuildingCollection) {
  return {
    type: 'FeatureCollection' as const,
    features: data.features.map((f) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: centroid(f) },
      properties: { id: f.properties.id, heat_band: f.properties.heat_band, label: f.properties.label },
    })),
  }
}
