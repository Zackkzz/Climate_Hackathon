import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { api } from '@/console/api'
import { govApi } from '@/console/api-gov'
import { useUser } from '@/console/auth'
import type { Grant } from '@/console/types-gov'
import { useRes } from '@/console/useRes'
import { money } from '@/format'
import { DataTable } from '@/portal/components/DataTable'
import { Figures, PageHeader } from '@/portal/components/PageHeader'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { StatusBadge } from '@/portal/components/Status'
import type { Tone } from '@/portal/components/Status'
import { NumberField, SelectField, TextAreaField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/portal/components/ui/dialog'
import { Form } from '@/portal/components/ui/form'
import { useAction } from '@/portal/lib/actions'
import { Confirm } from '@/portal/components/Confirm'
import { toast } from 'sonner'

const TONE: Record<Grant['status'], Tone> = { requested: 'warn', approved: 'good', declined: 'bad', paid: 'info' }
const WORD: Record<Grant['status'], string> = { requested: 'Waiting for a decision', approved: 'Approved', declined: 'Declined', paid: 'Paid' }

const decideSchema = z.object({ approved: z.coerce.number({ message: 'Enter an amount.' }).min(1, 'Enter an amount of at least $1.'), note: z.string().trim().max(500, 'Keep the note under 500 characters.').optional() })
const requestSchema = z.object({
  project_id: z.string().min(1, 'Choose a project.'),
  requested: z.coerce.number({ message: 'Enter an amount.' }).min(1, 'Enter an amount of at least $1.'),
  reason: z.string().trim().min(3, 'Say why the grant is needed.').max(500, 'Keep the reason under 500 characters.'),
})

function Decide({ grant, left, onClose, onDone }: { grant: Grant; left: number; onClose: () => void; onDone: () => void }) {
  const act = useAction()
  const form = useForm<z.input<typeof decideSchema>, unknown, z.output<typeof decideSchema>>({ resolver: zodResolver(decideSchema), defaultValues: { approved: grant.requested, note: '' } })
  const amount = Number(form.watch('approved')) || 0
  const submit = (status: 'approved' | 'declined') => async () => {
    const v = decideSchema.safeParse(form.getValues())
    if (status === 'approved' && !v.success) {
      await form.trigger()
      return
    }
    const r = await act.run(() => govApi.decideGrant(grant.id, status, status === 'approved' && v.success ? v.data.approved : 0, v.success ? v.data.note ?? '' : ''), status === 'approved' ? 'Grant approved' : 'Grant declined')
    if (r) {
      onDone()
      onClose()
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decide on grant {grant.id}</DialogTitle>
          <DialogDescription>
            Project {grant.project_id}. Asked for {money(grant.requested)}. {money(left)} is left in the grant pool. {grant.reason}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-3" noValidate onSubmit={(e) => e.preventDefault()}>
            <NumberField control={form.control} name="approved" label="Amount to approve ($)" min={1} step={100} description={amount > left ? 'This is more than is left in the pool, so it will be refused.' : undefined} />
            <TextAreaField control={form.control} name="note" label="Note (optional)" />
            <ErrorAlert error={act.error} title="We could not record the decision" />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Confirm title="Decline this grant?" description="The request is closed and the project will have to find the money elsewhere." confirmLabel="Decline grant" destructive onConfirm={submit('declined')}>
                <Button type="button" variant="outline" disabled={act.busy}>
                  Decline
                </Button>
              </Confirm>
              <Confirm title={`Approve ${money(amount)}?`} description={`This takes ${money(amount)} from the grant pool and sets it as the project's grant.`} confirmLabel="Approve grant" onConfirm={submit('approved')}>
                <Button type="button" disabled={act.busy || !(amount > 0)}>
                  Approve
                </Button>
              </Confirm>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function Request({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const act = useAction()
  const projects = useRes(() => api.projects(), [])
  const form = useForm<z.input<typeof requestSchema>, unknown, z.output<typeof requestSchema>>({ resolver: zodResolver(requestSchema), defaultValues: { project_id: '', requested: '' as unknown as number, reason: '' } })
  const [pending, setPending] = useState<z.output<typeof requestSchema> | null>(null)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a grant</DialogTitle>
          <DialogDescription>{pending ? `Send a request for ${money(pending.requested)} to state or council oversight?` : 'Ask for grant money to close the funding gap on a project.'}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="space-y-3"
            noValidate
            onSubmit={form.handleSubmit(async (v) => {
              if (!pending) {
                setPending(v)
                return
              }
              const r = await act.run(() => govApi.requestGrant(Number(v.project_id), v.requested, v.reason), 'Grant requested')
              if (r) {
                onDone()
                onClose()
              } else toast.error('The request was not sent.')
            })}
          >
            {!pending && (
              <>
                <SelectField control={form.control} name="project_id" label="Project" options={(projects.data ?? []).map((p) => ({ value: String(p.id), label: `${p.label} (funding gap ${money(p.summary.funding_gap)})` }))} placeholder={projects.loading ? 'Loading projects' : 'Choose a project'} />
                <NumberField control={form.control} name="requested" label="Amount ($)" min={1} step={100} />
                <TextAreaField control={form.control} name="reason" label="Reason" />
              </>
            )}
            <ErrorAlert error={act.error} title="We could not send the request" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => (pending ? setPending(null) : onClose())}>
                {pending ? 'Back' : 'Cancel'}
              </Button>
              <Button type="submit" disabled={act.busy}>
                {pending ? (act.busy ? 'Sending' : 'Confirm and send') : 'Review request'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default function Grants() {
  const user = useUser()
  const res = useRes(() => govApi.grants(), [])
  const out = useRes(() => govApi.outcomes(), [])
  const [deciding, setDeciding] = useState<Grant | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [status, setStatus] = useState('all')
  const isGov = user?.role === 'government'
  useEffect(() => {
    document.title = 'Grants | Government | Meterwise'
  }, [])

  const left = out.data ? out.data.money.grant_committed - out.data.money.grant_spent : 0
  const cols = useMemo<ColumnDef<Grant>[]>(
    () => [
      {
        id: 'action',
        header: () => <span className="sr-only">Action</span>,
        enableHiding: false,
        enableSorting: false,
        meta: { label: 'Action', csv: () => '' },
        cell: ({ row }) => (isGov && row.original.status === 'requested' ? <Button size="sm" onClick={() => setDeciding(row.original)}>Decide</Button> : null),
      },
      { accessorKey: 'id', header: 'Grant', meta: { numeric: true } },
      { accessorKey: 'project_id', header: 'Project', cell: (c) => <Link to={`/government/projects/${c.getValue<number>()}`}>Project {c.getValue<number>()}</Link>, meta: { csv: (r) => r.project_id } },
      { accessorKey: 'requested', header: 'Requested', meta: { numeric: true }, cell: (c) => money(c.getValue<number>()) },
      { accessorKey: 'approved', header: 'Approved', meta: { numeric: true }, cell: (c) => (c.getValue<number | null>() === null ? '-' : money(c.getValue<number>())) },
      { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge tone={TONE[c.getValue<Grant['status']>()]}>{WORD[c.getValue<Grant['status']>()]}</StatusBadge>, meta: { csv: (r) => r.status } },
      { accessorKey: 'reason', header: 'Reason' },
      { accessorKey: 'requested_on', header: 'Requested on' },
      { accessorKey: 'decided_on', header: 'Decided on', cell: (c) => c.getValue<string | null>() ?? '-' },
      { accessorKey: 'decided_by', header: 'Decided by', cell: (c) => c.getValue<string | null>() ?? '-' },
    ],
    [isGov],
  )

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Government', to: '/government' }, { label: 'Grants' }]}
        title="Grants"
        description={isGov ? 'Requests from programme officers waiting for your decision come first.' : 'Request grant money for a project. State or council oversight decides.'}
        actions={user?.role === 'manager' && <Button onClick={() => setRequesting(true)}>Request a grant</Button>}
      />
      <Gate res={res} rows={6}>
        {(g) => {
          const shown = status === 'all' ? g : g.filter((x) => x.status === status)
          const sorted = [...shown].sort((a, b) => Number(b.status === 'requested') - Number(a.status === 'requested') || b.id - a.id)
          const waiting = g.filter((x) => x.status === 'requested')
          return (
            <>
              <Figures
                label="Grant pool"
                items={[
                  { label: 'Waiting for a decision', value: waiting.length, note: money(waiting.reduce((s, x) => s + x.requested, 0)), tone: waiting.length ? 'warn' : undefined },
                  { label: 'Left in the pool', value: out.data ? money(left) : '...', note: out.data ? `of ${money(out.data.money.grant_committed)}` : undefined },
                  { label: 'Approved or paid', value: g.filter((x) => x.status === 'approved' || x.status === 'paid').length },
                  { label: 'Declined', value: g.filter((x) => x.status === 'declined').length },
                ]}
              />
              <DataTable
                columns={cols}
                data={sorted}
                caption="Grants"
                csvName="grants"
                getRowId={(r) => String(r.id)}
                initialHidden={{ id: false, decided_by: false }}
                searchPlaceholder="Search grants"
                emptyTitle="No grants yet"
                emptyText="Grant requests appear here."
                filters={
                  <div className="flex items-center gap-2">
                    <label htmlFor="g-status" className="text-sm text-muted-foreground">
                      Status
                    </label>
                    <select id="g-status" className="h-9 border border-input bg-background px-2 text-base" value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="all">All</option>
                      <option value="requested">Waiting for a decision</option>
                      <option value="approved">Approved</option>
                      <option value="declined">Declined</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                }
              />
            </>
          )
        }}
      </Gate>
      {deciding && <Decide grant={deciding} left={left} onClose={() => setDeciding(null)} onDone={() => { res.reload(); out.reload() }} />}
      {requesting && <Request onClose={() => setRequesting(false)} onDone={res.reload} />}
    </>
  )
}
