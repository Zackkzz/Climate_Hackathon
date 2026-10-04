// Typed client for the programme and analysis routes. Bearer token handling and readable errors live here.
// With VITE_MOCK=1 every call goes to the in-browser mock (src/mock/programme.ts, loaded on demand) instead of fetch.
import type {
  AdvanceResult,
  Audit,
  AuditLogEntry,
  BillingRun,
  ClockInfo,
  Doc,
  Fault,
  Flat,
  LedgerEntry,
  LoginResponse,
  MfaRequired,
  Microclimate,
  MvRun,
  MyFlat,
  Overview,
  OrgRef,
  PlanBody,
  PlanResult,
  Programme,
  Project,
  ProjectDetail,
  Quote,
  Reading,
  Reserve,
  Risk,
  RiskReq,
  Scenario,
  SchedReq,
  Schedule,
  Sizing,
  Tender,
  TenantLoginResponse,
  User,
  WorkOrder,
} from './types'
import type { AssessRequest } from '../types'

export const MOCK = import.meta.env.VITE_MOCK === '1'

export class ProgError extends Error {
  status: number
  code: string
  conditions: string[]
  constructor(status: number, message: string, code = '', conditions: string[] = []) {
    super(message)
    this.status = status
    this.code = code
    this.conditions = conditions
  }
}

const TOKEN_KEY = 'meterwise.token'
let token: string | null = null
try {
  token = sessionStorage.getItem(TOKEN_KEY)
} catch {
  /* storage blocked: the session then lasts for this page only */
}
const listeners = new Set<() => void>()
export function getToken(): string | null {
  return token
}
export function setToken(t: string | null) {
  token = t
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}
/** Called when the server says the token is no longer good. */
export function onAuthChange(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

async function mockHandle(method: string, pathname: string, params: URLSearchParams, body: unknown, tok: string | null): Promise<RawReply> {
  const mods = [() => import('../mock/gov'), () => import('../mock/utility'), () => import('../mock/property'), () => import('../mock/programme')]
  for (const load of mods) {
    const m = await load()
    const r = await m.handle(method, pathname, params, body, tok)
    if (r) return r
  }
  return { status: 404, body: { detail: 'Not found.', code: 'not_found' } }
}

const NO_SERVER = "We couldn't reach the Meterwise server. Check it is running, then try again."

export interface RawReply {
  status: number
  body: unknown
  text?: string
  contentType?: string
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function toError(status: number, body: unknown): ProgError {
  let detail = ''
  let code = ''
  let conditions: string[] = []
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    if (typeof b.detail === 'string') detail = b.detail
    else if (Array.isArray(b.detail)) {
      // FastAPI validation errors, or a list of unmet conditions
      const items = b.detail.map((d) => (typeof d === 'string' ? d : d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : '')).filter(Boolean)
      if (b.code === 'stage_guard') conditions = items
      else detail = items.join(' ')
    }
    if (typeof b.code === 'string') code = b.code
    conditions = [...conditions, ...strings(b.conditions), ...strings(b.unmet), ...strings(b.blocked_by)]
  }
  if (code === 'stage_guard' && conditions.length === 0 && detail) conditions = [detail]
  if (!detail) {
    detail =
      status === 401 ? 'Please sign in to continue.' : status === 403 ? "You don't have access to that." : status === 404 ? "We couldn't find that." : status === 409 ? "That can't be done yet." : `The server had a problem (error ${status}). Please try again.`
  }
  if (code === 'stage_guard') detail = 'This step is not ready yet.'
  return new ProgError(status, detail, code, conditions)
}

async function send(method: string, path: string, body?: unknown, opts: { auth?: boolean; raw?: boolean } = {}): Promise<RawReply> {
  const url = new URL(path, window.location.origin)
  const tok = opts.auth === false ? null : token
  let reply: RawReply
  if (MOCK) {
    reply = await mockHandle(method, url.pathname, url.searchParams, body, tok)
  } else {
    let res: Response
    try {
      const headers: Record<string, string> = {}
      if (tok) headers.Authorization = `Bearer ${tok}`
      let payload: BodyInit | undefined
      if (body instanceof FormData) payload = body
      else if (body !== undefined) {
        headers['Content-Type'] = 'application/json'
        payload = JSON.stringify(body)
      }
      res = await fetch(path, { method, headers, body: payload })
    } catch {
      throw new ProgError(0, NO_SERVER)
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) throw new ProgError(res.status, NO_SERVER)
    const ct = res.headers.get('content-type') ?? ''
    if (opts.raw || !ct.includes('json')) {
      reply = { status: res.status, body: null, text: await res.text(), contentType: ct }
      if (!res.ok) {
        let parsed: unknown = null
        try {
          parsed = JSON.parse(reply.text ?? '')
        } catch {
          /* not JSON */
        }
        reply.body = parsed
      }
    } else {
      let parsed: unknown = null
      try {
        parsed = await res.json()
      } catch {
        /* handled below */
      }
      reply = { status: res.status, body: parsed, contentType: ct }
    }
  }
  if (reply.status >= 400) {
    const err = toError(reply.status, reply.body)
    if (reply.status === 401 && tok && opts.auth !== false) setToken(null)
    throw err
  }
  return reply
}

async function json<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const r = await send(method, path, body, { auth })
  return r.body as T
}
export const http = { send, json, get: <T>(path: string) => json<T>('GET', path), post: <T>(path: string, body: unknown = {}) => json<T>('POST', path, body), put: <T>(path: string, body: unknown = {}) => json<T>('PUT', path, body), qs }
const get = <T>(path: string) => json<T>('GET', path)
const post = <T>(path: string, body: unknown = {}) => json<T>('POST', path, body)

