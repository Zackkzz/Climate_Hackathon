import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { MAP_STYLE, startGoogleMaps, useGoogleFirst } from '@/portal/lib/maps'
import { HEAT_COLORS } from '../../heat'
import { heatWord } from '../../format'
import type { HeatBand } from '../../types'
import { CLOSE_ZOOM, PIN_SVG, centroid, points, polygons, type MapProps } from './mapData'

// MapLibre and the OpenStreetMap map load only when Google Maps fails, so the normal bundle stays small.
const OsmMap = lazy(() => import('./OsmMap'))

/** Linear ramp between two zoom levels, held at the end values outside them. */
function ramp(zoom: number, z0: number, z1: number, from: number, to: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, (zoom - z0) / (z1 - z0)))
}

function replaceFeatures(layer: google.maps.Data, geojson: object) {
  const old: google.maps.Data.Feature[] = []
  layer.forEach((f) => old.push(f))
  for (const f of old) layer.remove(f)
  layer.addGeoJson(geojson, { idPropertyName: 'id' })
}

type Overlay = google.maps.OverlayView & { place: (map: google.maps.Map, at: google.maps.LatLngLiteral) => void }

/** A plain HTML element fixed to a point on the map: the hover label and the location pin. */
function htmlOverlay(OverlayView: typeof google.maps.OverlayView, el: HTMLElement): Overlay {
  class HtmlOverlay extends OverlayView {
    at: google.maps.LatLngLiteral | null = null
    place(map: google.maps.Map, at: google.maps.LatLngLiteral) {
      this.at = at
      if (this.getMap() === map) this.draw()
      else this.setMap(map)
    }
    onAdd() {
      this.getPanes()?.floatPane.appendChild(el)
    }
    draw() {
      const p = this.at ? this.getProjection()?.fromLatLngToDivPixel(this.at) : null
      if (p) {
        el.style.left = `${p.x}px`
        el.style.top = `${p.y}px`
      }
    }
    onRemove() {
      el.remove()
    }
  }
  return new HtmlOverlay()
}

interface Live {
  map: google.maps.Map
  core: google.maps.CoreLibrary
  shapes: google.maps.Data
  dots: google.maps.Data
  tip: Overlay
  tipEl: HTMLElement
  pin: Overlay
  restyle: () => void
}

/**
 * The block finder map: Google Maps when it works, otherwise the OpenStreetMap map. Any Google failure (no key at build
 * time, the script not loading, the key refused through gm_authFailure even after the map is up, or a load taking longer
 * than 8 seconds; see startGoogleMaps) swaps in the fallback in place. Selection, filters and the shortlist live in the parent, so
 * they carry over.
 */
export default function MapView(props: MapProps) {
  const [onGoogle, fallBack] = useGoogleFirst()
  if (onGoogle) return <GoogleMap {...props} onFail={fallBack} />
  return (
    <Suspense fallback={<div className="map-wrap" aria-busy="true" />}>
      <OsmMap {...props} />
    </Suspense>
  )
}

