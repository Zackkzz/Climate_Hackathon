// Meter-data consent. The server returns {flat_id, current, active, history, scope, purpose, note}; every screen
// uses this one shape: given (= active), expiry, who gave it, and the plain-language scope, purpose and note.
import { http } from './api'

export interface DataConsent {
  given: boolean
  expires_on: string | null
  given_on: string | null
  given_by: string | null
  /** Note recorded with the consent (who agreed and how, when it was recorded on the tenant's behalf). */
  recorded_note: string | null
  scope: string
  purpose: string
  /** The server's plain explanation that this consent is separate from the upgrade. */
  note: string
  history: { given_on: string | null; expires_on: string | null; withdrawn_on: string | null; given_by: string | null }[]
}

interface Raw {
  current?: { given_by?: string; note?: string; given_at?: string; expires_on?: string } | null
  active?: boolean
  history?: { given_by?: string; given_at?: string; expires_on?: string; withdrawn_at?: string | null }[]
  scope?: string
  purpose?: string
  note?: string
}

export function normaliseConsent(r: Raw): DataConsent {
  const c = r.current ?? null
  return {
    given: !!r.active,
    expires_on: c?.expires_on ?? null,
    given_on: c?.given_at ? c.given_at.slice(0, 10) : null,
    given_by: c?.given_by ?? null,
    recorded_note: c?.note || null,
    scope: r.scope ?? '',
    purpose: r.purpose ?? '',
    note: r.note ?? '',
    history: (r.history ?? []).map((h) => ({ given_on: h.given_at?.slice(0, 10) ?? null, expires_on: h.expires_on ?? null, withdrawn_on: h.withdrawn_at?.slice(0, 10) ?? null, given_by: h.given_by ?? null })),
  }
}

const base = (flatId: number) => `/api/programme/flats/${flatId}/data-consent`

export const consentApi = {
  get: async (flatId: number) => normaliseConsent(await http.get<Raw>(base(flatId))),
  /** `note` is required by the server when someone other than the tenant records consent. */
  set: async (flatId: number, given: boolean, opts: { expires_on?: string; note?: string } = {}) =>
    normaliseConsent(await http.post<Raw>(base(flatId), given ? { given: true, ...(opts.expires_on ? { expires_on: opts.expires_on } : {}), ...(opts.note ? { note: opts.note } : {}) } : { given: false })),
}

/** Run `fn` over `items` with at most `limit` requests in flight. Results keep the order of `items`. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** Consents for many flats, six at a time. A failed lookup gives null. */
export async function consentsFor(flatIds: number[]): Promise<Record<number, DataConsent | null>> {
  const rows = await mapLimit(flatIds, 6, (id) => consentApi.get(id).then((c) => [id, c] as const).catch(() => [id, null] as const))
  return Object.fromEntries(rows)
}
