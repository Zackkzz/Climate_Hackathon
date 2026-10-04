import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { errText } from '@/console/useRes'

/** Run a request with a busy flag and an error to show next to the form. Success shows a toast (announced to screen readers). */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const run = useCallback(async function <T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
    setBusy(true)
    setError(null)
    try {
      const r = await fn()
      if (ok) toast.success(ok)
      return r
    } catch (e) {
      setError(e instanceof Error ? e : new Error(errText(e)))
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  const clear = useCallback(() => setError(null), [])
  return { busy, error, run, clear }
}
