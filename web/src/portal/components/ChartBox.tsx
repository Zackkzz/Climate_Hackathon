import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Table2, BarChart3 } from '@/portal/components/icons'
import { Button } from '@/portal/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/portal/components/ui/table'
import { Panel } from './PageHeader'

export interface ChartTable {
  columns: { label: string; numeric?: boolean }[]
  rows: (string | number)[][]
}

/**
 * Every chart goes in one of these: a title, the chart, and a "Show as table" switch that shows the same numbers
 * in an accessible table. Series are told apart by direct labels or patterns as well as colour.
 */
export function ChartBox({ title, description, chart, table, legend }: { title: string; description?: ReactNode; chart: ReactNode; table: ChartTable; legend?: ReactNode }) {
  const [asTable, setAsTable] = useState(false)
  const id = useId()
  return (
    <Panel
      title={title}
      description={description}
      actions={
        <Button variant="outline" size="sm" aria-pressed={asTable} aria-controls={id} onClick={() => setAsTable((v) => !v)}>
          {asTable ? <BarChart3 /> : <Table2 />}
          {asTable ? 'Show as chart' : 'Show as table'}
        </Button>
      }
    >
      <div id={id}>
        {asTable ? (
          <div className="mw-max-h-96 nsw-overflow-auto mw-border" role="region" aria-label={`${title}, as a table`} tabIndex={0}>
            <Table>
              <TableHeader>
                <TableRow>
                  {table.columns.map((c, i) => (
                    <TableHead key={i} className={c.numeric ? 'nsw-text-right' : ''}>
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((r, i) => (
                  <TableRow key={i}>
                    {r.map((v, j) => (
                      <TableCell key={j} className={table.columns[j]?.numeric ? 'nsw-text-right mw-tabular' : ''}>
                        {v}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <>
            {chart}
            {legend && <div className="mw-mt-2 nsw-display-flex nsw-flex-wrap mw-gap-4 nsw-small">{legend}</div>}
          </>
        )}
      </div>
    </Panel>
  )
}

/** A legend entry with a pattern swatch as well as colour. */
export function LegendKey({ label, color, dashed }: { label: string; color: string; dashed?: boolean }) {
  return (
    <span className="nsw-display-inline-flex nsw-align-items-center mw-gap-1">
      <svg width="22" height="10" aria-hidden="true">
        <line x1="0" y1="5" x2="22" y2="5" stroke={color} strokeWidth="3" strokeDasharray={dashed ? '4 3' : undefined} />
      </svg>
      {label}
    </span>
  )
}
