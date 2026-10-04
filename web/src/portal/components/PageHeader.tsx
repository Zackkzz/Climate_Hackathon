import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/portal/components/ui/breadcrumb'

export interface Crumb {
  label: string
  to?: string
}

/** Breadcrumbs, a page title, one line of plain description and the page actions. Every page starts with this. */
export function PageHeader({ crumbs, title, description, actions }: { crumbs: Crumb[]; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-2 border-b-2 border-navy-900 pb-4">
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {c.to && i < crumbs.length - 1 ? (
                  <BreadcrumbLink asChild>
                    <Link to={c.to}>{c.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{c.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1>{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-lg text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** A bordered panel with a small heading. Flat, no shadow. */
export function Panel({ title, description, actions, children, className = '' }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={'rounded-lg border bg-card ' + className}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted px-4 py-2.5">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

/** A compact row of labelled figures. Used instead of large tiles. */
export function Figures({ items, label }: { items: { label: string; value: ReactNode; note?: ReactNode; tone?: 'good' | 'warn' | 'bad' }[]; label?: string }) {
  return (
    <dl aria-label={label} className="mb-4 flex flex-wrap overflow-hidden rounded-lg border border-b-0 border-r-0 bg-card">
      {items.map((f, i) => (
        <div key={i} className="min-w-[10rem] flex-1 basis-[10rem] border-b border-r border-t-4 border-t-navy-900 px-3 py-2">
          <dt className="text-sm text-muted-foreground">{f.label}</dt>
          <dd className={'text-xl font-bold tabular-nums ' + (f.tone === 'bad' ? 'text-destructive' : f.tone === 'warn' ? 'text-warning' : f.tone === 'good' ? 'text-success' : '')}>{f.value}</dd>
          {f.note && <dd className="text-sm text-muted-foreground">{f.note}</dd>}
        </div>
      ))}
    </dl>
  )
}

/** Label and value pairs. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(8rem,12rem)_1fr]">
      {items.map((f, i) => (
        <Fragment key={i}>
          <dt className="text-muted-foreground sm:pt-0">{f.label}</dt>
          <dd className="min-w-0 pb-1 sm:pb-0">{f.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

const CALLOUT = {
  info: { cls: 'border-info bg-info-bg text-info', Icon: Info },
  warning: { cls: 'border-warning bg-warning-bg text-warning', Icon: AlertTriangle },
  success: { cls: 'border-success bg-success-bg text-success', Icon: CheckCircle2 },
  danger: { cls: 'border-destructive bg-danger-bg text-destructive', Icon: OctagonAlert },
}

/** A highlighted note with an icon and a heading. The heading is always present so it never relies on colour. */
export function Callout({ tone = 'info', title, children }: { tone?: keyof typeof CALLOUT; title: string; children?: ReactNode }) {
  const { cls, Icon } = CALLOUT[tone]
  return (
    <aside className={'flex gap-3 border-l-4 p-4 ' + cls} aria-label={title}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        {children && <div className="mt-1 text-foreground">{children}</div>}
      </div>
    </aside>
  )
}

/** A summary list: a label, a value and an optional action on each row. */
export function SummaryList({ items }: { items: { label: string; value: ReactNode; action?: ReactNode }[] }) {
  return (
    <dl className="border-t">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-1 gap-x-6 border-b py-3 sm:grid-cols-[minmax(9rem,14rem)_1fr_auto]">
          <dt className="font-semibold">{it.label}</dt>
          <dd className="min-w-0">{it.value}</dd>
          {it.action ? <dd className="sm:text-right">{it.action}</dd> : <dd className="hidden sm:block" />}
        </div>
      ))}
    </dl>
  )
}

/** "On this page" links for long pages. Give each section an id. Sticky on wide screens. */
export function PageNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="On this page" className="mb-4 border-l-4 border-mark bg-card p-3 text-sm lg:sticky lg:top-[calc(var(--header-h)+1rem)]">
      <p className="mb-1 font-bold">On this page</p>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`}>{it.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
