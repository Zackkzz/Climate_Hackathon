import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/console/api'
import { projectApi } from '@/console/api-project'
import type { Flat } from '@/console/types'
import { useUser } from '@/console/auth'
import { useRes } from '@/console/useRes'
import { Confirm } from '@/portal/components/Confirm'
import { DataTable } from '@/portal/components/DataTable'
import { ErrorAlert } from '@/portal/components/States'
import { Panel } from '@/portal/components/PageHeader'
import { StatusBadge } from '@/portal/components/Status'
import { DateField, NumberField, TextField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Form } from '@/portal/components/ui/form'
import { Progress } from '@/portal/components/ui/progress'
import { useAction } from '@/portal/lib/actions'
import { dateLabelAu } from '@/portal/lib/dates'
import { CONSENT_LABEL, canEdit, dateText, isIsoDate, refetch } from './shared'
import type { TabProps } from './shared'

const ownerSchema = z.object({
  name: z.string().trim().min(2, 'Type the full name of the person signing.'),
  meeting_date: z.string().optional(),
  votes_for: z.coerce.number().int('Use a whole number.').min(0, 'Votes cannot be negative.').optional(),
  votes_against: z.coerce.number().int('Use a whole number.').min(0, 'Votes cannot be negative.').optional(),
})

export default function Consent(props: TabProps) {
  const { p, role, onChange } = props
  const user = useUser()
  // the project only carries the owner's id and name, so the kind comes from the organisation list (manager) or the signed-in user (owner)
  const orgs = useRes(() => (role === 'manager' ? api.orgs() : Promise.resolve([])), [role])
  const ownerKind = p.owner_org?.kind ?? orgs.data?.find((o) => o.id === p.owner_org?.id)?.kind ?? (user?.org?.id === p.owner_org?.id ? user?.org?.kind : undefined)
  const strata = ownerKind === 'strata'
  const c = p.consent
  const act = useAction()
  const flatAct = useAction()
  const editable = canEdit(role)
  const needed = Math.ceil(c.threshold * c.tenants_total)
  const ratio = c.tenants_total > 0 ? c.tenants_agreed / c.tenants_total : 0

  const form = useForm<z.input<typeof ownerSchema>, unknown, z.output<typeof ownerSchema>>({
    resolver: zodResolver(
      ownerSchema.superRefine((v, ctx) => {
        if (!strata) return
        if (!v.meeting_date || !isIsoDate(v.meeting_date)) ctx.addIssue({ code: 'custom', path: ['meeting_date'], message: dateText('The meeting date') })
        if (v.votes_for === undefined || Number.isNaN(v.votes_for)) ctx.addIssue({ code: 'custom', path: ['votes_for'], message: 'Enter the votes for.' })
        if (v.votes_against === undefined || Number.isNaN(v.votes_against)) ctx.addIssue({ code: 'custom', path: ['votes_against'], message: 'Enter the votes against.' })
        if (v.votes_for !== undefined && v.votes_against !== undefined && v.votes_for <= v.votes_against) ctx.addIssue({ code: 'custom', path: ['votes_for'], message: 'An ordinary resolution needs more votes for than against.' })
      }),
    ),
    defaultValues: { name: '', meeting_date: '', votes_for: undefined, votes_against: undefined },
  })

  const sign = form.handleSubmit(async (v) => {
    const body = strata
      ? { signed: true as const, name: v.name, resolution: { meeting_date: v.meeting_date ?? '', votes_for: v.votes_for ?? 0, votes_against: v.votes_against ?? 0, kind: 'ordinary' as const } }
      : { signed: true as const, name: v.name }
    const r = await act.run(() => projectApi.ownerConsent(p.id, body), 'Owner signature recorded')
    if (r) onChange(r)
  })

  const setConsent = async (f: Flat, value: 'agreed' | 'declined') => {
    const r = await flatAct.run(() => api.flatConsent(f.id, value), `Flat ${f.unit}: ${value}`)
    if (r) await refetch(props)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={strata ? 'Owners corporation signature' : 'Owner signature'}>
          {c.owner_signed ? (
            <p>
              <StatusBadge tone="good">Signed</StatusBadge> <span className="ml-1">The owner has signed the agreement.</span>
            </p>
          ) : !editable ? (
            <p className="text-muted-foreground">The owner has not signed yet.</p>
          ) : (
            <Form {...form}>
              <form className="space-y-3" noValidate onSubmit={(e) => e.preventDefault()} aria-label="Owner signature">
                <TextField control={form.control} name="name" label="Full name of the person signing" autoComplete="name" />
                {strata && (
                  <fieldset className="space-y-3 border p-3">
                    <legend className="px-1 text-sm font-medium">Strata meeting resolution (ordinary)</legend>
                    <DateField control={form.control} name="meeting_date" label="Meeting date" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <NumberField control={form.control} name="votes_for" label="Votes for" min={0} />
                      <NumberField control={form.control} name="votes_against" label="Votes against" min={0} />
                    </div>
                  </fieldset>
                )}
                <ErrorAlert error={act.error} title="We could not record the signature" />
                <Confirm title="Record the owner's signature?" description="This records that the owner agrees to the upgrade and the charge on each meter. It cannot be undone here." confirmLabel="Record signature" onConfirm={() => void sign()}>
                  <Button type="button" disabled={act.busy}>
                    {act.busy ? 'Saving' : 'Record signature'}
                  </Button>
                </Confirm>
              </form>
            </Form>
          )}
        </Panel>

        <Panel title="Tenant agreement" description={`${Math.round(c.threshold * 100)}% of flats must agree before the project can go to quotes.`}>
          <p className="text-lg font-semibold tabular-nums" role="status">
            {c.tenants_agreed} of {c.tenants_total} flats agreed ({Math.round(ratio * 100)}%)
          </p>
          <Progress value={Math.min(100, ratio * 100)} className="my-2 h-3" aria-label={`${Math.round(ratio * 100)} percent of flats have agreed`} />
          <p className="text-muted-foreground">
            Needed: {needed} flats ({Math.round(c.threshold * 100)}%). {c.tenants_agreed >= needed ? 'The threshold is met.' : `${needed - c.tenants_agreed} more needed.`} {c.tenants_declined} declined.
          </p>
        </Panel>
      </div>

      <Panel title="Flats" description="Flats whose tenant declines get no charge and no work inside the flat.">
        <ErrorAlert error={flatAct.error} />
        <DataTable<Flat>
          caption="Flats and consent"
          data={p.flats_list}
          getRowId={(f) => String(f.id)}
          csvName={`project-${p.id}-consent`}
          searchPlaceholder="Search flats"
          columns={[
            { accessorKey: 'unit', header: 'Unit' },
            { id: 'tenant', header: 'Tenant', accessorFn: (f) => f.tenant_name ?? '-', meta: { csv: (f) => f.tenant_name ?? '' } },
            { id: 'since', header: 'Tenancy from', accessorFn: (f) => dateLabelAu(f.tenancy_start), meta: { csv: (f) => f.tenancy_start } },
            {
              id: 'consent',
              header: 'Upgrade consent',
              accessorFn: (f) => CONSENT_LABEL[f.consent],
              cell: ({ row }) => <StatusBadge tone={row.original.consent === 'agreed' ? 'good' : row.original.consent === 'declined' ? 'bad' : 'warn'}>{CONSENT_LABEL[row.original.consent]}</StatusBadge>,
            },
            ...(editable
              ? [
                  {
                    id: 'act',
                    header: () => <span className="sr-only">Actions</span>,
                    enableSorting: false,
                    enableHiding: false,
                    meta: { label: 'Actions' },
                    cell: ({ row }: { row: { original: Flat } }) => {
                      const f = row.original
                      return (
                        <div className="flex gap-1">
                          <Confirm title={`Record that flat ${f.unit} agrees?`} description="Only do this with the tenant's agreement. They can also agree themselves with their access code." confirmLabel="Record agreement" onConfirm={() => setConsent(f, 'agreed')}>
                            <Button size="sm" variant="outline" disabled={flatAct.busy || f.consent === 'agreed'} aria-label={`Record that flat ${f.unit} agrees`}>
                              Agree
                            </Button>
                          </Confirm>
                          <Confirm title={`Record that flat ${f.unit} declines?`} description="A flat that declines gets no charge and no work inside the flat." confirmLabel="Record decline" destructive onConfirm={() => setConsent(f, 'declined')}>
                            <Button size="sm" variant="outline" disabled={flatAct.busy || f.consent === 'declined'} aria-label={`Record that flat ${f.unit} declines`}>
                              Decline
                            </Button>
                          </Confirm>
                        </div>
                      )
                    },
                  },
                ]
              : []),
          ]}
        />
      </Panel>
    </div>
  )
}