function GoogleMap(props: MapProps & { onFail: () => void }) {
  const { data, selectedId, hoverId, pickMode, pin, bottomPad } = props
  const box = useRef<HTMLDivElement>(null)
  const cb = useRef(props)
  cb.current = props
  const live = useRef<Live | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const fitted = useRef(false)
  const lastEased = useRef<string | null>(null)

  // load the API and create the map once
  useEffect(() => {
    const stop = startGoogleMaps(([maps, core]) => {
      if (!box.current) return
      const map = new maps.Map(box.current, {
        center: { lat: -33.92, lng: 151.075 },
        zoom: 16,
        maxZoom: 20,
        styles: MAP_STYLE,
        backgroundColor: '#e9ecef',
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: core.ControlPosition.INLINE_END_BLOCK_START },
        clickableIcons: false,
        gestureHandling: 'greedy',
        headingInteractionEnabled: false,
        tiltInteractionEnabled: false,
      })
      const shapes = new maps.Data({ map })
      const dots = new maps.Data({ map })
      const colour = (f: google.maps.Data.Feature) => HEAT_COLORS[f.getProperty('heat_band') as HeatBand] ?? '#cccccc'

      // Footprints fade in from zoom 16; the dots that stand in for them at lower zooms fade out by 17.5.
      const restyle = () => {
        const z = map.getZoom() ?? 16
        const { selectedId: sel, hoverId: over, pickMode: picking } = cb.current
        const fillOpacity = ramp(z, 15.8, 16.8, 0, 0.95)
        const strokeOpacity = ramp(z, 15.8, 16.8, 0, 1)
        const dotOpacity = ramp(z, 16.5, 17.5, 0.95, 0)
        const dotStroke = ramp(z, 16.5, 17.5, 1, 0)
        const radius = z <= 15 ? ramp(z, 12, 15, 3.5, 6) : ramp(z, 15, 17, 6, 9)
        shapes.setStyle((f) => {
          const on = f.getId() === sel
          const hot = f.getId() === over
          return {
            fillColor: colour(f),
            fillOpacity,
            strokeColor: on ? '#0b3a5c' : hot ? '#1b1f23' : '#50575e',
            strokeWeight: on ? 3.5 : hot ? 2.5 : 0.8,
            strokeOpacity,
            zIndex: on ? 3 : hot ? 2 : 1,
            visible: strokeOpacity > 0,
            clickable: !picking,
            cursor: 'pointer',
          }
        })
        dots.setStyle((f) => {
          const on = f.getId() === sel
          return {
            icon: {
              path: core.SymbolPath.CIRCLE,
              scale: radius,
              fillColor: colour(f),
              fillOpacity: dotOpacity,
              strokeColor: on ? '#0b3a5c' : '#50575e',
              strokeOpacity: dotStroke,
              strokeWeight: on ? 2.5 : 0.8,
            },
            // Google draws each dot as a button that can be reached with the arrow keys; this names it.
            title: `${f.getProperty('label')} · ${heatWord(f.getProperty('heat_band') as HeatBand)}`,
            zIndex: on ? 3 : 1,
            visible: dotOpacity > 0,
            clickable: !picking,
            cursor: 'pointer',
          }
        })
      }
      map.addListener('zoom_changed', restyle)

      for (const layer of [shapes, dots]) {
        layer.addListener('mouseover', (e: google.maps.Data.MouseEvent) => {
          const id = e.feature.getId()
          cb.current.onHover(typeof id === 'string' ? id : null)
        })
        layer.addListener('mouseout', () => cb.current.onHover(null))
        layer.addListener('click', (e: google.maps.Data.MouseEvent) => {
          e.stop()
          if (cb.current.pickMode) {
            if (e.latLng) cb.current.onPick(e.latLng.lat(), e.latLng.lng())
            return
          }
          const id = e.feature.getId()
          if (typeof id === 'string') cb.current.onSelect(id)
        })
      }
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!cb.current.pickMode) cb.current.onSelect(null)
        else if (e.latLng) cb.current.onPick(e.latLng.lat(), e.latLng.lng())
      })

      // The building outlines are OpenStreetMap data. This sits on the right edge, above Google's own attribution.
      const credit = document.createElement('div')
      credit.className = 'map-credit'
      credit.innerHTML = 'Buildings © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
      map.controls[core.ControlPosition.INLINE_END_BLOCK_END].push(credit)

      const tipEl = document.createElement('div')
      tipEl.className = 'map-tip'
      const pinEl = document.createElement('div')
      pinEl.className = 'map-pin'
      pinEl.innerHTML = PIN_SVG

      live.current = { map, core, shapes, dots, tip: htmlOverlay(maps.OverlayView, tipEl), tipEl, pin: htmlOverlay(maps.OverlayView, pinEl), restyle }
      restyle()
      setStatus('ready')
    }, () => cb.current.onFail())

    return () => {
      stop()
      const l = live.current
      if (l) {
        l.tip.setMap(null)
        l.pin.setMap(null)
        for (const o of [l.shapes, l.dots]) {
          l.core.event.clearInstanceListeners(o)
          o.setMap(null)
        }
        l.core.event.clearInstanceListeners(l.map)
        live.current = null
      }
    }
  }, [])

  // keep the buildings in sync, fit the view the first time
  useEffect(() => {
    const l = live.current
    if (status !== 'ready' || !l) return
    replaceFeatures(l.shapes, polygons(data))
    replaceFeatures(l.dots, points(data))
    if (!fitted.current && data.features.length > 0) {
      fitted.current = true
      const b = new l.core.LatLngBounds()
      const bb = cb.current.bbox
      if (bb && bb.length === 4 && bb.every(Number.isFinite)) {
        b.extend({ lng: bb[0], lat: bb[1] })
        b.extend({ lng: bb[2], lat: bb[3] })
      } else for (const f of data.features) {
        const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0])
        for (const ring of rings) for (const [lng, lat] of ring) b.extend({ lng, lat })
      }
      l.map.fitBounds(b, { top: 70, left: 40, right: 60, bottom: bottomPad + 50 })
      l.core.event.addListenerOnce(l.map, 'idle', () => {
        if ((l.map.getZoom() ?? 0) > CLOSE_ZOOM) l.map.setZoom(CLOSE_ZOOM)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, status])

  // selection and hover styling, hover label, crosshair, and bringing the selected block into view
  useEffect(() => {
    const l = live.current
    if (status !== 'ready' || !l) return
    const { map } = l
    l.restyle()
    map.setOptions({ draggableCursor: pickMode ? 'crosshair' : null })
    const feat = (id: string | null) => (id ? data.features.find((f) => f.properties.id === id) : undefined)
    const h = feat(hoverId)
    if (h && !pickMode) {
      const [lng, lat] = centroid(h)
      l.tipEl.textContent = `${h.properties.label} · ${heatWord(h.properties.heat_band)}`
      l.tip.place(map, { lat, lng })
    } else l.tip.setMap(null)
    const s = feat(selectedId)
    if (s && selectedId !== lastEased.current) {
      lastEased.current = selectedId
      const [lng, lat] = centroid(s)
      const z = map.getZoom() ?? 0
      const inView = bottomPad === 0 && !!map.getBounds()?.contains({ lat, lng }) && z >= CLOSE_ZOOM
      if (!inView) {
        // Zoomed out, go straight there; close up, glide.
        if (z < CLOSE_ZOOM) map.setOptions({ center: { lat, lng }, zoom: CLOSE_ZOOM })
        else map.panTo({ lat, lng })
        if (bottomPad > 0) map.panBy(0, bottomPad / 2)
      }
    }
    if (!s) lastEased.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, hoverId, data, pickMode, status])

  // location pin for hand-entered blocks
  useEffect(() => {
    const l = live.current
    if (status !== 'ready' || !l) return
    if (pin) l.pin.place(l.map, { lat: pin.lat, lng: pin.lon })
    else l.pin.setMap(null)
  }, [pin, status])

  return (
    <div className={'map-wrap' + (pickMode ? ' picking' : '')}>
      <div className="map-canvas" role="application" aria-label="Map of apartment buildings coloured by how hot the ground gets in summer">
        <div ref={box} className="map-host" />
      </div>
      {pickMode && status === 'ready' && <div className="map-banner">Tap the map to place your block</div>}
    </div>
  )
}
