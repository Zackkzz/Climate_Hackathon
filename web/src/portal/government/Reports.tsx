import { Download } from '@/portal/components/icons'
import { useEffect, useState } from 'react'
import { govApi } from '@/console/api-gov'
import type { ReportKind } from '@/console/types-gov'
import { PageHeader } from '@/portal/components/PageHeader'
import { ErrorAlert } from '@/portal/components/States'
import { Button } from '@/portal/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/portal/components/ui/table'
import { useAction } from '@/portal/lib/actions'
import { saveText } from '@/portal/lib/csv'

const REPORTS: { kind: ReportKind; name: string; text: string }[] = [
  { kind: 'projects', name: 'Projects', text: 'Every project, its stage, size and owner.' },
  { kind: 'outcomes', name: 'Outcomes', text: 'The headline measures: reach, money and modelled impact.' },
  { kind: 'verified_savings', name: 'Measured savings', text: 'Each savings check: modelled against measured, and any charge corrections.' },
  { kind: 'grants', name: 'Grants', text: 'Every grant request and decision.' },
  { kind: 'charges', name: 'Charges', text: 'Charge, status and balance for each flat. No tenant names.' },
  { kind: 'audit_log', name: 'Audit log', text: 'Every sign-in, read of tenant data, export and change.' },
]

export default function Reports() {
  const act = useAction()
  const [busy, setBusy] = useState<ReportKind | null>(null)
  const [done, setDone] = useState('')
  useEffect(() => {
    document.title = 'Reports | Government | Meterwise'
  }, [])
  const get = async (kind: ReportKind) => {
    setBusy(kind)
    setDone('')
    const t = await act.run(() => govApi.report(kind))
    setBusy(null)
    if (t !== undefined) {
      saveText(`meterwise-${kind}.csv`, t)
      setDone(`Downloaded meterwise-${kind}.csv`)
    }
  }
  return (
    <>
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Reports' }]} title="Reports" description="Download a report as a CSV file that opens in a spreadsheet. Downloads are recorded in the audit log." />
      <ErrorAlert error={act.error} title="We could not download the report" />
      <p role="status" className="mw-mb-2 mw-min-h-6 mw-text-success">
        {done}
      </p>
      <div className="nsw-overflow-x-auto mw-border nsw-fill-white" role="region" aria-label="Reports" tabIndex={0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>What it contains</TableHead>
              <TableHead>
                <span className="sr-only">Download</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {REPORTS.map((r) => (
              <TableRow key={r.kind}>
                <TableCell className="nsw-text-medium">{r.name}</TableCell>
                <TableCell>{r.text}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void get(r.kind)} aria-label={`Download the ${r.name.toLowerCase()} report as CSV`}>
                    <Download aria-hidden="true" /> {busy === r.kind ? 'Preparing' : 'Download CSV'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