export function qs(o: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

const P = '/api/programme'

export const api = {
  // auth
  login: (email: string, password: string) => json<LoginResponse | MfaRequired>('POST', '/api/auth/login', { email, password }, false),
  mfaLogin: (ticket: string, code: string) => json<LoginResponse>('POST', '/api/auth/mfa/login', { ticket, code }, false),
  logout: () => post<unknown>('/api/auth/logout'),
  tenantLogin: (code: string) => json<TenantLoginResponse>('POST', '/api/auth/tenant', { code }, false),
  me: () => get<User>('/api/auth/me'),

  // programme and portfolio
  programme: () => get<Programme>(P),
  overview: () => get<Overview>(`${P}/overview`),
  projects: (f: { stage?: string; q?: string } = {}) => get<Project[]>(`${P}/projects${qs(f)}`),
  project: (id: number) => get<ProjectDetail>(`${P}/projects/${id}`),
  createProject: (building_id: string, owner_org_id: number) => post<ProjectDetail>(`${P}/projects`, { building_id, owner_org_id }),
  advance: (id: number, to: string, note?: string, start_month?: string) => post<ProjectDetail>(`${P}/projects/${id}/advance`, { to, note, ...(start_month ? { start_month } : {}) }),
  patchProject: (id: number, body: Record<string, unknown>) => json<ProjectDetail>('PATCH', `${P}/projects/${id}`, body),
  orgs: () => get<OrgRef[]>(`${P}/orgs`),
  auditLog: (f: { limit?: number; project_id?: number } = {}) => get<AuditLogEntry[]>(`${P}/audit-log${qs(f)}`),

  // project work
  saveAudit: (id: number, a: Partial<Audit>) => json<ProjectDetail>('PUT', `${P}/projects/${id}/audit`, a),
  ownerConsent: (id: number, name: string) => post<ProjectDetail>(`${P}/projects/${id}/consent/owner`, { signed: true, name }),
  flatConsent: (flatId: number, consent: 'agreed' | 'declined') => post<Flat>(`${P}/flats/${flatId}/consent`, { consent }),
  openTender: (id: number, installer_org_ids: number[], closes_on: string) => post<unknown>(`${P}/projects/${id}/tender`, { installer_org_ids, closes_on }),
  tenders: () => get<Tender[]>(`${P}/tenders`),
  submitQuote: (id: number, b: { items: { key: string; label?: string; qty: number; unit_price: number }[]; valid_until: string; note: string }) => post<Quote>(`${P}/projects/${id}/quotes`, b),
  acceptQuote: (id: number) => post<ProjectDetail>(`${P}/quotes/${id}/accept`),
  createWorkOrder: (id: number, scheduled_start: string) => post<WorkOrder>(`${P}/projects/${id}/work-order`, { scheduled_start }),
  tick: (woId: number, key: string, done: boolean) => post<WorkOrder>(`${P}/work-orders/${woId}/checklist`, { key, done }),
  flats: (id: number) => get<Flat[]>(`${P}/projects/${id}/flats`),
  tenancyChange: (flatId: number, new_tenant_name: string, date: string) => post<Flat>(`${P}/flats/${flatId}/tenancy-change`, { new_tenant_name, date }),
  ledger: (flatId: number) => get<LedgerEntry[]>(`${P}/flats/${flatId}/ledger`),
  payment: (flatId: number, amount: number, month: string) => post<unknown>(`${P}/flats/${flatId}/payments`, { amount, month }),

  // billing, faults, reserve
  runBilling: (month?: string) => post<BillingRun>(`${P}/billing/run`, month ? { month } : {}),
  billingExport: async (month: string, project_id?: number) => (await send('GET', `${P}/billing/export${qs({ month, project_id })}`, undefined, { raw: true })).text ?? '',
  faults: (f: { status?: string; project_id?: number } = {}) => get<Fault[]>(`${P}/faults${qs(f)}`),
  reportFault: (flatId: number, item: string, description: string) => post<Fault>(`${P}/flats/${flatId}/faults`, { item, description }),
  resolveFault: (id: number, note: string) => post<Fault>(`${P}/faults/${id}/resolve`, { note }),
  reserve: () => get<Reserve>(`${P}/reserve`),

  // measured savings
  readings: (flatId: number) => get<Reading[]>(`${P}/flats/${flatId}/readings`),
  uploadReadings: (flatId: number, csv: string) => {
    const f = new FormData()
    f.append('file', new Blob([csv], { type: 'text/csv' }), 'readings.csv')
    return json<unknown>('POST', `${P}/flats/${flatId}/readings`, f)
  },
  runMv: (id: number, from: string, to: string) => post<MvRun>(`${P}/projects/${id}/mv/run`, { from, to }),
  mv: (id: number) => get<MvRun[]>(`${P}/projects/${id}/mv`),

  // documents (fetched with the token, then opened as a page)
  documents: (id: number) => get<Doc[]>(`${P}/projects/${id}/documents`),
  documentHtml: async (url: string) => (await send('GET', url, undefined, { raw: true })).text ?? '',

  personalData: (flatId: number) => get<Record<string, unknown>>(`${P}/flats/${flatId}/personal-data`),
  erasePersonalData: (flatId: number) => post<{ flat_id: number; tenancies_erased: number; kept: string }>(`${P}/flats/${flatId}/personal-data/erase`, {}),
  topUpReserve: (amount: number, note: string) => post<Reserve>(`${P}/reserve/top-up`, { amount, ...(note ? { note } : {}) }),

  // tenant
  myFlat: () => get<MyFlat>(`${P}/my-flat`),

  // clock
  clock: () => get<ClockInfo>('/api/sim/clock'),
  advanceClock: (months: number, scenario: Scenario) => post<AdvanceResult>('/api/sim/advance', { months, scenario }),
  resetClock: () => post<unknown>('/api/sim/reset'),

  controls: () => json<unknown>('GET', '/api/government/controls'),

  // analysis (public)
  sizing: (req: AssessRequest) => json<Sizing>('POST', '/api/sizing', req, false),
  schedule: (req: SchedReq) => json<Schedule>('POST', '/api/schedule', req, false),
  risk: (req: RiskReq) => json<Risk>('POST', '/api/risk', req, false),
  microclimate: (id: string) => json<Microclimate>('GET', `/api/buildings/${encodeURIComponent(id)}/microclimate`, undefined, false),
  epw: async (id: string) => (await send('GET', `/api/buildings/${encodeURIComponent(id)}/weather.epw`, undefined, { auth: false, raw: true })).text ?? '',
  plan: (b: PlanBody) => json<PlanResult>('POST', '/api/portfolio/plan', b, false),
}

/** Save text as a file in the browser. */
export function downloadText(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Open an HTML page (a document) in a new tab. */
export function openHtml(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
