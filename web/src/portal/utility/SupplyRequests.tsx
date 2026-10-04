import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { utilityApi } from '@/console/api-utility'
import type { SupplyRequest, SupplyStatus } from '@/console/types-utility'
import { useRes } from '@/console/useRes'
import { DataTable } from '@/portal/components/DataTable'
import { SelectField, TextAreaField } from '@/portal/components/fields'
import { PageHeader } from '@/portal/components/PageHeader'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { StatusBadge } from '@/portal/components/Status'
import type { Tone } from '@/portal/components/Status'
import { Button } from '@/portal/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/portal/components/ui/dialog'
import { Form } from '@/portal/components/ui/form'
import { useAction } from '@/portal/lib/actions'
import { ConfirmDialog } from './shared'

const STATUS: Record<SupplyStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'warn' },
  approved: { label: 'Approved', tone: 'good' },
  not_needed: { label: 'Not needed', tone: 'neutral' },
  completed: { label: 'Completed', tone: 'good' },
}
const KIND: Record<string, string> = { switchboard_upgrade: 'Switchboard upgrade', supply_upgrade: 'Supply upgrade' }

const schema = z.object({
  status: z.enum(['open', 'approved', 'not_needed', 'completed'], { message: 'Choose a status.' }),
  response: z.string().trim().min(1, 'Write a short response for the programme.').max(1000, 'Keep the response under 1000 characters.'),
})
type Values = z.infer<typeof schema>

export default function SupplyRequests() {
  useEffect(() => {
    document.title = 'Supply requests | Meterwise'
  }, [])
  const res = useRes(() => utilityApi.supply(), [])
  const [edit, setEdit] = useState<SupplyRequest | null>(null)

  const columns = useMemo<ColumnDef<SupplyRequest>[]>(
    () => [
      { accessorKey: 'label', header: 'Building', cell: (c) => c.getValue<string>() ?? '' },
      { accessorKey: 'kind', header: 'Kind', cell: (c) => KIND[c.getValue<string>()] ?? c.getValue<string>(), meta: { csv: (r) => KIND[r.kind] ?? r.kind } },
      { accessorKey: 'detail', header: 'What was found' },
      { accessorKey: 'raised_on', header: 'Raised' },
      { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge tone={STATUS[c.getValue<SupplyStatus>()].tone}>{STATUS[c.getValue<SupplyStatus>()].label}</StatusBadge>, meta: { csv: (r) => STATUS[r.status].label } },
      { accessorKey: 'response', header: 'Your response', cell: (c) => c.getValue<string | null>() ?? '-' },
      {
        id: 'action',
        header: () => <span className="sr-only">Action</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { label: 'Action' },
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => setEdit(row.original)} aria-label={`Respond to the request for ${row.original.label ?? 'project ' + row.original.project_id}`}>
            Respond
          </Button>
        ),
      },
    ],
    [],
  )

  return (
    <>
      <PageHeader crumbs={[{ label: 'Utility', to: '/utility' }, { label: 'Supply requests' }]} title="Supply requests" description="Raised when the sizing says a building's switchboard or supply is likely to need an upgrade. Say whether it is approved." />
      <Gate res={res} rows={5}>
        {(rows) => (
          <DataTable
            columns={columns}
            data={rows}
            caption="Supply requests"
            csvName="supply-requests"
            searchPlaceholder="Search requests"
            getRowId={(r) => String(r.id)}
            initialSort={[{ id: 'status', desc: false }]}
            emptyTitle="No supply requests"
            emptyText="A request appears here when the sizing for a project says an upgrade is likely."
          />
        )}
      </Gate>
      {edit && (
        <RespondDialog
          s={edit}
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

function RespondDialog({ s, onClose, onSaved }: { s: SupplyRequest; onClose: () => void; onSaved: () => void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { status: s.status, response: s.response ?? '' } })
  const act = useAction()
  const [pending, setPending] = useState<Values | null>(null)
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Respond to the supply request</DialogTitle>
            <DialogDescription>
              {s.label ?? `Project ${s.project_id}`}. {s.detail}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form className="space-y-3" noValidate onSubmit={form.handleSubmit((v) => setPending(v))}>
              <SelectField control={form.control} name="status" label="Status" options={(Object.keys(STATUS) as SupplyStatus[]).map((k) => ({ value: k, label: STATUS[k].label }))} />
              <TextAreaField control={form.control} name="response" label="Response" description="Plain words the programme can act on." />
              <ErrorAlert error={act.error} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={act.busy}>
                  Send response
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Send this response?"
        confirmLabel="Send"
        description={<p>The request will be marked {pending ? STATUS[pending.status].label.toLowerCase() : ''}. The programme will see your response straight away.</p>}
        onConfirm={async () => {
          const v = pending
          setPending(null)
          if (!v) return
          const r = await act.run(() => utilityApi.updateSupply(s.id, v), 'Response sent')
          if (r) onSaved()
        }}
      />
    </>
  )
}
