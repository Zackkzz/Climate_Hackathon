import type { ColumnDef } from '@tanstack/react-table'
import { Suspense, lazy, useEffect, useRef } from 'react'
import { govApi } from '@/console/api-gov'
import type { AreaRow, BuildingPoint } from '@/console/types-gov'
import { useRes } from '@/console/useRes'
import { heatWord, num } from '@/format'
import { HEAT_COLORS, HEAT_ORDER } from '@/heat'
import { MAP_STYLE, startGoogleMaps, useGoogleFirst } from '@/portal/lib/maps'
import { ChartBox } from '@/portal/components/ChartBox'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader } from '@/portal/components/PageHeader'
import { Gate } from '@/portal/components/States'
import { STAGE_LABEL } from '@/portal/components/Status'
import type { Stage } from '@/console/types'
import { RING, dotStyle, ringOf, titleOf, type Ring } from './areasMapData'

// The OpenStreetMap fallback lives in the same lazily loaded chunk as the block finder's, so MapLibre loads only when
// Google Maps fails.
const AreasOsmMap = lazy(() => import('@/portal/finder/OsmMap').then((m) => ({ default: m.AreasOsmMap })))

/** The buildings on the map: a dot per building in the finder's heat colours, bigger for hotter bands, with a ring for a
 * project. Google Maps when it works; on any Google failure (no key, script not loading, key refused, too slow) the
 * OpenStreetMap map takes its place. A visual aid; "Show as table" has the same data for keyboard and screen reader users. */
function AreasMap({ pts }: { pts: BuildingPoint[] }) {
  const [onGoogle, fallBack] = useGoogleFirst()
  const withProject = pts.filter((p) => p.project_stage).length
  return (
    <div className="mw-areas-map" role="region" aria-label={`Map of ${pts.length} buildings in the building dataset, coloured by heat band. ${withProject} have a project. The same data is in the table.`}>
      {onGoogle ? (
        <AreasGoogleMap pts={pts} onFail={fallBack} />
      ) : (
        <Suspense fallback={null}>
          <AreasOsmMap pts={pts} />
        </Suspense>
      )}
    </div>
  )
}

function AreasGoogleMap({ pts, onFail }: { pts: BuildingPoint[]; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const failRef = useRef(onFail)
  failRef.current = onFail
  useEffect(() => {
    if (pts.length === 0) return
    return startGoogleMaps(([maps, core]) => {
      if (!box.current) return
      const map = new maps.Map(box.current, {
        styles: MAP_STYLE,
        backgroundColor: '#ebebeb',
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: 'cooperative',
        headingInteractionEnabled: false,
        tiltInteractionEnabled: false,
      })
      const bounds = new core.LatLngBounds()
      for (const p of pts) {
        bounds.extend({ lat: p.lat, lng: p.lon })
        map.data.add({ geometry: new maps.Data.Point({ lat: p.lat, lng: p.lon }), properties: { band: p.heat_band, ring: ringOf(p), title: titleOf(p) } })
      }
      map.fitBounds(bounds, 32)
      map.data.setStyle((f) => {
        const d = dotStyle(f.getProperty('band') as string, f.getProperty('ring') as Ring)
        return {
          title: f.getProperty('title') as string,
          zIndex: d.z,
          icon: { path: core.SymbolPath.CIRCLE, scale: d.radius, fillColor: d.fill, fillOpacity: 0.95, strokeColor: d.stroke, strokeWeight: d.strokeWidth },
        }
      })
      const info = new maps.InfoWindow()
      map.data.addListener('click', (e: google.maps.Data.MouseEvent) => {
        info.setContent(e.feature.getProperty('title') as string)
        info.setPosition(e.latLng)
        info.open({ map })
      })
    }, () => failRef.current())
  }, [pts])
  return <div ref={box} className="mw-areas-map__canvas" />
}

function Dot({ fill, ring, size = 14 }: { fill: string; ring?: string; size?: number }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r={size / 2} fill={fill} stroke={ring ?? '#495054'} strokeWidth={ring ? 3 : 1} />
    </svg>
  )
}

function Legend() {
  return (
    <>
      <span className="nsw-text-medium">Heat band:</span>
      {HEAT_ORDER.map((b, i) => (
        <span key={b} className="nsw-display-inline-flex nsw-align-items-center mw-gap-1_5">
          <Dot fill={HEAT_COLORS[b]} size={8 + i * 2} />
          {heatWord(b)}
        </span>
      ))}
      <span className="nsw-display-inline-flex nsw-align-items-center mw-gap-1_5">
        <Dot fill="#ffffff" ring={RING.live} />
        Project built or active
      </span>
      <span className="nsw-display-inline-flex nsw-align-items-center mw-gap-1_5">
        <Dot fill="#ffffff" ring={RING.pipeline} />
        Project in the pipeline
      </span>
    </>
  )
}

const pctOf = (n: number) => `${Math.round(n * 100)}%`
const areaCols: ColumnDef<AreaRow>[] = [
  { accessorKey: 'area', header: 'Area', cell: (c) => <span className="nsw-text-medium">{c.getValue<string>()}</span> },
  { accessorKey: 'buildings', header: 'Buildings', meta: { numeric: true } },
  { accessorKey: 'flats_est', header: 'Flats (estimate)', meta: { numeric: true }, cell: (c) => num(c.getValue<number>()) },
  { accessorKey: 'renter_share', header: 'Renting', meta: { numeric: true, csv: (r) => r.renter_share }, cell: (c) => pctOf(c.getValue<number>()) },
  { accessorKey: 'hottest_band_buildings', header: 'In the hotter bands', meta: { numeric: true } },
  { accessorKey: 'projects', header: 'Projects', meta: { numeric: true } },
  { accessorKey: 'flats_upgraded', header: 'Flats upgraded', meta: { numeric: true } },
]

export default function Areas() {
  const res = useRes(() => govApi.areas(), [])
  useEffect(() => {
    document.title = 'Areas | Government | Meterwise'
  }, [])
  return (
    <>
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Areas' }]} title="Areas" description="Where the hot blocks are, where projects are under way, and how many flats have been upgraded in each area." />
      <Gate res={res} rows={6}>
        {(a) => (
          <div className="mw-space-y-4">
            <ChartBox
              title="Map of buildings"
              description="Each dot is a building, coloured by heat band. Hotter bands have bigger dots. A ring marks a project. Select a dot for its details."
              chart={<AreasMap pts={a.buildings} />}
              legend={<Legend />}
              table={{
                columns: [{ label: 'Building' }, { label: 'Heat band' }, { label: 'Flats (estimate)', numeric: true }, { label: 'Renting', numeric: true }, { label: 'Project stage' }],
                rows: a.buildings.map((b) => [b.building_id, heatWord(b.heat_band), b.flats_est, b.renter_share === null ? 'Unknown' : pctOf(b.renter_share), b.project_stage ? STAGE_LABEL[b.project_stage as Stage] ?? b.project_stage : 'No project']),
              }}
            />
            <div>
              <h2 id="areas-h" className="mw-mb-2 nsw-text-semibold">
                Areas
              </h2>
              <DataTable columns={areaCols} data={a.by_area} caption="Areas" csvName="areas" searchPlaceholder="Search areas" getRowId={(r) => r.area} emptyTitle="No areas" />
            </div>
          </div>
        )}
      </Gate>
    </>
  )
}
