import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/console/api'
import { useUser } from '@/console/auth'
import type { Fault, ProjectDetail, Quote, Tender } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money } from '@/format'
import { Confirm } from '@/portal/components/Confirm'
import { DataTable } from '@/portal/components/DataTable'
import { PageHeader, Panel } from '@/portal/components/PageHeader'
import { EmptyState, ErrorAlert, Gate } from '@/portal/components/States'
import { StageBadge, StatusBadge } from '@/portal/components/Status'
import { DateField, NumberField, TextAreaField, TextField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Checkbox } from '@/portal/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/portal/components/ui/dialog'
import { Form } from '@/portal/components/ui/form'
import { Input } from '@/portal/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/portal/components/ui/tabs'
import { useAction } from '@/portal/lib/actions'
import { dateLabel, itemLabel } from '@/portal/lib/dates-p2'

interface Loaded {
  tenders: Tender[]
  projects: ProjectDetail[]
  faults: Fault[]
}

async function load(): Promise<Loaded> {
  const [tenders, list, faults] = await Promise.all([api.tenders(), api.projects(), api.faults()])
  const projects = await Promise.all(list.map((p) => api.project(p.id)))
  return { tenders, projects, faults }
}

const quoteSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        qty: z.coerce.number({ message: 'Enter a quantity.' }).int('Use a whole number.').min(1, 'At least 1.'),
        unit_price: z.coerce.number({ message: 'Enter a price.' }).min(0, 'The price cannot be negative.'),
      }),
    )
    .min(1, 'Add at least one line.'),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date like 2026-12-31.'),
  note: z.string().max(1000, 'Keep the note under 1000 characters.').optional(),
})
type QuoteValues = z.input<typeof quoteSchema>

function plus60(): string {
  const d = new Date()
  d.setDate(d.getDate() + 60)
  return d.toISOString().slice(0, 10)
}

