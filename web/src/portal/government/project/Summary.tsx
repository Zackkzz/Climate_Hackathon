import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/console/api'
import { STAGES } from '@/console/types'
import type { Stage } from '@/console/types'
import { dateLabelAu } from '@/portal/lib/dates'
import { money, num1 } from '@/format'
import { Confirm } from '@/portal/components/Confirm'
import { ErrorAlert } from '@/portal/components/States'
import { Facts, Figures, Panel } from '@/portal/components/PageHeader'
import { STAGE_LABEL, StatusBadge } from '@/portal/components/Status'
import { NumberField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Form } from '@/portal/components/ui/form'
import { Input } from '@/portal/components/ui/input'
import { Label } from '@/portal/components/ui/label'
import { useAction } from '@/portal/lib/actions'
import { canManage } from './shared'
import type { TabProps } from './shared'

const grantSchema = z.object({ grant: z.coerce.number({ message: 'Enter an amount in dollars.' }).min(0, 'The grant cannot be negative.').max(5_000_000, 'That is more than the grant pool.') })

const startMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

export default function Summary({ p, role, onChange }: TabProps) {
  const adv = useAction()
  const [startMonth, setStartMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const startErr = startMonthSchema.safeParse(startMonth).success ? '' : 'Enter a month like 2026-11.'
  const patch = useAction()
  const idx = STAGES.indexOf(p.stage)
  const next: Stage | undefined = STAGES[idx + 1]
  const s = p.summary
  const form = useForm<z.input<typeof grantSchema>, unknown, z.output<typeof grantSchema>>({ resolver: zodResolver(grantSchema), defaultValues: { grant: s.grant_allocated } })

  const history = [...p.stage_history].sort((a, b) => a.at.localeCompare(b.at))
  const reached = new Set(history.map((h) => h.stage))

  const saveGrant = form.handleSubmit(async (v) => {
    const r = await patch.run(() => api.patchProject(p.id, { grant_allocated: v.grant }), 'Grant updated and the deal reassessed')
    if (r) onChange(r)
  })

  return (
    <div className="mw-space-y-4">
      <Figures
        label="Deal figures"
        items={[
          { label: 'Net cost', value: money(s.net_capex) },
          { label: 'Funding gap', value: money(s.funding_gap), tone: s.funding_gap > 0 ? 'warn' : 'good', note: s.fully_funded ? 'Fully funded' : 'Not fully funded' },
          { label: 'Grant allocated', value: money(s.grant_allocated) },
          { label: 'Charge, whole block', value: `${money(s.charge_per_month_building)} a month` },
          { label: 'Tenant keeps', value: `${money(s.tenant_net_saving_per_month)} a month` },
          { label: 'Emissions cut', value: `${num1(s.co2e_t_per_year_saved)} t a year` },
        ]}
      />

      <div className="nsw-display-grid mw-gap-4 mw-lg-grid-cols-2">
        <Panel title="Next step">
          <p>{p.next_step}</p>
          {p.blocked_by.length > 0 && (
            <div className="mw-mt-3">
              <p className="nsw-text-medium">Blocking this step</p>
              <ul className="mw-list-disc mw-pl-5">
                {p.blocked_by.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {p.flags.length > 0 && (
            <div className="mw-mt-3 nsw-display-flex nsw-flex-wrap mw-gap-2">
              {p.flags.map((f) => (
                <StatusBadge key={f} tone="warn">
                  {f === 'charge_paused' ? 'Charge paused' : f === 'true_up_due' ? 'Charge check due' : f.replace(/_/g, ' ')}
                </StatusBadge>
              ))}
            </div>
          )}
          {canManage(role) && next && (
            <div className="mw-mt-4 mw-space-y-2">
              {next === 'active' && (
                <div className="mw-max-w-xs mw-space-y-1">
                  <Label htmlFor="start-month">Start month for charges</Label>
                  <Input id="start-month" type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} aria-invalid={!!startErr} aria-describedby="start-month-h" />
                  <p id="start-month-h" className={'nsw-small ' + (startErr ? 'mw-text-danger' : 'mw-text-muted')}>
                    {startErr || 'Charges begin the month after this one.'}
                  </p>
                </div>
              )}
              <Confirm
                title={`Move to ${STAGE_LABEL[next]}?`}
                description={`This moves ${p.label} from ${STAGE_LABEL[p.stage]} to ${STAGE_LABEL[next]}. The server checks every condition first and will say what is missing.`}
                confirmLabel="Move to the next stage"
                onConfirm={async () => {
                  const r = await adv.run(() => api.advance(p.id, next, undefined, next === 'active' ? startMonth : undefined), `Moved to ${STAGE_LABEL[next]}`)
                  if (r) onChange(r)
                }}
              >
                <Button disabled={adv.busy || !!startErr}>{adv.busy ? 'Checking' : `Move to ${STAGE_LABEL[next]}`}</Button>
              </Confirm>
              <ErrorAlert error={adv.error} title={`Not ready for ${STAGE_LABEL[next]} yet`} />
            </div>
          )}
          {!next && <p className="mw-mt-3 mw-text-muted">This project is at the last stage.</p>}
        </Panel>

        <Panel title="Where the project is">
          <ol className="mw-space-y-1" aria-label="Stages">
            {STAGES.map((st, i) => {
              const h = history.filter((x) => x.stage === st).pop()
              const state = st === p.stage ? 'Current' : i < idx || reached.has(st) ? 'Done' : 'To come'
              return (
                <li key={st} className="nsw-display-flex nsw-flex-wrap nsw-align-items-baseline mw-gap-x-3 mw-border-b mw-py-1 mw-last-no-border" aria-current={st === p.stage ? 'step' : undefined}>
                  <span className={'mw-w-28 ' + (st === p.stage ? 'nsw-text-semibold' : '')}>{STAGE_LABEL[st]}</span>
                  <span className="mw-w-16 nsw-small mw-text-muted">{state}</span>
                  <span className="mw-min-w-0 mw-flex-1 nsw-small mw-text-muted">{h ? `${dateLabelAu(h.at)}${h.by ? ', ' + h.by : ''}${h.note ? '. ' + h.note : ''}` : ''}</span>
                </li>
              )
            })}
          </ol>
        </Panel>
      </div>

      <div className="nsw-display-grid mw-gap-4 mw-lg-grid-cols-2">
        <Panel title="The block">
          <Facts
            items={[
              { label: 'Address', value: p.label },
              { label: 'Flats', value: p.flats },
              { label: 'Owner', value: p.owner_org?.name },
              { label: 'Installer', value: p.installer_org?.name ?? 'Not chosen yet' },
              { label: 'In this stage since', value: dateLabelAu(p.stage_since) },
              { label: 'Heat', value: p.heat_band },
            ]}
          />
        </Panel>
        {canManage(role) && (
          <Panel title="Grant" description="The grant covers the part of the cost the capped charge cannot repay.">
            <Form {...form}>
              <form className="mw-space-y-3" noValidate onSubmit={(e) => e.preventDefault()}>
                <NumberField control={form.control} name="grant" label="Grant allocated (dollars)" min={0} step={500} description={`Funding gap now ${money(s.funding_gap)}.`} className="mw-max-w-xs" />
                <ErrorAlert error={patch.error} />
                <Confirm title="Change the grant?" description={`This changes the money set aside for ${p.label} and reassesses the deal.`} confirmLabel="Change grant" onConfirm={() => void saveGrant()}>
                  <Button type="button" variant="outline" disabled={patch.busy}>
                    Save grant
                  </Button>
                </Confirm>
              </form>
            </Form>
          </Panel>
        )}
      </div>
    </div>
  )
}
