import { AlertTriangle, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { ProgError } from '@/console/api'
import type { Res } from '@/console/useRes'
import { Alert, AlertDescription, AlertTitle } from '@/portal/components/ui/alert'
import { Button } from '@/portal/components/ui/button'
import { Skeleton } from '@/portal/components/ui/skeleton'

/** An error with, for a stage guard, the list of what is still needed. */
export function ErrorAlert({ error, title = 'That did not work', onRetry }: { error: Error | string | null; title?: string; onRetry?: () => void }) {
  if (!error) return null
  const message = typeof error === 'string' ? error : error.message
  const conditions = error instanceof ProgError ? error.conditions : []
  return (
    <Alert variant="destructive" role="alert">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {conditions.length > 0 && (
          <ul className="mt-1 list-disc pl-5">
            {conditions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1 border border-dashed bg-card p-6 text-sm">
      <Inbox className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium">{title}</p>
      {children && <p className="text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function LoadingRows({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
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
