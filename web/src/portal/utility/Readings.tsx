import type { ColumnDef } from '@tanstack/react-table'
import { Download, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { utilityApi } from '@/console/api-utility'
import type { ReadingsResult } from '@/console/types-utility'
import { num } from '@/format'
import { DataTable } from '@/portal/components/DataTable'
import { Figures, PageHeader, Panel } from '@/portal/components/PageHeader'
import { ErrorAlert } from '@/portal/components/States'
import { Button } from '@/portal/components/ui/button'
import { useAction } from '@/portal/lib/actions'
import { saveText } from '@/portal/lib/csv'
import { CsvInput, parseWithColumns } from './shared'

type Rej = ReadingsResult['rejected'][number]
const columns: ColumnDef<Rej>[] = [
  { accessorKey: 'row', header: 'Row in file', meta: { numeric: true } },
  { accessorKey: 'meter_id', header: 'Meter reference', cell: (c) => <span className="font-mono text-sm">{c.getValue<string>() ?? ''}</span> },
  { accessorKey: 'reason', header: 'Why it was rejected' },
]

export default function Readings() {
  useEffect(() => {
    document.title = 'Meter readings | Meterwise'
  }, [])
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseWithColumns(text, ['meter_id', 'month', 'electricity_kwh']), [text])
  const tpl = useAction()
  const up = useAction()
  const [result, setResult] = useState<ReadingsResult | null>(null)

  const canUpload = parsed.rows.length > 0 && parsed.problems.length === 0

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Utility', to: '/utility' }, { label: 'Meter readings' }]}
        title="Meter readings"
        description="Send monthly meter data for the programme's meters. The measured savings checks use it instead of modelled estimates."
      />
      <div className="space-y-4">
        <Panel title="1. Get the template" description="A CSV with the meters whose readings are due.">
          <Button
            variant="outline"
            disabled={tpl.busy}
            onClick={async () => {
              const t = await tpl.run(() => utilityApi.readingsTemplate())
              if (t !== undefined) saveText('readings-template.csv', t)
            }}
          >
            <Download aria-hidden="true" /> Download the template
          </Button>
          <div className="mt-2">
            <ErrorAlert error={tpl.error} />
          </div>
        </Panel>

        <Panel title="2. Upload readings" description="Columns: meter_id, month (like 2027-03), electricity_kwh, gas_mj. Up to 5,000 rows.">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Rows are rejected for a meter that is not in your network area, or where the tenant has not given data consent, or has withdrawn it. Nothing is stored for a rejected row.</p>
            <CsvInput value={text} onChange={(t) => { setText(t); setResult(null) }} parsed={parsed} label="Readings" previewCols={['meter_id', 'month', 'electricity_kwh', 'gas_mj']} />
            <ErrorAlert error={up.error} title="We could not upload the readings" />
            <Button
              disabled={!canUpload || up.busy}
              onClick={async () => {
                const r = await up.run(
                  () =>
                    utilityApi.uploadReadings(
                      parsed.rows.map((x) => ({ meter_id: x.meter_id, month: x.month, electricity_kwh: x.electricity_kwh === '' ? NaN : Number(x.electricity_kwh), gas_mj: x.gas_mj === '' || x.gas_mj === undefined ? 0 : Number(x.gas_mj) })),
                    ),
                  'Upload finished',
                )
                if (r) setResult(r)
              }}
            >
              <Upload aria-hidden="true" /> {up.busy ? 'Uploading' : `Upload ${canUpload ? num(parsed.rows.length) + (parsed.rows.length === 1 ? ' row' : ' rows') : 'readings'}`}
            </Button>
          </div>
        </Panel>

        {result && (
          <Panel title="3. Result">
            <div role="status">
              <Figures
                label="Upload result"
                items={[
                  { label: 'Accepted', value: num(result.accepted), tone: 'good' },
                  { label: 'Rejected', value: num(result.rejected.length), tone: result.rejected.length ? 'warn' : undefined },
                ]}
              />
            </div>
            {result.rejected.length === 0 ? (
              <p>Every row was accepted.</p>
            ) : (
              <DataTable
                columns={columns}
                data={result.rejected}
                caption="Rejected rows"
                searchPlaceholder="Search rejected rows"
                csvName="rejected-rows"
                pageSize={25}
              />
            )}
          </Panel>
        )}
      </div>
    </>
  )
}
