import { useState } from 'react'
import type { ReactNode } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { UseFormReturn } from 'react-hook-form'
import type { z } from 'zod'
import { ErrorAlert } from '@/portal/components/States'
import { StatusBadge } from '@/portal/components/Status'
import { Button } from '@/portal/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/portal/components/ui/dialog'
import { Form } from '@/portal/components/ui/form'
import { useAction } from '@/portal/lib/actions'
import type { ConsentState, Flat } from '@/console/types'
import type { DataConsent } from '@/console/consent'

const df = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
export function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  const t = new Date(d.length === 7 ? d + '-01T00:00:00' : d.slice(0, 10) + 'T00:00:00')
  return Number.isNaN(t.getTime()) ? d : df.format(t)
}
const mf = new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric' })
export function fmtMonth(m: string | null | undefined): string {
  if (!m) return ''
  const t = new Date(m.slice(0, 7) + '-01T00:00:00')
  return Number.isNaN(t.getTime()) ? m : mf.format(t)
}

export const CONSENT_LABEL: Record<ConsentState, string> = { pending: 'Not answered', agreed: 'Agreed', declined: 'Declined' }
export function ConsentBadge({ c }: { c: ConsentState }) {
  return <StatusBadge tone={c === 'agreed' ? 'good' : c === 'declined' ? 'bad' : 'warn'}>{CONSENT_LABEL[c]}</StatusBadge>
}
export function ChargeBadge({ s }: { s: Flat['charge_status'] }) {
  const label = { not_started: 'Not started', active: 'Active', paused: 'Paused', ended: 'Ended' }[s]
  return <StatusBadge tone={s === 'active' ? 'good' : s === 'paused' ? 'warn' : 'neutral'}>{label}</StatusBadge>
}
/** Meter-data consent, shown apart from upgrade consent. */
export function DataConsentCell({ c }: { c: DataConsent | null | undefined }) {
  if (c === undefined) return <span className="text-muted-foreground">Checking</span>
  if (c === null) return <span className="text-muted-foreground">Unknown</span>
  if (!c.given) return <StatusBadge tone="warn">Not given</StatusBadge>
  return (
    <span>
      <StatusBadge tone="good">Given</StatusBadge>
      {c.expires_on && <span className="ml-1 text-sm text-muted-foreground">until {fmtDate(c.expires_on)}</span>}
    </span>
  )
}

export const FAULT_ITEMS = [
  { value: 'heat_pump_hot_water', label: 'Heat pump hot water' },
  { value: 'reverse_cycle', label: 'Reverse-cycle air conditioner' },
  { value: 'cool_roof', label: 'Cool roof' },
  { value: 'other', label: 'Something else' },
]
export const itemLabel = (k: string) => FAULT_ITEMS.find((i) => i.value === k)?.label ?? k.replace(/_/g, ' ')

type AnyForm = UseFormReturn<any, any, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * A dialog with a form and a review step. The person fills in the form, reviews a plain summary, then confirms.
 * Use for anything that moves money or changes who a flat belongs to.
 */
export function FormDialog({ title, description, trigger, schema, defaults, fields, summary, confirmLabel, onSubmit, success, triggerVariant = 'outline' }: {
  title: string
  description?: ReactNode
  trigger: ReactNode
  schema: z.ZodType<any, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  defaults: Record<string, unknown>
  fields: (form: AnyForm) => ReactNode
  /** When given, a review step is shown before the request is sent. */
  summary?: (values: any) => ReactNode // eslint-disable-line @typescript-eslint/no-explicit-any
  confirmLabel: string
  onSubmit: (values: any) => Promise<unknown> // eslint-disable-line @typescript-eslint/no-explicit-any
  success: string
  triggerVariant?: 'outline' | 'default' | 'ghost'
}) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<unknown>(null)
  const act = useAction()
  const form = useForm<any, any, any>({ resolver: zodResolver(schema), defaultValues: defaults }) // eslint-disable-line @typescript-eslint/no-explicit-any
  const close = (o: boolean) => {
    setOpen(o)
    if (!o) {
      setValues(null)
      act.clear()
      form.reset(defaults)
    }
  }
  const send = async (v: unknown) => {
    const r = await act.run(async () => {
      await onSubmit(v)
      return true
    }, success)
    if (r) close(false)
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {values === null ? (
          <Form {...form}>
            <form
              className="space-y-3"
              noValidate
              onSubmit={form.handleSubmit((v) => {
                if (summary) setValues(v)
                else void send(v)
              })}
            >
              {fields(form)}
              <ErrorAlert error={act.error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => close(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={act.busy}>
                  {summary ? 'Review' : confirmLabel}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <div className="space-y-3">
            <div className="border bg-muted p-3" role="status">
              {summary?.(values)}
            </div>
            <ErrorAlert error={act.error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setValues(null)}>
                Back
              </Button>
              <Button type="button" disabled={act.busy} onClick={() => void send(values)}>
                {act.busy ? 'Working' : confirmLabel}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
