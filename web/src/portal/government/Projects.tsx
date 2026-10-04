import type { ColumnDef } from '@tanstack/react-table'
import { Plus } from '@/portal/components/icons'
import { cleanName } from '@/portal/lib/labels'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { api } from '@/console/api'
import type { Project, Stage } from '@/console/types'
import { STAGES } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money } from '@/format'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader } from '@/portal/components/PageHeader'
import { ErrorAlert } from '@/portal/components/States'
import { STAGE_LABEL, StageBadge, StatusBadge } from '@/portal/components/Status'
import { Button } from '@/portal/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/portal/components/ui/select'
import { saveText, toCsv } from '@/portal/lib/csv'
import { HEAT, ProjectLink, usePageTitle } from './shared'

export default function Projects() {
  usePageTitle('Projects')
  const res = useRes(() => api.projects(), [])
  const [stage, setStage] = useState('all')
  const data = useMemo(() => (res.data ?? []).filter((p) => stage === 'all' || p.stage === stage), [res.data, stage])

  const columns = useMemo<ColumnDef<Project>[]>(
    () => [
      { accessorKey: 'label', header: 'Block', cell: ({ row }) => <ProjectLink id={row.original.id} label={row.original.label} /> },
      { accessorKey: 'stage', header: 'Stage', cell: ({ row }) => <StageBadge stage={row.original.stage} />, meta: { csv: (p) => STAGE_LABEL[p.stage] } },
      { accessorKey: 'flats', header: 'Flats', meta: { numeric: true } },
      { accessorKey: 'heat_band', header: 'Heat', cell: ({ row }) => HEAT[row.original.heat_band] ?? row.original.heat_band },
      { id: 'owner', header: 'Owner', accessorFn: (p) => cleanName(p.owner_org?.name) },
      { id: 'capex', header: 'Net cost', accessorFn: (p) => p.summary.net_capex, cell: ({ getValue }) => money(getValue<number>()), meta: { numeric: true, csv: (p) => p.summary.net_capex } },
      { id: 'gap', header: 'Funding gap', accessorFn: (p) => p.summary.funding_gap, cell: ({ getValue }) => money(getValue<number>()), meta: { numeric: true, csv: (p) => p.summary.funding_gap } },
      { id: 'next', header: 'Next step', accessorFn: (p) => p.next_step, cell: ({ row }) => <span className="nsw-display-block mw-min-w-48 mw-ws-normal">{row.original.next_step}</span> },
      { id: 'blocked', header: 'Blockers', accessorFn: (p) => p.blocked_by.length, meta: { numeric: true, csv: (p) => p.blocked_by.join('; ') }, cell: ({ row }) => (row.original.blocked_by.length ? <StatusBadge tone="warn">{row.original.blocked_by.length}</StatusBadge> : 'None') },
      { id: 'flags', header: 'Flags', accessorFn: (p) => p.flags.join(', ').replace(/_/g, ' ') },
    ],
    [],
  )

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Government', to: '/government' }, { label: 'Projects' }]}
        title="Projects"
        description="Every block in the programme, with where it is up to and what is stopping it."
        actions={
          <Button asChild>
            <Link to="/government/projects/new">
              <Plus aria-hidden="true" /> Start a project
            </Link>
          </Button>
        }
      />
      {res.error && <ErrorAlert error={res.error} onRetry={res.reload} title="We could not load projects" />}
      <DataTable
        columns={columns}
        data={data}
        caption="Projects"
        loading={res.data === null && !res.error}
        getRowId={(p) => String(p.id)}
        selectable
        csvName="projects"
        searchPlaceholder="Search by address, owner or step"
        emptyTitle="No projects yet"
        emptyText="Start a project from a pilot building."
        initialHidden={{ gap: false, flags: false }}
        filters={
          <div className="nsw-display-flex nsw-flex-column mw-gap-1">
            <label htmlFor="stage-filter" className="sr-only">
              Filter by stage
            </label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger id="stage-filter" className="mw-w-44">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {STAGES.map((s: Stage) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        bulkActions={(rows, clear) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              saveText('selected-projects.csv', toCsv(['Id', 'Block', 'Stage', 'Flats', 'Next step'], rows.map((p) => [p.id, p.label, STAGE_LABEL[p.stage], p.flats, p.next_step])))
              clear()
            }}
          >
            Download selected
          </Button>
        )}
      />
    </div>
  )
}
