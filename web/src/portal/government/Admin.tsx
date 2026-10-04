import { useState } from 'react'
import { api, ProgError } from '@/console/api'
import type { ClockInfo, Scenario } from '@/console/types'
import { useRes } from '@/console/useRes'
import { Confirm } from '@/portal/components/Confirm'
import { PageHeader, Panel } from '@/portal/components/PageHeader'
import { ErrorAlert, LoadingRows } from '@/portal/components/States'
import { Button } from '@/portal/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/portal/components/ui/select'
import { useAction } from '@/portal/lib/actions'
import { usePageTitle } from './shared'

function monthName(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

export default function Admin() {
  usePageTitle('System date')
  const clock = useRes<ClockInfo>(() => api.clock(), [])
  const [scenario, setScenario] = useState<Scenario>('mixed')
  const act = useAction()
  const [last, setLast] = useState('')

  const forbidden = clock.error && !clock.data
  const adv = async (n: number) => {
    const r = await act.run(() => api.advanceClock(n, scenario))
    if (r) {
      setLast(`Moved to ${monthName(r.month)}. ${r.billing_runs} billing runs, ${r.payments} payments, ${r.faults_opened} faults opened, ${r.faults_resolved} resolved, ${r.mv_runs} savings checks.`)
      clock.reload()
    }
  }
  return (
    <div>
      <PageHeader crumbs={[{ label: 'Government', to: '/government' }, { label: 'Administration' }, { label: 'System date' }]} title="System date" description="The date the programme works to. Billing, payments and meter readings are processed month by month from it." />
      {clock.data === null && !clock.error && <LoadingRows rows={2} />}
      {forbidden && (
        <p className="border bg-card p-4" role="status">
          {clock.error && /not available|forbidden|cannot use|access/i.test(clock.error) ? 'Changing the system date is not available on this system.' : <ErrorAlert error={clock.error} onRetry={clock.reload} title="We could not load the system date" />}
        </p>
      )}
      {clock.data && (
        <Panel title="Move the system date forward">
          <p className="mb-3">
            The system month is <strong>{monthName(clock.data.month)}</strong>.
          </p>
          <p className="mb-3 text-muted-foreground">Moves the system date forward and runs billing, payments and readings for each month. It cannot be moved back.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="scn" className="text-sm font-medium">
                How the equipment performs
              </label>
              <Select value={scenario} onValueChange={(v) => setScenario(v as Scenario)}>
                <SelectTrigger id="scn" className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="as_modelled">As modelled</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                  <SelectItem value="underperforming">Below the model</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {[1, 3, 12].map((n) => (
              <Confirm key={n} title={`Move forward ${n} ${n === 1 ? 'month' : 'months'}?`} description={<p>Billing, payments and readings will be processed for each month. This cannot be undone.</p>} confirmLabel="Move forward" onConfirm={() => adv(n)}>
                <Button variant="outline" disabled={act.busy}>
                  Move forward {n} {n === 1 ? 'month' : 'months'}
                </Button>
              </Confirm>
            ))}
            <Confirm
              title="Reset the system?"
              description={<p>This removes every change made since the system was set up and returns the system date to the start. It cannot be undone.</p>}
              confirmLabel="Reset"
              destructive
              onConfirm={async () => {
                const r = await act.run(() => api.resetClock(), 'System reset')
                if (r !== undefined) {
                  setLast('')
                  clock.reload()
                }
              }}
            >
              <Button variant="outline" disabled={act.busy}>
                Reset
              </Button>
            </Confirm>
          </div>
          {act.busy && (
            <p role="status" className="mt-2 text-muted-foreground">
              Working through the months
            </p>
          )}
          <div className="mt-2">
            {act.error instanceof ProgError && act.error.status === 403 ? <p role="alert">Changing the system date is not available on this system.</p> : <ErrorAlert error={act.error} title="The system date did not move" />}
          </div>
          {last && (
            <p role="status" className="mt-2">
              {last}
            </p>
          )}
        </Panel>
      )}
    </div>
  )
}
