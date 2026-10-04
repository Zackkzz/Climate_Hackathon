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
    <header className="mw-page-header">
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
      <div className="nsw-display-flex nsw-flex-wrap nsw-align-items-start nsw-justify-content-between mw-gap-3">
        <div className="mw-min-w-0">
          <h1 className="nsw-h3">{title}</h1>
          {description && <p className="mw-text-muted mw-max-w-3xl mw-mt-1">{description}</p>}
        </div>
        {actions && <div className="nsw-display-flex nsw-flex-wrap nsw-align-items-center mw-gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** A bordered panel with a small heading. Flat, no shadow. */
export function Panel({ title, description, actions, children, className = '' }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={'mw-panel ' + className}>
      {(title || actions) && (
        <div className="mw-panel__head">
          <div>
            {title && <h2 className="nsw-h5">{title}</h2>}
            {description && <p className="nsw-small mw-text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="mw-panel__body">{children}</div>
    </section>
  )
}

/** A compact row of labelled figures. Used instead of large tiles. */
export function Figures({ items, label }: { items: { label: string; value: ReactNode; note?: ReactNode; tone?: 'good' | 'warn' | 'bad' }[]; label?: string }) {
  return (
    <dl aria-label={label} className="mw-figures">
      {items.map((f, i) => (
        <div key={i} className="mw-figures__item">
          <dt className="nsw-small mw-text-muted">{f.label}</dt>
          <dd className={'mw-figures__value ' + (f.tone === 'bad' ? 'mw-text-danger' : f.tone === 'warn' ? 'mw-text-warning' : f.tone === 'good' ? 'mw-text-success' : '')}>{f.value}</dd>
          {f.note && <dd className="nsw-small mw-text-muted">{f.note}</dd>}
        </div>
      ))}
    </dl>
  )
}

/** Label and value pairs. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="mw-facts">
      {items.map((f, i) => (
        <Fragment key={i}>
          <dt className="mw-text-muted">{f.label}</dt>
          <dd>{f.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
