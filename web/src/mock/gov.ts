// Mock of the government routes (docs/portals-contract.md). Demo data only.
// Reads the shared in-memory programme state from ./programme. Returns null for paths it does not own.
import type { RawReply } from '../console/api'
import type { AuditLogEntry } from '../console/types'
import type { Areas, AreaRow, Grant, Outcomes, Target } from '../console/types-gov'
import { mockBuildings } from './fixtures.ts'
import { mockState, mockWho } from './programme'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

const fail = (status: number, detail: string, code: string): RawReply => ({ status, body: { detail, code } })

let targets: Target[] | null = null
let grants: Grant[] | null = null

function seedTargets(): Target[] {
  return [
    { key: 'flats_upgraded', label: 'Flats upgraded', target: 200, by: '2028-06', actual: 0 },
    { key: 'co2e_t_per_year', label: 'Emissions cut (tonnes CO2e a year)', target: 120, by: '2028-06', actual: 0 },
    { key: 'tenant_saving_per_year', label: 'Tenant savings a year ($)', target: 60000, by: '2028-06', actual: 0 },
    { key: 'grant_spent', label: 'Grant spent ($)', target: 300000, by: '2028-06', actual: 0 },
  ]
}

function seedGrants(): Grant[] {
  const S = mockState()
  const ps = S.projects.filter((p) => ['consent', 'procurement', 'installation', 'commissioned', 'active'].includes(p.stage))
  const out: Grant[] = []
  const base = S.now
  ps.slice(0, 5).forEach((p, i) => {
    const asked = Math.max(4000, Math.round((p.grant || 12000 + i * 3000) / 500) * 500 || 12000)
    const status: Grant['status'] = i === 0 ? 'paid' : i === 1 || i === 2 ? 'approved' : 'requested'
    out.push({
      id: i + 1,
      project_id: p.id,
      requested: asked,
      approved: status === 'requested' ? null : asked,
      status,
      reason: 'Funding gap after capped charge',
      requested_on: `${base}-0${2 + i}`,
      decided_on: status === 'requested' ? null : `${base}-1${i}`,
      decided_by: status === 'requested' ? null : 'Robin Sample (state oversight)',
    })
  })
  return out
}

function areaOf(label: string): string {
  const f = mockBuildings.features.find((x) => x.properties.label === label)
  return f?.properties.suburb ?? 'Unknown'
}

function centroid(g: { type: string; coordinates: unknown }): [number, number] {
  const ring = (g.type === 'Polygon' ? (g.coordinates as number[][][])[0] : (g.coordinates as number[][][][])[0][0]) ?? []
  const n = Math.max(1, ring.length)
  return [ring.reduce((s, c) => s + c[0], 0) / n, ring.reduce((s, c) => s + c[1], 0) / n]
}

