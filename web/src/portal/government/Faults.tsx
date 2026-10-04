import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { api } from '@/console/api'
import type { Fault } from '@/console/types'
import { useRes } from '@/console/useRes'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader } from '@/portal/components/PageHeader'
import { ErrorAlert } from '@/portal/components/States'
import { StatusBadge } from '@/portal/components/Status'
import { TextAreaField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/portal/components/ui/dialog'
import { Form } from '@/portal/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/portal/components/ui/select'
import { useAction } from '@/portal/lib/actions'
import { usePageTitle } from './shared'

const ITEM: Record<string, string> = { cool_roof: 'Cool roof', heat_pump_hot_water: 'Heat pump hot water', reverse_cycle: 'Air conditioner', induction_cooktop: 'Induction cooktop', ceiling_insulation: 'Ceiling insulation' }
const schema = z.object({ note: z.string().trim().min(3, 'Say briefly what was done to fix it.').max(500, 'Keep the note under 500 characters.') })

export default function Faults() {
  usePageTitle('Faults')
  const [status, setStatus] = useState('all')
  const res = useRes(() => api.faults(), [])
  const [target, setTarget] = useState<Fault | null>(null)
  const act = useAction()
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { note: '' } })
  const data = useMemo(() => (res.data ?? []).filter((f) => status === 'all' || f.status === status), [res.data, status])

  const columns = useMemo<ColumnDef<Fault>[]>(
    () => [
      { accessorKey: 'opened_on', header: 'Reported' },
      { id: 'problem', header: 'Problem', accessorFn: (f) => `${ITEM[f.item] ?? f.item}: ${f.description}`, cell: ({ row }) => <span className="nsw-display-block mw-min-w-40 mw-ws-normal"><span className="nsw-text-medium">{ITEM[row.original.item] ?? row.original.item.replace(/_/g, ' ')}</span><br />{row.original.description}</span> },
      { id: 'where', header: 'Project and flat', accessorFn: (f) => `Project ${f.project_id}, flat ${f.flat_id}`, cell: ({ row }) => <Link to={`/government/projects/${row.original.project_id}/faults`}>Project {row.original.project_id}, flat {row.original.flat_id}</Link> },
      { accessorKey: 'reported_by', header: 'Reported by' },
      { id: 'status', header: 'Status', accessorFn: (f) => (f.status === 'open' ? 'Open' : 'Fixed'), cell: ({ row }) => <StatusBadge tone={row.original.status === 'open' ? 'warn' : 'good'}>{row.original.status === 'open' ? 'Open' : `Fixed ${row.original.resolved_on ?? ''}`}</StatusBadge> },
      { id: 'paused', header: 'Charge', accessorFn: (f) => (f.charge_paused ? 'Paused' : 'Running'), cell: ({ row }) => (row.original.charge_paused ? `Paused ${row.original.months_paused} months` : 'Running'), meta: { csv: (f: Fault) => (f.charge_paused ? 'Paused' : 'Running') } },
      {
        id: 'act',
        header: 'Action',
        enableSorting: false,
        meta: { label: 'Action', csv: () => '' },
        cell: ({ row }) =>
          row.original.status === 'open' ? (
            <Button size="sm" variant="outline" onClick={() => { form.reset({ note: '' }); act.clear(); setTarget(row.original) }} aria-label={`Resolve fault ${row.original.id}`}>
              Resolve
            </Button>
          ) : (
            'None'
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Faults' }]} title="Faults" description="When equipment fails, the flat's charge is paused until it is fixed. The paused months are covered from the reserve." />
      {res.error && <ErrorAlert error={res.error} onRetry={res.reload} title="We could not load faults" />}
      <DataTable
        columns={columns}
        data={data}
        caption="Faults"
        loading={res.data === null && !res.error}
        getRowId={(f) => String(f.id)}
        csvName="faults"
        searchPlaceholder="Search faults"
        emptyTitle="No faults"
        emptyText="Nothing has been reported."
        initialSort={[{ id: 'opened_on', desc: true }]}
        filters={
          <>
            <label htmlFor="fault-status" className="sr-only">
              Filter by status
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="fault-status" className="mw-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All faults</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Fixed</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve fault {target?.id}</DialogTitle>
            <DialogDescription>The charge starts again next month. The paused months are covered from the reserve and the term is not extended.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              noValidate
              className="mw-space-y-3"
              onSubmit={form.handleSubmit(async (v) => {
                if (!target) return
                const r = await act.run(() => api.resolveFault(target.id, v.note), 'Fault marked as fixed')
                if (r) {
                  setTarget(null)
                  res.reload()
                }
              })}
            >
              <TextAreaField control={form.control} name="note" label="What was done" />
              <ErrorAlert error={act.error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTarget(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={act.busy}>
                  {act.busy ? 'Saving' : 'Mark as fixed'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
