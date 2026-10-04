import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/console/api'
import type { Audit as AuditT } from '@/console/types'
import { money } from '@/format'
import { dateLabelAu } from '@/portal/lib/dates'
import { ErrorAlert } from '@/portal/components/States'
import { Facts, Panel } from '@/portal/components/PageHeader'
import { DateField, NumberField, SelectField, TextAreaField, TextField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Form } from '@/portal/components/ui/form'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/portal/components/ui/table'
import { useAction } from '@/portal/lib/actions'
import { canEdit, dateText, isIsoDate } from './shared'
import type { TabProps } from './shared'

const num = (label: string, min: number, max: number) =>
  z.coerce.number({ message: `Enter ${label}.` }).int('Use a whole number.').min(min, `${label[0].toUpperCase()}${label.slice(1)} must be at least ${min}.`).max(max, `${label[0].toUpperCase()}${label.slice(1)} must be ${max} or fewer.`)

const schema = z.object({
  visited_on: z.string().refine(isIsoDate, dateText('The visit date')),
  by: z.string().trim().min(1, 'Enter who did the site visit.'),
  storeys: num('the number of storeys', 1, 30),
  flats: num('the number of flats', 1, 500),
  roof_m2: z.coerce.number({ message: 'Enter the roof area in square metres.' }).min(10, 'The roof must be at least 10 square metres.').max(10000, 'That roof area is too large.'),
  roof_condition: z.enum(['sound', 'needs_repair', 'unsuitable'], { message: 'Choose the roof condition.' }),
  roof_colour: z.enum(['dark', 'light'], { message: 'Choose the roof colour.' }),
  switchboard_amps: num('the switchboard rating in amps', 10, 1000),
  hot_water_layout: z.enum(['per_flat', 'shared'], { message: 'Choose the hot water layout.' }),
  gas_meters: num('the number of gas meters', 0, 500),
  notes: z.string().max(2000, 'Keep notes under 2000 characters.').optional(),
})
type In = z.input<typeof schema>
type Out = z.output<typeof schema>

const FIELD_LABEL: Record<string, string> = {
  storeys: 'Storeys',
  flats: 'Flats',
  roof_m2: 'Roof area (m2)',
  roof_condition: 'Roof condition',
  roof_colour: 'Roof colour',
  switchboard_amps: 'Switchboard (amps)',
  hot_water_layout: 'Hot water layout',
  gas_meters: 'Gas meters',
}
const show = (v: unknown) => (v === null || v === undefined ? 'Not known' : String(v).replace(/_/g, ' '))

export default function Audit({ p, role, onChange }: TabProps) {
  const act = useAction()
  const a = p.audit
  const b = p.building as Record<string, unknown>
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(schema),
    defaultValues: {
      visited_on: a?.visited_on ?? '',
      by: a?.by ?? '',
      storeys: (a?.storeys ?? b.storeys ?? '') as number,
      flats: (a?.flats ?? p.flats ?? '') as number,
      roof_m2: (a?.roof_m2 ?? b.roof_m2 ?? '') as number,
      roof_condition: a?.roof_condition,
      roof_colour: (a?.roof_colour as 'dark' | 'light' | undefined) ?? undefined,
      switchboard_amps: (a?.switchboard_amps ?? '') as number,
      hot_water_layout: a?.hot_water_layout,
      gas_meters: (a?.gas_meters ?? '') as number,
      notes: a?.notes ?? '',
    },
  })
  const editable = canEdit(role)
  const changes = a?.changes ?? []

  const submit = form.handleSubmit(async (v) => {
    const body: Partial<AuditT> = { ...v, notes: v.notes ?? '' }
    const r = await act.run(() => api.saveAudit(p.id, body), 'Site audit saved and the deal reassessed')
    if (r) onChange(r)
  })

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Panel title="Site audit" description="What was found on the visit. Saving it corrects the open-data guess and reassesses the deal.">
        {!editable && <p className="mb-3 text-muted-foreground">Only the programme office and the owner can change the audit.</p>}
        <Form {...form}>
          <form className="space-y-3" noValidate onSubmit={submit} aria-label="Site audit form">
            <fieldset disabled={!editable || act.busy} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <DateField control={form.control} name="visited_on" label="Date of visit" />
                <TextField control={form.control} name="by" label="Visited by" />
                <NumberField control={form.control} name="storeys" label="Storeys" min={1} />
                <NumberField control={form.control} name="flats" label="Flats" min={1} />
                <NumberField control={form.control} name="roof_m2" label="Roof area (m2)" min={10} />
                <SelectField control={form.control} name="roof_condition" label="Roof condition" options={[{ value: 'sound', label: 'Sound' }, { value: 'needs_repair', label: 'Needs repair' }, { value: 'unsuitable', label: 'Unsuitable for a cool roof' }]} />
                <SelectField control={form.control} name="roof_colour" label="Roof colour now" options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
                <NumberField control={form.control} name="switchboard_amps" label="Switchboard rating (amps)" min={10} />
                <SelectField control={form.control} name="hot_water_layout" label="Hot water layout" options={[{ value: 'per_flat', label: 'A unit in each flat' }, { value: 'shared', label: 'Shared for the block' }]} />
                <NumberField control={form.control} name="gas_meters" label="Gas meters" min={0} />
              </div>
              <TextAreaField control={form.control} name="notes" label="Notes" />
            </fieldset>
            <ErrorAlert error={act.error} title="We could not save the audit" />
            {editable && (
              <Button type="submit" disabled={act.busy}>
                {act.busy ? 'Saving' : 'Save audit'}
              </Button>
            )}
          </form>
        </Form>
      </Panel>

      <div className="space-y-4">
        <Panel title="What changed from the open-data guess" description={a ? `Visit on ${dateLabelAu(a.visited_on)} by ${a.by}` : undefined}>
          {!a ? (
            <p className="text-muted-foreground">No audit has been saved yet. The deal uses the open-data estimate.</p>
          ) : changes.length === 0 ? (
            <p>The visit found nothing different from the open-data guess.</p>
          ) : (
            <div className="overflow-x-auto border" role="region" aria-label="Changes from the open-data guess" tabIndex={0}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Open data</TableHead>
                    <TableHead className="text-right">Site visit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changes.map((c) => (
                    <TableRow key={c.field}>
                      <TableCell>{FIELD_LABEL[c.field] ?? c.field.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-right tabular-nums">{show(c.from)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{show(c.to)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
        <Panel title="Reassessed result">
          <Facts
            items={[
              { label: 'Net cost', value: money(p.summary.net_capex) },
              { label: 'Funding gap', value: money(p.summary.funding_gap) },
              { label: 'Whole-block charge', value: `${money(p.summary.charge_per_month_building)} a month` },
              { label: 'Tenant keeps', value: `${money(p.summary.tenant_net_saving_per_month)} a month` },
              { label: 'Fully funded', value: p.summary.fully_funded ? 'Yes' : 'No' },
            ]}
          />
        </Panel>
      </div>
    </div>
  )
}
