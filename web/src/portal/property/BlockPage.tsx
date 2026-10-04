import type { ColumnDef } from '@tanstack/react-table'
import { useEffect } from 'react'
import { cleanName } from '@/portal/lib/labels'
import { useNavigate, useParams } from 'react-router'
import { api } from '@/console/api'
import { useUser } from '@/console/auth'
import { propertyApi } from '@/console/api-property'
import type { Doc } from '@/console/types'
import type { PropertyProject } from '@/console/types-property'
import { useRes } from '@/console/useRes'
import { money } from '@/format'
import { DataTable } from '@/portal/components/DataTable'
import { Facts, PageHeader, Panel } from '@/portal/components/PageHeader'
import { Gate } from '@/portal/components/States'
import { StageBadge } from '@/portal/components/Status'
import { Button } from '@/portal/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/portal/components/ui/tabs'
import { openHtmlTab } from '@/portal/lib/csv'
import { useAction } from '@/portal/lib/actions'
import { ErrorAlert } from '@/portal/components/States'
import { fmtDate } from './common'
import { ReportFaultDialog } from './FaultDialog'
import { FaultsTable } from './FaultsTable'
import { ChargesTab, ConsentTab, FlatsTab } from './FlatsTab'

const TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'consent', label: 'Consent' },
  { key: 'flats', label: 'Flats' },
  { key: 'faults', label: 'Faults' },
  { key: 'documents', label: 'Documents' },
  { key: 'charges', label: 'Charges and export' },
]

function SummaryTab({ p }: { p: PropertyProject }) {
  const s = p.summary
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Panel title="Where this block is up to" className="min-w-0">
        <Facts
          items={[
            { label: 'Stage', value: <StageBadge stage={p.stage} /> },
            { label: 'Since', value: fmtDate(p.stage_since) },
            { label: 'Next step', value: p.next_step },
            { label: 'Blocked by', value: p.blocked_by.length ? <ul className="list-disc pl-4">{p.blocked_by.map((b, i) => <li key={i}>{b}</li>)}</ul> : 'Nothing' },
            { label: 'Installer', value: (p.installer_org ? cleanName(p.installer_org.name) : null) ?? 'Not chosen yet' },
            { label: 'Flats', value: p.flats },
          ]}
        />
      </Panel>
      <Panel title="The deal" description="Modelled figures. They are estimates, not quotes." className="min-w-0">
        <Facts
          items={[
            { label: 'Net cost', value: money(s.net_capex) },
            { label: 'Funding gap', value: money(s.funding_gap) },
            { label: 'Grant allocated', value: money(s.grant_allocated) },
            { label: 'Charge a month, whole block', value: money(s.charge_per_month_building) },
            { label: 'Tenant keeps a month', value: money(s.tenant_net_saving_per_month) },
            { label: 'Emissions cut a year', value: `${s.co2e_t_per_year_saved.toFixed(1)} tonnes CO2e` },
          ]}
        />
      </Panel>
      <Panel title="History" className="min-w-0 lg:col-span-2">
        <DataTable
          columns={[
            { accessorKey: 'at', header: 'Date', cell: ({ row }) => fmtDate(row.original.at) },
            { accessorKey: 'stage', header: 'Stage' },
            { accessorKey: 'by', header: 'By' },
            { accessorKey: 'note', header: 'Note' },
          ]}
          data={p.stage_history}
          caption="Stage history"
          pageSize={10}
        />
      </Panel>
    </div>
  )
}

function DocumentsTab({ p }: { p: PropertyProject }) {
  const res = useRes<Doc[]>(() => api.documents(p.id), [p.id])
  const act = useAction()
  const cols: ColumnDef<Doc>[] = [
    { accessorKey: 'title', header: 'Document' },
    { id: 'flat', header: 'Flat', accessorFn: (d) => (d.flat_id ? `Flat ${d.flat_id}` : 'Whole block') },
    { accessorKey: 'generated_at', header: 'Made', cell: ({ row }) => fmtDate(row.original.generated_at), meta: { csv: (d) => d.generated_at } },
    {
      id: 'open',
      header: 'Open',
      enableSorting: false,
      enableHiding: false,
      meta: { label: 'Open' },
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="outline"
          disabled={act.busy}
          onClick={async () => {
            const html = await act.run(() => api.documentHtml(row.original.url))
            if (html) openHtmlTab(html)
          }}
        >
          Open<span className="sr-only"> {row.original.title}</span> in a new tab
        </Button>
      ),
    },
  ]
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">Printable pages. They summarise your agreement and are not legal or financial advice. Please have your own adviser review them.</p>
      <ErrorAlert error={act.error} title="We could not open the document" />
      <Gate res={res}>{(d) => <DataTable columns={cols} data={d} caption="Documents" searchPlaceholder="Search documents" emptyTitle="No documents yet" emptyText="Documents are made when the offer is issued." />}</Gate>
    </div>
  )
}

function FaultsTab({ p }: { p: PropertyProject }) {
  const res = useRes(() => api.faults({ project_id: p.id }), [p.id])
  return (
    <div className="space-y-3">
      <div>
        <ReportFaultDialog projects={[{ id: p.id, label: p.label }]} defaultProject={p.id} onDone={res.reload} />
      </div>
      <Gate res={res}>{(f) => <FaultsTable faults={f} name={`Faults at ${p.label}`} />}</Gate>
    </div>
  )
}

export default function BlockPage() {
  const { id, tab = 'summary' } = useParams()
  const nav = useNavigate()
  const user = useUser()
  const pid = Number(id)
  const res = useRes<PropertyProject>(() => propertyApi.project(pid), [pid])
  const p = res.data
  useEffect(() => {
    document.title = `${p?.label ?? 'Block'} | Property | Meterwise`
  }, [p?.label])
  const current = TABS.some((t) => t.key === tab) ? tab : 'summary'
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Property', to: '/property' }, { label: 'My blocks', to: '/property/blocks' }, { label: p?.label ?? 'Block' }]}
        title={p?.label ?? 'Block'}
        description={p ? `${p.flats} flats. ${p.next_step}` : undefined}
        actions={p && <StageBadge stage={p.stage} />}
      />
      <Gate res={res} rows={6}>
        {(pr) => (
          <>
            <Tabs value={current} onValueChange={(t) => nav(`/property/blocks/${pid}/${t}`)}>
              <div className="overflow-x-auto">
                <TabsList>
                  {TABS.map((t) => (
                    <TabsTrigger key={t.key} value={t.key}>
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <TabsContent value="summary" className="mt-4"><SummaryTab p={pr} /></TabsContent>
              <TabsContent value="consent" className="mt-4"><ConsentTab p={pr} orgKind={user?.org?.kind} reload={res.reload} /></TabsContent>
              <TabsContent value="flats" className="mt-4"><FlatsTab p={pr} reload={res.reload} /></TabsContent>
              <TabsContent value="faults" className="mt-4"><FaultsTab p={pr} /></TabsContent>
              <TabsContent value="documents" className="mt-4"><DocumentsTab p={pr} /></TabsContent>
              <TabsContent value="charges" className="mt-4"><ChargesTab p={pr} /></TabsContent>
            </Tabs>
          </>
        )}
      </Gate>
    </>
  )
}
