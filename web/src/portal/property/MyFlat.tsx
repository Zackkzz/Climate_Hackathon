import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { api } from '@/console/api'
import { tenantApi } from '@/console/api-tenant'
import type { MyFlat as MyFlatData } from '@/console/types'
import { useRes } from '@/console/useRes'
import { money } from '@/format'
import { Confirm } from '@/portal/components/Confirm'
import { ErrorAlert, Gate } from '@/portal/components/States'
import { ExampleBadge, StatusBadge } from '@/portal/components/Status'
import { SelectField, TextAreaField } from '@/portal/components/fields'
import { Button } from '@/portal/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/portal/components/ui/dialog'
import { Form } from '@/portal/components/ui/form'
import { useAction } from '@/portal/lib/actions'
import { openHtmlTab } from '@/portal/lib/csv'
import { dateLabel, itemLabel, LEDGER_LABEL, monthLabel } from '@/portal/lib/dates-p2'

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mw-border mw-bg-white">
      <h2 id={id} className="mw-border-b mw-px-4 mw-py-3 mw-text-lg nsw-text-semibold">
        {title}
      </h2>
      <div className="mw-space-y-3 mw-p-4">{children}</div>
    </section>
  )
}

function Big({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="mw-min-w-0 mw-bg-white mw-p-3">
      <dt className="nsw-small mw-text-muted">{label}</dt>
      <dd className="mw-text-2xl nsw-text-semibold mw-tabular">{value}</dd>
      {note && <dd className="nsw-small mw-text-muted">{note}</dd>}
    </div>
  )
}

const faultSchema = z.object({
  item: z.string().min(1, 'Choose what is not working.'),
  description: z.string().trim().min(5, 'Say what is wrong in a few words.').max(500, 'Keep it under 500 characters.'),
})

