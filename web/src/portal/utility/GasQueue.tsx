import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { utilityApi } from '@/console/api-utility'
import type { GasDisconnection, GasStatus } from '@/console/types-utility'
import { useRes } from '@/console/useRes'
import { DataTable } from '@/portal/components/DataTable'
import { DateField, SelectField, TextAreaField } from '@/portal/components/fields'
import { PageHeader } from '@/portal/components/PageHeader'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { StatusBadge } from '@/portal/components/Status'
import type { Tone } from '@/portal/components/Status'
import { Button } from '@/portal/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/portal/components/ui/dialog'
import { Form } from '@/portal/components/ui/form'
import { useAction } from '@/portal/lib/actions'
import { ConfirmDialog } from './shared'

const STATUS: Record<GasStatus, { label: string; tone: Tone }> = {
  requested: { label: 'Requested', tone: 'warn' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  completed: { label: 'Completed', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

const schema = z
  .object({
    status: z.enum(['requested', 'scheduled', 'completed', 'cancelled'], { message: 'Choose a status.' }),
    scheduled_for: z.string().optional(),
    note: z.string().max(500, 'Keep the note under 500 characters.').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'scheduled' && !/^\d{4}-\d{2}-\d{2}$/.test(v.scheduled_for ?? '')) ctx.addIssue({ code: 'custom', path: ['scheduled_for'], message: 'Enter the date the work is scheduled for, like 2027-03-20.' })
    if (v.scheduled_for && !/^\d{4}-\d{2}-\d{2}$/.test(v.scheduled_for)) ctx.addIssue({ code: 'custom', path: ['scheduled_for'], message: 'Use the format 2027-03-20.' })
  })
type Values = z.infer<typeof schema>

export default function GasQueue() {
  useEffect(() => {
    document.title = 'Gas disconnections | Meterwise'
  }, [])
  const res = useRes(() => utilityApi.gas(), [])
  const [edit, setEdit] = useState<GasDisconnection | null>(null)

  const columns = useMemo<ColumnDef<GasDisconnection>[]>(
    () => [
      { accessorKey: 'label', header: 'Building', cell: (c) => c.getValue<string>() ?? '' },
      { accessorKey: 'meters', header: 'Gas meters', meta: { numeric: true } },
      { accessorKey: 'requested_on', header: 'Requested' },
      { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge tone={STATUS[c.getValue<GasStatus>()].tone}>{STATUS[c.getValue<GasStatus>()].label}</StatusBadge>, meta: { csv: (r) => STATUS[r.status].label } },
      { accessorKey: 'scheduled_for', header: 'Scheduled for', cell: (c) => c.getValue<string | null>() ?? '-' },
      { accessorKey: 'completed_on', header: 'Completed', cell: (c) => c.getValue<string | null>() ?? '-' },
      { accessorKey: 'note', header: 'Note' },
      {
        id: 'action',
        header: () => <span className="sr-only">Action</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { label: 'Action' },
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => setEdit(row.original)} aria-label={`Update the request for ${row.original.label ?? 'project ' + row.original.project_id}`}>
            Update
          </Button>
        ),
      },
    ],
    [],
  )

  return (
    <>
      <PageHeader crumbs={[{ label: 'Utility', to: '/utility' }, { label: 'Gas disconnections' }]} title="Gas disconnections" description="Requests raised when a building replaces its gas appliances. Schedule the work and mark it done." />
      <Gate res={res} rows={5}>
        {(rows) => (
          <DataTable
            columns={columns}
            data={rows}
            caption="Gas disconnections"
            csvName="gas-disconnections"
            searchPlaceholder="Search requests"
            getRowId={(r) => String(r.id)}
            initialSort={[{ id: 'requested_on', desc: true }]}
            emptyTitle="No gas disconnections"
            emptyText="A request appears here when a project that removes gas is commissioned."
          />
        )}
      </Gate>
      {edit && (
        <EditDialog
          g={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            res.reload()
          }}
        />
      )}
    </>
  )
}

function EditDialog({ g, onClose, onSaved }: { g: GasDisconnection; onClose: () => void; onSaved: () => void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { status: g.status, scheduled_for: g.scheduled_for ?? '', note: g.note ?? '' } })
  const act = useAction()
  const [pending, setPending] = useState<Values | null>(null)
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update gas disconnection</DialogTitle>
            <DialogDescription>
              {g.label ?? `Project ${g.project_id}`}, {g.meters} gas meters.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form className="mw-space-y-3" noValidate onSubmit={form.handleSubmit((v) => setPending(v))}>
              <SelectField
                control={form.control}
                name="status"
                label="Status"
                options={(Object.keys(STATUS) as GasStatus[]).map((k) => ({ value: k, label: STATUS[k].label }))}
              />
              <DateField control={form.control} name="scheduled_for" label="Scheduled for" description="Needed when the status is Scheduled." />
              <TextAreaField control={form.control} name="note" label="Note" />
              <ErrorAlert error={act.error} />
              <div className="nsw-display-flex nsw-justify-content-end mw-gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={act.busy}>
                  Save
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Save this change?"
        confirmLabel="Save"
        description={<p>The status will change to {pending ? STATUS[pending.status].label.toLowerCase() : ''}. The programme will see this straight away.</p>}
        onConfirm={async () => {
          const v = pending
          setPending(null)
          if (!v) return
          const r = await act.run(() => utilityApi.updateGas(g.id, { status: v.status, scheduled_for: v.scheduled_for || undefined, note: v.note || undefined }), 'Gas disconnection updated')
          if (r) onSaved()
        }}
      />
    </>
  )
}
