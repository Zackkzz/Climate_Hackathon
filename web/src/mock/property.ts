// Mock for the property portal routes and data consent. Shares the in-memory state of mock/programme.ts.
import type { RawReply } from '../console/api'
import type { Fault, Flat, Project } from '../console/types'
import type { Enquiry, PropertySummary, Resolution } from '../console/types-property'

interface DataConsent {
  given: boolean
  expires_on: string | null
  given_on: string | null
}
/** The shape the real server returns. */
function rawConsent(c: DataConsent) {
  return {
    current: c.given ? { given_by: 'tenant', note: '', given_at: `${c.given_on ?? ''}T00:00:00`, expires_on: c.expires_on } : null,
    active: c.given,
    history: [],
    scope: 'Monthly electricity and gas totals for this meter',
    purpose: 'Checking the savings from the upgrade and adjusting the charge if savings are lower',
    note: 'Agreeing to the upgrade does not mean agreeing to share meter data. This consent is separate and can be withdrawn at any time.',
  }
}
import { handle as programmeHandle, mockState, mockWho } from './programme'
import { mockBuildings } from './fixtures'

const enquiries: Enquiry[] = []
const consents = new Map<number, DataConsent>()
const resolutions = new Map<number, Resolution>()
const erased = new Set<number>()
let setupDone = false

type Who = NonNullable<ReturnType<typeof mockWho>>
const fail = (status: number, detail: string, code: string): RawReply => ({ status, body: { detail, code } })
const ok = (body: unknown): RawReply => ({ status: 200, body })

function setup() {
  if (setupDone) return
  setupDone = true
  const S = mockState()
  const provider = S.orgs.find((o) => o.id === 1)
  if (provider) provider.kind = 'community_housing'
  const landlord = { id: 21, name: 'Example Landlord Pty Ltd', kind: 'landlord', example: true }
  const strata = { id: 22, name: 'Example Strata Committee SP 1234', kind: 'strata', example: true }
  S.orgs.push(landlord, strata)
  S.users.push(
    { key: 'landlord', name: 'Lee Landlord (example)', email: 'landlord@example.org', role: 'owner', org: landlord },
    { key: 'strata', name: 'Sky Strata (example chairperson)', email: 'strata@example.org', role: 'owner', org: strata },
  )
  const consentStage = S.projects.filter((p) => p.stage === 'consent')
  const early = S.projects.filter((p) => p.stage === 'screened' || p.stage === 'audit' || p.stage === 'offer')
  const strataProj = consentStage[0] ?? early[0]
  if (strataProj) {
    strataProj.owner_org = strata
    strataProj.ownerSigned = false // so the resolution form has something to do
  }
  const landProj = early.find((p) => p !== strataProj) ?? S.projects.find((p) => p !== strataProj && p.stage !== 'active')
  if (landProj) landProj.owner_org = landlord
}

const today = () => `${mockState().now}-15`

function defaultConsent(f: Flat): DataConsent {
  const S = mockState()
  const p = S.projects.find((x) => x.id === f.project_id)
  if (p && (p.stage === 'active' || p.stage === 'commissioned' || p.stage === 'closed')) {
    const [y, m] = S.now.split('-')
    return { given: true, expires_on: `${Number(y) + 1}-${m}-01`, given_on: `${S.now}-01` }
  }
  return { given: false, expires_on: null, given_on: null }
}
function consentOf(f: Flat): DataConsent {
  let c = consents.get(f.id)
  if (!c) {
    c = defaultConsent(f)
    consents.set(f.id, c)
  }
  return c
}
/** True when the flat's tenant has a current meter-data consent. For the utility mock. */
export function hasDataConsent(flatId: number): boolean {
  setup()
  const f = mockState().flats.find((x) => x.id === flatId)
  if (!f) return false
  const c = consentOf(f)
  return c.given && (!c.expires_on || c.expires_on >= today())
}

