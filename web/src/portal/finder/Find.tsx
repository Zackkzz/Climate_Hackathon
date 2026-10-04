import { zodResolver } from '@hookform/resolvers/zod'
import { MapPin } from 'lucide-react'
import { Suspense, lazy, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { ColumnDef } from '@tanstack/react-table'
import { z } from 'zod'
import { portfolio } from '@/api'
import { useUser } from '@/console/auth'
import { heatWord, money, num1, plural, rentedPhrase } from '@/format'
import { HEAT_COLORS, HEAT_ORDER } from '@/heat'
import { useLoad } from '@/hooks'
import type { BuildingCollection, BuildingFeature, Deal, Meta } from '@/types'
import { DataTable } from '@/portal/components/DataTable'
import { NumberField } from '@/portal/components/fields'
import { EmptyState, ErrorAlert, LoadingRows } from '@/portal/components/States'
import { Button } from '@/portal/components/ui/button'
import { Checkbox } from '@/portal/components/ui/checkbox'
import { Form } from '@/portal/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/portal/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/portal/components/ui/tabs'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/portal/components/ui/table'
import { MicroclimatePanel } from './Analysis'

const MapView = lazy(() => import('./MapView'))
type Own = NonNullable<Deal['own']>
type BProps = BuildingFeature['properties']

interface Props {
  meta: Meta
  buildings: BuildingCollection
  shortlist: { ids: string[]; toggle: (id: string) => void; remove: (id: string) => void }
  onBuild: (id: string) => void
  onBuildOwn: (own: Own) => void
}

function HeatKey({ band }: { band: BProps['heat_band'] }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block size-3 border border-foreground/40" style={{ background: HEAT_COLORS[band] }} aria-hidden="true" />
      {heatWord(band)}
    </span>
  )
}

function Legend() {
  return (
    <div className="absolute bottom-12 left-2 z-10 border bg-card/95 px-2 py-1.5 text-sm" aria-label="Map legend: from cooler than most to among the hottest">
      <div className="flex" aria-hidden="true">
        {HEAT_ORDER.map((b) => (
          <span key={b} className="h-3 w-8 border border-foreground/30" style={{ background: HEAT_COLORS[b] }} />
        ))}
      </div>
      <div className="flex justify-between gap-4">
        <span>Cooler than most</span>
        <span>Among the hottest</span>
      </div>
    </div>
  )
}

function SelectedBlock({ f, onBuild, shortlisted, onShortlist }: { f: BuildingFeature; onBuild: () => void; shortlisted: boolean; onShortlist: () => void }) {
  const p = f.properties
  const user = useUser()
  const rent = rentedPhrase(p.renter_share)
  return (
    <section className="border bg-card" aria-live="polite" aria-label="Selected block">
      <div className="space-y-2 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-base font-semibold">{p.label}</h2>
          <HeatKey band={p.heat_band} />
        </div>
        <p>
          About {plural(p.flats_est, 'flat')}, {plural(p.storeys, 'storey')}
          {p.storeys_source === 'assumed' ? ' (assumed)' : ''}. {rent[0].toUpperCase() + rent.slice(1)}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onBuild}>Build the deal</Button>
          <Button variant="outline" aria-pressed={shortlisted} onClick={onShortlist}>
            {shortlisted ? 'On shortlist' : 'Shortlist'}
          </Button>
          {user?.role === 'manager' && (
            <Button variant="outline" asChild>
              <a href={`/government/projects/new?b=${encodeURIComponent(p.id)}`}>Start a project for this block</a>
            </Button>
          )}
        </div>
        <MicroclimatePanel id={p.id} />
      </div>
    </section>
  )
}

const ownSchema = z.object({
  storeys: z.coerce.number({ message: 'Enter the number of storeys.' }).int('Use a whole number.').min(1, 'At least 1 storey.').max(12, 'Up to 12 storeys.'),
  flats: z.coerce.number({ message: 'Enter the number of flats.' }).int('Use a whole number.').min(1, 'At least 1 flat.').max(200, 'Up to 200 flats.'),
  roof_known: z.boolean(),
  roof: z.coerce.number().optional(),
})

