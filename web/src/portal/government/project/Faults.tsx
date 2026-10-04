import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/console/api'
import type { Fault } from '@/console/types'
import { useRes } from '@/console/useRes'
import { Confirm } from '@/portal/components/Confirm'
import { DataTable } from '@/portal/components/DataTable'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { Panel } from '@/portal/components/PageHeader'
import { StatusBadge } from '@/portal/components/Status'
import { SelectField, TextAreaField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/portal/components/ui/dialog'
import { Form } from '@/portal/components/ui/form'
import { Textarea } from '@/portal/components/ui/textarea'
import { useAction } from '@/portal/lib/actions'
import { dateLabelAu } from '@/portal/lib/dates'
import { canEdit, canManage } from './shared'
import type { TabProps } from './shared'

const ITEMS = [
  { value: 'heat_pump_hot_water', label: 'Heat pump hot water' },
  { value: 'reverse_cycle', label: 'Reverse-cycle air conditioner' },
  { value: 'cool_roof', label: 'Cool roof' },
  { value: 'other', label: 'Something else' },
]
const itemLabel = (k: string) => ITEMS.find((i) => i.value === k)?.label ?? k.replace(/_/g, ' ')

const schema = z.object({ flat_id: z.string().min(1, 'Choose the flat.'), item: z.string().min(1, 'Choose what is wrong.'), description: z.string().trim().min(5, 'Say what is wrong, in a few words.').max(1000, 'Keep it under 1000 characters.') })

function ReportDialog({ p, onDone }: { p: TabProps['p']; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const act = useAction()
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { flat_id: '', item: '', description: '' } })
  const submit = form.handleSubmit(async (v) => {
    const r = await act.run(() => api.reportFault(Number(v.flat_id), v.item, v.description), 'Fault reported. The flat\'s charge is paused from this month.')
    if (r) {
      setOpen(false)
      form.reset()
      onDone()
    }
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Report a fault</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a fault</DialogTitle>
          <DialogDescription>Reporting a fault pauses that flat's charge from this month until it is fixed.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="mw-space-y-3" noValidate onSubmit={(e) => e.preventDefault()}>
            <SelectField control={form.control} name="flat_id" label="Flat" options={p.flats_list.map((f) => ({ value: String(f.id), label: `Flat ${f.unit}` }))} />
            <SelectField control={form.control} name="item" label="What is wrong" options={ITEMS} />
            <TextAreaField control={form.control} name="description" label="Describe the problem" />
            <ErrorAlert error={act.error} title="We could not report the fault" />
            <Confirm title="Report this fault?" description="The charge on that flat's meter will be paused until the fault is fixed." confirmLabel="Report fault" onConfirm={() => void submit()}>
              <Button type="button" disabled={act.busy}>
                {act.busy ? 'Reporting' : 'Report fault'}
              </Button>
            </Confirm>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function ResolveDialog({ fault, onDone }: { fault: Fault; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const act = useAction()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`Resolve fault ${fault.id}: ${fault.description}`}>
          Resolve
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark this fault as fixed</DialogTitle>
          <DialogDescription>
            {itemLabel(fault.item)}: {fault.description}. The charge starts again next month. The paused months are covered from the reserve and the term is not extended.
          </DialogDescription>
        </DialogHeader>
        <div className="mw-space-y-1">
          <label htmlFor={`rn-${fault.id}`} className="nsw-small nsw-text-medium">
            What was done
          </label>
          <Textarea id={`rn-${fault.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} aria-invalid={!!err} aria-describedby={err ? `rn-err-${fault.id}` : undefined} />
          {err && (
            <p id={`rn-err-${fault.id}`} className="nsw-small mw-text-danger">
              {err}
            </p>
          )}
        </div>
        <ErrorAlert error={act.error} title="We could not resolve the fault" />
        <Confirm
          title="Mark as fixed?"
          description="The paused charge resumes next month."
          confirmLabel="Mark as fixed"
          onConfirm={async () => {
            if (note.trim().length < 3) {
              setErr('Say briefly what was done.')
              return
            }
            setErr(null)
            const r = await act.run(() => api.resolveFault(fault.id, note.trim()), 'Fault marked as fixed')
            if (r) {
              setOpen(false)
              onDone()
            }
          }}
        >
          <Button type="button" disabled={act.busy}>
            Mark as fixed
          </Button>
        </Confirm>
      </DialogContent>
    </Dialog>
  )
}

export default function Faults(props: TabProps) {
  const { p, role, onChange } = props
  const res = useRes(() => api.faults({ project_id: p.id }), [p.id])
  const unit = (id: number) => p.flats_list.find((f) => f.id === id)?.unit ?? String(id)
  const refresh = () => {
    res.reload()
    void api.project(p.id).then(onChange)
  }
  return (
    <Panel
      title="Faults"
      description="When equipment fails, the flat's charge is paused until it is fixed."
      actions={canEdit(role) ? <ReportDialog p={p} onDone={refresh} /> : undefined}
    >
      <Gate res={res} rows={3}>
        {(faults) => (
          <DataTable<Fault>
            caption="Faults"
            data={faults}
            getRowId={(f) => String(f.id)}
            csvName={`project-${p.id}-faults`}
            searchPlaceholder="Search faults"
            emptyTitle="No faults"
            emptyText="Nothing has been reported for this block."
            initialSort={[{ id: 'opened', desc: true }]}
            columns={[
              { id: 'opened', header: 'Reported', accessorFn: (f) => f.opened_on, cell: ({ row }) => <>{dateLabelAu(row.original.opened_on)}<div className="nsw-small mw-text-muted">by {row.original.reported_by}</div></>, meta: { csv: (f) => f.opened_on } },
              { id: 'flat', header: 'Flat', accessorFn: (f) => unit(f.flat_id) },
              { id: 'item', header: 'Problem', accessorFn: (f) => `${itemLabel(f.item)} ${f.description}`, cell: ({ row }) => <><span className="nsw-text-medium">{itemLabel(row.original.item)}</span><div>{row.original.description}</div></>, meta: { csv: (f) => `${itemLabel(f.item)}: ${f.description}` } },
              {
                id: 'status',
                header: 'Status',
                accessorFn: (f) => f.status,
                cell: ({ row }) => (
                  <>
                    {row.original.status === 'open' ? <StatusBadge tone="warn">Open</StatusBadge> : <StatusBadge tone="good">Fixed {dateLabelAu(row.original.resolved_on)}</StatusBadge>}
                    {row.original.charge_paused && <div className="nsw-small mw-text-muted">Charge paused{row.original.months_paused ? `, ${row.original.months_paused} months` : ''}</div>}
                  </>
                ),
              },
              ...(canManage(role)
                ? [
                    {
                      id: 'act',
                      header: () => <span className="sr-only">Actions</span>,
                      enableSorting: false,
                      enableHiding: false,
                      meta: { label: 'Actions' },
                      cell: ({ row }: { row: { original: Fault } }) => (row.original.status === 'open' ? <ResolveDialog fault={row.original} onDone={refresh} /> : null),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Gate>
    </Panel>
  )
}
