import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { Download } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { utilityApi } from '@/console/api-utility'
import type { RemittanceResult } from '@/console/types-utility'
import { useRes } from '@/console/useRes'
import { money, num } from '@/format'
import { DataTable } from '@/portal/components/DataTable'
import { TextField } from '@/portal/components/fields'
import { Figures, PageHeader, Panel } from '@/portal/components/PageHeader'
import { ErrorAlert } from '@/portal/components/States'
import { Button } from '@/portal/components/ui/button'
import { Form } from '@/portal/components/ui/form'
import { useAction } from '@/portal/lib/actions'
import { saveText } from '@/portal/lib/csv'
import { ConfirmDialog, CsvInput, parseWithColumns } from './shared'

const monthSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a month, like 2027-03.') })
type Mismatch = RemittanceResult['mismatches'][number]
const cols: ColumnDef<Mismatch>[] = [
  { accessorKey: 'meter_id', header: 'Meter reference', cell: (c) => <span className="font-mono text-sm">{c.getValue<string>()}</span> },
  { accessorKey: 'expected', header: 'Charge due', cell: (c) => (c.getValue<number | undefined>() === undefined ? '-' : money(c.getValue<number>())), meta: { numeric: true, csv: (r) => r.expected ?? '' } },
  { accessorKey: 'received', header: 'Received', cell: (c) => (c.getValue<number | undefined>() === undefined ? '-' : money(c.getValue<number>())), meta: { numeric: true, csv: (r) => r.received ?? '' } },
  { accessorKey: 'reason', header: 'Problem' },
]

export default function Charges() {
  useEffect(() => {
    document.title = 'Charges and remittance | Meterwise'
  }, [])
  const sum = useRes(() => utilityApi.summary(), [])
  const month = sum.data?.billing.month ?? ''

  const fileForm = useForm<z.infer<typeof monthSchema>>({ resolver: zodResolver(monthSchema), defaultValues: { month: '' } })
  const remForm = useForm<z.infer<typeof monthSchema>>({ resolver: zodResolver(monthSchema), defaultValues: { month: '' } })
  useEffect(() => {
    if (month) {
      if (!fileForm.getValues('month')) fileForm.setValue('month', month)
      if (!remForm.getValues('month')) remForm.setValue('month', month)
    }
  }, [month, fileForm, remForm])

  const dl = useAction()
  const rem = useAction()
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseWithColumns(text, ['meter_id', 'amount']), [text])
  const [result, setResult] = useState<RemittanceResult | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const bad = parsed.rows.filter((r) => !(Number(r.amount) >= 0) || r.amount === '').length
  const total = parsed.rows.reduce((s, r) => s + (Number(r.amount) >= 0 ? Number(r.amount) : 0), 0)
  const canPost = parsed.rows.length > 0 && parsed.problems.length === 0

  const post = async (m: string) => {
    setConfirm(null)
    const r = await rem.run(() => utilityApi.remit(m, parsed.rows.map((x) => ({ meter_id: x.meter_id, amount: Number(x.amount) }))), 'Remittance posted to the ledgers')
    if (r) setResult(r)
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Utility', to: '/utility' }, { label: 'Charges and remittance' }]}
        title="Charges and remittance"
        description="Download the monthly charge file for on-bill collection. Then tell us what you collected and passed on."
      />
      <div className="space-y-4">
        <Panel title="Charge file" description="One row per meter: meter reference, amount, status and whether the charge is paused. Paused charges are listed at $0.">
          <Form {...fileForm}>
            <form
              className="flex flex-wrap items-end gap-3"
              noValidate
              onSubmit={fileForm.handleSubmit(async (v) => {
                const t = await dl.run(() => utilityApi.chargeFile(v.month))
                if (t !== undefined) saveText(`charge-file-${v.month}.csv`, t)
              })}
            >
              <TextField control={fileForm.control} name="month" label="Month" type="month" className="w-48" />
              <Button type="submit" variant="outline" disabled={dl.busy}>
                <Download aria-hidden="true" /> Download charge file
              </Button>
            </form>
          </Form>
          <div className="mt-2">
            <ErrorAlert error={dl.error} />
          </div>
        </Panel>

        <Panel title="Remittance" description="What you collected and passed on for the month. It is posted as payments on each flat's ledger.">
          <Form {...remForm}>
            <form
              className="space-y-3"
              noValidate
              onSubmit={remForm.handleSubmit((v) => {
                if (!canPost) return
                setConfirm(v.month)
              })}
            >
              <TextField control={remForm.control} name="month" label="Month collected for" type="month" className="w-48" />
              <p className="text-sm text-muted-foreground">Columns: meter_id, amount. Up to 5,000 rows.</p>
              <CsvInput value={text} onChange={(t) => { setText(t); setResult(null) }} parsed={parsed} label="Remittance" previewCols={['meter_id', 'amount']} />
              {canPost && bad > 0 && (
                <p className="text-warning" role="status">
                  {bad} row{bad === 1 ? ' has' : 's have'} an amount that is not a number. {bad === 1 ? 'It' : 'They'} will be listed as problems.
                </p>
              )}
              <ErrorAlert error={rem.error} title="We could not post the remittance" />
              <Button type="submit" disabled={!canPost || rem.busy}>
                {rem.busy ? 'Posting' : 'Post remittance'}
              </Button>
            </form>
          </Form>
        </Panel>

        {result && (
          <Panel title={`Result for ${result.month}`}>
            <div role="status">
              <Figures
                label="Remittance result"
                items={[
                  { label: 'Rows', value: num(result.rows ?? 0) },
                  { label: 'Payments posted', value: num(result.posted ?? 0), tone: 'good' },
                  { label: 'Received', value: money(result.total_received ?? 0) },
                  { label: 'Due', value: money(result.total_due ?? 0) },
                  { label: 'Mismatches', value: num(result.mismatches.length), tone: result.mismatches.length ? 'warn' : undefined },
                ]}
              />
            </div>
            {result.mismatches.length === 0 ? (
              <p>Every amount matched the charge due.</p>
            ) : (
              <DataTable columns={cols} data={result.mismatches} caption="Mismatch report" csvName={`remittance-mismatches-${result.month}`} searchPlaceholder="Search the mismatch report" />
            )}
          </Panel>
        )}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Post this remittance?"
        confirmLabel="Post payments"
        description={
          <p>
            This posts {num(parsed.rows.length)} payment{parsed.rows.length === 1 ? '' : 's'} totalling <strong>{money(total)}</strong> for {confirm} to the flats' ledgers. It cannot be undone from here.
          </p>
        }
        onConfirm={() => confirm && void post(confirm)}
      />
    </>
  )
}
