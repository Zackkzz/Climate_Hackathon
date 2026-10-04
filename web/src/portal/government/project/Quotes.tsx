import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { cleanName } from '@/portal/lib/labels'
import { z } from 'zod'
import { api } from '@/console/api'
import type { Quote } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money, pct } from '@/format'
import { Confirm } from '@/portal/components/Confirm'
import { DataTable } from '@/portal/components/DataTable'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { Panel } from '@/portal/components/PageHeader'
import { StatusBadge } from '@/portal/components/Status'
import { DateField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Checkbox } from '@/portal/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/portal/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/portal/components/ui/form'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/portal/components/ui/table'
import { useAction } from '@/portal/lib/actions'
import { dateLabelAu } from '@/portal/lib/dates'
import { canManage, dateText, isIsoDate, refetch } from './shared'
import type { TabProps } from './shared'

const tenderSchema = z.object({
  installer_org_ids: z.array(z.number()).min(1, 'Choose at least one installer.'),
  closes_on: z.string().refine(isIsoDate, dateText('The closing date')),
})

const STATUS: Record<Quote['status'], { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  submitted: { label: 'Submitted', tone: 'warn' },
  accepted: { label: 'Accepted', tone: 'good' },
  declined: { label: 'Declined', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}

function QuoteItems({ q }: { q: Quote }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`See line items for the quote from ${cleanName(q.installer_org.name)}`}>
          Line items
        </Button>
      </DialogTrigger>
      <DialogContent className="mw-max-w-2xl">
        <DialogHeader>
          <DialogTitle>{cleanName(q.installer_org.name)}</DialogTitle>
          <DialogDescription>
            Quote {dateLabelAu(q.submitted_on)}, valid until {dateLabelAu(q.valid_until)}. {q.note}
          </DialogDescription>
        </DialogHeader>
        <div className="nsw-overflow-x-auto mw-border" role="region" aria-label="Quote line items" tabIndex={0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="nsw-text-right">Quantity</TableHead>
                <TableHead className="nsw-text-right">Unit price</TableHead>
                <TableHead className="nsw-text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.items.map((i) => (
                <TableRow key={i.key}>
                  <TableCell>{i.label}</TableCell>
                  <TableCell className="nsw-text-right mw-tabular">{i.qty}</TableCell>
                  <TableCell className="nsw-text-right mw-tabular">{money(i.unit_price)}</TableCell>
                  <TableCell className="nsw-text-right mw-tabular">{money(i.total)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="nsw-text-semibold">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="nsw-text-right mw-tabular">{money(q.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function Quotes(props: TabProps) {
  const { p, role, onChange } = props
  const manager = canManage(role)
  const orgs = useRes(() => (manager ? api.orgs() : Promise.resolve([])), [manager])
  const tender = useAction()
  const accept = useAction()
  const form = useForm<z.input<typeof tenderSchema>, unknown, z.output<typeof tenderSchema>>({ resolver: zodResolver(tenderSchema), defaultValues: { installer_org_ids: [], closes_on: '' } })
  const hasAccepted = p.quotes.some((q) => q.status === 'accepted')

  return (
    <div className="mw-space-y-4">
      {manager && (
        <Panel title="Open a tender" description="Invite installers to quote. They see the quantities and the modelled prices.">
          <Gate res={orgs} rows={2}>
            {(list) => {
              const installers = list.filter((o) => o.kind === 'installer')
              return (
                <Form {...form}>
                  <form
                    className="mw-space-y-3"
                    noValidate
                    onSubmit={form.handleSubmit(async (v) => {
                      const r = await tender.run(() => api.openTender(p.id, v.installer_org_ids, v.closes_on), 'Tender opened')
                      if (r !== undefined) await refetch(props)
                    })}
                  >
                    <FormField
                      control={form.control}
                      name="installer_org_ids"
                      render={({ field }) => (
                        <FormItem>
                          <fieldset>
                            <legend className="mw-mb-1 nsw-small nsw-text-medium">Installers to invite</legend>
                            {installers.length === 0 && <p className="mw-text-muted">No installers are registered.</p>}
                            <div className="mw-space-y-1">
                              {installers.map((o) => (
                                <div key={o.id} className="nsw-display-flex nsw-align-items-center mw-gap-2">
                                  <FormControl>
                                    <Checkbox
                                      id={`inst-${o.id}`}
                                      checked={field.value.includes(o.id)}
                                      onCheckedChange={(c) => field.onChange(c ? [...field.value, o.id] : field.value.filter((x: number) => x !== o.id))}
                                    />
                                  </FormControl>
                                  <FormLabel htmlFor={`inst-${o.id}`} className="nsw-text-normal">
                                    {cleanName(o.name)}
                                  </FormLabel>
                                </div>
                              ))}
                            </div>
                          </fieldset>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DateField control={form.control} name="closes_on" label="Tender closes on" className="mw-max-w-xs" />
                    <ErrorAlert error={tender.error} title="We could not open the tender" />
                    <Button type="submit" disabled={tender.busy || installers.length === 0}>
                      {tender.busy ? 'Opening' : 'Open tender'}
                    </Button>
                  </form>
                </Form>
              )
            }}
          </Gate>
        </Panel>
      )}

      <Panel title="Quotes" description="Each quote is compared with the modelled cost the offer was built on.">
        <ErrorAlert error={accept.error} title="We could not accept the quote" />
        <DataTable<Quote>
          caption="Quotes"
          data={p.quotes}
          getRowId={(q) => String(q.id)}
          emptyTitle="No quotes yet"
          emptyText={p.stage === 'procurement' ? 'Open a tender and installers can quote.' : 'Quotes are collected once the project reaches the Quotes stage.'}
          csvName={`project-${p.id}-quotes`}
          searchPlaceholder="Search quotes"
          columns={[
            { id: 'installer', header: 'Installer', accessorFn: (q) => cleanName(q.installer_org.name) },
            { accessorKey: 'total', header: 'Quoted', cell: ({ row }) => money(row.original.total), meta: { numeric: true } },
            { accessorKey: 'modelled_total', header: 'Modelled', cell: ({ row }) => money(row.original.modelled_total), meta: { numeric: true } },
            {
              id: 'diff',
              header: 'Difference',
              accessorFn: (q) => q.total - q.modelled_total,
              cell: ({ row }) => {
                const d = row.original.total - row.original.modelled_total
                const r = row.original.modelled_total ? (d / row.original.modelled_total) * 100 : 0
                return (
                  <span className={d > 0 ? 'mw-text-warning' : 'mw-text-success'}>
                    {d > 0 ? '+' : d < 0 ? '-' : ''}
                    {money(Math.abs(d))} ({d > 0 ? 'over' : d < 0 ? 'under' : 'on'} by {pct(Math.abs(r), 1)})
                  </span>
                )
              },
              meta: { numeric: true },
            },
            { id: 'valid', header: 'Valid until', accessorFn: (q) => dateLabelAu(q.valid_until), meta: { csv: (q) => q.valid_until } },
            { id: 'status', header: 'Status', accessorFn: (q) => STATUS[q.status].label, cell: ({ row }) => <StatusBadge tone={STATUS[row.original.status].tone}>{STATUS[row.original.status].label}</StatusBadge> },
            {
              id: 'act',
              header: () => <span className="sr-only">Actions</span>,
              enableSorting: false,
              enableHiding: false,
              meta: { label: 'Actions' },
              cell: ({ row }) => {
                const q = row.original
                return (
                  <div className="nsw-display-flex mw-gap-1">
                    <QuoteItems q={q} />
                    {manager && q.status === 'submitted' && !hasAccepted && (
                      <Confirm
                        title={`Accept the quote from ${cleanName(q.installer_org.name)}?`}
                        description={`This accepts a quote of ${money(q.total)}, declines the other quotes and reassesses the deal with the quoted prices.`}
                        confirmLabel="Accept quote"
                        onConfirm={async () => {
                          const r = await accept.run(() => api.acceptQuote(q.id), 'Quote accepted and the deal reassessed')
                          if (r) onChange(r)
                        }}
                      >
                        <Button size="sm" disabled={accept.busy}>
                          Accept
                        </Button>
                      </Confirm>
                    )}
                  </div>
                )
              },
            },
          ]}
        />
      </Panel>
    </div>
  )
}
