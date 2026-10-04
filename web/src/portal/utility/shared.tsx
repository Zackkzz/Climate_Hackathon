import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from '@/portal/components/ui/sonner'
import { csvObjects } from '@/console/api-utility'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/portal/components/ui/alert-dialog'
import { Button } from '@/portal/components/ui/button'
import { Textarea } from '@/portal/components/ui/textarea'
import { Input } from '@/portal/components/ui/input'
import { Label } from '@/portal/components/ui/label'

/** A confirmation that you open yourself, after a form has been checked. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: ReactNode; confirmLabel: string; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to}>{children}</Link>
}

export interface ParsedCsv {
  header: string[]
  rows: Record<string, string>[]
  /** Plain-language problems with the file as a whole. */
  problems: string[]
}

/** Parse CSV text and check the required columns. */
export function parseWithColumns(text: string, required: string[]): ParsedCsv {
  if (!text.trim()) return { header: [], rows: [], problems: [] }
  const { header, rows } = csvObjects(text)
  const problems: string[] = []
  const missing = required.filter((c) => !header.includes(c))
  if (missing.length) problems.push(`The first row must have these column names: ${required.join(', ')}. Missing: ${missing.join(', ')}.`)
  else if (rows.length === 0) problems.push('The file has a header row but no data rows.')
  if (rows.length > 5000) problems.push(`The file has ${rows.length.toLocaleString('en-AU')} rows. The limit is 5,000. Split it into parts.`)
  return { header, rows, problems }
}

/** Choose a CSV file or paste CSV text. Shows a short preview. The text is held by the parent. */
export function CsvInput({ value, onChange, parsed, label, previewCols }: { value: string; onChange: (t: string) => void; parsed: ParsedCsv; label: string; previewCols: string[] }) {
  const fid = useId()
  const tid = useId()
  const [fileName, setFileName] = useState('')
  const preview = parsed.rows.slice(0, 5)
  return (
    <div className="mw-space-y-3">
      <div className="mw-space-y-1">
        <Label htmlFor={fid}>{label}: choose a CSV file</Label>
        <Input
          id={fid}
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            if (f.size > 2_000_000) {
              onChange('')
              setFileName('')
              toast.error('That file is over 2 MB. Split it into smaller files.')
              return
            }
            setFileName(f.name)
            onChange(await f.text())
          }}
        />
        {fileName && <p className="nsw-small mw-text-muted">Loaded {fileName}.</p>}
      </div>
      <div className="mw-space-y-1">
        <Label htmlFor={tid}>Or paste the CSV text here</Label>
        <Textarea id={tid} rows={4} value={value} onChange={(e) => onChange(e.target.value)} className="mw-mono nsw-small" spellCheck={false} />
      </div>
      {parsed.problems.length > 0 && (
        <ul className="mw-list-disc mw-pl-5 mw-text-danger" role="alert">
          {parsed.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {parsed.problems.length === 0 && parsed.rows.length > 0 && (
        <div className="mw-space-y-1" role="status">
          <p>
            <strong>{parsed.rows.length.toLocaleString('en-AU')}</strong> row{parsed.rows.length === 1 ? '' : 's'} found. Preview of the first {preview.length}:
          </p>
          <div className="nsw-overflow-x-auto mw-border" role="region" aria-label="Preview of the file" tabIndex={0}>
            <table className="nsw-width-100 nsw-small">
              <thead>
                <tr className="mw-bg-wash nsw-text-left">
                  {previewCols.map((c) => (
                    <th key={c} className="mw-px-2 mw-py-1 nsw-text-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="mw-border-t">
                    {previewCols.map((c) => (
                      <td key={c} className="mw-px-2 mw-py-1">
                        {r[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export function DownloadButton({ children, onClick, busy }: { children: ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={busy}>
      {children}
    </Button>
  )
}
