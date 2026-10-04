import { Inbox } from '@/portal/components/icons'
import type { ReactNode } from 'react'
import { ProgError } from '@/console/api'
import type { Res } from '@/console/useRes'
import { Alert, AlertDescription, AlertTitle } from '@/portal/components/ui/alert'
import { Button } from '@/portal/components/ui/button'

/** An error with, for a stage guard, the list of what is still needed. */
export function ErrorAlert({ error, title = 'That did not work', onRetry }: { error: Error | string | null; title?: string; onRetry?: () => void }) {
  if (!error) return null
  const message = typeof error === 'string' ? error : error.message
  const conditions = error instanceof ProgError ? error.conditions : []
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {conditions.length > 0 && (
          <ul className="mw-list">
            {conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
        {onRetry && (
          <Button variant="outline" size="sm" className="mw-mt-2" onClick={onRetry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mw-empty">
      <Inbox />
      <p className="nsw-text-medium">{title}</p>
      {children && <p className="mw-text-muted">{children}</p>}
      {action && <div className="mw-mt-2">{action}</div>}
    </div>
  )
}

/** The system's loader: .nsw-loader holding the spinning .nsw-loader__circle. Decorative; the label says what is loading. */
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="nsw-loader" aria-hidden="true">
      <span className={`nsw-loader__circle nsw-loader__circle--${size}`} />
    </span>
  )
}

/** The system's loader with a text label for assistive technology. */
export function LoadingRows({ label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" className="mw-loading">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}

/** A large loader centred in a panel, for a wait of more than a moment, with a line saying what is happening. */
export function LoadingPanel({ label, detail }: { label: string; detail?: ReactNode }) {
  return (
    <div role="status" className="mw-loading-panel mw-border mw-bg-white">
      <Spinner size="lg" />
      <p className="nsw-text-semibold">{label}</p>
      {detail && <p className="nsw-small mw-text-muted">{detail}</p>}
    </div>
  )
}

/** Standard loading, error and content wrapper for a Res. Keeps old data on screen while reloading. */
export function Gate<T>({ res, children, rows }: { res: Res<T>; children: (d: T) => ReactNode; rows?: number }) {
  if (res.data === null) {
    if (res.error) return <ErrorAlert error={res.error} onRetry={res.reload} title="We could not load this" />
    return <LoadingRows rows={rows} />
  }
  return (
    <>
      {res.error && <ErrorAlert error={res.error} onRetry={res.reload} title="We could not refresh this" />}
      {children(res.data)}
    </>
  )
}