function QuoteDialog({ tender, onClose, onDone }: { tender: Tender; onClose: () => void; onDone: () => void }) {
  const act = useAction()
  const form = useForm<QuoteValues, unknown, z.output<typeof quoteSchema>>({
    resolver: zodResolver(quoteSchema),
    defaultValues: { items: tender.items.map((i) => ({ key: i.key, label: i.label, qty: i.qty, unit_price: i.modelled_unit_price })), valid_until: plus60(), note: '' },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const watched = form.watch('items')
  const total = watched.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0)
  const modelled = tender.items.reduce((s, i) => s + i.qty * i.modelled_unit_price, 0)
  const diff = total - modelled
  const submit = form.handleSubmit(async (v) => {
    const r = await act.run(() => api.submitQuote(tender.project.id, { items: v.items.map((i) => ({ key: i.key, label: i.label, qty: i.qty, unit_price: i.unit_price })), valid_until: v.valid_until, note: v.note ?? '' }), 'Quote submitted')
    if (r) {
      onDone()
      onClose()
    }
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Quote for {tender.project.label}</DialogTitle>
          <DialogDescription>Prices start at the modelled unit prices. Change them to your own. The quote is open until the date you set.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-3" noValidate onSubmit={(e) => e.preventDefault()}>
            <div className="overflow-x-auto" role="region" aria-label="Quote lines" tabIndex={0}>
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="p-1 font-semibold">Item</th>
                    <th className="p-1 font-semibold">Quantity</th>
                    <th className="p-1 font-semibold">Unit price ($)</th>
                    <th className="p-1 text-right font-semibold">Line total</th>
                    <th className="p-1">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, i) => (
                    <tr key={f.id} className="align-top">
                      <td className="p-1">
                        <TextField control={form.control} name={`items.${i}.label`} label={`Item ${i + 1} name`} />
                      </td>
                      <td className="w-24 p-1">
                        <NumberField control={form.control} name={`items.${i}.qty`} label={`Item ${i + 1} quantity`} min={1} />
                      </td>
                      <td className="w-32 p-1">
                        <NumberField control={form.control} name={`items.${i}.unit_price`} label={`Item ${i + 1} unit price`} min={0} />
                      </td>
                      <td className="p-1 pt-8 text-right tabular-nums">{money((Number(watched[i]?.qty) || 0) * (Number(watched[i]?.unit_price) || 0))}</td>
                      <td className="p-1 pt-6">
                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label={`Remove item ${i + 1}`}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {form.formState.errors.items?.message && <p role="alert" className="text-destructive">{form.formState.errors.items.message}</p>}
            <Button type="button" variant="outline" size="sm" onClick={() => append({ key: 'other', label: 'Other work', qty: 1, unit_price: 0 })}>
              <Plus aria-hidden="true" /> Add a line
            </Button>
            <dl className="grid grid-cols-3 gap-px border bg-border text-sm" aria-label="Quote totals">
              <div className="bg-card p-2">
                <dt className="text-muted-foreground">Your total</dt>
                <dd className="text-lg font-semibold tabular-nums">{money(total)}</dd>
              </div>
              <div className="bg-card p-2">
                <dt className="text-muted-foreground">Modelled cost</dt>
                <dd className="text-lg font-semibold tabular-nums">{money(modelled)}</dd>
              </div>
              <div className="bg-card p-2">
                <dt className="text-muted-foreground">Difference</dt>
                <dd className={'text-lg font-semibold tabular-nums ' + (diff > 0 ? 'text-warning' : 'text-success')}>
                  {diff > 0 ? '+' : diff < 0 ? '-' : ''}
                  {money(Math.abs(diff))} {diff > 0 ? 'over' : diff < 0 ? 'under' : ''}
                </dd>
              </div>
            </dl>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField control={form.control} name="valid_until" label="Quote valid until" />
            </div>
            <TextAreaField control={form.control} name="note" label="Note (optional)" />
            <ErrorAlert error={act.error} title="We could not submit the quote" />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Confirm title="Submit this quote?" description={`You are quoting ${money(total)} for ${tender.project.label}. You can withdraw it only by contacting the programme office.`} confirmLabel="Submit quote" onConfirm={() => submit()}>
                <Button type="button" disabled={act.busy}>
                  {act.busy ? 'Submitting' : 'Submit quote'}
                </Button>
              </Confirm>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function Tenders({ d, reload }: { d: Loaded; reload: () => void }) {
  const [open, setOpen] = useState<Tender | null>(null)
  const mine = (id: number) => d.projects.find((p) => p.id === id)?.quotes.some((q) => q.status === 'submitted' || q.status === 'accepted')
  const cols = useMemo<ColumnDef<Tender>[]>(
    () => [
      { id: 'label', header: 'Block', accessorFn: (t) => t.project.label, cell: ({ row }) => <span className="font-medium">{row.original.project.label}</span> },
      { id: 'flats', header: 'Flats', accessorFn: (t) => t.project.flats, meta: { numeric: true } },
      { id: 'items', header: 'Work', accessorFn: (t) => t.items.map((i) => `${i.qty} x ${i.label}`).join('; '), cell: ({ row }) => (
        <ul className="space-y-0.5">
          {row.original.items.map((i) => (
            <li key={i.key}>
              {i.qty} x {i.label} <span className="text-muted-foreground">at {money(i.modelled_unit_price)} modelled</span>
            </li>
          ))}
        </ul>
      ) },
      { id: 'modelled', header: 'Modelled cost', accessorFn: (t) => t.items.reduce((s, i) => s + i.qty * i.modelled_unit_price, 0), cell: ({ getValue }) => money(getValue<number>()), meta: { numeric: true, csv: (t) => t.items.reduce((s, i) => s + i.qty * i.modelled_unit_price, 0) } },
      { id: 'sizing', header: 'Air conditioner sizes', accessorFn: (t) => t.sizing?.groups.map((g) => `${g.count} x ${g.unit_kw_with_package} kW (${g.position})`).join('; ') ?? '', cell: ({ row }) => (
        row.original.sizing ? (
          <ul>
            {row.original.sizing.groups.map((g) => (
              <li key={g.position}>
                {g.position === 'top' ? 'Top floor' : 'Lower floors'}: {g.count} x {g.unit_kw_with_package} kW
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">Not set</span>
        )
      ) },
      { id: 'closes', header: 'Closes', accessorFn: (t) => t.closes_on, cell: ({ getValue }) => dateLabel(getValue<string>()) },
      { id: 'status', header: 'Your quote', accessorFn: (t) => (mine(t.project.id) ? 'Quoted' : 'Not quoted'), cell: ({ row }) => (mine(row.original.project.id) ? <StatusBadge tone="good">Quoted</StatusBadge> : <StatusBadge tone="warn">Not quoted</StatusBadge>) },
      { id: 'act', header: 'Action', enableSorting: false, enableHiding: false, meta: { label: 'Action' }, cell: ({ row }) => (
        <Button size="sm" onClick={() => setOpen(row.original)} aria-label={`Write a quote for ${row.original.project.label}`}>
          {mine(row.original.project.id) ? 'New quote' : 'Quote'}
        </Button>
      ) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.projects],
  )
  return (
    <>
      <DataTable columns={cols} data={d.tenders} caption="Open tenders" csvName="open-tenders" emptyTitle="No open tenders" emptyText="When the programme office opens a tender to you, it appears here." getRowId={(t) => String(t.project.id)} />
      {open && <QuoteDialog tender={open} onClose={() => setOpen(null)} onDone={reload} />}
    </>
  )
}

function MyQuotes({ d }: { d: Loaded }) {
  const rows = d.projects.flatMap((p) => p.quotes.map((q) => ({ q, p })))
  const cols = useMemo<ColumnDef<{ q: Quote; p: ProjectDetail }>[]>(
    () => [
      { id: 'label', header: 'Block', accessorFn: (r) => r.p.label },
      { id: 'on', header: 'Submitted', accessorFn: (r) => r.q.submitted_on, cell: ({ getValue }) => dateLabel(getValue<string>()) },
      { id: 'valid', header: 'Valid until', accessorFn: (r) => r.q.valid_until, cell: ({ getValue }) => dateLabel(getValue<string>()) },
      { id: 'total', header: 'Your total', accessorFn: (r) => r.q.total, cell: ({ getValue }) => money(getValue<number>()), meta: { numeric: true } },
      { id: 'mod', header: 'Modelled', accessorFn: (r) => r.q.modelled_total, cell: ({ getValue }) => money(getValue<number>()), meta: { numeric: true } },
      { id: 'status', header: 'Status', accessorFn: (r) => r.q.status, cell: ({ getValue }) => {
        const s = getValue<Quote['status']>()
        return <StatusBadge tone={s === 'accepted' ? 'good' : s === 'submitted' ? 'info' : 'neutral'}>{s === 'submitted' ? 'Waiting for decision' : s === 'accepted' ? 'Accepted' : s === 'declined' ? 'Declined' : 'Withdrawn'}</StatusBadge>
      } },
    ],
    [],
  )
  return <DataTable columns={cols} data={rows} caption="My quotes" csvName="my-quotes" emptyTitle="No quotes yet" emptyText="Quote on an open tender and it will show here." getRowId={(r) => String(r.q.id)} />
}

function WorkOrders({ d, reload }: { d: Loaded; reload: () => void }) {
  const orders = d.projects.filter((p) => p.work_order)
  const act = useAction()
  const user = useUser()
  if (orders.length === 0) return <EmptyState title="No work orders">When a quote is accepted and the work is scheduled, the work order shows here.</EmptyState>
  return (
    <div className="space-y-4">
      <ErrorAlert error={act.error} />
      {orders.map((p) => {
        const wo = p.work_order!
        const done = wo.checklist.filter((c) => c.done).length
        return (
          <Panel key={wo.id} title={p.label} description={`Starts ${dateLabel(wo.scheduled_start)}. Warranty ${wo.warranty_years} years. ${done} of ${wo.checklist.length} items done.`} actions={<StageBadge stage={p.stage} />}>
            <ul className="space-y-1" aria-label={`Checklist for ${p.label}`}>
              {wo.checklist.map((c) => {
                const id = `wo${wo.id}-${c.key}`
                return (
                  <li key={c.key} className="flex items-start gap-2">
                    <Checkbox
                      id={id}
                      checked={c.done}
                      disabled={act.busy || (user?.role !== 'installer' && user?.role !== 'manager')}
                      onCheckedChange={async (v) => {
                        const r = await act.run(() => api.tick(wo.id, c.key, !!v), v ? 'Item ticked off' : 'Item unticked')
                        if (r) reload()
                      }}
                      className="mt-1"
                    />
                    <label htmlFor={id} className="min-w-0">
                      {c.label}
                      {c.done && c.by && <span className="block text-sm text-muted-foreground">Done by {c.by}{c.at ? ` on ${dateLabel(c.at)}` : ''}</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          </Panel>
        )
      })}
    </div>
  )
}

function FaultTickets({ d, reload }: { d: Loaded; reload: () => void }) {
  const [target, setTarget] = useState<Fault | null>(null)
  const [note, setNote] = useState('')
  const act = useAction()
  const label = (id: number) => d.projects.find((p) => p.id === id)?.label ?? `Project ${id}`
  const cols = useMemo<ColumnDef<Fault>[]>(
    () => [
      { id: 'opened', header: 'Reported', accessorFn: (f) => f.opened_on, cell: ({ getValue }) => dateLabel(getValue<string>()) },
      { id: 'block', header: 'Block', accessorFn: (f) => label(f.project_id) },
      { id: 'item', header: 'Equipment', accessorFn: (f) => itemLabel(f.item) },
      { id: 'desc', header: 'Problem', accessorFn: (f) => f.description },
      { id: 'status', header: 'Status', accessorFn: (f) => f.status, cell: ({ row }) => (row.original.status === 'open' ? <StatusBadge tone="warn">Open</StatusBadge> : <StatusBadge tone="good">Fixed {dateLabel(row.original.resolved_on)}</StatusBadge>) },
      { id: 'act', header: 'Action', enableSorting: false, enableHiding: false, meta: { label: 'Action' }, cell: ({ row }) => (row.original.status === 'open' ? (
        <Button size="sm" variant="outline" onClick={() => { setNote(''); setTarget(row.original) }} aria-label={`Resolve fault ${row.original.id}`}>
          Resolve
        </Button>
      ) : null) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.projects],
  )
  return (
    <>
      <DataTable columns={cols} data={d.faults} caption="Fault tickets" csvName="fault-tickets" emptyTitle="No fault tickets" emptyText="Reported faults on your installations appear here." getRowId={(f) => String(f.id)} initialSort={[{ id: 'opened', desc: true }]} />
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve the fault</DialogTitle>
            <DialogDescription>{target ? `${itemLabel(target.item)}: ${target.description}` : ''} The tenant's charge starts again next month.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <label htmlFor="fault-note" className="text-sm font-medium">
              What was done
            </label>
            <Input id="fault-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <ErrorAlert error={act.error} />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={act.busy}
              onClick={async () => {
                if (!target) return
                const r = await act.run(() => api.resolveFault(target.id, note.trim() || 'Fixed'), 'Fault marked as fixed')
                if (r) {
                  setTarget(null)
                  reload()
                }
              }}
            >
              Mark as fixed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function Installer() {
  const res = useRes(load, [])
  const [tab, setTab] = useState('tenders')
  useEffect(() => {
    document.title = 'Tenders and work | Meterwise'
  }, [])
  return (
    <div>
      <PageHeader crumbs={[{ label: 'Installer' }, { label: 'Tenders and work' }]} title="Tenders and work" description="Open tenders for you to quote on, your quotes, your work orders and fault tickets. Meter numbers are partly hidden and tenant details are never shown." />
      <Gate res={res} rows={6}>
        {(d) => {
          const open = d.faults.filter((f) => f.status === 'open').length
          return (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="tenders">Tenders ({d.tenders.length})</TabsTrigger>
                <TabsTrigger value="quotes">My quotes</TabsTrigger>
                <TabsTrigger value="work">Work orders ({d.projects.filter((p) => p.work_order).length})</TabsTrigger>
                <TabsTrigger value="faults">Fault tickets ({open} open)</TabsTrigger>
              </TabsList>
              <TabsContent value="tenders" className="mt-3">
                <Tenders d={d} reload={res.reload} />
              </TabsContent>
              <TabsContent value="quotes" className="mt-3">
                <MyQuotes d={d} />
              </TabsContent>
              <TabsContent value="work" className="mt-3">
                <WorkOrders d={d} reload={res.reload} />
              </TabsContent>
              <TabsContent value="faults" className="mt-3">
                <FaultTickets d={d} reload={res.reload} />
              </TabsContent>
            </Tabs>
          )
        }}
      </Gate>
    </div>
  )
}