function OwnBlockForm({ meta, pin, pickMode, setPickMode, onCancel, onSubmit }: { meta: Meta; pin: { lat: number; lon: number } | null; pickMode: boolean; setPickMode: (v: boolean) => void; onCancel: () => void; onSubmit: (o: Own) => void }) {
  const form = useForm<z.input<typeof ownSchema>, unknown, z.output<typeof ownSchema>>({
    resolver: zodResolver(ownSchema),
    defaultValues: { storeys: 3, flats: 12, roof_known: false, roof: 300 },
  })
  const v = form.watch()
  const flatArea = 65
  const st = Number(v.storeys) || 1
  const fl = Number(v.flats) || 1
  const estimate = Math.round(((fl / st) * flatArea * 1.15) / 10) * 10
  const loc = pin ?? meta.pilot.centre
  return (
    <Form {...form}>
      <form
        className="space-y-3 border bg-card p-3"
        noValidate
        onSubmit={form.handleSubmit((d) => {
          const roof = d.roof_known ? Math.max(20, Number(d.roof) || 20) : estimate
          onSubmit({ storeys: d.storeys, flats: d.flats, roof_m2: roof, flat_area_m2: flatArea, lat: loc.lat, lon: loc.lon })
        })}
      >
        <h2 className="text-base font-semibold">Enter your own block</h2>
        <p className="text-muted-foreground">A few details are enough. You can change them later.</p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField control={form.control} name="storeys" label="Storeys" min={1} max={12} />
          <NumberField control={form.control} name="flats" label="Flats" min={1} max={200} />
        </div>
        <div className="space-y-1">
          <label className="flex items-center gap-2">
            <Checkbox checked={!v.roof_known} onCheckedChange={(c) => form.setValue('roof_known', !c)} /> I don't know the roof area, estimate it
          </label>
          {v.roof_known ? <NumberField control={form.control} name="roof" label="Roof area (m²)" min={20} max={5000} /> : <p className="text-sm text-muted-foreground">Estimated roof area: {estimate} m².</p>}
        </div>
        <div className="space-y-1">
          <Button type="button" variant="outline" aria-pressed={pickMode} onClick={() => setPickMode(!pickMode)}>
            <MapPin aria-hidden="true" /> {pickMode ? 'Tap the map...' : pin ? 'Move the spot' : 'Choose the spot on the map'}
          </Button>
          <p className="text-sm text-muted-foreground">{pin ? 'Spot chosen.' : 'Optional. Without it we use the middle of the pilot area.'}</p>
        </div>
        <div className="flex gap-2">
          <Button type="submit">Build the deal</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}

function ShortlistView({ ids, buildings, remove, onOpen }: { ids: string[]; buildings: BuildingCollection; remove: (id: string) => void; onOpen: (id: string) => void }) {
  const key = ids.join(',')
  const state = useLoad(() => (ids.length ? portfolio({ building_ids: ids }) : Promise.resolve(null)), key)
  if (ids.length === 0) return <EmptyState title="Your shortlist is empty">Select a block on the map and press Shortlist. Then compare capital needed and funding gaps here.</EmptyState>
  if (state.error) return <ErrorAlert error={state.error} onRetry={state.retry} title="We could not compare the shortlist" />
  if (!state.data) return <LoadingRows rows={3} label="Comparing your shortlist" />
  const { results, totals } = state.data
  const byId = new Map(buildings.features.map((f) => [f.properties.id, f.properties]))
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Each block gets the standard package with default settings. Figures are estimated.</p>
      <div className="overflow-x-auto border" role="region" aria-label="Shortlist comparison" tabIndex={0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Block</TableHead>
              <TableHead className="text-right">Capital needed</TableHead>
              <TableHead className="text-right">Gap</TableHead>
              <TableHead className="text-right">CO₂e t/yr</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r) => (
              <TableRow key={r.building_id}>
                <TableCell>
                  <Button variant="link" className="h-auto p-0 text-left" onClick={() => onOpen(r.building_id)}>
                    {r.label}
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    {plural(r.flats, 'flat')} · {byId.get(r.building_id) ? heatWord(byId.get(r.building_id)?.heat_band) : ''}{' '}
                    <Button variant="link" size="sm" className="h-auto p-0 text-sm" aria-label={`Remove ${r.label} from shortlist`} onClick={() => remove(r.building_id)}>
                      Remove
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(r.net_capex)}</TableCell>
                <TableCell className={'text-right tabular-nums ' + (r.funding_gap > 0 ? 'text-warning' : 'text-success')}>{r.funding_gap > 0 ? money(r.funding_gap) : 'None'}</TableCell>
                <TableCell className="text-right tabular-nums">{num1(r.co2e_t_per_year_saved)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>
                Total: {plural(totals.buildings, 'block')}, {plural(totals.flats, 'flat')}
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(totals.net_capex)}</TableCell>
              <TableCell className="text-right tabular-nums">{totals.funding_gap > 0 ? money(totals.funding_gap) : 'None'}</TableCell>
              <TableCell className="text-right tabular-nums">{num1(totals.co2e_t_per_year_saved)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">
        {totals.fully_funded_count} of {totals.buildings} blocks can be fully repaid from bill savings.
      </p>
    </div>
  )
}

export default function Find({ meta, buildings, shortlist, onBuild, onBuildOwn }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState('top')
  const [own, setOwn] = useState(false)
  const [pickMode, setPickMode] = useState(false)
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null)
  const [band, setBand] = useState('all')

  const selected = selectedId ? buildings.features.find((f) => f.properties.id === selectedId) ?? null : null
  const data = useMemo(() => buildings.features.map((f) => f.properties).filter((p) => band === 'all' || p.heat_band === band), [buildings, band])

  const select = (id: string | null) => {
    setSelectedId(id)
    if (id) {
      setOwn(false)
      setPickMode(false)
      setTab('top')
    }
  }

  const columns = useMemo<ColumnDef<BProps, any>[]>( // eslint-disable-line @typescript-eslint/no-explicit-any
    () => [
      {
        id: 'label',
        accessorFn: (p) => p.label,
        header: 'Block',
        meta: { label: 'Block' },
        cell: ({ row }) => (
          <Button variant="link" className="h-auto whitespace-normal p-0 text-left" aria-pressed={row.original.id === selectedId} onClick={() => select(row.original.id)}>
            {row.original.label}
          </Button>
        ),
      },
      { id: 'flats', accessorFn: (p) => p.flats_est, header: 'Flats', meta: { numeric: true, label: 'Flats' } },
      {
        id: 'heat',
        accessorFn: (p) => heatWord(p.heat_band),
        header: 'Heat',
        meta: { label: 'Heat' },
        sortingFn: (a, b) => HEAT_ORDER.indexOf(a.original.heat_band) - HEAT_ORDER.indexOf(b.original.heat_band),
        cell: ({ row }) => <HeatKey band={row.original.heat_band} />,
      },
      { id: 'rented', accessorFn: (p) => (p.renter_share === null ? null : Math.round(p.renter_share * 100)), header: 'Rented %', meta: { numeric: true, label: 'Rented %' }, cell: ({ getValue }) => (getValue() === null ? 'Unknown' : `${getValue()}%`) },
      { id: 'score', accessorFn: (p) => p.quick_score, header: 'Score', meta: { numeric: true, label: 'Screening score' } },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId],
  )

  return (
    <div className="grid min-h-[calc(100svh-3.5rem)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <section className="relative h-[55svh] min-h-[320px] border-b lg:sticky lg:top-14 lg:h-[calc(100svh-3.5rem)] lg:border-b-0 lg:border-r" aria-label="Map of blocks">
        <Suspense fallback={<div className="p-4"><LoadingRows rows={2} label="Loading the map" /></div>}>
          <MapView
            data={buildings}
            selectedId={selectedId}
            hoverId={null}
            onSelect={select}
            onHover={() => {}}
            pickMode={pickMode}
            pin={pin}
            onPick={(lat, lon) => {
              setPin({ lat, lon })
              setPickMode(false)
            }}
            bbox={meta.pilot.bbox}
            bottomPad={0}
          />
        </Suspense>
        <Legend />
      </section>

      <aside className="min-w-0 space-y-3 p-3 lg:p-4" aria-label="Blocks to look at first">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Where should we upgrade first?</h1>
          <p className="text-muted-foreground">Select a block on the map or in the table.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Colours show how much hotter the ground gets than the area's middle on hot summer days, measured by satellite. This is surface temperature, not the air inside a flat.
          </p>
        </header>
        {own ? (
          <OwnBlockForm
            meta={meta}
            pin={pin}
            pickMode={pickMode}
            setPickMode={setPickMode}
            onCancel={() => {
              setOwn(false)
              setPickMode(false)
            }}
            onSubmit={onBuildOwn}
          />
        ) : (
          <>
            {selected && <SelectedBlock f={selected} onBuild={() => onBuild(selected.properties.id)} shortlisted={shortlist.ids.includes(selected.properties.id)} onShortlist={() => shortlist.toggle(selected.properties.id)} />}
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="top">Top blocks</TabsTrigger>
                <TabsTrigger value="shortlist">Shortlist{shortlist.ids.length > 0 ? ` (${shortlist.ids.length})` : ''}</TabsTrigger>
              </TabsList>
              <TabsContent value="top" className="mt-2">
                <DataTable
                  caption="Blocks ranked by screening score"
                  columns={columns}
                  data={data}
                  getRowId={(p) => p.id}
                  csvName="blocks"
                  pageSize={10}
                  searchPlaceholder="Search by address"
                  initialSort={[{ id: 'score', desc: true }]}
                  initialHidden={{ rented: false }}
                  emptyTitle="No blocks found"
                  emptyText="There are no apartment buildings in this area yet."
                  filters={
                    <div>
                      <label htmlFor="heat-filter" className="sr-only">
                        Filter by heat
                      </label>
                      <Select value={band} onValueChange={setBand}>
                        <SelectTrigger id="heat-filter" className="w-[11rem]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All heat levels</SelectItem>
                          {HEAT_ORDER.map((b) => (
                            <SelectItem key={b} value={b}>
                              {heatWord(b)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  }
                />
              </TabsContent>
              <TabsContent value="shortlist" className="mt-2">
                <ShortlistView ids={shortlist.ids} buildings={buildings} remove={shortlist.remove} onOpen={(id) => select(id)} />
              </TabsContent>
            </Tabs>
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => {
                setOwn(true)
                setSelectedId(null)
              }}
            >
              It's not on the map? Enter your own block
            </Button>
          </>
        )}
      </aside>
    </div>
  )
}