function computeOutcomes(): Outcomes {
  const S = mockState()
  if (!targets) targets = seedTargets()
  const live = S.projects.filter((p) => ['commissioned', 'active', 'closed'].includes(p.stage))
  const pipeline = S.projects.filter((p) => !['commissioned', 'active', 'closed'].includes(p.stage))
  let tenantSaving = 0
  let co2 = 0
  let gas = 0
  let hours = 0
  let energyPct = 0
  let energyN = 0
  for (const p of live) {
    const a = p.frozen
    if (!a) continue
    for (const g of a.flat_groups) {
      tenantSaving += g.net_saving_per_month * g.count * 12
      if (g.position === 'top') hours += Math.max(0, g.comfort.hours_above_30c_baseline - g.comfort.hours_above_30c_upgraded) * g.count
    }
    co2 += a.impact.co2e_t_per_year_saved
    gas += a.impact.gas_mj_per_year_avoided
    energyPct += a.impact.energy_reduction_pct
    energyN += 1
  }
  const flatsUpgraded = live.reduce((s, p) => s + p.flats, 0)

  // measured savings: the latest check per project
  const latest = new Map<number, (typeof S.mv)[number]>()
  for (const m of S.mv) latest.set(m.project_id, m)
  const runs = [...latest.values()]
  const rate = runs.length ? runs.reduce((s, m) => s + m.realisation_rate, 0) / runs.length : 0
  const verified = runs.length ? { projects: runs.length, realisation_rate: r2(rate), tenant_saving_per_year: Math.round(tenantSaving * rate * (runs.length / Math.max(1, live.length))), co2e_t_per_year: r1(co2 * rate * (runs.length / Math.max(1, live.length))) } : null

  const trueUps = S.mv.reduce((s, m) => s + m.true_ups.length, 0)
  const refunded = S.mv.reduce((s, m) => s + m.true_ups.reduce((a, t) => a + t.refund, 0), 0)
  const pausedMonths = S.faults.reduce((s, f) => s + f.months_paused, 0)
  const complaints = S.faults.filter((f) => f.status === 'open').length

  const prog = { ...S.programme }
  if (!prog.capital_deployed) prog.capital_deployed = Math.round(live.reduce((t, p) => t + (p.frozen?.package.net_capex ?? 0), 0))
  if (!prog.repaid_to_date) prog.repaid_to_date = Math.round(S.ledger.filter((l) => l.kind === 'payment').reduce((t, l) => t + l.amount, 0))
  if (!prog.reserve_balance) prog.reserve_balance = Math.round(S.reserve.length ? S.reserve[S.reserve.length - 1].balance_after : 0)
  const spent = grants ? grants.filter((g) => g.status === 'approved' || g.status === 'paid').reduce((s, g) => s + (g.approved ?? 0), 0) : prog.grant_used
  const actual: Record<string, number> = { flats_upgraded: flatsUpgraded, co2e_t_per_year: r1(co2), tenant_saving_per_year: Math.round(tenantSaving), grant_spent: Math.round(spent) }

  const areas = new Map<string, { rows: typeof mockBuildings.features; projects: number; upgraded: number }>()
  for (const f of mockBuildings.features) {
    const a = f.properties.suburb
    if (!areas.has(a)) areas.set(a, { rows: [], projects: 0, upgraded: 0 })
    areas.get(a)!.rows.push(f)
  }
  for (const p of S.projects) {
    const a = areas.get(areaOf(p.label))
    if (!a) continue
    a.projects += 1
    if (['commissioned', 'active', 'closed'].includes(p.stage)) a.upgraded += p.flats
  }
  const by_area: AreaRow[] = [...areas.entries()].map(([area, v]) => {
    const rs = v.rows.map((r) => r.properties.renter_share).filter((x): x is number => x !== null)
    return {
      area,
      kind: 'suburb',
      buildings: v.rows.length,
      flats_est: v.rows.reduce((s, r) => s + r.properties.flats_est, 0),
      renter_share: r2(rs.length ? rs.reduce((s, x) => s + x, 0) / rs.length : 0),
      hottest_band_buildings: v.rows.filter((r) => r.properties.heat_band === 'hottest' || r.properties.heat_band === 'hot').length,
      projects: v.projects,
      flats_upgraded: v.upgraded,
    }
  })

  return {
    as_of: S.now,
    programme: prog,
    reach: {
      projects_active: S.projects.filter((p) => p.stage === 'active').length,
      flats_upgraded: flatsUpgraded,
      households_renting_est: Math.round(flatsUpgraded * 0.72),
      blocks_in_pipeline: pipeline.length,
    },
    money: {
      grant_committed: prog.grant_pool,
      grant_spent: Math.round(spent),
      capital_deployed: prog.capital_deployed,
      repaid: prog.repaid_to_date,
      reserve: prog.reserve_balance,
      cost_per_flat: flatsUpgraded ? Math.round(prog.capital_deployed / flatsUpgraded) : 0,
      grant_per_tonne_co2e: co2 > 0 ? Math.round(spent / (co2 * 10)) : 0,
    },
    impact_modelled: {
      tenant_saving_per_year: Math.round(tenantSaving),
      co2e_t_per_year: r1(co2),
      gas_mj_per_year_avoided: Math.round(gas),
      energy_reduction_pct: r1(energyN ? energyPct / energyN : 0),
      top_floor_hours_above_30c_avoided: Math.round(hours),
    },
    impact_verified: verified,
    protections: { charges_paused_months: pausedMonths, true_ups: trueUps, refunded: r2(refunded), tenants_worse_off_verified: 0, complaints_open: complaints },
    targets: targets.map((t) => ({ ...t, actual: actual[t.key] ?? 0 })),
    by_area,
  }
}

/** A simple chained hash over the audit log, so the chain can be verified. */
function hashOf(prev: string, e: AuditLogEntry): string {
  const s = `${prev}|${e.at}|${e.by}|${e.role}|${e.action}|${e.project_id}|${e.detail}`
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}
function chained() {
  const S = mockState()
  let prev = '0000000000000000'
  return S.log.map((e, i) => {
    const hash = hashOf(prev, e)
    const out = { ...e, id: i + 1, prev_hash: prev, hash }
    prev = hash
    return out
  })
}

