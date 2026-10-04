import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { api, downloadText } from '@/console/api'
import { propertyApi } from '@/console/api-property'
import type { Flat, LedgerEntry } from '@/console/types'
import type { PropertyProject } from '@/console/types-property'
import { consentsFor } from '@/console/consent'
import type { DataConsent } from '@/console/consent'
import { FlatPrivacy } from '@/portal/components/FlatPrivacy'
import { useRes } from '@/console/useRes'
import { money } from '@/format'
import { Confirm } from '@/portal/components/Confirm'
import { DataTable } from '@/portal/components/DataTable'
import { DateField, NumberField, TextField } from '@/portal/components/fields'
import { Facts, Panel } from '@/portal/components/PageHeader'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { Alert, AlertDescription } from '@/portal/components/ui/alert'
import { Button } from '@/portal/components/ui/button'
import { Form } from '@/portal/components/ui/form'
import { Progress } from '@/portal/components/ui/progress'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/portal/components/ui/sheet'
import { useAction } from '@/portal/lib/actions'
import { ChargeBadge, ConsentBadge, DataConsentCell, FormDialog, fmtDate, fmtMonth } from './common'

const KIND: Record<string, string> = { charge: 'Charge', payment: 'Payment', pause_credit: 'Credit for paused charge', true_up_refund: 'Refund after savings check', adjustment: 'Adjustment', write_off: 'Written off' }

// ---------- consent ----------
const nameSchema = z.object({ name: z.string().trim().min(2, 'Enter the name of the person signing.') })
const strataSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the name of the person signing.'),
    meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date as year-month-day, for example 2026-10-12.'),
    votes_for: z.coerce.number({ message: 'Enter the number of votes for.' }).int('Use a whole number.').min(0, 'Votes cannot be negative.'),
    votes_against: z.coerce.number({ message: 'Enter the number of votes against.' }).int('Use a whole number.').min(0, 'Votes cannot be negative.'),
  })
  .refine((v) => v.votes_for > v.votes_against, { path: ['votes_for'], message: 'An ordinary resolution needs more votes for than against.' })

