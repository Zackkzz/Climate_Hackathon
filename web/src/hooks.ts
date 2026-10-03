import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, assess } from './api'
import { dealToRequest } from './state'
import type { AssessResponse, Deal } from './types'

export interface Async<T> {
  data: T | null
  loading: boolean
  error: string | null
  retry: () => void
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Something went wrong. Please try again.'
}

/** Load once, with retry. */
export function useLoad<T>(fn: () => Promise<T>, key = ''): Async<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    fnRef
      .current()
      .then((d) => live && setData(d))
      .catch((e: unknown) => live && setError(errMsg(e)))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [tick, key])
  const retry = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, retry }
}

/** Re-runs the assessment when the deal changes (debounced). Keeps the last result on screen while updating. */
export function useAssess(deal: Deal | null, debounceMs = 250): Async<AssessResponse> & { updating: boolean } {
  const [data, setData] = useState<AssessResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const hasData = useRef(false)
  const key = deal ? JSON.stringify(dealToRequest(deal)) : ''

  useEffect(() => {
    if (!key) {
      setData(null)
      hasData.current = false
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    const delay = hasData.current ? debounceMs : 0
    const t = setTimeout(() => {
      assess(JSON.parse(key) as ReturnType<typeof dealToRequest>, ctrl.signal)
        .then((r) => {
          hasData.current = true
          setData(r)
          setError(null)
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setError(errMsg(e))
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false)
        })
    }, delay)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [key, tick, debounceMs])

  const retry = useCallback(() => setTick((n) => n + 1), [])
  return { data, loading, error, retry, updating: loading && data !== null }
}

export function useReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    const f = () => setR(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return r
}

const SHORTLIST_KEY = 'meterwise.shortlist'
export function useShortlist() {
  const [ids, setIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SHORTLIST_KEY)
      const v: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(SHORTLIST_KEY, JSON.stringify(ids))
    } catch {
      /* storage blocked: the shortlist then lasts for this visit only */
    }
  }, [ids])
  const toggle = useCallback((id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])), [])
  const remove = useCallback((id: string) => setIds((cur) => cur.filter((x) => x !== id)), [])
  return { ids, toggle, remove }
}
