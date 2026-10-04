// OpenStreetMap fallbacks, drawn with MapLibre GL: the block finder map (default export) and the Areas page map
// (AreasOsmMap). MapView and Areas load this file only when Google Maps is not available (no key, script blocked, key
// refused, or too slow), so MapLibre stays out of the normal bundle and is one chunk for both.
import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { HEAT_COLORS, HEAT_ORDER } from '../../heat'
import { heatWord } from '../../format'
import { CLOSE_ZOOM, PIN_SVG, centroid, points, polygons, type MapProps } from './mapData'
import type { BuildingPoint } from '@/console/types-gov'
import { dotStyle, ringOf, titleOf } from '@/portal/government/areasMapData'

// OpenStreetMap standard raster tiles: the host the server's Content Security Policy allows for images and fetches.
const BASEMAP: StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.6, 'raster-opacity': 0.9 } }],
}
// Plain background if the tiles cannot be fetched, so the buildings still show.
const PLAIN_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e9ecef' } }],
}

/**
 * Watch for the OpenStreetMap tiles failing. Before the map's own layers exist (dataSource not yet added), carry on with a
 * plain background; after, the layers stay and only the status line changes. Either way onFailed is called.
 */
function watchBasemap(map: maplibregl.Map, dataSource: string, onFailed: () => void) {
  map.on('error', (e) => {
    if (!map.getSource(dataSource)) {
      if (!map.getSource('osm')) return
      onFailed()
      map.setStyle(PLAIN_STYLE)
    } else if ((e as { sourceId?: string }).sourceId === 'osm') onFailed()
  })
}

/** Status line and tile credit along the bottom edge of either fallback map. */
function OsmFoot({ tilesFailed }: { tilesFailed: boolean }) {
  return (
    <div className="map-foot">
      <span role="status">{tilesFailed ? 'The map background could not load. The buildings are still shown.' : 'Showing the OpenStreetMap map.'}</span>
      <span>
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>
      </span>
    </div>
  )
}

export default function OsmMap(props: MapProps) {
  const { data, selectedId, hoverId, pickMode, pin, bottomPad } = props
  const box = useRef<HTMLDivElement>(null)
  const cb = useRef(props)
  cb.current = props
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [tilesFailed, setTilesFailed] = useState(false)
  const prevSel = useRef<string | null>(null)
  const prevHover = useRef<string | null>(null)
  const popup = useRef<maplibregl.Popup | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const fitted = useRef(false)
  const lastEased = useRef<string | null>(null)

  const applyFeatureState = () => {
    const map = mapRef.current
    if (!map || !map.getSource('buildings')) return
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
    })
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    const addLayers = () => {
      if (map.getSource('buildings')) return
      const colorExpr = ['match', ['get', 'heat_band'], ...HEAT_ORDER.flatMap((b) => [b, HEAT_COLORS[b]]), '#cccccc'] as unknown as maplibregl.ExpressionSpecification
      const on = ['boolean', ['feature-state', 'selected'], false] as maplibregl.ExpressionSpecification
      const hot = ['boolean', ['feature-state', 'hover'], false] as maplibregl.ExpressionSpecification
      map.addSource('buildings', { type: 'geojson', data: polygons(cb.current.data), promoteId: 'id' })
      map.addSource('building-pts', { type: 'geojson', data: points(cb.current.data), promoteId: 'id' })
      // Footprints fade in from zoom 16; the dots that stand in for them at lower zooms fade out by 17.5 (as on Google).
      map.addLayer({ id: 'b-fill', type: 'fill', source: 'buildings', paint: { 'fill-color': colorExpr, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14.8, 0, 15.8, 0.95] } })
      map.addLayer({
        id: 'b-line',
        type: 'line',
        source: 'buildings',
        paint: {
          'line-color': ['case', on, '#0b3a5c', hot, '#1b1f23', '#50575e'],
          'line-width': ['case', on, 3.5, hot, 2.5, 0.8],
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
      applyFeatureState()
      setReady(true)
    }
    map.on('style.load', addLayers)
    watchBasemap(map, 'buildings', () => setTilesFailed(true))

    const featureId = (e: MapLayerMouseEvent): string | null => {
      const id = e.features?.[0]?.properties?.id
      return typeof id === 'string' ? id : null
    }
    for (const layer of ['b-fill', 'b-dot']) {
      map.on('mousemove', layer, (e) => {
        map.getCanvas().style.cursor = cb.current.pickMode ? 'crosshair' : 'pointer'
        cb.current.onHover(featureId(e))
      })
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = cb.current.pickMode ? 'crosshair' : ''
        cb.current.onHover(null)
      })
    }
    map.on('click', (e) => {
      if (cb.current.pickMode) {
        cb.current.onPick(e.lngLat.lat, e.lngLat.lng)
        return
      }
      const layers = ['b-fill', 'b-dot'].filter((l) => map.getLayer(l))
      const hit = map.queryRenderedFeatures(e.point, { layers })[0]
      const id = hit?.properties?.id
      cb.current.onSelect(typeof id === 'string' ? id : null)
    })
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(box.current)
    popup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'hover-pop' })
    return () => {
      ro.disconnect()
      popup.current?.remove()
      marker.current?.remove()
      marker.current = null
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keep the buildings in sync, fit the view the first time
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource('buildings') as GeoJSONSource | undefined)?.setData(polygons(data))
    ;(map.getSource('building-pts') as GeoJSONSource | undefined)?.setData(points(data))
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
      map.fitBounds(b, { padding: { top: 70, left: 40, right: 60, bottom: bottomPad + 50 }, maxZoom: CLOSE_ZOOM, duration: 0 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ready])

  // selection and hover styling, hover label, crosshair, and bringing the selected block into view
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    applyFeatureState()
    map.getCanvas().style.cursor = pickMode ? 'crosshair' : ''
    const feat = (id: string | null) => (id ? data.features.find((f) => f.properties.id === id) : undefined)
    const h = feat(hoverId)
    if (h && popup.current && !pickMode) {
      popup.current.setLngLat(centroid(h)).setText(`${h.properties.label} · ${heatWord(h.properties.heat_band)}`).addTo(map)
    } else popup.current?.remove()
    const s = feat(selectedId)
    if (s && selectedId !== lastEased.current) {
      lastEased.current = selectedId
      const c = centroid(s)
      const inView = bottomPad === 0 && map.getBounds().contains(c) && map.getZoom() >= CLOSE_ZOOM
      if (!inView) map.easeTo({ center: c, zoom: Math.max(map.getZoom(), CLOSE_ZOOM), duration: 700, padding: { bottom: bottomPad, top: 0, left: 0, right: 0 } })
    }
    if (!s) lastEased.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, hoverId, data, pickMode, ready])

  // location pin for hand-entered blocks
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (pin) {
      if (!marker.current) {
        const el = document.createElement('div')
        el.className = 'map-pin-ml'
        el.innerHTML = PIN_SVG
        marker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      }
      marker.current.setLngLat([pin.lon, pin.lat]).addTo(map)
    } else marker.current?.remove()
  }, [pin])

  return (
    <div className={'map-wrap' + (pickMode ? ' picking' : '')}>
      <div className="map-canvas" role="application" aria-label="Map of apartment buildings coloured by how hot the ground gets in summer">
        <div ref={box} className="map-host" />
      </div>
      {pickMode && <div className="map-banner">Tap the map to place your block</div>}
      <OsmFoot tilesFailed={tilesFailed} />
    </div>
  )
}

