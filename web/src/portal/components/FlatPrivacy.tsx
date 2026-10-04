// Side-sheet panel for one flat: meter-data consent (separate from upgrade consent) and the tenant's personal data
// (export as a file, erase the name). Used by the government and property flat sheets.
import { useState } from 'react'
import { api } from '@/console/api'
import { consentApi } from '@/console/consent'
import type { DataConsent } from '@/console/consent'
import { useRes } from '@/console/useRes'
import { Confirm } from '@/portal/components/Confirm'
import { Facts } from '@/portal/components/PageHeader'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { StatusBadge } from '@/portal/components/Status'
import { Button } from '@/portal/components/ui/button'
import { Input } from '@/portal/components/ui/input'
import { Label } from '@/portal/components/ui/label'
import { useAction } from '@/portal/lib/actions'
import { saveText } from '@/portal/lib/csv'

const fmt = (d: string | null) => {
  if (!d) return ''
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${Number(day)}/${Number(m)}/${y}`
}

export function FlatPrivacy({ flatId, unit, onChanged }: { flatId: number; unit: string; onChanged?: () => void }) {
  const res = useRes(() => consentApi.get(flatId), [flatId])
  const act = useAction()
  const exp = useAction()
  const erase = useAction()
  const [note, setNote] = useState('')
  const [noteErr, setNoteErr] = useState('')
  const [erased, setErased] = useState<string | null>(null)

  const give = async () => {
    if (note.trim().length < 5) {
      setNoteErr('Say how the tenant gave consent, for example "signed form on 3 March".')
      return
    }
    setNoteErr('')
    const r = await act.run(() => consentApi.set(flatId, true, { note: note.trim() }), 'Meter-data consent recorded')
    if (r) {
      res.set(r)
      setNote('')
      onChanged?.()
    }
  }
  const withdraw = async () => {
    const r = await act.run(() => consentApi.set(flatId, false), 'Meter-data consent withdrawn')
    if (r) {
      res.set(r)
      onChanged?.()
    }
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby={`dc-${flatId}`} className="border p-3">
        <h3 id={`dc-${flatId}`} className="mb-2 text-base font-semibold">
          Meter-data consent
        </h3>
        <Gate res={res} rows={2}>
          {(c: DataConsent) => (
            <div className="space-y-2">
              <p>{c.given ? <StatusBadge tone="good">Given</StatusBadge> : <StatusBadge tone="warn">Not given</StatusBadge>}</p>
              <Facts
                items={[
                  ...(c.given ? [{ label: 'Ends', value: fmt(c.expires_on) }, { label: 'Recorded by', value: c.given_by ?? '' }, ...(c.recorded_note ? [{ label: 'How', value: c.recorded_note }] : [])] : []),
                  { label: 'What it covers', value: c.scope },
                  { label: 'Why', value: c.purpose },
                ]}
              />
              <p className="text-muted-foreground">{c.note}</p>
              <ErrorAlert error={act.error} />
              {c.given ? (
                <Confirm title="Withdraw meter-data consent?" description={`The programme will stop using new meter readings for unit ${unit}.`} confirmLabel="Withdraw" destructive onConfirm={() => withdraw()}>
                  <Button variant="outline" size="sm" disabled={act.busy}>
                    Withdraw consent
                  </Button>
                </Confirm>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor={`dcn-${flatId}`}>How did the tenant give consent?</Label>
                  <Input id={`dcn-${flatId}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: signed form on 3 March" aria-invalid={!!noteErr} aria-describedby={noteErr ? `dce-${flatId}` : undefined} />
                  {noteErr && (
                    <p id={`dce-${flatId}`} className="text-sm text-destructive">
                      {noteErr}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">Tenants can also give this themselves on their own page. Consent runs for two years unless withdrawn.</p>
                  <Button size="sm" disabled={act.busy} onClick={() => void give()}>
                    Record consent
                  </Button>
                </div>
              )}
            </div>
          )}
        </Gate>
      </section>

      <section aria-labelledby={`pd-${flatId}`} className="border p-3">
        <h3 id={`pd-${flatId}`} className="mb-2 text-base font-semibold">
          Personal data
        </h3>
        <p className="mb-2 text-muted-foreground">Export everything held about this flat, or erase the names of former tenants.</p>
        <ErrorAlert error={exp.error} />
        <ErrorAlert error={erase.error} />
        {erased && (
          <p role="status" className="mb-2 text-success">
            {erased}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={exp.busy}
            onClick={async () => {
              const d = await exp.run(() => api.personalData(flatId), 'Personal data downloaded')
              if (d) saveText(`personal-data-flat-${unit}.json`, JSON.stringify(d, null, 2), 'application/json')
            }}
          >
            Export personal data
          </Button>
          <Confirm
            title={`Erase personal data for unit ${unit}?`}
            description={
              <>
                <p>Names of former tenants become "Former tenant" and their access codes are removed. The current tenant is not changed.</p>
                <p className="mt-2">The charge ledger stays, because it belongs to the meter and is needed for the funder accounts. This cannot be undone.</p>
              </>
            }
            confirmLabel="Erase"
            destructive
            onConfirm={async () => {
              const r = await erase.run(() => api.erasePersonalData(flatId))
              if (r) {
                setErased(`Done. ${r.tenancies_erased} former tenancy record${r.tenancies_erased === 1 ? '' : 's'} erased. ${r.kept}`)
                onChanged?.()
              }
            }}
          >
            <Button variant="outline" size="sm" disabled={erase.busy}>
              Erase personal data
            </Button>
          </Confirm>
        </div>
      </section>
    </div>
  )
}