function canTouchFlat(w: Who, f: Flat): boolean {
  if (w.role === 'manager') return true
  if (w.role === 'tenant') return w.flat_id === f.id
  if (w.role === 'owner') return mockState().projects.find((p) => p.id === f.project_id)?.owner_org.id === w.org?.id
  return false
}

async function viaProgramme<T>(method: string, path: string, token: string | null, body?: unknown): Promise<{ status: number; body: T }> {
  const url = new URL(path, 'http://x')
  const r = await programmeHandle(method, url.pathname, url.searchParams, body, token)
  return { status: r.status, body: r.body as T }
}

function nearestBuilding(addr: string, flats: number, skip: Set<string>) {
  const words = addr.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  return mockBuildings.features
    .filter((f) => !skip.has(f.properties.id))
    .map((f) => {
      const label = f.properties.label.toLowerCase()
      const score = words.filter((w) => label.includes(w)).length * 100 - Math.abs(f.properties.flats_est - flats)
      return { id: f.properties.id, score }
    })
    .sort((a, b) => b.score - a.score)
}

export async function handle(method: string, pathname: string, params: URLSearchParams, body: unknown, token: string | null): Promise<RawReply | null> {
  // set up the extra demo users before any other mock file looks up a token
  mockState()
  setup()
  const mine =
    pathname === '/api/property/summary' ||
    pathname === '/api/property/enquiries' ||
    pathname === '/api/programme/enquiries' ||
    /^\/api\/programme\/enquiries\/\d+\/convert$/.test(pathname) ||
    /^\/api\/programme\/flats\/\d+\/(data-consent|personal-data|erase)$/.test(pathname) ||
    /^\/api\/programme\/projects\/\d+\/consent\/owner$/.test(pathname) ||
    (method === 'GET' && /^\/api\/programme\/projects\/\d+$/.test(pathname)) ||
    pathname === '/api/auth/demo-users' ||
    pathname === '/api/auth/login'
  if (!mine) return null
  // make sure the demo users exist before the programme mock lists or checks them
  mockState()
  setup()
  await new Promise((r) => setTimeout(r, 80))
  const S = mockState()
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (pathname === '/api/auth/demo-users' || pathname === '/api/auth/login') return null

  // ----- enquiries (public) -----
  if (method === 'POST' && pathname === '/api/property/enquiries') {
    const name = String(b.name ?? '').trim()
    const email = String(b.email ?? '').trim()
    const address = String(b.address ?? '').trim()
    const flats = Number(b.flats)
    if (!name) return fail(400, 'Enter your name.', 'validation')
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(400, 'Enter a valid email address.', 'validation')
    if (!['landlord', 'strata', 'community_housing'].includes(String(b.org_kind))) return fail(400, 'Choose what you are.', 'validation')
    if (address.length < 5) return fail(400, 'Enter the street address of the block.', 'validation')
    if (!Number.isInteger(flats) || flats < 1 || flats > 500) return fail(400, 'Enter a number of flats between 1 and 500.', 'validation')
    const e: Enquiry = { id: enquiries.length + 1, name, email, phone: b.phone ? String(b.phone) : undefined, org_kind: String(b.org_kind), address, flats, message: b.message ? String(b.message) : undefined, created_on: today(), status: 'new', project_id: null }
    enquiries.push(e)
    return { status: 201, body: { id: e.id } }
  }

  const who = mockWho(token)
  if (!who) return fail(401, 'Please sign in to continue.', 'unauthorized')

  if (method === 'GET' && pathname === '/api/programme/enquiries') {
    if (who.role !== 'manager') return fail(403, "You don't have access to that.", 'forbidden')
    return ok([...enquiries].reverse())
  }
  const conv = /^\/api\/programme\/enquiries\/(\d+)\/convert$/.exec(pathname)
  if (method === 'POST' && conv) {
    if (who.role !== 'manager') return fail(403, "You don't have access to that.", 'forbidden')
    const e = enquiries.find((x) => x.id === Number(conv[1]))
    if (!e) return fail(404, "We couldn't find that enquiry.", 'not_found')
    if (e.status === 'converted') return fail(409, 'That enquiry already has a project.', 'conflict')
    const org = S.orgs.find((o) => o.kind === 'community_housing' || o.kind === 'provider' || o.kind === e.org_kind) ?? S.orgs[0]
    const taken = new Set(S.projects.map((p) => p.building_id))
    for (const c of nearestBuilding(e.address, e.flats, taken).slice(0, 8)) {
      const r = await viaProgramme<{ id: number }>('POST', '/api/programme/projects', token, { building_id: c.id, owner_org_id: org.id })
      if (r.status < 300) {
        e.status = 'converted'
        e.project_id = r.body.id
        return ok({ project_id: r.body.id })
      }
    }
    return fail(409, 'No pilot building was free to match this enquiry.', 'conflict')
  }

  // ----- summary -----
  if (method === 'GET' && pathname === '/api/property/summary') {
    if (who.role !== 'owner') return fail(403, "You don't have access to that.", 'forbidden')
    const pr = await viaProgramme<Project[]>('GET', '/api/programme/projects', token)
    const blocks = pr.body
    const ids = new Set(blocks.map((x) => x.id))
    const flats = S.flats.filter((f) => ids.has(f.project_id))
    const actions: PropertySummary['actions'] = []
    for (const p of blocks) {
      if (p.stage === 'screened') actions.push({ project_id: p.id, label: p.label, kind: 'site_visit', text: 'Book a site visit so the open-data guess can be checked.' })
      if (p.stage === 'audit') actions.push({ project_id: p.id, label: p.label, kind: 'site_visit', text: 'Enter the site audit details after the visit.' })
      if (p.stage === 'consent' && !p.consent.owner_signed) actions.push({ project_id: p.id, label: p.label, kind: 'sign_consent', text: 'Sign the owner consent (strata: record the meeting resolution).' })
      if (p.stage === 'consent') {
        const pending = flats.filter((f) => f.project_id === p.id && f.consent === 'pending').length
        if (pending) actions.push({ project_id: p.id, label: p.label, kind: 'tenant_consent', text: `${pending} tenant${pending === 1 ? ' has' : 's have'} not answered yet.` })
      }
      const owing = flats.filter((f) => f.project_id === p.id && f.balance_owing > 0)
      if (owing.length) actions.push({ project_id: p.id, label: p.label, kind: 'record_payments', text: `${owing.length} flat${owing.length === 1 ? '' : 's'} owe a charge. Record any payments received.` })
    }
    const fr = await viaProgramme<Fault[]>('GET', '/api/programme/faults?status=open', token)
    for (const f of fr.body) {
      const p = blocks.find((x) => x.id === f.project_id)
      actions.push({ project_id: f.project_id, label: p?.label ?? `Project ${f.project_id}`, kind: 'fault', text: `Open fault: ${f.description}` })
    }
    const fids = new Set(flats.map((f) => f.id))
    const months = S.ledger.filter((l) => fids.has(l.flat_id) && l.kind === 'charge').map((l) => l.month).sort()
    const month = months[months.length - 1] ?? S.now
    const inMonth = S.ledger.filter((l) => fids.has(l.flat_id) && l.month === month)
    const org = who.org ?? { id: 0, name: '' }
    const out: PropertySummary = {
      org,
      blocks,
      actions,
      charges: {
        month,
        flats_active: flats.filter((f) => f.charge_status === 'active').length,
        billed: inMonth.filter((l) => l.kind === 'charge').reduce((s, l) => s + l.amount, 0),
        collected: inMonth.filter((l) => l.kind === 'payment').reduce((s, l) => s + l.amount, 0),
        arrears: flats.reduce((s, f) => s + Math.max(0, f.balance_owing), 0),
      },
      faults_open: fr.body.length,
      consent_pending: flats.filter((f) => f.consent === 'pending' && blocks.find((p) => p.id === f.project_id)?.stage === 'consent').length,
    }
    return ok(out)
  }

  // ----- data consent, personal data, erase -----
  const fl = /^\/api\/programme\/flats\/(\d+)\/(data-consent|personal-data|erase)$/.exec(pathname)
  if (fl) {
    const f = S.flats.find((x) => x.id === Number(fl[1]))
    if (!f) return fail(404, "We couldn't find that flat.", 'not_found')
    if (!canTouchFlat(who, f)) return fail(403, "You don't have access to that.", 'forbidden')
    if (fl[2] === 'data-consent') {
      if (method === 'GET') return ok({ flat_id: f.id, ...rawConsent(consentOf(f)) })
      if (method === 'POST') {
        if (typeof b.given !== 'boolean') return fail(400, 'Say whether data consent is given.', 'validation')
        if (b.given) {
          const [y, m] = S.now.split('-')
          const exp = b.expires_on ? String(b.expires_on) : `${Number(y) + 1}-${m}-01`
          if (!/^\d{4}-\d{2}-\d{2}$/.test(exp) || exp <= today()) return fail(400, 'The end date must be in the future.', 'validation')
          consents.set(f.id, { given: true, expires_on: exp, given_on: today() })
        } else consents.set(f.id, { given: false, expires_on: null, given_on: null })
        return ok({ flat_id: f.id, ...rawConsent(consents.get(f.id)!) })
      }
    }
    if (fl[2] === 'personal-data' && method === 'GET') {
      return ok({
        flat_id: f.id,
        unit: f.unit,
        tenant_name: f.tenant_name,
        tenancy_start: f.tenancy_start,
        meter_id: f.meter_id,
        ledger_entries: S.ledger.filter((l) => l.flat_id === f.id).length,
        readings: S.readings.get(f.id)?.length ?? 0,
        data_consent: rawConsent(consentOf(f)),
        generated_on: today(),
      })
    }
    if (fl[2] === 'erase' && method === 'POST') {
      if (who.role === 'tenant') return fail(403, "You don't have access to that.", 'forbidden')
      f.tenant_name = 'Former tenant'
      erased.add(f.id)
      return ok(f)
    }
    return null
  }

  // ----- strata consent and project detail with resolution -----
  const co = /^\/api\/programme\/projects\/(\d+)\/consent\/owner$/.exec(pathname)
  if (method === 'POST' && co) {
    const res = b.resolution as Record<string, unknown> | undefined
    if (!res) return null
    if (who.role !== 'manager' && who.role !== 'owner') return fail(403, "You don't have access to that.", 'forbidden')
    const date = String(res.meeting_date ?? '')
    const vf = Number(res.votes_for)
    const va = Number(res.votes_against)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, 'Enter the meeting date as year-month-day.', 'validation')
    if (!Number.isInteger(vf) || !Number.isInteger(va) || vf < 0 || va < 0) return fail(400, 'Votes must be whole numbers, zero or more.', 'validation')
    if (vf <= va) return fail(400, 'An ordinary resolution needs more votes for than against.', 'validation')
    if (!String(b.name ?? '').trim()) return fail(400, 'Enter the name of the person signing.', 'validation')
    const r = await viaProgramme<Record<string, unknown>>('POST', pathname, token, { signed: true, name: b.name })
    if (r.status >= 300) return { status: r.status, body: r.body }
    const rec: Resolution = { meeting_date: date, votes_for: vf, votes_against: va, kind: 'ordinary' }
    resolutions.set(Number(co[1]), rec)
    return ok({ ...r.body, resolution: rec })
  }
  const pd = /^\/api\/programme\/projects\/(\d+)$/.exec(pathname)
  if (method === 'GET' && pd) {
    const r = await viaProgramme<Record<string, unknown>>('GET', pathname, token)
    if (r.status >= 300) return { status: r.status, body: r.body }
    return ok({ ...r.body, resolution: resolutions.get(Number(pd[1])) ?? null })
  }
  void params
  return null
}
