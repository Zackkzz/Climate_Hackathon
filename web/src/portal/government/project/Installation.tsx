import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '@/console/api'
import { EmptyState, ErrorAlert } from '@/portal/components/States'
import { Facts, Panel } from '@/portal/components/PageHeader'
import { StatusBadge } from '@/portal/components/Status'
import { DateField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Checkbox } from '@/portal/components/ui/checkbox'
import { Form } from '@/portal/components/ui/form'
import { Progress } from '@/portal/components/ui/progress'
import { useAction } from '@/portal/lib/actions'
import { dateLabelAu } from '@/portal/lib/dates'
import { canManage, dateText, isIsoDate } from './shared'
import type { TabProps } from './shared'

const schema = z.object({ scheduled_start: z.string().refine(isIsoDate, dateText('The start date')) })

export default function Installation({ p, role, onChange }: TabProps) {
  const wo = p.work_order
  const create = useAction()
  const tick = useAction()
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { scheduled_start: '' } })
  const accepted = p.quotes.find((q) => q.status === 'accepted')

  if (!wo) {
    return (
      <Panel title="Work order" description="The work order tells the installer when to start. It needs an accepted quote.">
        {!accepted && <EmptyState title="No quote has been accepted yet">Accept a quote on the Quotes tab first.</EmptyState>}
        {accepted && canManage(role) && (
          <Form {...form}>
            <form
              className="mw-max-w-sm mw-space-y-3"
              noValidate
              onSubmit={form.handleSubmit(async (v) => {
                const r = await create.run(() => api.createWorkOrder(p.id, v.scheduled_start), 'Work order created')
                if (r) onChange(await api.project(p.id))
              })}
            >
              <p>Installer: {accepted.installer_org.name}</p>
              <DateField control={form.control} name="scheduled_start" label="Scheduled start" />
              <ErrorAlert error={create.error} title="We could not create the work order" />
              <Button type="submit" disabled={create.busy}>
                {create.busy ? 'Creating' : 'Create work order'}
              </Button>
            </form>
          </Form>
        )}
        {accepted && !canManage(role) && <p className="mw-text-muted">The programme office will create the work order.</p>}
      </Panel>
    )
  }

  const done = wo.checklist.filter((c) => c.done).length
  const all = wo.checklist.length
  const toggle = async (key: string, value: boolean) => {
    const r = await tick.run(() => api.tick(wo.id, key, value))
    if (r) onChange(await api.project(p.id))
  }

  return (
    <div className="nsw-display-grid mw-gap-4 mw-lg-cols-2fr-3fr">
      <Panel title="Work order">
        <Facts
          items={[
            { label: 'Installer', value: wo.installer_org.name },
            { label: 'Scheduled start', value: dateLabelAu(wo.scheduled_start) },
            { label: 'Completed', value: wo.completed_on ? dateLabelAu(wo.completed_on) : 'Not yet' },
            { label: 'Warranty', value: `${wo.warranty_years} years` },
          ]}
        />
      </Panel>
      <Panel title="Commissioning checklist" description="Every item must be done before the project can be marked commissioned.">
        <p className="nsw-text-semibold mw-tabular" role="status">
          {done} of {all} done
        </p>
        <Progress value={all ? (done / all) * 100 : 0} className="mw-my-2 mw-h-3" aria-label={`${done} of ${all} checklist items done`} />
        <ErrorAlert error={tick.error} />
        <ul className="mw-divide-y mw-border">
          {wo.checklist.map((c) => (
            <li key={c.key} className="nsw-display-flex nsw-align-items-start mw-gap-3 mw-p-2">
              <Checkbox id={`ck-${c.key}`} checked={c.done} disabled={tick.busy} onCheckedChange={(v) => void toggle(c.key, !!v)} className="mw-mt-1" />
              <label htmlFor={`ck-${c.key}`} className="mw-min-w-0 mw-flex-1">
                {c.label}
                {c.done && c.at && (
                  <span className="nsw-display-block nsw-small mw-text-muted">
                    Done {dateLabelAu(c.at)}
                    {c.by ? ` by ${c.by}` : ''}
                  </span>
                )}
              </label>
              {c.done ? <StatusBadge tone="good">Done</StatusBadge> : <StatusBadge tone="warn">To do</StatusBadge>}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
