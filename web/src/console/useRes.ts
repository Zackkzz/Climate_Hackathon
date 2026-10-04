import { useCallback, useEffect, useRef, useState } from 'react'

export function errText(e: unknown): string {
  if (e instanceof Error) return e.message
  return 'Something went wrong. Please try again.'
}

export interface Res<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
  set: (v: T) => void
}

/** Load on mount and when `deps` change. Keeps old data on screen while reloading. */
export function useRes<T>(fn: () => Promise<T>, deps: unknown[] = []): Res<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    let live = true
    setLoading(true)
    ref
      .current()
      .then((d) => {
        if (live) {
          setData(d)
          setError(null)
        }
      })
      .catch((e: unknown) => live && setError(errText(e)))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const set = useCallback((v: T) => setData(v), [])
  return { data, error, loading, reload, set }
}
