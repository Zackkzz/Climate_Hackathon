// Short messages after an action. Rendered as in-page alerts in a polite live region at the bottom of the screen.
// `toast.success` and `toast.error` keep the call shape the pages already use.
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from './alert'

type Item = { id: number; kind: 'success' | 'error'; text: string }
let items: Item[] = []
let n = 0
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
function push(kind: Item['kind'], text: string) {
  const id = ++n
  items = [...items, { id, kind, text }]
  emit()
  window.setTimeout(() => {
    items = items.filter((i) => i.id !== id)
    emit()
  }, 8000)
}
export const toast = { success: (t: string) => push('success', t), error: (t: string) => push('error', t) }

export function Toaster(_props: { position?: string }) {
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force((x) => x + 1)
    subs.add(f)
    return () => void subs.delete(f)
  }, [])
  return (
    <div className="mw-toasts no-print" role="status" aria-live="polite">
      {items.map((i) => (
        <Alert key={i.id} variant={i.kind === 'error' ? 'destructive' : 'success'} className="mw-toast">
          <AlertDescription>{i.text}</AlertDescription>
        </Alert>
      ))}
    </div>
  )
}