/** The Areas page map on OpenStreetMap: the same dots, colours, sizes and rings as the Google version, the building's
 * details as a tooltip on hover and in a popup on click. */
export function AreasOsmMap({ pts }: { pts: BuildingPoint[] }) {
  const box = useRef<HTMLDivElement>(null)
  const [tilesFailed, setTilesFailed] = useState(false)
  useEffect(() => {
    if (!box.current) return
    const map = new maplibregl.Map({
      container: box.current,
      style: BASEMAP,
      attributionControl: false,
      center: [151.075, -33.92],
      zoom: 12,
      maxZoom: 19,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: true,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    if (pts.length > 0) {
      const b = new maplibregl.LngLatBounds()
      for (const p of pts) b.extend([p.lon, p.lat])
      map.fitBounds(b, { padding: { top: 32, left: 32, right: 48, bottom: 56 }, maxZoom: 17, duration: 0 })
    }
    const data = {
      type: 'FeatureCollection' as const,
      features: pts.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
        properties: { title: titleOf(p), ...dotStyle(p.heat_band, ringOf(p)) },
      })),
    }
    map.on('style.load', () => {
      if (map.getSource('areas')) return
      map.addSource('areas', { type: 'geojson', data })
      map.addLayer({
        id: 'a-dot',
        type: 'circle',
        source: 'areas',
        layout: { 'circle-sort-key': ['get', 'z'] },
        paint: {
          'circle-color': ['get', 'fill'],
          'circle-opacity': 0.95,
          'circle-radius': ['get', 'radius'],
          'circle-stroke-color': ['get', 'stroke'],
          'circle-stroke-width': ['get', 'strokeWidth'],
        },
      })
    })
    watchBasemap(map, 'areas', () => setTilesFailed(true))
    const titleAt = (e: MapLayerMouseEvent): string | null => {
      const t = e.features?.[0]?.properties?.title
      return typeof t === 'string' ? t : null
    }
    // Google shows the building's details as a tooltip on hover and in an info window on click; this does the same.
    map.on('mousemove', 'a-dot', (e) => {
      map.getCanvas().style.cursor = 'pointer'
      map.getCanvas().title = titleAt(e) ?? ''
    })
    map.on('mouseleave', 'a-dot', () => {
      map.getCanvas().style.cursor = ''
      map.getCanvas().removeAttribute('title')
    })
    const info = new maplibregl.Popup({ offset: 10, maxWidth: '18rem' })
    map.on('click', 'a-dot', (e) => {
      const t = titleAt(e)
      if (t) info.setLngLat(e.lngLat).setText(t).addTo(map)
    })
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(box.current)
    return () => {
      ro.disconnect()
      info.remove()
      map.remove()
    }
  }, [pts])
  return (
    <>
      {/* MapLibre makes its container position: relative, so it gets a host inside the absolutely placed canvas box. */}
      <div className="mw-areas-map__canvas">
        <div ref={box} className="mw-areas-map__host" />
      </div>
      <OsmFoot tilesFailed={tilesFailed} />
    </>
  )
}
