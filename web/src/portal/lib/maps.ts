// Google Maps JavaScript API, loaded once per page and shared by the block finder map and the Areas map.
import { useCallback, useEffect, useState } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

declare global {
  interface Window {
    gm_authFailure?: () => void
  }
}

// Browser key for the Maps JavaScript API. It is public by design: Google accepts it only from the site's own addresses,
// for this one API, up to a daily number of map loads. It is read from web/.env.local, which git ignores.
export const MAPS_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''

// Muted base map so the heat colours stand out; businesses and transit icons are hidden.
export const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { stylers: [{ saturation: -60 }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
]

export type MapsLibs = [google.maps.MapsLibrary, google.maps.CoreLibrary]
let configured = false
let loading: Promise<MapsLibs> | null = null
/** Callbacks to run when Google refuses the key (gm_authFailure). Add one per map; remove it on unmount. */
export const mapsAuthFailures = new Set<() => void>()
let refused = false
/** True once Google has refused the key on this page (gm_authFailure); it does not recover without a reload. */
export const mapsKeyRefused = () => refused

// Give up on Google if the script and the map are not up within this time.
const LOAD_TIMEOUT_MS = 8000

/**
 * Which map a page should show: Google Maps first, unless this build has no key or Google has already refused it on
 * this page. Call the returned function when Google fails and the page swaps to the OpenStreetMap map in place.
 */
export function useGoogleFirst(): [boolean, () => void] {
  const [onGoogle, setOnGoogle] = useState(() => !!MAPS_KEY && !mapsKeyRefused())
  useEffect(() => {
    if (!MAPS_KEY) console.info('Map: no Google Maps key in this build (VITE_GOOGLE_MAPS_API_KEY), so the OpenStreetMap map is shown.')
  }, [])
  return [onGoogle, useCallback(() => setOnGoogle(false), [])]
}

/**
 * Load Google Maps for one map. Calls onReady with the libraries once they are up, and onFail at most once if the script
 * does not load, the key is refused through gm_authFailure (even after the map is up), or nothing is up after
 * LOAD_TIMEOUT_MS. Returns a function that stops watching; call it on unmount.
 */
export function startGoogleMaps(onReady: (libs: MapsLibs) => void, onFail: () => void): () => void {
  let gone = false
  let up = false
  const fail = (why: unknown) => {
    if (gone) return
    gone = true
    console.info('Map: Google Maps is not available, showing the OpenStreetMap map instead.', why instanceof Error ? why.message : why)
    onFail()
  }
  const keyRefused = () => fail('key refused (gm_authFailure)')
  mapsAuthFailures.add(keyRefused)
  const timer = window.setTimeout(() => {
    if (!up) fail(`not loaded after ${LOAD_TIMEOUT_MS / 1000} s`)
  }, LOAD_TIMEOUT_MS)
  loadMaps().then((libs) => {
    if (gone) return
    if (refused) return fail('key refused (gm_authFailure)')
    up = true
    onReady(libs)
  }, fail)
  return () => {
    gone = true
    window.clearTimeout(timer)
    mapsAuthFailures.delete(keyRefused)
  }
}

/** Load the Maps JavaScript API once per page. */
export function loadMaps(): Promise<MapsLibs> {
  if (!configured) {
    configured = true
    window.gm_authFailure = () => {
      refused = true
      mapsAuthFailures.forEach((f) => f())
    }
    setOptions({ key: MAPS_KEY, v: 'quarterly', language: 'en-AU', region: 'AU', authReferrerPolicy: 'origin' })
  }
  loading ??= Promise.all([importLibrary('maps'), importLibrary('core')]).catch((e: unknown) => {
    loading = null
    throw e
  })
  return loading
}
