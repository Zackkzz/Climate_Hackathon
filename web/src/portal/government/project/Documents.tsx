import { ExternalLink } from 'lucide-react'
import { api } from '@/console/api'
import type { Doc } from '@/console/types'
import { useRes } from '@/console/useRes'
import { DataTable } from '@/portal/components/DataTable'
import { Gate } from '@/portal/components/States'
import { Panel } from '@/portal/components/PageHeader'
import { Button } from '@/portal/components/ui/button'
import { useAction } from '@/portal/lib/actions'
import { openHtmlTab } from '@/portal/lib/csv'
import { dateLabelAu } from '@/portal/lib/dates'
import { ErrorAlert } from '@/portal/components/States'
import type { TabProps } from './shared'

/** The documents for a project. Each opens as a printable page in a new tab. */
export function DocumentList({ projectId, flatLabels }: { projectId: number; flatLabels?: Record<number, string> }) {
  const res = useRes<Doc[]>(() => api.documents(projectId), [projectId])
  const act = useAction()
  const open = async (d: Doc) => {
    const html = await act.run(() => api.documentHtml(d.url))
    if (html) openHtmlTab(html)
  }
  return (
    <Gate res={res} rows={3}>
      {(docs) => (
        <div className="space-y-2">
          <ErrorAlert error={act.error} title="We could not open the document" />
          <DataTable<Doc>
            caption="Documents"
            data={docs}
            getRowId={(d) => `${d.kind}-${d.flat_id ?? 'all'}`}
            emptyTitle="No documents yet"
            emptyText="Documents are made when the offer is issued."
            searchPlaceholder="Search documents"
            csvName={`project-${projectId}-documents`}
            columns={[
              { accessorKey: 'title', header: 'Document', cell: ({ row }) => <span className="font-medium">{row.original.title}</span> },
              { id: 'flat', header: 'Flat', accessorFn: (d) => (d.flat_id ? flatLabels?.[d.flat_id] ?? `Flat ${d.flat_id}` : 'Whole block'), meta: { label: 'Flat' } },
              { id: 'when', header: 'Made', accessorFn: (d) => dateLabelAu(d.generated_at), meta: { csv: (d) => d.generated_at } },
              {
                id: 'open',
                header: () => <span className="sr-only">Open</span>,
                enableSorting: false,
                enableHiding: false,
                meta: { label: 'Open' },
                cell: ({ row }) => (
                  <Button variant="outline" size="sm" disabled={act.busy} onClick={() => void open(row.original)} aria-label={`Open ${row.original.title} in a new tab`}>
                    Open <ExternalLink aria-hidden="true" />
                  </Button>
                ),
              },
            ]}
          />
        </div>
      )}
    </Gate>
  )
}

export default function Documents({ p }: TabProps) {
  const labels: Record<number, string> = {}
  for (const f of p.flats_list) labels[f.id] = `Flat ${f.unit}`
  return (
    <Panel title="Documents" description="Printable pages. They summarise the agreement and are not legal or financial advice. Please have your own adviser review them.">
      <DocumentList projectId={p.id} flatLabels={labels} />
    </Panel>
  )
}
