import { zodResolver } from '@hookform/resolvers/zod'
import { MoreHorizontal } from '@/portal/components/icons'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/console/api'
import { consentsFor } from '@/console/consent'
import type { DataConsent } from '@/console/consent'
import { FlatPrivacy } from '@/portal/components/FlatPrivacy'
import type { Flat, LedgerEntry } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money } from '@/format'
import { Confirm } from '@/portal/components/Confirm'
import { DataTable } from '@/portal/components/DataTable'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { Facts, Panel } from '@/portal/components/PageHeader'
import { StatusBadge } from '@/portal/components/Status'
import { DateField, NumberField, TextField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/portal/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/portal/components/ui/dropdown-menu'
import { Form } from '@/portal/components/ui/form'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/portal/components/ui/sheet'
import { useAction } from '@/portal/lib/actions'
import { dateLabelAu, monthLabelAu } from '@/portal/lib/dates'
import { CHARGE_LABEL, CONSENT_LABEL, canEdit, dateText, isIsoDate, refetch } from './shared'
import type { TabProps } from './shared'

const KIND: Record<LedgerEntry['kind'], string> = {
  charge: 'Charge',
  payment: 'Payment',
  pause_credit: 'Credit for paused charge',
  true_up_refund: 'Refund after savings check',
  adjustment: 'Adjustment',
  write_off: 'Written off',
}
const CHARGE_TONE = { not_started: 'neutral', active: 'good', paused: 'warn', ended: 'neutral' } as const

/** Data consent for each flat, six requests at a time. A flat whose answer cannot be read shows as unknown. */
function useDataConsents(flats: Flat[], enabled: boolean) {
  const [map, setMap] = useState<Record<number, DataConsent | null>>({})
  const [tick, setTick] = useState(0)
  const key = flats.map((f) => f.id).join(',')
  useEffect(() => {
    if (!enabled) return
    let live = true
    void consentsFor(flats.map((f) => f.id)).then((m) => {
      if (live) setMap(m)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, tick])
  return { map, refresh: () => setTick((t) => t + 1) }
}

function LedgerSheet({ flat, open, onClose, showCode, onConsent }: { flat: Flat; open: boolean; onClose: () => void; showCode: boolean; onConsent: () => void }) {
  const res = useRes(() => api.ledger(flat.id), [flat.id])
  const [reveal, setReveal] = useState(false)
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="nsw-width-100 nsw-overflow-y-auto mw-sm-max-w-xl">
        <SheetHeader>
          <SheetTitle>Flat {flat.unit}</SheetTitle>
          <SheetDescription>Meter reference {flat.meter_id}</SheetDescription>
        </SheetHeader>
        <div className="mw-space-y-4 mw-px-4 mw-pb-4">
          <Facts
            items={[
              { label: 'Tenant', value: flat.tenant_name ?? '-' },
              { label: 'Charge', value: `${money(flat.charge_per_month)} a month` },
              { label: 'Charge status', value: CHARGE_LABEL[flat.charge_status] + (flat.paused_reason ? `: ${flat.paused_reason}` : '') },
              { label: 'Principal left', value: money(flat.principal_remaining) },
              { label: 'Balance owing', value: money(flat.balance_owing) },
              ...(showCode && flat.access_code
                ? [
                    {
                      label: 'Tenant access code',
                      value: reveal ? (
                        <span className="mw-mono nsw-text-semibold">{flat.access_code}</span>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setReveal(true)}>
                          Show access code
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
          <h3 className="nsw-text-semibold">Ledger</h3>
          <Gate res={res} rows={4}>
            {(rows) => (
              <DataTable<LedgerEntry>
                caption={`Ledger for flat ${flat.unit}`}
                data={[...rows].reverse()}
                getRowId={(r) => String(r.id)}
                pageSize={10}
                csvName={`ledger-flat-${flat.unit}`}
                emptyTitle="No entries yet"
                emptyText="Entries appear after the first billing run."
                searchPlaceholder="Search the ledger"
                columns={[
                  { id: 'month', header: 'Month', accessorFn: (r) => monthLabelAu(r.month), meta: { csv: (r) => r.month } },
                  { id: 'kind', header: 'What', accessorFn: (r) => KIND[r.kind] ?? r.kind, cell: ({ row }) => <>{KIND[row.original.kind] ?? row.original.kind}{row.original.note && <div className="nsw-small mw-text-muted">{row.original.note}</div>}</> },
                  { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => money(row.original.amount), meta: { numeric: true } },
                  { accessorKey: 'balance_after', header: 'Balance', cell: ({ row }) => money(row.original.balance_after), meta: { numeric: true } },
                ]}
              />
            )}
          </Gate>
          {showCode && <FlatPrivacy flatId={flat.id} unit={flat.unit} onChanged={onConsent} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}

const paySchema = z.object({
  amount: z.coerce.number({ message: 'Enter the amount paid in dollars.' }).positive('The amount must be more than zero.').max(100000, 'That amount is too large.'),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Enter the month as YYYY-MM, for example 2027-03.'),
})

function PaymentDialog({ flat, onClose, onDone }: { flat: Flat; onClose: () => void; onDone: () => void }) {
  const act = useAction()
  const form = useForm<z.input<typeof paySchema>, unknown, z.output<typeof paySchema>>({ resolver: zodResolver(paySchema), defaultValues: { amount: '' as unknown as number, month: new Date().toISOString().slice(0, 7) } })
  const submit = form.handleSubmit(async (v) => {
    const r = await act.run(() => api.payment(flat.id, v.amount, v.month), `Payment of ${money(v.amount)} recorded for flat ${flat.unit}`)
    if (r !== undefined) {
      onDone()
      onClose()
    }
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment for flat {flat.unit}</DialogTitle>
          <DialogDescription>Balance owing now {money(flat.balance_owing)}. This adds a payment to the flat's ledger.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="mw-space-y-3" noValidate onSubmit={(e) => e.preventDefault()}>
            <NumberField control={form.control} name="amount" label="Amount (dollars)" step={0.01} min={0} />
            <TextField control={form.control} name="month" label="Month paid for" placeholder="YYYY-MM" />
            <ErrorAlert error={act.error} title="We could not record the payment" />
            <Confirm title="Record this payment?" description={`This records a payment against flat ${flat.unit}'s ledger. It changes the balance owing.`} confirmLabel="Record payment" onConfirm={() => void submit()}>
              <Button type="button" disabled={act.busy}>
                {act.busy ? 'Recording' : 'Record payment'}
              </Button>
            </Confirm>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

const tenancySchema = z.object({ new_tenant_name: z.string().trim().min(2, 'Enter the new tenant name.'), date: z.string().refine(isIsoDate, dateText('The move-in date')) })

function TenancyDialog({ flat, onClose, onDone }: { flat: Flat; onClose: () => void; onDone: () => void }) {
  const act = useAction()
  const form = useForm<z.input<typeof tenancySchema>, unknown, z.output<typeof tenancySchema>>({ resolver: zodResolver(tenancySchema), defaultValues: { new_tenant_name: '', date: '' } })
  const submit = form.handleSubmit(async (v) => {
    const r = await act.run(() => api.tenancyChange(flat.id, v.new_tenant_name, v.date), `Tenancy changed for flat ${flat.unit}`)
    if (r) {
      onDone()
      onClose()
    }
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change tenant for flat {flat.unit}</DialogTitle>
          <DialogDescription>The charge stays with the meter. The old tenant's balance is settled, and a new access code and disclosure document are made for the new tenant.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="mw-space-y-3" noValidate onSubmit={(e) => e.preventDefault()}>
            <TextField control={form.control} name="new_tenant_name" label="New tenant's name" autoComplete="off" />
            <DateField control={form.control} name="date" label="Move-in date" />
            <ErrorAlert error={act.error} title="We could not change the tenancy" />
            <Confirm title="Change the tenant?" description={`This settles ${flat.tenant_name ?? 'the current tenant'}'s balance of ${money(flat.balance_owing)} and issues a new access code.`} confirmLabel="Change tenant" destructive onConfirm={() => void submit()}>
              <Button type="button" disabled={act.busy}>
                {act.busy ? 'Saving' : 'Change tenant'}
              </Button>
            </Confirm>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

type Active = { kind: 'detail' | 'payment' | 'tenancy'; flat: Flat } | null

export default function Flats(props: TabProps) {
  const { p, role } = props
  const editable = canEdit(role)
  const [active, setActive] = useState<Active>(null)
  const { map: consents, refresh: refreshConsents } = useDataConsents(p.flats_list, editable)
  const refresh = () => void refetch(props)
  const cur = active ? p.flats_list.find((f) => f.id === active.flat.id) ?? active.flat : null

  return (
    <Panel title="Flats and charges" description="Upgrade consent and meter-data consent are separate. A flat can agree to the upgrade without agreeing to share its meter data.">
      <DataTable<Flat>
        caption="Flats and charges"
        data={p.flats_list}
        getRowId={(f) => String(f.id)}
        csvName={`project-${p.id}-flats`}
        searchPlaceholder="Search by unit, tenant or meter"
        emptyTitle="No flats"
        columns={[
          { accessorKey: 'unit', header: 'Unit' },
          { id: 'tenant', header: 'Tenant', accessorFn: (f) => f.tenant_name ?? '-', meta: { csv: (f) => f.tenant_name ?? '' } },
          { accessorKey: 'meter_id', header: 'Meter reference', cell: ({ row }) => <span className="mw-mono nsw-small">{row.original.meter_id}</span> },
          { id: 'consent', header: 'Upgrade consent', accessorFn: (f) => CONSENT_LABEL[f.consent], cell: ({ row }) => <StatusBadge tone={row.original.consent === 'agreed' ? 'good' : row.original.consent === 'declined' ? 'bad' : 'warn'}>{CONSENT_LABEL[row.original.consent]}</StatusBadge> },
          {
            id: 'data',
            header: 'Meter data consent',
            accessorFn: (f) => (consents[f.id] === undefined ? 'Loading' : consents[f.id] === null ? 'Unknown' : consents[f.id]?.given ? 'Given' : 'Not given'),
            cell: ({ row }) => {
              const c = consents[row.original.id]
              if (c === undefined) return <span className="mw-text-muted">Loading</span>
              if (c === null) return <span className="mw-text-muted">Not available</span>
              return c.given ? <StatusBadge tone="good">{c.expires_on ? `Given, ends ${dateLabelAu(c.expires_on)}` : 'Given'}</StatusBadge> : <StatusBadge tone="warn">Not given</StatusBadge>
            },
          },
          { id: 'charge', header: 'Charge a month', accessorFn: (f) => f.charge_per_month, cell: ({ row }) => money(row.original.charge_per_month), meta: { numeric: true } },
          { id: 'status', header: 'Charge status', accessorFn: (f) => CHARGE_LABEL[f.charge_status], cell: ({ row }) => <StatusBadge tone={CHARGE_TONE[row.original.charge_status]}>{CHARGE_LABEL[row.original.charge_status]}</StatusBadge> },
          { id: 'principal', header: 'Principal left', accessorFn: (f) => f.principal_remaining, cell: ({ row }) => money(row.original.principal_remaining), meta: { numeric: true } },
          { id: 'balance', header: 'Balance owing', accessorFn: (f) => f.balance_owing, cell: ({ row }) => money(row.original.balance_owing), meta: { numeric: true } },
          { accessorKey: 'months_billed', header: 'Months billed', meta: { numeric: true } },
          {
            id: 'act',
            header: () => <span className="sr-only">Actions</span>,
            enableSorting: false,
            enableHiding: false,
            meta: { label: 'Actions' },
            cell: ({ row }) => {
              const f = row.original
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" aria-label={`Actions for flat ${f.unit}`}>
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setActive({ kind: 'detail', flat: f })}>Ledger and details</DropdownMenuItem>
                    {editable && <DropdownMenuItem onSelect={() => setActive({ kind: 'payment', flat: f })}>Record a payment</DropdownMenuItem>}
                    {editable && <DropdownMenuItem onSelect={() => setActive({ kind: 'tenancy', flat: f })}>Change tenant</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            },
          },
        ]}
        initialHidden={{ months_billed: false }}
      />
      {cur && active?.kind === 'detail' && <LedgerSheet flat={cur} open onClose={() => setActive(null)} showCode={editable} onConsent={refreshConsents} />}
      {cur && active?.kind === 'payment' && <PaymentDialog flat={cur} onClose={() => setActive(null)} onDone={refresh} />}
      {cur && active?.kind === 'tenancy' && <TenancyDialog flat={cur} onClose={() => setActive(null)} onDone={refresh} />}
    </Panel>
  )
}
