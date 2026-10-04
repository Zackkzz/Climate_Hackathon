// Google Maps JavaScript API, loaded once per page and shared by the block finder map and the Areas map.
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

/** Load the Maps JavaScript API once per page. */
export function loadMaps(): Promise<MapsLibs> {
  if (!configured) {
    configured = true
    window.gm_authFailure = () => mapsAuthFailures.forEach((f) => f())
    setOptions({ key: MAPS_KEY, v: 'quarterly', language: 'en-AU', region: 'AU', authReferrerPolicy: 'origin' })
  }
  loading ??= Promise.all([importLibrary('maps'), importLibrary('core')]).catch((e: unknown) => {
    loading = null
    throw e
  })
  return loading
}