function ReportDialog({ flatId, items, open, onOpenChange, onDone }: { flatId: number; items: { key: string; label: string }[]; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const act = useAction()
  const form = useForm<z.infer<typeof faultSchema>>({ resolver: zodResolver(faultSchema), defaultValues: { item: '', description: '' } })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>If something is not working, tell us. Your monthly charge is paused from this month until it is fixed.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="mw-space-y-3"
            noValidate
            onSubmit={form.handleSubmit(async (v) => {
              const r = await act.run(() => tenantApi.reportFault(flatId, v.item, v.description), 'Problem reported. Your charge is paused until it is fixed.')
              if (r) {
                form.reset()
                onOpenChange(false)
                onDone()
              }
            })}
          >
            <SelectField control={form.control} name="item" label="What is not working" options={[...items.map((i) => ({ value: i.key, label: i.label })), { value: 'other', label: 'Something else' }]} />
            <TextAreaField control={form.control} name="description" label="What is wrong" description="For example: no hot water since Monday." />
            <ErrorAlert error={act.error} title="We could not send your report" />
            <DialogFooter className="mw-gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={act.busy}>
                {act.busy ? 'Sending' : 'Send report'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function DataConsent({ flatId }: { flatId: number }) {
  const res = useRes(() => tenantApi.dataConsent(flatId), [flatId])
  const act = useAction()
  const set = async (given: boolean) => {
    const r = await act.run(() => tenantApi.setDataConsent(flatId, given), given ? 'Thank you. You have shared your meter data.' : 'You have withdrawn your consent.')
    if (r) res.set(r)
  }
  return (
    <Section id="dc-h" title="Your meter data">
      <p>If you agree, your electricity and gas meter readings can be used to check that the upgrades are saving you money. This is separate from agreeing to the upgrades. You can say no and still have them.</p>
      <p className="mw-text-muted">You can withdraw at any time. We then stop using new readings.</p>
      <Gate res={res} rows={2}>
        {(c) => (
          <div className="mw-space-y-3">
            <p>
              {c.given ? (
                <StatusBadge tone="good">You have agreed</StatusBadge>
              ) : (
                <StatusBadge tone="neutral">You have not agreed</StatusBadge>
              )}
            </p>
            {c.given && c.expires_on && <p>Your consent ends on {dateLabel(c.expires_on)}.</p>}
            {c.given && c.recorded_note && <p className="mw-text-muted">Recorded: {c.recorded_note}</p>}
            {(c.scope || c.purpose) && (
              <dl className="mw-space-y-1">
                {c.scope && (
                  <div>
                    <dt className="nsw-text-medium">What it covers</dt>
                    <dd>{c.scope}</dd>
                  </div>
                )}
                {c.purpose && (
                  <div>
                    <dt className="nsw-text-medium">Why we ask</dt>
                    <dd>{c.purpose}</dd>
                  </div>
                )}
              </dl>
            )}
            {c.note && <p className="mw-text-muted">{c.note}</p>}
            <ErrorAlert error={act.error} />
            {c.given ? (
              <Confirm title="Withdraw your consent?" description="We will stop using your meter readings. Savings checks for your flat may be less accurate." confirmLabel="Withdraw" destructive onConfirm={() => set(false)}>
                <Button variant="outline" className="mw-min-h-11 nsw-width-100 mw-sm-w-auto" disabled={act.busy}>
                  Withdraw my consent
                </Button>
              </Confirm>
            ) : (
              <Button className="mw-min-h-11 nsw-width-100 mw-sm-w-auto" disabled={act.busy} onClick={() => void set(true)}>
                I agree to share my meter data
              </Button>
            )}
          </div>
        )}
      </Gate>
    </Section>
  )
}

function Body({ d, reload }: { d: MyFlatData; reload: () => void }) {
  const [report, setReport] = useState(false)
  const [all, setAll] = useState(false)
  const act = useAction()
  const docs = useAction()
  const flat = d.flat
  const verified = d.verified
  const ledger = [...d.ledger].reverse()
  const shown = all ? ledger : ledger.slice(0, 8)
  const decide = async (c: 'agreed' | 'declined') => {
    const r = await act.run(() => tenantApi.flatConsent(flat.id, c), c === 'agreed' ? 'You agreed to the upgrades.' : 'You declined the upgrades.')
    if (r) reload()
  }
  const open = async (url: string) => {
    const html = await docs.run(() => api.documentHtml(url))
    if (html) openHtmlTab(html)
  }
  const openFaults = d.faults.filter((f) => f.status === 'open')

  return (
    <div className="mw-space-y-4">
      <div>
        <h1 className="mw-text-2xl nsw-text-semibold">My flat</h1>
        <p className="mw-text-muted">
          Flat {flat.unit}, {d.project.label}
        </p>
        <p className="mw-mt-1">
          <ExampleBadge>Example flat</ExampleBadge>
        </p>
      </div>

      {flat.consent === 'pending' && (
        <Section id="cons-h" title="Do you agree to the upgrades?">
          <p>Your housing provider would like to upgrade this block. You would pay {money(d.deal.charge_per_month)} a month, and keep part of what you save. You pay nothing upfront.</p>
          <ErrorAlert error={act.error} />
          <div className="nsw-display-flex nsw-flex-column mw-gap-2 mw-sm-flex-row">
            <Confirm title="Agree to the upgrades?" description={`You agree to a charge of ${money(d.deal.charge_per_month)} a month on your meter. It never takes more than your savings allow.`} confirmLabel="Yes, I agree" onConfirm={() => decide('agreed')}>
              <Button className="mw-min-h-11" disabled={act.busy}>
                I agree
              </Button>
            </Confirm>
            <Confirm title="Decline the upgrades?" description="Nothing changes for you. Your flat gets no charge and no work inside it." confirmLabel="Yes, I decline" destructive onConfirm={() => decide('declined')}>
              <Button variant="outline" className="mw-min-h-11" disabled={act.busy}>
                I decline
              </Button>
            </Confirm>
          </div>
        </Section>
      )}
      {flat.consent === 'declined' && <p className="mw-border mw-bg-white mw-p-3">You declined the upgrades. You pay no charge.</p>}

      <dl className="nsw-display-grid mw-grid-cols-1 mw-gap-px mw-border mw-bg-border mw-xs-grid-cols-2" aria-label="Your numbers">
        <Big label="You pay each month" value={money(d.deal.charge_per_month)} note={flat.charge_status === 'paused' ? 'Paused for now' : `Until ${monthLabel(d.deal.term_ends)}`} />
        <Big label="You keep each month" value={money(d.deal.net_saving_per_month)} note="Modelled saving, after the charge" />
        <Big label="Modelled saving" value={money(d.deal.modelled_saving_per_month)} note="On your bills each month" />
        <Big label="Measured saving" value={verified ? money(verified.verified_saving_per_month) : 'Not yet'} note={verified ? `As of ${dateLabel(verified.as_of)}` : 'Checked after about a year'} />
      </dl>

      <Section id="inst-h" title="What was installed">
        {d.deal.installed.length === 0 ? (
          <p className="mw-text-muted">Nothing is installed yet.</p>
        ) : (
          <ul className="mw-list-disc mw-space-y-1 mw-pl-5">
            {d.deal.installed.map((i) => (
              <li key={i.key}>{i.label}</li>
            ))}
          </ul>
        )}
        <p className="mw-text-muted">The block is at the stage: {d.project.stage}.</p>
      </Section>

      <Section id="sav-h" title="What you are saving">
        <p>
          We model that the upgrades save you <strong>{money(d.deal.modelled_saving_per_month)}</strong> a month on your bills. After the charge of {money(d.deal.charge_per_month)} you keep <strong>{money(d.deal.net_saving_per_month)}</strong>.
        </p>
        {verified ? (
          <p>
            Checked against your real meter readings (as of {dateLabel(verified.as_of)}), the saving is <strong>{money(verified.verified_saving_per_month)}</strong> a month. That is {Math.round(verified.realisation_rate * 100)}% of the modelled figure. If it falls short, your charge goes down and you are refunded.
          </p>
        ) : (
          <p className="mw-text-muted">We have not checked this against real readings yet. That happens after about a year of readings.</p>
        )}
      </Section>

      <Section id="stmt-h" title="My statement">
        {ledger.length === 0 ? (
          <p className="mw-text-muted">There is nothing on your statement yet. Charges start the month after the work is signed off.</p>
        ) : (
          <>
            <p>
              {flat.balance_owing < 0 ? (
                <>
                  You are <strong>{money(-flat.balance_owing)}</strong> in credit.
                </>
              ) : (
                <>
                  You owe <strong>{money(flat.balance_owing)}</strong> right now.
                </>
              )}
            </p>
            <ul className="mw-divide-y mw-border" aria-label="Statement entries, newest first">
              {shown.map((l) => (
                <li key={l.id} className="nsw-display-flex nsw-align-items-start nsw-justify-content-between mw-gap-3 mw-px-3 mw-py-2">
                  <div className="mw-min-w-0">
                    <div className="nsw-text-medium">{LEDGER_LABEL[l.kind] ?? l.kind}</div>
                    <div className="nsw-small mw-text-muted">{monthLabel(l.month)}</div>
                  </div>
                  <div className="nsw-text-right mw-tabular">
                    <div className="nsw-text-medium">{money(l.amount)}</div>
                    <div className="nsw-small mw-text-muted">{l.balance_after < 0 ? `Credit ${money(-l.balance_after)}` : `Owing ${money(l.balance_after)}`}</div>
                  </div>
                </li>
              ))}
            </ul>
            {ledger.length > 8 && (
              <Button variant="outline" className="mw-min-h-11" onClick={() => setAll((v) => !v)} aria-expanded={all}>
                {all ? 'Show fewer' : `Show all ${ledger.length} entries`}
              </Button>
            )}
          </>
        )}
      </Section>

      <Section id="prot-h" title="What protects me">
        {d.protections.length === 0 ? (
          <p className="mw-text-muted">No protections were listed.</p>
        ) : (
          <ul className="mw-list-disc mw-space-y-2 mw-pl-5">
            {d.protections.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="prob-h" title="Problems">
        {d.faults.length === 0 ? (
          <p className="mw-text-muted">You have not reported any problems.</p>
        ) : (
          <ul className="mw-divide-y mw-border" aria-label="Problems you reported">
            {d.faults.map((f) => (
              <li key={f.id} className="mw-px-3 mw-py-2">
                <div className="nsw-display-flex nsw-flex-wrap nsw-align-items-center nsw-justify-content-between mw-gap-2">
                  <span className="nsw-text-medium">{itemLabel(f.item)}</span>
                  {f.status === 'open' ? <StatusBadge tone="warn">Open</StatusBadge> : <StatusBadge tone="good">Fixed {dateLabel(f.resolved_on)}</StatusBadge>}
                </div>
                <p>{f.description}</p>
                <p className="nsw-small mw-text-muted">Reported {dateLabel(f.opened_on)}</p>
              </li>
            ))}
          </ul>
        )}
        {openFaults.length > 0 && <p className="mw-text-muted">While a problem is open your charge is paused.</p>}
        <Button className="mw-min-h-11 nsw-width-100 mw-sm-w-auto" onClick={() => setReport(true)}>
          Report a problem
        </Button>
        <ReportDialog flatId={flat.id} items={d.deal.installed} open={report} onOpenChange={setReport} onDone={reload} />
      </Section>

      <Section id="docs-h" title="My documents">
        {d.documents.length === 0 ? (
          <p className="mw-text-muted">No documents yet.</p>
        ) : (
          <ul className="mw-space-y-2">
            {d.documents.map((x) => (
              <li key={x.url} className="nsw-display-flex nsw-flex-wrap nsw-align-items-center nsw-justify-content-between mw-gap-2">
                <span className="mw-min-w-0">{x.title}</span>
                <Button variant="outline" className="mw-min-h-11" disabled={docs.busy} onClick={() => void open(x.url)} aria-label={`Open ${x.title} in a new tab`}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
        <ErrorAlert error={docs.error} title="We could not open that document" />
        <p className="nsw-small mw-text-muted">Documents are examples made by a prototype. They are not legal or financial advice.</p>
      </Section>

      <DataConsent flatId={flat.id} />

      <Section id="priv-h" title="Your privacy">
        <p>We keep your name and flat number, your meter readings and your charges. Nothing else. Read the full <Link to="/privacy">privacy notice</Link>.</p>
      </Section>
    </div>
  )
}

export default function MyFlat() {
  const res = useRes(() => api.myFlat(), [])
  useEffect(() => {
    document.title = 'My flat | Meterwise'
  }, [])
  return <Gate res={res}>{(d) => <Body d={d} reload={res.reload} />}</Gate>
}
