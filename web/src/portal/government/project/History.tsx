import { api } from '@/console/api'
import type { AuditLogEntry } from '@/console/types'
import { useRes } from '@/console/useRes'
import { DataTable } from '@/portal/components/DataTable'
import { Gate } from '@/portal/components/States'
import { Panel } from '@/portal/components/PageHeader'
import { STAGE_LABEL } from '@/portal/components/Status'
import { dateLabelAu } from '@/portal/lib/dates'
import type { TabProps } from './shared'

export default function History({ p }: TabProps) {
  const res = useRes<AuditLogEntry[]>(() => api.auditLog({ project_id: p.id, limit: 500 }), [p.id])
  const stages = [...p.stage_history].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <div className="mw-space-y-4">
      <Panel title="Stage history">
        <DataTable
          caption="Stage history"
          data={stages}
          getRowId={(s, i) => `${s.stage}-${i}`}
          searchPlaceholder="Search stage history"
          emptyTitle="No stage changes yet"
          columns={[
            { id: 'at', header: 'When', accessorFn: (s) => s.at, cell: ({ row }) => dateLabelAu(row.original.at), meta: { csv: (s) => s.at } },
            { id: 'stage', header: 'Stage', accessorFn: (s) => STAGE_LABEL[s.stage as keyof typeof STAGE_LABEL] ?? s.stage },
            { accessorKey: 'by', header: 'By' },
            { accessorKey: 'note', header: 'Note' },
          ]}
        />
      </Panel>
      <Panel title="Audit log" description="Every change to this project, newest first. The log cannot be edited.">
        <Gate res={res} rows={4}>
          {(rows) => (
            <DataTable<AuditLogEntry>
              caption="Audit log"
              data={rows}
              getRowId={(r, i) => `${r.at}-${i}`}
              csvName={`project-${p.id}-audit-log`}
              searchPlaceholder="Search the audit log"
              emptyTitle="Nothing logged yet"
              initialSort={[{ id: 'at', desc: true }]}
              columns={[
                { id: 'at', header: 'When', accessorFn: (r) => r.at, cell: ({ row }) => row.original.at.replace('T', ' ').slice(0, 16), meta: { csv: (r) => r.at } },
                { accessorKey: 'by', header: 'Who' },
                { accessorKey: 'role', header: 'Role' },
                { id: 'action', header: 'What', accessorFn: (r) => r.action.replace(/_/g, ' ') },
                { accessorKey: 'detail', header: 'Detail' },
              ]}
            />
          )}
        </Gate>
      </Panel>
    </div>
  )
}
