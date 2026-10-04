import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo } from 'react'
import { govApi } from '@/console/api-gov'
import type { AreaRow, BuildingPoint } from '@/console/types-gov'
import { useRes } from '@/console/useRes'
import { heatWord, num } from '@/format'
import { ChartBox } from '@/portal/components/ChartBox'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader } from '@/portal/components/PageHeader'
import { Gate } from '@/portal/components/States'
import { STAGE_LABEL } from '@/portal/components/Status'
import type { Stage } from '@/console/types'

const BANDS = ['cooler', 'average', 'warm', 'hot', 'hottest']
const FILL: Record<string, string> = { cooler: '#ffffff', average: '#c9ced3', warm: '#8a939b', hot: '#4a5560', hottest: '#1b1f23' }
const LIVE = ['commissioned', 'active', 'closed']

/** One marker per heat band: a different shape and size as well as a different tone. */
function Marker({ band, x, y, ring }: { band: string; x: number; y: number; ring: 'none' | 'live' | 'pipeline' }) {
  const i = Math.max(0, BANDS.indexOf(band))
  const s = 4 + i * 1.2
  const common = { fill: FILL[band] ?? '#8a939b', stroke: '#1b1f23', strokeWidth: 1.2 }
  let shape
  if (i === 0) shape = <circle cx={x} cy={y} r={s - 1} {...common} />
  else if (i === 1) shape = <circle cx={x} cy={y} r={s} {...common} />
  else if (i === 2) shape = <rect x={x - s} y={y - s} width={s * 2} height={s * 2} {...common} />
  else if (i === 3) shape = <polygon points={`${x},${y - s - 1} ${x + s + 1},${y + s} ${x - s - 1},${y + s}`} {...common} />
  else shape = <polygon points={`${x},${y - s - 2} ${x + s + 2},${y} ${x},${y + s + 2} ${x - s - 2},${y}`} {...common} />
  return (
    <g>
      {ring !== 'none' && <circle cx={x} cy={y} r={s + 6} fill="none" stroke="#0b4f7c" strokeWidth={2.5} strokeDasharray={ring === 'pipeline' ? '3 3' : undefined} />}
      {shape}
    </g>
  )
}

function MapSvg({ pts }: { pts: BuildingPoint[] }) {
  const W = 640
  const H = 420
  const pad = 24
  const b = useMemo(() => {
    const lats = pts.map((p) => p.lat)
    const lons = pts.map((p) => p.lon)
    return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) }
  }, [pts])
  const k = Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180)
  const spanX = Math.max(1e-6, (b.maxLon - b.minLon) * k)
  const spanY = Math.max(1e-6, b.maxLat - b.minLat)
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY)
  const ox = (W - spanX * scale) / 2
  const oy = (H - spanY * scale) / 2
  const px = (lon: number) => ox + (lon - b.minLon) * k * scale
  const py = (lat: number) => H - oy - (lat - b.minLat) * scale
  const withProject = pts.filter((p) => p.project_stage).length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mw-h-auto nsw-width-100 mw-border mw-bg-white" role="img" aria-label={`Map of ${pts.length} buildings in the pilot area, with the heat band of each. ${withProject} have a project. The same data is in the table.`}>
      <rect x={0} y={0} width={W} height={H} fill="#f6f7f8" />
      {pts.map((p) => {
        const live = p.project_stage && LIVE.includes(p.project_stage)
        return (
          <g key={p.building_id}>
            <title>{`${p.building_id}: ${heatWord(p.heat_band)}, about ${p.flats_est} flats${p.project_stage ? `, project at ${STAGE_LABEL[p.project_stage as Stage] ?? p.project_stage}` : ', no project'}`}</title>
            <Marker band={p.heat_band} x={px(p.lon)} y={py(p.lat)} ring={p.project_stage ? (live ? 'live' : 'pipeline') : 'none'} />
          </g>
        )
      })}
      <text x={W - 10} y={H - 8} textAnchor="end" fontSize="11" fill="#50575e">
        North is up. Not to scale.
      </text>
    </svg>
  )
}

function Legend() {
  return (
    <>
      <span className="nsw-text-medium">Heat band:</span>
      {BANDS.map((b) => (
        <span key={b} className="nsw-display-inline-flex nsw-align-items-center mw-gap-1_5">
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <Marker band={b} x={12} y={12} ring="none" />
          </svg>
          {heatWord(b)}
        </span>
      ))}
      <span className="nsw-display-inline-flex nsw-align-items-center mw-gap-1_5">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <circle cx="13" cy="13" r="9" fill="none" stroke="#0b4f7c" strokeWidth="2.5" />
        </svg>
        Project built or active
      </span>
      <span className="nsw-display-inline-flex nsw-align-items-center mw-gap-1_5">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <circle cx="13" cy="13" r="9" fill="none" stroke="#0b4f7c" strokeWidth="2.5" strokeDasharray="3 3" />
        </svg>
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
              description="Each marker is a building. Hotter bands have bigger, darker markers."
              chart={<MapSvg pts={a.buildings} />}
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
