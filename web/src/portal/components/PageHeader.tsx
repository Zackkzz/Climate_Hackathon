import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/portal/components/ui/breadcrumb'

export interface Crumb {
  label: string
  to?: string
}

/** Breadcrumbs, a page title, one line of plain description and the page actions. Every page starts with this. */
export function PageHeader({ crumbs, title, description, actions }: { crumbs: Crumb[]; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-col gap-2 border-b pb-3">
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
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 max-w-3xl text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** A bordered panel with a small heading. Flat, no shadow. */
export function Panel({ title, description, actions, children, className = '' }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={'border bg-card ' + className}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
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
    <dl aria-label={label} className="mb-4 grid grid-cols-2 overflow-hidden border bg-card sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
      {items.map((f, i) => (
        <div key={i} className="-mb-px -mr-px min-w-0 border-b border-r bg-card px-3 py-2">
          <dt className="text-sm text-muted-foreground">{f.label}</dt>
          <dd className={'text-lg font-semibold tabular-nums ' + (f.tone === 'bad' ? 'text-destructive' : f.tone === 'warn' ? 'text-warning' : f.tone === 'good' ? 'text-success' : '')}>{f.value}</dd>
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