const csv = (header: string[], rows: (string | number)[][]) => {
  const cell = (v: string | number) => {
    let s = String(v)
    if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

function report(kind: string): string | null {
  const S = mockState()
  switch (kind) {
    case 'projects':
      return csv(['project_id', 'label', 'stage', 'flats', 'owner'], S.projects.map((p) => [p.id, p.label, p.stage, p.flats, p.owner_org.name]))
    case 'outcomes': {
      const o = computeOutcomes()
      return csv(['measure', 'value'], [['flats_upgraded', o.reach.flats_upgraded], ['capital_deployed', o.money.capital_deployed], ['repaid', o.money.repaid], ['reserve', o.money.reserve], ['tenant_saving_per_year_modelled', o.impact_modelled.tenant_saving_per_year], ['co2e_t_per_year_modelled', o.impact_modelled.co2e_t_per_year]])
    }
    case 'verified_savings':
      return csv(['project_id', 'run_on', 'modelled_per_month', 'verified_per_month', 'realisation_rate', 'true_ups', 'source'], S.mv.map((m) => [m.project_id, m.run_on, m.modelled_saving_per_month, m.verified_saving_per_month, m.realisation_rate, m.true_ups.length, m.source]))
    case 'grants':
      return csv(['grant_id', 'project_id', 'requested', 'approved', 'status', 'decided_on'], (grants ?? []).map((g) => [g.id, g.project_id, g.requested, g.approved ?? '', g.status, g.decided_on ?? '']))
    case 'charges':
      return csv(['project_id', 'unit', 'charge_per_month', 'charge_status', 'months_billed', 'balance_owing'], S.flats.map((f) => [f.project_id, f.unit, f.charge_per_month, f.charge_status, f.months_billed, f.balance_owing]))
    case 'audit_log':
      return csv(['at', 'by', 'role', 'action', 'project_id', 'detail', 'hash'], chained().map((e) => [e.at, e.by, e.role, e.action, e.project_id ?? '', e.detail, e.hash]))
    default:
      return null
  }
}

const CONTROLS = {
  generated_at: 'now',
  sessions: { absolute_expiry_hours: 12, idle_expiry_minutes: 30, logout_revokes_token: true, tokens_in_urls: false },
  authentication: { min_password_length: 14, common_password_check: true, hashing: 'scrypt', lockout_after_failures: 5, lockout_minutes: 15, login_rate_limit_per_ip: true },
  multi_factor: { totp_for_staff: true, enforced_for: ['manager', 'government', 'utility', 'owner', 'installer', 'funder'], demo_accounts_exempt: true, enrolment_routes: ['/api/auth/mfa/setup', '/api/auth/mfa/verify'] },
  sso: { oidc_settings_present: true, configured: false, callback_route_status: '501 until configured', note: 'Single sign-on is prepared, not connected to an identity provider.' },
  access_control: { role_checks_on_every_route: true, default_deny: true, organisation_isolation: true, tenant_names_hidden_from: ['government', 'utility', 'funder', 'installer'] },
  audit_log: { append_only: true, hash_chained: true, verify_route: '/api/programme/audit-log/verify', records: ['sign-ins', 'sign-in failures', 'reads of tenant data', 'exports', 'every change'] },
  response_headers: { content_security_policy: true, strict_transport_security: true, x_content_type_options: true, referrer_policy: true, permissions_policy: true, frame_ancestors: 'none', api_cache_control: 'no-store' },
  input_handling: { validation_on_every_body: true, upload_size_limit: true, row_limit: true, csv_formula_neutralised: true },
  privacy: { tenant_data_limited_to: ['name', 'unit'], access_request_export: true, erase_to_former_tenant: true, retention_setting: '7 years', meter_data_consent_required: true, meter_ids_masked_for: ['government', 'funder', 'installer'] },
  data_inventory: [
    { item: 'Tenant name', purpose: 'Letters and charge records', retention: '7 years, or erased on request' },
    { item: 'Flat meter identifier', purpose: 'Charge and readings', retention: 'Life of the charge' },
    { item: 'Monthly meter readings', purpose: 'Measured savings check', retention: 'Life of the charge', note: 'Only with data consent' },
    { item: 'Staff name and email', purpose: 'Sign-in and audit log', retention: 'While the account is open' },
  ],
  secrets_and_config: { secrets_from_environment: true, refuses_default_secret_when_demo_off: true, cors_limited: true },
  operations: { security_txt: true, health_and_ready_routes: true, structured_request_log: true, personal_data_in_logs: false, dependencies_pinned: true, sbom: true },
  demo_mode: {
    demo_mode_on: true,
    demo_exemptions: ['Demo accounts skip the second sign-in step', 'Simulated clock and demo reset are available', 'Demo accounts are listed on the sign-in page'],
    note: 'A real deployment turns all of this off.',
  },
  not_claimed: ['ISO/IEC 27001 certification', 'SOC 2 report', 'IRAP assessment', 'Independent penetration test', 'Formal accessibility audit'],
}

export async function handle(method: string, pathname: string, params: URLSearchParams, body: unknown, token: string | null): Promise<RawReply | null> {
  const isGov = pathname.startsWith('/api/government/')
  const isAudit = pathname === '/api/programme/audit-log' || pathname === '/api/programme/audit-log/verify'
  if (!isGov && !isAudit) return null
  await sleep(100)
  const who = mockWho(token)
  if (!who) return fail(401, 'Please sign in to continue.', 'unauthorized')
  const role = who.role
  if (role !== 'government' && role !== 'manager') return fail(403, "You don't have access to that.", 'forbidden')
  const S = mockState()
  if (!grants) grants = seedGrants()
  if (!targets) targets = seedTargets()

  if (method === 'GET' && pathname === '/api/government/outcomes') return { status: 200, body: computeOutcomes() }

  if (method === 'PUT' && pathname === '/api/government/targets') {
    const t = (body as { targets?: Target[] } | null)?.targets
    if (!Array.isArray(t) || t.length === 0) return fail(400, 'Send at least one target.', 'validation')
    const allowed = ['flats_upgraded', 'co2e_t_per_year', 'tenant_saving_per_year', 'grant_spent']
    for (const x of t) {
      if (!allowed.includes(x.key)) return fail(400, `"${x.key}" is not a target we track.`, 'validation')
      if (!(Number(x.target) >= 0)) return fail(400, `The target for ${x.label} must be zero or more.`, 'validation')
      if (!/^\d{4}-\d{2}$/.test(String(x.by))) return fail(400, `The date for ${x.label} must look like 2028-06.`, 'validation')
    }
    targets = targets.map((cur) => {
      const n = t.find((x) => x.key === cur.key)
      return n ? { ...cur, label: n.label || cur.label, target: Number(n.target), by: n.by } : cur
    })
    S.log.push({ at: `${S.now}-04T09:00:00Z`, by: who.user.name, role, action: 'targets_updated', project_id: null, detail: 'Programme targets changed' })
    return { status: 200, body: { targets: computeOutcomes().targets } }
  }

  if (method === 'GET' && pathname === '/api/government/areas') {
    const o = computeOutcomes()
    const stageOf = new Map(S.projects.map((p) => [p.building_id, p.stage]))
    const out: Areas = {
      by_area: o.by_area,
      buildings: mockBuildings.features.map((f) => {
        const [lon, lat] = centroid(f.geometry as { type: string; coordinates: unknown })
        return { building_id: f.properties.id, lat, lon, heat_band: f.properties.heat_band, renter_share: f.properties.renter_share, flats_est: f.properties.flats_est, project_stage: stageOf.get(f.properties.id) ?? null }
      }),
    }
    return { status: 200, body: out }
  }

  if (method === 'GET' && pathname === '/api/government/grants') return { status: 200, body: [...grants].reverse() }

  if (method === 'POST' && pathname === '/api/government/grants') {
    if (role !== 'manager') return fail(403, 'Only programme officers can request a grant.', 'forbidden')
    const b = (body ?? {}) as { project_id?: number; requested?: number; reason?: string }
    const p = S.projects.find((x) => x.id === Number(b.project_id))
    if (!p) return fail(404, "We couldn't find that project.", 'not_found')
    if (!(Number(b.requested) > 0)) return fail(400, 'Enter the amount you are asking for.', 'validation')
    if (!b.reason || String(b.reason).trim().length < 3) return fail(400, 'Say why the grant is needed.', 'validation')
    const g: Grant = { id: Math.max(0, ...grants.map((x) => x.id)) + 1, project_id: p.id, requested: Math.round(Number(b.requested)), approved: null, status: 'requested', reason: String(b.reason).trim(), requested_on: `${S.now}-04`, decided_on: null, decided_by: null }
    grants.push(g)
    S.log.push({ at: `${S.now}-04T09:10:00Z`, by: who.user.name, role, action: 'grant_requested', project_id: p.id, detail: `Grant of $${g.requested} requested` })
    return { status: 200, body: g }
  }

  const dm = /^\/api\/government\/grants\/(\d+)\/decide$/.exec(pathname)
  if (method === 'POST' && dm) {
    if (role !== 'government') return fail(403, 'Only state or council oversight can decide a grant.', 'forbidden')
    const g = grants.find((x) => x.id === Number(dm[1]))
    if (!g) return fail(404, "We couldn't find that grant.", 'not_found')
    if (g.status !== 'requested') return fail(409, 'That grant has already been decided.', 'conflict')
    const b = (body ?? {}) as { approved?: number; status?: string; note?: string }
    if (b.status !== 'approved' && b.status !== 'declined') return fail(400, 'Choose approve or decline.', 'validation')
    if (b.status === 'approved') {
      const amt = Number(b.approved)
      if (!(amt > 0)) return fail(400, 'Enter the amount to approve.', 'validation')
      const left = S.programme.grant_pool - S.programme.grant_used
      if (amt > left) return fail(409, `Only $${Math.round(left)} is left in the grant pool.`, 'conflict')
      g.approved = Math.round(amt)
      S.programme.grant_used += g.approved
      const p = S.projects.find((x) => x.id === g.project_id)
      if (p) p.grant = g.approved
    } else g.approved = 0
    g.status = b.status
    g.decided_on = `${S.now}-04`
    g.decided_by = who.user.name
    S.log.push({ at: `${S.now}-04T09:20:00Z`, by: who.user.name, role, action: 'grant_decided', project_id: g.project_id, detail: `Grant ${g.status}${b.note ? ': ' + b.note : ''}` })
    return { status: 200, body: g }
  }

  if (method === 'GET' && pathname === '/api/government/routes') {
    const total = mockBuildings.features.length
    const strata = mockBuildings.features.filter((f) => f.properties.flats_est > 20).length
    const provider = Math.round(total * 0.28)
    return {
      status: 200,
      body: [
        { key: 'community_housing', name: 'Route A: community housing provider', status: 'usable_now', rule_change: 'None. The provider collects the charge as a service charge.', blocks_reachable: provider, estimate: true, note: 'Pilot blocks owned by community housing providers. An estimate from ownership patterns, not a register.' },
        { key: 'council_rates', name: 'Route B: council rates', status: 'needs_rule_change', rule_change: 'Council needs power to levy a charge for private upgrades, and strata schemes above 20 lots need a resolution.', blocks_reachable: strata, estimate: true, note: 'Strata blocks above 20 lots in the dataset.' },
        { key: 'meter_attached', name: 'Route C: charge attached to the meter', status: 'needs_rule_change', rule_change: 'Energy rules would need to allow a charge that stays with the meter when tenants change.', blocks_reachable: total, estimate: true, note: 'All pilot blocks could use it, if the rule changed.' },
      ],
    }
  }

  const rm = /^\/api\/government\/reports\/([a-z_]+)\.csv$/.exec(pathname)
  if (method === 'GET' && rm) {
    const text = report(rm[1])
    if (text === null) return fail(404, "We don't have that report.", 'not_found')
    S.log.push({ at: `${S.now}-04T09:30:00Z`, by: who.user.name, role, action: 'report_exported', project_id: null, detail: `Report ${rm[1]} exported` })
    return { status: 200, body: null, text, contentType: 'text/csv' }
  }

  if (method === 'GET' && pathname === '/api/government/controls') return { status: 200, body: { ...CONTROLS, generated_at: new Date().toISOString() } }

  if (method === 'GET' && pathname === '/api/programme/audit-log') {
    const pid = params.get('project_id')
    const lim = Number(params.get('limit') ?? 200)
    return { status: 200, body: chained().filter((l) => !pid || l.project_id === Number(pid)).slice(-lim).reverse() }
  }
  if (method === 'GET' && pathname === '/api/programme/audit-log/verify') {
    return { status: 200, body: { valid: true, entries: S.log.length, broken_at: null } }
  }

  return fail(404, "We couldn't find that.", 'not_found')
}
