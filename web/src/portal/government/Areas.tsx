import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useRef, useState } from 'react'
import { govApi } from '@/console/api-gov'
import type { AreaRow, BuildingPoint } from '@/console/types-gov'
import { useRes } from '@/console/useRes'
import { heatWord, num } from '@/format'
import { HEAT_COLORS, HEAT_ORDER } from '@/heat'
import type { HeatBand } from '@/types'
import { MAPS_KEY, MAP_STYLE, loadMaps, mapsAuthFailures } from '@/portal/lib/maps'
import { ChartBox } from '@/portal/components/ChartBox'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader } from '@/portal/components/PageHeader'
import { Gate } from '@/portal/components/States'
import { STAGE_LABEL } from '@/portal/components/Status'
import type { Stage } from '@/console/types'

const LIVE = ['commissioned', 'active', 'closed']
// Project rings in NSW brand colours: dark for built or active, blue for the pipeline.
const RING = { live: '#002664', pipeline: '#146cfd' }

type Ring = 'none' | 'live' | 'pipeline'
const ringOf = (p: BuildingPoint): Ring => (p.project_stage ? (LIVE.includes(p.project_stage) ? 'live' : 'pipeline') : 'none')
const titleOf = (p: BuildingPoint) =>
  `${p.building_id}: ${heatWord(p.heat_band)}, about ${p.flats_est} flats${p.project_stage ? `, project at ${STAGE_LABEL[p.project_stage as Stage] ?? p.project_stage}` : ', no project'}`

/** The buildings on the Google map: a dot per building in the finder's heat colours, bigger for hotter bands, with a
 * ring for a project. A visual aid; "Show as table" has the same data for keyboard and screen reader users. */
function AreasMap({ pts }: { pts: BuildingPoint[] }) {
  const box = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(MAPS_KEY ? 'loading' : 'failed')
  useEffect(() => {
    if (!MAPS_KEY || pts.length === 0) return
    let gone = false
    const fail = () => {
      if (!gone) setStatus('failed')
    }
    mapsAuthFailures.add(fail)
    loadMaps().then(([maps, core]) => {
      if (gone || !box.current) return
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
        const band = f.getProperty('band') as HeatBand
        const i = Math.max(0, HEAT_ORDER.indexOf(band))
        const ring = f.getProperty('ring') as Ring
        return {
          title: f.getProperty('title') as string,
          zIndex: i + (ring === 'none' ? 0 : 10),
          icon: {
            path: core.SymbolPath.CIRCLE,
            scale: 4 + i,
            fillColor: HEAT_COLORS[band] ?? '#cdd3d6',
            fillOpacity: 0.95,
            strokeColor: ring === 'none' ? '#495054' : RING[ring],
            strokeWeight: ring === 'none' ? 1 : 3,
          },
        }
      })
      const info = new maps.InfoWindow()
      map.data.addListener('click', (e: google.maps.Data.MouseEvent) => {
        info.setContent(e.feature.getProperty('title') as string)
        info.setPosition(e.latLng)
        info.open({ map })
      })
      setStatus('ready')
    }, fail)
    return () => {
      gone = true
      mapsAuthFailures.delete(fail)
    }
  }, [pts])
  const withProject = pts.filter((p) => p.project_stage).length
  return (
    <div className="mw-areas-map" role="region" aria-label={`Map of ${pts.length} buildings in the building dataset, coloured by heat band. ${withProject} have a project. The same data is in the table.`}>
      <div ref={box} className="mw-areas-map__canvas" />
      {status === 'failed' && (
        <p className="mw-areas-map__status" role="status">
          The map could not load. Choose Show as table for the same data.
        </p>
      )}
    </div>
  )
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
