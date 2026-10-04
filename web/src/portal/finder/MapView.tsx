import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import { HEAT_COLORS, HEAT_ORDER } from '../../heat'
import { heatWord } from '../../format'
import type { BuildingCollection, BuildingFeature } from '../../types'

// OpenStreetMap raster tiles: the host the server's Content Security Policy allows for images.
const BASEMAP: maplibregl.StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.6, 'raster-opacity': 0.9 } }],
}
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e9ecef' } }],
}

interface Props {
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
  onBasemapFailed: () => void
}

function centroid(f: BuildingFeature): [number, number] {
  const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]
  let x = 0
  let y = 0
  for (const [lx, ly] of ring) {
    x += lx
    y += ly
  }
  return [x / ring.length, y / ring.length]
}

function polygons(data: BuildingCollection) {
  return { type: 'FeatureCollection' as const, features: data.features }
}

function points(data: BuildingCollection) {
  return {
    type: 'FeatureCollection' as const,
    features: data.features.map((f) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: centroid(f) },
      properties: { id: f.properties.id, heat_band: f.properties.heat_band },
    })),
  }
}

export default function MapView(props: Props) {
  const { data, selectedId, hoverId, pickMode, pin, bottomPad } = props
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const loaded = useRef(false)
  const cb = useRef(props)
  cb.current = props
  const prevSel = useRef<string | null>(null)
  const prevHover = useRef<string | null>(null)
  const popup = useRef<maplibregl.Popup | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const fallbackUsed = useRef(false)

  // create the map once
  useEffect(() => {
    if (!box.current) return
    const map = new maplibregl.Map({
      container: box.current,
      style: BASEMAP,
      attributionControl: false,
      center: [151.075, -33.92],
      zoom: 15,
      maxZoom: 19,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: false,
    })
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    const addLayers = () => {
      if (map.getSource('buildings')) return
      const colorExpr: maplibregl.ExpressionSpecification = [
        'match',
        ['get', 'heat_band'],
        ...HEAT_ORDER.flatMap((b) => [b, HEAT_COLORS[b]]),
        '#cccccc',
      ] as unknown as maplibregl.ExpressionSpecification
      map.addSource('buildings', { type: 'geojson', data: polygons(cb.current.data), promoteId: 'id' })
      map.addSource('building-pts', { type: 'geojson', data: points(cb.current.data) })
      map.addLayer({
        id: 'b-fill',
        type: 'fill',
        source: 'buildings',
        paint: {
          'fill-color': colorExpr,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14.8, 0, 15.8, 0.95],
        },
      })
      map.addLayer({
        id: 'b-line',
        type: 'line',
        source: 'buildings',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#0b3a5c', ['boolean', ['feature-state', 'hover'], false], '#1b1f23', '#50575e'],
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3.5, ['boolean', ['feature-state', 'hover'], false], 2.5, 0.8],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 14.8, 0, 15.8, 1],
        },
      })
      map.addLayer({
        id: 'b-dot',
        type: 'circle',
        source: 'building-pts',
        paint: {
          'circle-color': colorExpr,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 14, 6, 16, 9],
          'circle-stroke-color': '#50575e',
          'circle-stroke-width': 0.8,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 15.5, 0.95, 16.5, 0],
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 15.5, 1, 16.5, 0],
        },
      })
      loaded.current = true
      applyFeatureState()
    }

    const featureId = (e: MapLayerMouseEvent): string | null => {
      const f = e.features?.[0]
      const id = f?.properties?.id
      return typeof id === 'string' ? id : null
    }

    map.on('style.load', addLayers)
    map.on('error', () => {
      // If the basemap cannot be fetched, carry on with a plain background so the buildings still show.
      if (!fallbackUsed.current && !map.getSource('buildings')) {
        fallbackUsed.current = true
        cb.current.onBasemapFailed()
        map.setStyle(FALLBACK_STYLE)
      }
    })

    for (const layer of ['b-fill', 'b-dot']) {
      map.on('mousemove', layer, (e) => {
        map.getCanvas().style.cursor = cb.current.pickMode ? 'crosshair' : 'pointer'
        cb.current.onHover(featureId(e))
      })
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = cb.current.pickMode ? 'crosshair' : ''
        cb.current.onHover(null)
      })
      map.on('click', layer, (e) => {
        if (cb.current.pickMode) return
        const id = featureId(e)
        if (id) {
          e.originalEvent.stopPropagation()
          cb.current.onSelect(id)
        }
      })
    }
    map.on('click', (e) => {
      if (cb.current.pickMode) {
        cb.current.onPick(e.lngLat.lat, e.lngLat.lng)
        return
      }
      const hits = map.queryRenderedFeatures(e.point, { layers: ['b-fill', 'b-dot'].filter((l) => map.getLayer(l)) })
      if (hits.length === 0) cb.current.onSelect(null)
    })

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(box.current)

    popup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'hover-pop' })

    return () => {
      ro.disconnect()
      popup.current?.remove()
      marker.current?.remove()
      map.remove()
      mapRef.current = null
      loaded.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyFeatureState = () => {
    const map = mapRef.current
    if (!map || !loaded.current || !map.getSource('buildings')) return
    const set = (id: string | null, key: 'selected' | 'hover', v: boolean) => {
      if (id) map.setFeatureState({ source: 'buildings', id }, { [key]: v })
    }
    if (prevSel.current !== cb.current.selectedId) set(prevSel.current, 'selected', false)
    set(cb.current.selectedId, 'selected', true)
    prevSel.current = cb.current.selectedId
    if (prevHover.current !== cb.current.hoverId) set(prevHover.current, 'hover', false)
    set(cb.current.hoverId, 'hover', true)
    prevHover.current = cb.current.hoverId
  }

  // keep source data in sync, fit the view the first time
  const fitted = useRef(false)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const run = () => {
      const src = map.getSource('buildings') as GeoJSONSource | undefined
      if (src) src.setData(polygons(data))
      const pts = map.getSource('building-pts') as GeoJSONSource | undefined
      if (pts) pts.setData(points(data))
      if (!fitted.current && data.features.length > 0) {
        fitted.current = true
        const b = new maplibregl.LngLatBounds()
        const bb = cb.current.bbox
        if (bb && bb.length === 4 && bb.every(Number.isFinite)) {
          b.extend([bb[0], bb[1]])
          b.extend([bb[2], bb[3]])
        } else for (const f of data.features) {
          const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0])
          for (const ring of rings) for (const [x, y] of ring) b.extend([x, y])
        }
        map.fitBounds(b, { padding: { top: 70, left: 40, right: 60, bottom: bottomPad + 50 }, maxZoom: 16.5, duration: 0 })
      }
    }
    if (map.isStyleLoaded() && map.getSource('buildings')) run()
    else map.once('style.load', run)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // selection and hover styling, popup, and easing to the selected block
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    applyFeatureState()
    const feat = (id: string | null) => data.features.find((f) => f.properties.id === id)
    // hover label
    const h = feat(hoverId)
    if (h && popup.current && !pickMode) {
      popup.current.setLngLat(centroid(h)).setText(`${h.properties.label} · ${heatWord(h.properties.heat_band)}`).addTo(map)
    } else popup.current?.remove()
    // ease to the selected block
    const s = feat(selectedId)
    if (s && selectedId !== lastEased.current) {
      lastEased.current = selectedId
      const c = centroid(s)
      const inView = bottomPad === 0 && map.getBounds().contains(c as [number, number]) && map.getZoom() >= 15.5
      if (!inView) map.easeTo({ center: c, zoom: Math.max(map.getZoom(), 16.3), duration: 700, padding: { bottom: bottomPad, top: 0, left: 0, right: 0 } })
    }
    if (!s) lastEased.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, hoverId, data, pickMode])

  const lastEased = useRef<string | null>(null)

  // location pin for hand-entered blocks
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (pin) {
      if (!marker.current) {
        const el = document.createElement('div')
        el.className = 'map-pin'
        el.innerHTML = '<svg width="30" height="38" viewBox="0 0 30 38" aria-hidden="true"><path d="M15 36S3 24.500 3 14.500a12 12 0 0 1 24 0C27 24.500 15 36 15 36z" fill="#0b4f7c" stroke="#fff" stroke-width="2.500"/><circle cx="15" cy="14.500" r="4.500" fill="#fff"/></svg>'
        marker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      }
      marker.current.setLngLat([pin.lon, pin.lat]).addTo(map)
    } else marker.current?.remove()
  }, [pin])

  useEffect(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = pickMode ? 'crosshair' : ''
  }, [pickMode])

  return (
    <div className={'map-wrap' + (pickMode ? ' picking' : '')}>
      <div ref={box} className="map-canvas" role="application" aria-label="Map of apartment buildings coloured by how hot the ground gets in summer" />
      {pickMode && <div className="map-banner">Tap the map to place your block</div>}
      <div className="map-attrib">
        Map tiles ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>{' '}
        · drawn with{' '}
        <a href="https://maplibre.org" target="_blank" rel="noreferrer">
          MapLibre
        </a>
      </div>
    </div>
  )
}