function VoteWarning({ form }: { form: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const vf = Number(useWatch({ control: form.control, name: 'votes_for' }))
  const va = Number(useWatch({ control: form.control, name: 'votes_against' }))
  const show = Number.isFinite(vf) && Number.isFinite(va) && (vf > 0 || va > 0) && vf <= va
  return show ? (
    <Alert role="status">
      <AlertDescription>Votes for must be more than votes against for an ordinary resolution to pass.</AlertDescription>
    </Alert>
  ) : null
}

export function ConsentTab({ p, orgKind, reload }: { p: PropertyProject; orgKind?: string; reload: () => void }) {
  const strata = orgKind === 'strata'
  const c = p.consent
  const pct = c.tenants_total ? c.tenants_agreed / c.tenants_total : 0
  const act = useAction()
  const setConsent = async (f: Flat, v: 'agreed' | 'declined') => {
    const r = await act.run(() => api.flatConsent(f.id, v), v === 'agreed' ? `Unit ${f.unit} agreed.` : `Unit ${f.unit} declined.`)
    if (r) reload()
  }
  const cols = useMemo<ColumnDef<Flat>[]>(
    () => [
      { accessorKey: 'unit', header: 'Unit' },
      { accessorKey: 'tenant_name', header: 'Tenant', cell: ({ row }) => row.original.tenant_name ?? 'Vacant' },
      { accessorKey: 'consent', header: 'Upgrade consent', cell: ({ row }) => <ConsentBadge c={row.original.consent} /> },
      {
        id: 'act',
        header: 'Record an answer',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <span className="nsw-display-flex mw-gap-1">
            <Confirm title={`Record unit ${row.original.unit} as agreed?`} description="Only record this when the tenant has said yes. They can change their mind later." confirmLabel="Record agreed" onConfirm={() => setConsent(row.original, 'agreed')}>
              <Button size="sm" variant="outline" disabled={row.original.consent === 'agreed' || act.busy}>
                Agreed
              </Button>
            </Confirm>
            <Confirm title={`Record unit ${row.original.unit} as declined?`} description="A flat that declines gets no charge and no work inside the flat." confirmLabel="Record declined" onConfirm={() => setConsent(row.original, 'declined')}>
              <Button size="sm" variant="outline" disabled={row.original.consent === 'declined' || act.busy}>
                Declined
              </Button>
            </Confirm>
          </span>
        ),
        meta: { label: 'Record an answer' },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [act.busy],
  )
  return (
    <div className="mw-space-y-4">
      <Panel title="Owner consent" description={strata ? 'For a strata scheme, record the meeting resolution that approves the work.' : 'The owner must sign before tenants are asked.'}>
        {c.owner_signed ? (
          <div>
            <p className="nsw-text-medium mw-text-success">Signed.</p>
            {p.resolution && (
              <Facts
                items={[
                  { label: 'Resolution', value: 'Ordinary resolution' },
                  { label: 'Meeting date', value: fmtDate(p.resolution.meeting_date) },
                  { label: 'Votes for', value: p.resolution.votes_for },
                  { label: 'Votes against', value: p.resolution.votes_against },
                ]}
              />
            )}
          </div>
        ) : strata ? (
          <FormDialog
            title="Record the strata resolution"
            description="Enter the result of the general meeting. Only record a resolution that has passed."
            trigger="Record resolution and sign"
            triggerVariant="default"
            schema={strataSchema}
            defaults={{ name: '', meeting_date: '', votes_for: '', votes_against: '' }}
            fields={(form) => (
              <>
                <TextField control={form.control} name="name" label="Name of the person signing for the committee" autoComplete="name" />
                <DateField control={form.control} name="meeting_date" label="Meeting date" />
                <div className="nsw-display-grid mw-grid-cols-2 mw-gap-3">
                  <NumberField control={form.control} name="votes_for" label="Votes for" min={0} />
                  <NumberField control={form.control} name="votes_against" label="Votes against" min={0} />
                </div>
                <p className="nsw-small mw-text-muted">Kind of resolution: ordinary (more votes for than against).</p>
                <VoteWarning form={form} />
              </>
            )}
            summary={(v) => (
              <p>
                {v.name} signs for the committee. The resolution passed {v.votes_for} to {v.votes_against} at the meeting on {fmtDate(v.meeting_date)}.
              </p>
            )}
            confirmLabel="Record and sign"
            onSubmit={async (v) => {
              await propertyApi.strataConsent(p.id, v.name, { meeting_date: v.meeting_date, votes_for: v.votes_for, votes_against: v.votes_against, kind: 'ordinary' })
              reload()
            }}
            success="Resolution recorded and owner consent signed."
          />
        ) : (
          <FormDialog
            title="Sign the owner agreement"
            trigger="Sign as owner"
            triggerVariant="default"
            schema={nameSchema}
            defaults={{ name: '' }}
            fields={(form) => <TextField control={form.control} name="name" label="Your full name" autoComplete="name" />}
            summary={(v) => <p>{v.name} signs the owner agreement for {p.label}.</p>}
            confirmLabel="Sign"
            onSubmit={async (v) => {
              await api.ownerConsent(p.id, v.name)
              reload()
            }}
            success="Owner consent signed."
          />
        )}
      </Panel>
      <Panel title="Tenant consent" description="Meter-data consent is separate. See the Flats tab.">
        <div className="mw-mb-3 mw-max-w-xl">
          <p className="mw-mb-1" id="thr">
            {c.tenants_agreed} of {c.tenants_total} tenants have agreed, {c.tenants_declined} declined. At least {Math.round(c.threshold * 100)}% must agree.
          </p>
          <Progress value={pct * 100} aria-labelledby="thr" />
          <p className="mw-mt-1 nsw-small mw-text-muted">{pct >= c.threshold ? 'The threshold is met.' : 'The threshold is not met yet.'}</p>
        </div>
        <ErrorAlert error={act.error} />
        <DataTable columns={cols} data={p.flats_list} caption="Tenant consent by flat" searchPlaceholder="Search flats" getRowId={(r) => String(r.id)} pageSize={25} />
      </Panel>
    </div>
  )
}

// ---------- flats ----------
function LedgerBody({ flatId }: { flatId: number }) {
  const res = useRes<LedgerEntry[]>(() => api.ledger(flatId), [flatId])
  return (
    <Gate res={res} rows={6}>
      {(l) => (
        <DataTable
          columns={[
            { accessorKey: 'month', header: 'Month', cell: ({ row }) => fmtMonth(row.original.month), meta: { csv: (r: LedgerEntry) => r.month } },
            { accessorKey: 'kind', header: 'What', cell: ({ row }) => KIND[row.original.kind] ?? row.original.kind },
            { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => money(row.original.amount), meta: { numeric: true } },
            { accessorKey: 'balance_after', header: 'Balance', cell: ({ row }) => money(row.original.balance_after), meta: { numeric: true } },
          ]}
          data={l}
          caption="Ledger"
          csvName="meterwise-ledger"
          searchPlaceholder="Search the ledger"
          emptyTitle="No entries yet"
          pageSize={12}
        />
      )}
    </Gate>
  )
}

const paySchema = z.object({
  amount: z.coerce.number({ message: 'Enter the amount paid.' }).positive('The amount must be more than zero.').max(100000, 'That amount looks too large. Check it.'),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Choose the month the payment is for.'),
})
const tenantSchema = z.object({
  new_tenant_name: z.string().trim().min(2, 'Enter the new tenant name.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date as year-month-day, for example 2026-11-01.'),
})

export function FlatsTab({ p, reload, readOnly }: { p: PropertyProject; reload: () => void; readOnly?: boolean }) {
  const consents = useRes<Record<number, DataConsent | null>>(() => consentsFor(p.flats_list.map((f) => f.id)), [p.id, p.flats_list.length])
  const [sheet, setSheet] = useState<Flat | null>(null)
  const cols = useMemo<ColumnDef<Flat>[]>(
    () => [
      { accessorKey: 'unit', header: 'Unit' },
      { accessorKey: 'tenant_name', header: 'Tenant', cell: ({ row }) => row.original.tenant_name ?? 'Vacant' },
      { accessorKey: 'consent', header: 'Upgrade consent', cell: ({ row }) => <ConsentBadge c={row.original.consent} /> },
      { id: 'data', header: 'Meter-data consent', accessorFn: (f) => (consents.data?.[f.id]?.given ? `Given until ${consents.data[f.id]?.expires_on ?? ''}` : 'Not given'), cell: ({ row }) => <DataConsentCell c={consents.data?.[row.original.id]} />, meta: { label: 'Meter-data consent' } },
      { accessorKey: 'charge_per_month', header: 'Charge a month', cell: ({ row }) => money(row.original.charge_per_month), meta: { numeric: true } },
      { accessorKey: 'charge_status', header: 'Charge', cell: ({ row }) => <ChargeBadge s={row.original.charge_status} />, meta: { csv: (r) => r.charge_status } },
      { accessorKey: 'balance_owing', header: 'Balance owing', cell: ({ row }) => money(row.original.balance_owing), meta: { numeric: true } },
      { accessorKey: 'principal_remaining', header: 'Principal remaining', cell: ({ row }) => money(row.original.principal_remaining), meta: { numeric: true } },
      { accessorKey: 'access_code', header: 'Access code', cell: ({ row }) => <code>{row.original.access_code ?? ''}</code> },
      {
        id: 'act',
        header: 'Actions',
        enableSorting: false,
        enableHiding: false,
        meta: { label: 'Actions' },
        cell: ({ row }) => {
          const f = row.original
          return (
            <span className="nsw-display-flex nsw-flex-wrap mw-gap-1">
              <Button size="sm" variant="outline" onClick={() => setSheet(f)}>
                Ledger<span className="sr-only"> for unit {f.unit}</span>
              </Button>
              {!readOnly && (
                <>
                  <FormDialog
                    title={`Record a payment, unit ${f.unit}`}
                    description="Record money the tenant has paid towards the meter charge."
                    trigger={<>Record payment<span className="sr-only"> for unit {f.unit}</span></>}
                    schema={paySchema}
                    defaults={{ amount: '', month: '' }}
                    fields={(form) => (
                      <>
                        <NumberField control={form.control} name="amount" label="Amount paid ($)" step={0.01} min={0} />
                        <TextField control={form.control} name="month" label="Month the payment is for" type="month" />
                      </>
                    )}
                    summary={(v) => (
                      <p>
                        Record {money(Number(v.amount))} received from unit {f.unit} for {fmtMonth(v.month)}. This lowers the balance owing, which is now {money(f.balance_owing)}.
                      </p>
                    )}
                    confirmLabel="Record payment"
                    onSubmit={async (v) => {
                      await api.payment(f.id, Number(v.amount), v.month)
                      reload()
                    }}
                    success={`Payment recorded for unit ${f.unit}.`}
                  />
                  <FormDialog
                    title={`Tenancy change, unit ${f.unit}`}
                    description="The charge stays with the meter. The old tenant's balance is settled, and a new access code and disclosure document are issued."
                    trigger={<>New tenant<span className="sr-only"> for unit {f.unit}</span></>}
                    schema={tenantSchema}
                    defaults={{ new_tenant_name: '', date: '' }}
                    fields={(form) => (
                      <>
                        <TextField control={form.control} name="new_tenant_name" label="New tenant name" />
                        <DateField control={form.control} name="date" label="Start date" />
                      </>
                    )}
                    summary={(v) => (
                      <p>
                        {f.tenant_name ?? 'The current tenant'} leaves unit {f.unit}. {v.new_tenant_name} starts on {fmtDate(v.date)}. Their balance of {money(f.balance_owing)} is settled and the charge of {money(f.charge_per_month)} a month stays with the meter.
                      </p>
                    )}
                    confirmLabel="Change tenant"
                    onSubmit={async (v) => {
                      await api.tenancyChange(f.id, v.new_tenant_name, v.date)
                      reload()
                    }}
                    success={`Tenancy changed for unit ${f.unit}.`}
                  />
                </>
              )}
            </span>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [consents.data, readOnly],
  )
  return (
    <div className="mw-space-y-3">
      <p className="mw-max-w-3xl mw-text-muted">
        Upgrade consent (agreeing to the work and the charge) and meter-data consent (letting the programme use meter readings) are separate. The tenant gives or withdraws each one themselves.
      </p>
      {consents.error && <ErrorAlert error={consents.error} onRetry={consents.reload} title="We could not check meter-data consent" />}
      <DataTable columns={cols} data={p.flats_list} caption="Flats and charges" csvName={`meterwise-flats-${p.id}`} searchPlaceholder="Search flats" getRowId={(r) => String(r.id)} initialHidden={{ principal_remaining: false }} emptyTitle="No flats" />
      <Sheet open={!!sheet} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent className="nsw-width-100 nsw-overflow-y-auto mw-sm-max-w-xl">
          <SheetHeader>
            <SheetTitle>Ledger, unit {sheet?.unit}</SheetTitle>
            <SheetDescription>Every charge and payment on this meter.</SheetDescription>
          </SheetHeader>
          <div className="mw-space-y-4 mw-px-4 mw-pb-4">{sheet && <LedgerBody flatId={sheet.id} />}{sheet && !readOnly && <FlatPrivacy flatId={sheet.id} unit={sheet.unit} onChanged={consents.reload} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ---------- charges and export ----------
export function ChargesTab({ p }: { p: PropertyProject }) {
  return (
    <div className="mw-space-y-3">
      <ExportBar projectId={p.id} defaultMonth="" />
      <DataTable
        columns={[
          { accessorKey: 'unit', header: 'Unit' },
          { accessorKey: 'charge_per_month', header: 'Charge a month', cell: ({ row }) => money(row.original.charge_per_month), meta: { numeric: true } },
          { accessorKey: 'charge_status', header: 'Status', cell: ({ row }) => <ChargeBadge s={row.original.charge_status} />, meta: { csv: (r: Flat) => r.charge_status } },
          { accessorKey: 'months_billed', header: 'Months billed', meta: { numeric: true } },
          { accessorKey: 'balance_owing', header: 'Balance owing', cell: ({ row }) => money(row.original.balance_owing), meta: { numeric: true } },
          { accessorKey: 'principal_remaining', header: 'Principal remaining', cell: ({ row }) => money(row.original.principal_remaining), meta: { numeric: true } },
        ]}
        data={p.flats_list}
        caption="Charges by flat"
        csvName={`meterwise-charges-${p.id}`}
        searchPlaceholder="Search flats"
      />
    </div>
  )
}

const monthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Choose a month.') })
/** Month picker and a button that downloads the rent-ledger CSV for the provider's own systems. */
export function ExportBar({ projectId, defaultMonth }: { projectId?: number; defaultMonth: string }) {
  const act = useAction()
  const form = useForm<z.infer<typeof monthSchema>>({ resolver: zodResolver(monthSchema), defaultValues: { month: defaultMonth } })
  const month = useWatch({ control: form.control, name: 'month' })
  useEffect(() => {
    if (defaultMonth) return
    api.clock().then((c) => form.setValue('month', c.month)).catch(() => form.setValue('month', new Date().toISOString().slice(0, 7)))
  }, [defaultMonth, form])
  return (
    <Form {...form}>
      <form
        className="nsw-display-flex nsw-flex-wrap nsw-align-items-end mw-gap-2 mw-border mw-bg-white mw-p-3"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          const t = await act.run(() => api.billingExport(v.month, projectId))
          if (t !== undefined) downloadText(`meterwise-rent-ledger-${v.month}.csv`, t, 'text/csv')
        })}
      >
        <TextField control={form.control} name="month" label="Month" type="month" className="mw-w-48" />
        <Button type="submit" variant="outline" disabled={act.busy || !month}>
          {act.busy ? 'Preparing' : 'Download rent ledger (CSV)'}
        </Button>
        <div className="mw-basis-full">
          <ErrorAlert error={act.error} title="We could not make the file" />
        </div>
      </form>
    </Form>
  )
}
