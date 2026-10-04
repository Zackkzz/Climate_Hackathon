// DEMO DATA ONLY. In-browser stand-in for the programme and analysis routes (VITE_MOCK=1).
// Everything here is invented and example: organisations, people, meters and readings. Nothing is a real estimate.
import type { RawReply } from '../console/api'
import type {
  AdvanceResult,
  Audit,
  AuditLogEntry,
  BillingRun,
  ChecklistItem,
  DemoUser,
  Doc,
  Fault,
  Flat,
  LedgerEntry,
  Microclimate,
  MvRun,
  MyFlat,
  OrgRef,
  Overview,
  PlanBody,
  PlanResult,
  Programme,
  Project,
  ProjectDetail,
  Quote,
  Reading,
  Reserve,
  ReserveEntry,
  Risk,
  Role,
  Schedule,
  Sizing,
  Stage,
  StageHistory,
  Tender,
  User,
  VerifyResult,
  WorkOrder,
} from '../console/types'
import { STAGES } from '../console/types'
import type { AssessRequest, AssessResponse, Existing, Finance, Package, PackageKey, Tariff } from '../types'
import { mockAssess } from './assess.ts'
import { mockBuildings, mockMeta } from './fixtures.ts'

// ---------- helpers ----------
class HttpErr extends Error {
  status: number
  code: string
  extra: Record<string, unknown>
  constructor(status: number, message: string, code: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}
const bad = (m: string) => new HttpErr(400, m, 'validation')
const nope = (m = "You don't have access to that.") => new HttpErr(403, m, 'forbidden')
const missing = (m = "We couldn't find that.") => new HttpErr(404, m, 'not_found')
const conflict = (m: string) => new HttpErr(409, m, 'conflict')

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const mIdx = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return y * 12 + mo - 1
}
const addM = (m: string, n: number) => {
  const i = mIdx(m) + n
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`
}
const monthsBetween = (a: string, b: string) => {
  const out: string[] = []
  for (let i = mIdx(a); i <= mIdx(b); i++) out.push(`${Math.floor(i / 12)}-${pad((i % 12) + 1)}`)
  return out
}
/** Deterministic pseudo-random number in [0, 1) from integers. */
function rnd(...ns: number[]): number {
  let h = 2166136261
  for (const n of ns) {
    h ^= Math.floor(n) + 0x9e3779b9
    h = Math.imul(h, 16777619)
    h ^= h >>> 13
  }
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ---------- state ----------
interface Proj {
  id: number
  building_id: string
  label: string
  storeys: number
  flats: number
  roof_m2: number
  heat_band: string
  stage: Stage
  stage_since: string
  owner_org: OrgRef
  installer_org: OrgRef | null
  existing: Record<string, string>
  package: Record<string, boolean>
  finance: Record<string, number | boolean>
  tariff: Record<string, number>
  audit: Audit | null
  frozen: AssessResponse | null
  sizing: Sizing | null
  schedule: Schedule | null
  ownerSigned: boolean
  tender: { orgs: number[]; closes_on: string } | null
  grant: number
  startMonth: string | null
  history: StageHistory[]
  rate: number | null
  quoted: number | null
}
interface UserRec {
  key: string
  name: string
  email: string
  role: Role
  org: OrgRef
}
interface State {
  base: string
  offset: number
  now: string
  programme: Programme
  orgs: OrgRef[]
  users: UserRec[]
  projects: Proj[]
  flats: Flat[]
  ledger: LedgerEntry[]
  faults: Fault[]
  quotes: Quote[]
  wos: WorkOrder[]
  readings: Map<number, Reading[]>
  mv: MvRun[]
  reserve: ReserveEntry[]
  log: AuditLogEntry[]
  runs: Map<string, BillingRun>
  stats: Map<string, { billed: number; collected: number; paused: number; reserve_balance: number }>
  ids: Record<string, number>
}
let S!: State
let ready = false
const nid = (k: string) => (S.ids[k] = (S.ids[k] ?? 0) + 1)

const ORG = {
  office: { id: 5, name: 'Example Programme Office', kind: 'programme', example: true },
  provider: { id: 1, name: 'Example Community Housing', kind: 'provider', example: true },
  provider2: { id: 6, name: 'Example Housing Collective', kind: 'provider', example: true },
  funder: { id: 2, name: 'Example Impact Fund', kind: 'funder', example: true },
  council: { id: 7, name: 'Example City Council', kind: 'council', example: true },
  state: { id: 8, name: 'Example State Energy Agency', kind: 'state_agency', example: true },
  distributor: { id: 9, name: 'Example Network Distributor', kind: 'distributor', example: true },
  retailer: { id: 10, name: 'Example Energy Retailer', kind: 'retailer', example: true },
  gas: { id: 11, name: 'Example Gas Network', kind: 'gas_network', example: true },
  instA: { id: 3, name: 'Example Solar and Heat Co', kind: 'installer', example: true },
  instB: { id: 4, name: 'Example Cool Roofs Pty Ltd', kind: 'installer', example: true },
}
const NAMES = ['R. Example', 'S. Sample', 'T. Demo', 'A. Placeholder', 'M. Fictional', 'J. Imaginary', 'K. Pretend', 'L. Mockup', 'D. Specimen', 'N. Trial', 'P. Dummy', 'H. Notional', 'C. Invented', 'B. Sketch', 'F. Model']
const ITEM_LABELS: Record<string, string> = {
  roof_coating_thickness: 'Roof coating applied to specified thickness',
  heat_pump_installed: 'Heat pump hot water units installed and tested',
  ac_installed: 'Reverse-cycle air conditioners installed and tested',
  switchboard_checked: 'Switchboard checked and labelled',
  meters_checked: 'Meters and loggers checked',
  tenant_walkthrough: 'Walk-through done with each tenant',
}
const FAULT_ITEMS = ['heat_pump_hot_water', 'reverse_cycle', 'cool_roof']

const dayOf = (m: string, d = 15) => `${m}-${pad(d)}`

// ---------- assessment helpers ----------
const aCache = new Map<string, AssessResponse>()
function reqOf(p: Proj): AssessRequest {
  return {
    building_id: p.building_id,
    building: { storeys: p.storeys, flats: p.flats, roof_m2: p.roof_m2 },
    existing: p.existing as Partial<Existing>,
    package: p.package as Partial<Package>,
    finance: p.finance as Partial<Finance>,
    tariff: p.tariff as Partial<Tariff>,
  }
}
function assess(req: AssessRequest): AssessResponse {
  const k = JSON.stringify(req)
  let a = aCache.get(k)
  if (!a) {
    a = mockAssess(req)
    if (aCache.size > 60) aCache.clear()
    aCache.set(k, a)
  }
  return a
}
const liveOf = (p: Proj) => assess(reqOf(p))
const assessOf = (p: Proj) => p.frozen ?? liveOf(p)
const groupFor = (a: AssessResponse, pos: string) => a.flat_groups.find((g) => g.position === pos) ?? a.flat_groups[0]
const stageIdx = (s: Stage) => STAGES.indexOf(s)
const finNum = (p: Proj, k: string) => Number(p.finance[k])

// ---------- flats and ledger ----------
const flatsOf = (p: Proj) => S.flats.filter((f) => f.project_id === p.id)
const projOfFlat = (f: Flat) => S.projects.find((p) => p.id === f.project_id)!
function annuity(rate: number, years: number) {
  const i = rate / 12
  const n = years * 12
  return i === 0 ? n : (1 - Math.pow(1 + i, -n)) / i
}
function makeFlats(p: Proj) {
  S.flats = S.flats.filter((f) => f.project_id !== p.id)
  const topCount = Math.max(1, Math.ceil(p.flats / Math.max(1, p.storeys)))
  const a = liveOf(p)
  for (let u = 1; u <= p.flats; u++) {
    const position = u > p.flats - topCount ? 'top' : 'lower'
    const id = nid('flat')
    const charge = groupFor(a, position).charge_per_month
    S.flats.push({
      id,
      project_id: p.id,
      unit: String(u),
      position,
      meter_id: `NMI-EX-4${pad(p.id)}${pad(u, 4)}`,
      tenant_name: NAMES[(id * 7) % NAMES.length],
      tenancy_start: `${2022 + (id % 4)}-${pad((id % 12) + 1)}-01`,
      consent: 'pending',
      charge_per_month: r2(charge),
      charge_status: 'not_started',
      paused_reason: null,
      balance_owing: 0,
      principal_remaining: r2(charge * annuity(finNum(p, 'cost_of_capital'), finNum(p, 'term_years'))),
      months_billed: 0,
      access_code: codeFor(id),
    })
  }
}
function codeFor(id: number) {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let n = id * 7919 + 1301
  let s = ''
  for (let i = 0; i < 4; i++) {
    s += A[n % A.length]
    n = Math.floor(n / A.length) + 11 * (i + 1)
  }
  return `FLAT-${s}`
}
function refreshCharges(p: Proj) {
  const a = assessOf(p)
  for (const f of flatsOf(p)) {
    if (f.charge_status === 'active' || f.charge_status === 'paused' || f.charge_status === 'ended') continue
    f.charge_per_month = f.consent === 'declined' ? 0 : r2(groupFor(a, f.position).charge_per_month)
    f.principal_remaining = r2(f.charge_per_month * annuity(finNum(p, 'cost_of_capital'), finNum(p, 'term_years')))
  }
}
function ledgerAdd(f: Flat, month: string, kind: LedgerEntry['kind'], amount: number, note: string) {
  const dec = kind === 'charge' ? amount : kind === 'adjustment' ? amount : -amount
  f.balance_owing = r2(f.balance_owing + dec)
  S.ledger.push({ id: nid('ledger'), flat_id: f.id, month, at: `${dayOf(month, 28)}T09:00:00Z`, kind, amount: r2(amount), balance_after: f.balance_owing, note })
}
function reserveAdd(month: string, kind: ReserveEntry['kind'], amount: number, project_id: number | null, note: string) {
  const bal = (S.reserve.length ? S.reserve[S.reserve.length - 1].balance_after : 0) + amount
  S.reserve.push({ id: nid('reserve'), at: `${dayOf(month, 28)}T09:00:00Z`, month, kind, amount: r2(amount), balance_after: r2(bal), project_id, note })
}
function logAdd(by: string, role: string, action: string, project_id: number | null, detail: string) {
  S.log.push({ at: `${dayOf(S.now, 4)}T${pad(8 + (S.log.length % 9))}:${pad((S.log.length * 7) % 60)}:00Z`, by, role, action, project_id, detail })
}
function pay(f: Flat, amount: number, month: string, note = 'Payment received') {
  ledgerAdd(f, month, 'payment', amount, note)
  const s = statOf(month)
  s.collected = r2(s.collected + amount)
}
function statOf(month: string) {
  let s = S.stats.get(month)
  if (!s) S.stats.set(month, (s = { billed: 0, collected: 0, paused: 0, reserve_balance: 0 }))
  return s
}

// ---------- readings and measured savings ----------
function genReading(p: Proj, f: Flat, m: string, rate: number | null): Reading {
  const a = assessOf(p)
  const g = groupFor(a, f.position)
  const mo = Number(m.slice(5))
  const fe = 1 + 0.25 * Math.cos(((mo - 1) * Math.PI) / 6)
  const fg = 1 + 0.6 * Math.cos(((mo - 7) * Math.PI) / 6)
  const noise = 1 + (rnd(f.id, mIdx(m), 5) - 0.5) * 0.1
  const k = rate === null ? 0 : rate * (0.94 + rnd(f.id, 9) * 0.12)
  const be = g.baseline.electricity_kwh / 12
  const ue = g.upgraded.electricity_kwh / 12
  const bg = g.baseline.gas_mj / 12
  const ug = g.upgraded.gas_mj / 12
  const summer = mo === 12 || mo <= 3
  const hb = g.comfort.hours_above_30c_baseline / 4
  const hu = g.comfort.hours_above_30c_upgraded / 4
  return {
    month: m,
    electricity_kwh: r1((be + (ue - be) * k) * fe * noise),
    gas_mj: r1(Math.max(0, (bg + (ug - bg) * k) * fg * noise)),
    indoor_hours_above_30c: summer ? Math.round(hb + (hu - hb) * k) : 0,
    mean_outdoor_c: r1(22 + 6 * Math.cos(((mo - 1) * Math.PI) / 6)),
    source: 'simulated',
  }
}
function putReading(fid: number, r: Reading) {
  const list = S.readings.get(fid) ?? []
  const i = list.findIndex((x) => x.month === r.month)
  if (i >= 0) list[i] = r
  else list.push(r)
  list.sort((x, y) => x.month.localeCompare(y.month))
  S.readings.set(fid, list)
}
function seedBaseline(p: Proj, start: string) {
  for (const f of flatsOf(p)) for (const m of monthsBetween(addM(start, -11), start)) putReading(f.id, genReading(p, f, m, null))
}
function cost(r: Reading, t: Record<string, number>) {
  return (r.electricity_kwh * t.electricity_c_per_kwh) / 100 + (r.gas_mj * t.gas_c_per_mj) / 100
}
function verifyFlat(p: Proj, f: Flat, from: string, to: string): VerifyResult | null {
  const list = S.readings.get(f.id) ?? []
  const byM = new Map(list.map((r) => [r.month, r]))
  const rows: NonNullable<VerifyResult['by_month']> = []
  let hb = 0
  let hp = 0
  for (const m of monthsBetween(from, to)) {
    if (!p.startMonth || m <= p.startMonth) continue
    const post = byM.get(m)
    const base = byM.get(addM(m, -12))
    if (!post || !base) continue
    const b = cost(base, p.tariff)
    const c = cost(post, p.tariff)
    rows.push({ month: m, expected_baseline_cost: r2(b), actual_cost: r2(c), saving: r2(b - c) })
    hb += base.indoor_hours_above_30c ?? 0
    hp += post.indoor_hours_above_30c ?? 0
  }
  if (rows.length < 3) return null
  const verified = r1(rows.reduce((a, r) => a + r.saving, 0) / rows.length)
  const modelled = r1(groupFor(assessOf(p), f.position).saving_per_year / 12)
  const rate = modelled > 0 ? r2(verified / modelled) : 0
  const unc = r1(0.12 * modelled)
  const share = finNum(p, 'savings_share_to_charge')
  const maxCharge = share * verified
  let true_up: VerifyResult['true_up'] = { action: 'none', new_charge_per_month: f.charge_per_month, refund: 0, reason: 'The charge is within what the measured savings support. No change.' }
  if (f.charge_per_month > maxCharge + unc && f.charge_per_month > 0) {
    const nc = r2(Math.max(0, maxCharge))
    true_up = {
      action: 'reduce_charge',
      new_charge_per_month: nc,
      refund: r2((f.charge_per_month - nc) * f.months_billed),
      reason: `Measured savings are lower than modelled, so the charge falls to ${Math.round(share * 100)}% of the measured saving and the difference already billed is refunded from the reserve.`,
    }
  }
  const flags: string[] = []
  if (rate < 0.7) flags.push('Savings are well below the model. Check hot water and air conditioner settings in this flat.')
  return {
    method: 'Energy use before the upgrade is compared with the same months a year later, using the same prices. The difference is the measured saving.',
    baseline_fit: { r2: r2(0.85 + rnd(f.id, 3) * 0.1), months: 12 },
    post_months: rows.length,
    modelled_saving_per_month: modelled,
    verified_saving_per_month: verified,
    realisation_rate: rate,
    uncertainty_per_month: unc,
    confidence: rate > 0.85 ? 'high' : 'medium',
    tenant_net_per_month: r1(verified - f.charge_per_month),
    bill_neutral_verified: verified - f.charge_per_month >= 0,
    comfort: { hours_above_30c_before: hb, hours_above_30c_after: hp },
    by_month: rows,
    true_up,
    flags,
  }
}
function runMv(p: Proj, from: string, to: string): MvRun {
  const by: MvRun['by_flat'] = []
  const true_ups: MvRun['true_ups'] = []
  let drawn = 0
  let neutral = 0
  for (const f of flatsOf(p)) {
    if (f.consent === 'declined' || f.charge_status === 'not_started') continue
    const res = verifyFlat(p, f, from, to)
    if (!res) continue
    by.push({ flat_id: f.id, unit: f.unit, result: res })
    if (res.bill_neutral_verified) neutral++
    const t = res.true_up
    if (t && t.action !== 'none') {
      true_ups.push({ flat_id: f.id, action: t.action, old_charge: f.charge_per_month, new_charge: t.new_charge_per_month, refund: t.refund })
      f.charge_per_month = t.new_charge_per_month
      if (t.refund > 0) {
        ledgerAdd(f, S.now, 'true_up_refund', t.refund, 'Refund after measured savings check')
        reserveAdd(S.now, 'true_up_refund', -t.refund, p.id, `Refund to flat ${f.unit} after measured savings check`)
        drawn += t.refund
      }
    }
  }
  if (!by.length) throw conflict('There are not enough readings yet. We need at least three months after the upgrade, plus the same months a year earlier.')
  const n = by.length
  const avg = (k: 'modelled_saving_per_month' | 'verified_saving_per_month') => r1(by.reduce((a, b) => a + b.result[k], 0) / n)
  const mod = avg('modelled_saving_per_month')
  const ver = avg('verified_saving_per_month')
  const run: MvRun = {
    id: nid('mv'),
    project_id: p.id,
    run_on: dayOf(S.now, 5),
    period: { from, to },
    source: 'simulated',
    flats_verified: n,
    modelled_saving_per_month: mod,
    verified_saving_per_month: ver,
    realisation_rate: mod > 0 ? r2(ver / mod) : 0,
    bill_neutral_flats: neutral,
    true_ups,
    reserve_drawn: r2(drawn),
    by_flat: by,
  }
  S.mv.push(run)
  logAdd('Programme office', 'manager', 'mv_run', p.id, `Measured savings checked for ${n} flats, ${true_ups.length} charge changes`)
  return run
}

// ---------- billing, faults, simulation ----------
function billMonth(m: string): BillingRun {
  const have = S.runs.get(m)
  if (have) return have
  let billed = 0
  let flatsBilled = 0
  let paused = 0
  let contrib = 0
  const stat = statOf(m)
  for (const p of S.projects) {
    if (p.stage !== 'active' || !p.startMonth || m <= p.startMonth) continue
    for (const f of flatsOf(p)) {
      if (f.consent === 'declined' || f.charge_status === 'ended' || f.charge_status === 'not_started') continue
      if (f.charge_status === 'paused') {
        paused++
        stat.paused = r2(stat.paused + f.charge_per_month)
        reserveAdd(m, 'pause_cover', -f.charge_per_month, p.id, `Charge for flat ${f.unit} covered while equipment is faulty`)
        const ft = S.faults.find((x) => x.flat_id === f.id && x.status === 'open')
        if (ft) ft.months_paused++
        continue
      }
      ledgerAdd(f, m, 'charge', f.charge_per_month, 'Monthly charge on the meter')
      f.months_billed++
      f.principal_remaining = r2(Math.max(0, f.principal_remaining * (1 + finNum(p, 'cost_of_capital') / 12) - f.charge_per_month))
      billed += f.charge_per_month
      flatsBilled++
      const c = f.charge_per_month * finNum(p, 'reserve')
      contrib += c
      reserveAdd(m, 'contribution', c, p.id, `Reserve share of the charge, flat ${f.unit}`)
    }
  }
  stat.billed = r2(stat.billed + billed)
  stat.reserve_balance = S.reserve.length ? S.reserve[S.reserve.length - 1].balance_after : 0
  const run: BillingRun = { month: m, flats_billed: flatsBilled, billed: r2(billed), paused_flats: paused, reserve_contribution: r2(contrib) }
  S.runs.set(m, run)
  logAdd('Programme office', 'manager', 'billing_run', null, `Billing run for ${m}: ${flatsBilled} flats, $${Math.round(billed)} billed`)
  return run
}
function reportFault(f: Flat, item: string, description: string, by: string): Fault {
  const p = projOfFlat(f)
  const ft: Fault = { id: nid('fault'), flat_id: f.id, project_id: p.id, item, description, reported_by: by, opened_on: dayOf(S.now, 12), resolved_on: null, status: 'open', charge_paused: f.charge_status === 'active' || f.charge_status === 'paused', months_paused: 0 }
  S.faults.push(ft)
  if (f.charge_status === 'active') {
    f.charge_status = 'paused'
    f.paused_reason = `Fault reported: ${description}`
  }
  return ft
}
function resolveFault(ft: Fault, note: string) {
  ft.status = 'resolved'
  ft.resolved_on = dayOf(S.now, 20)
  const f = S.flats.find((x) => x.id === ft.flat_id)!
  if (f.charge_status === 'paused') {
    f.charge_status = 'active'
    f.paused_reason = null
  }
  logAdd('Installer', 'installer', 'fault_resolved', ft.project_id, note || 'Fault resolved')
}
function scenarioRate(s: string) {
  return s === 'as_modelled' ? 1 : s === 'underperforming' ? 0.6 : 0.85
}
function runMonth(m: string, scenario: string | null, c: AdvanceResult) {
  for (const p of S.projects) {
    if (p.stage !== 'active' || !p.startMonth || m <= p.startMonth) continue
    const rate = scenario ? scenarioRate(scenario) : (p.rate ?? 1)
    for (const f of flatsOf(p)) {
      if (f.consent === 'declined') continue
      if (f.balance_owing > 0 && rnd(f.id, mIdx(m), 2) < 0.6) {
        pay(f, f.balance_owing, m, 'Late payment received')
        c.payments++
      }
      putReading(f.id, genReading(p, f, m, rate))
      c.readings_added++
    }
  }
  billMonth(m)
  for (const p of S.projects) {
    if (p.stage !== 'active' || !p.startMonth || m <= p.startMonth) continue
    for (const f of flatsOf(p)) {
      if (f.charge_status !== 'active' || f.consent === 'declined') continue
      if (rnd(f.id, mIdx(m), 1) > 0.1) {
        pay(f, f.charge_per_month, m)
        c.payments++
      }
    }
    const fl = flatsOf(p).filter((f) => f.charge_status === 'active' && f.consent !== 'declined')
    if (fl.length && rnd(p.id, mIdx(m), 3) < 0.06) {
      const f = fl[Math.floor(rnd(p.id, mIdx(m), 4) * fl.length)]
      reportFault(f, FAULT_ITEMS[Math.floor(rnd(f.id, mIdx(m), 6) * 2)], rnd(f.id, 7) < 0.5 ? 'No hot water' : 'Air conditioner not cooling', 'tenant')
      c.faults_opened++
    }
    const last = S.mv.filter((x) => x.project_id === p.id).map((x) => x.period.to).sort().pop() ?? p.startMonth
    if (mIdx(m) - mIdx(last) >= 12) {
      try {
        runMv(p, addM(m, -11), m)
        c.mv_runs++
      } catch {
        /* not enough readings yet */
      }
    }
  }
  for (const ft of S.faults) {
    if (ft.status === 'open' && mIdx(m) - mIdx(ft.opened_on.slice(0, 7)) >= 2) {
      resolveFault(ft, 'Repaired on site')
      c.faults_resolved++
    }
  }
  c.billing_runs++
}

// ---------- guards and stages ----------
function consentSummary(p: Proj) {
  const fl = flatsOf(p)
  return { owner_signed: p.ownerSigned, tenants_total: fl.length, tenants_agreed: fl.filter((f) => f.consent === 'agreed').length, tenants_declined: fl.filter((f) => f.consent === 'declined').length, threshold: 0.75 }
}
function gapOf(p: Proj) {
  const a = assessOf(p)
  return Math.max(0, a.package.funding_gap - p.grant)
}
function guards(p: Proj, to: Stage): string[] {
  const out: string[] = []
  if (to === 'offer') {
    if (!p.audit) out.push('The site audit has not been saved.')
    if (p.audit?.roof_condition === 'unsuitable' && p.package.cool_roof) out.push('The roof is unsuitable for a cool roof. Change the package or fix the roof.')
  }
  if (to === 'procurement') {
    const c = consentSummary(p)
    if (!c.owner_signed) out.push('The owner has not signed.')
    const need = Math.ceil(c.threshold * c.tenants_total)
    if (c.tenants_agreed < need) out.push(`${c.tenants_agreed} of ${c.tenants_total} tenants have agreed. At least ${need} are needed.`)
  }
  if (to === 'installation') {
    if (!S.quotes.some((q) => q.project_id === p.id && q.status === 'accepted')) out.push('No quote has been accepted.')
    if (gapOf(p) > 0) out.push(`The funding gap of $${Math.round(gapOf(p)).toLocaleString('en-AU')} is not covered by the grant allocated.`)
  }
  if (to === 'commissioned') {
    const wo = S.wos.find((w) => w.project_id === p.id)
    if (!wo) out.push('There is no work order yet.')
    else for (const c of wo.checklist) if (!c.done) out.push(`Checklist item not done: ${c.label}.`)
  }
  if (to === 'closed' && flatsOf(p).some((f) => f.charge_status !== 'ended' && f.consent !== 'declined')) out.push('Some flat charges have not ended.')
  return out
}
const NEXT_STEP: Record<Stage, string> = {
  screened: 'Start the site audit to check the open-data guesses.',
  audit: 'Save the site audit, then issue the offer.',
  offer: 'Share the offer with the owner and move to consent.',
  consent: 'Get the owner to sign and enough tenants to agree.',
  procurement: 'Open the tender, compare quotes and accept one.',
  installation: 'Create the work order and complete the commissioning checklist.',
  commissioned: 'Record the start month so charges begin.',
  active: 'Charges run monthly. Check measured savings each year.',
  closed: 'All charges have ended.',
}
function nextStage(s: Stage): Stage | null {
  return STAGES[stageIdx(s) + 1] ?? null
}
function setStage(p: Proj, to: Stage, by: string, note: string) {
  p.stage = to
  p.stage_since = dayOf(S.now, 10)
  p.history.push({ stage: to, at: dayOf(S.now, 10), by, note })
  if (to === 'offer') {
    p.frozen = liveOf(p)
    p.sizing = sizingOf(reqOf(p))
    p.schedule = scheduleOf(reqOf(p), addM(S.now, 3))
    refreshCharges(p)
  }
  if (to === 'commissioned') {
    const wo = S.wos.find((w) => w.project_id === p.id)
    if (wo) wo.completed_on = dayOf(S.now, 10)
  }
  if (to === 'active') {
    p.startMonth = S.now
    for (const f of flatsOf(p)) if (f.consent !== 'declined') f.charge_status = 'active'
    seedBaseline(p, S.now)
  }
  logAdd(by, by === 'system' ? 'manager' : 'manager', 'advance', p.id, `Moved to ${to}`)
}

// ---------- analysis ----------
function sizingOf(req: AssessRequest): Sizing {
  const a = assess(req)
  const pk = { ...mockMeta.defaults.package, ...req.package }
  const area = a.building.flat_area_m2
  const kw = (x: number) => Math.ceil(x * 1.1 * 2) / 2
  const groups = a.flat_groups.map((g) => {
    const top = g.position === 'top'
    const wo = r1(area * 0.062 * (top ? 1.25 : 1))
    const wi = r1(top && pk.cool_roof ? wo * 0.72 : wo)
    return {
      position: g.position,
      count: g.count,
      design_cooling_kw_without_roof: wo,
      design_cooling_kw_with_package: wi,
      reduction_pct: r1((1 - wi / wo) * 100),
      unit_kw_without_roof: kw(wo),
      unit_kw_with_package: kw(wi),
      unit_cost_without_roof: Math.round(1800 + 420 * kw(wo)),
      unit_cost_with_package: Math.round(1800 + 420 * kw(wi)),
      design_heating_kw: r1(area * 0.05),
    }
  })
  const saved = groups.reduce((s, g) => s + g.count * (g.unit_cost_without_roof - g.unit_cost_with_package), 0)
  const after = r1(groups.reduce((s, g) => s + g.count * g.unit_kw_with_package * 0.3, 0) + a.building.flats * 0.6)
  const afterNo = r1(groups.reduce((s, g) => s + g.count * g.unit_kw_without_roof * 0.3, 0) + a.building.flats * 0.6)
  const upgrade = afterNo > 40 && after <= 40
  return {
    groups,
    hot_water: { system: 'heat_pump_per_flat', units: a.building.flats, kw_each: 1.0, note: 'One small heat pump hot water unit per flat.' },
    electrical: {
      per_flat_added_amps: r1((Math.max(...groups.map((g) => g.unit_kw_with_package)) * 1000) / 230 / 3 + 4),
      typical_supply_amps: 63,
      flat_supply_ok: true,
      building_peak_kw_before: r1(a.building.flats * 0.9),
      building_peak_kw_after: after,
      building_peak_kw_after_without_roof: afterNo,
      switchboard_upgrade_likely: afterNo > 40,
      upgrade_cost_avoided: upgrade ? 6500 : 0,
      note: afterNo > 40 ? 'Without the cool roof the building peak is likely to need a switchboard upgrade.' : 'The existing switchboard is likely to cope.',
      kind: 'assumption',
    },
    capex_saved_by_right_sizing: Math.round(saved),
    assumptions: [{ key: 'design_percentile', label: 'Design day is the hottest 1% of hours', value: 99, unit: 'percentile', source: 'assumption', kind: 'assumption' }],
    warnings: pk.cool_roof ? [] : ['The cool roof is off, so the air conditioners are sized for the full load.'],
  }
}
function scheduleOf(req: AssessRequest, start: string): Schedule {
  const a = assess(req)
  const fin = { ...mockMeta.defaults.finance, ...req.finance }
  const term = fin.term_years
  const n = term * 12
  const i = fin.cost_of_capital / 12
  const groups = a.flat_groups.map((g) => {
    const principal = g.charge_per_month * annuity(fin.cost_of_capital, term)
    let bal = principal
    const rows = []
    for (let k = 1; k <= n; k++) {
      const interest = bal * i
      const pr = g.charge_per_month - interest
      bal = Math.max(0, bal - pr)
      rows.push({ n: k, month: addM(start, k - 1), charge: r2(g.charge_per_month), interest: r2(interest), principal: r2(pr), balance: r2(bal) })
    }
    return { position: g.position, count: g.count, principal_per_flat: Math.round(principal), charge_per_month: r2(g.charge_per_month), rows }
  })
  const total = groups.reduce((s, g) => s + g.count * g.charge_per_month * n, 0)
  const pr = groups.reduce((s, g) => s + g.count * g.principal_per_flat, 0)
  return {
    term_years: term,
    months: n,
    start,
    end: addM(start, n - 1),
    groups,
    building: { principal: pr, charge_per_month: r2(groups.reduce((s, g) => s + g.count * g.charge_per_month, 0)), total_repaid: Math.round(total), total_interest: Math.round(total - pr) },
    reserve: { rate: fin.reserve, contribution_total: Math.round(total * fin.reserve), note: 'A share of each charge goes to the reserve that covers faults and refunds.' },
    equipment_life_check: [{ key: 'heat_pump_hot_water', life_years: 12, term_years: term, ok: term <= 12 }],
  }
}
function riskOf(req: AssessRequest & { runs?: number; seed?: number }): Risk {
  const a = assess(req)
  const seed = req.seed ?? 1
  return {
    runs: req.runs ?? 500,
    seed,
    groups: a.flat_groups.map((g, i) => {
      const p50 = g.net_saving_per_month
      return {
        position: g.position,
        net_saving_per_month: { p10: r1(p50 - 14 - i * 2), p50: r1(p50), p90: r1(p50 + 15 + i * 3) },
        prob_tenant_worse_off: r2(Math.min(0.6, Math.max(0.01, 0.35 - p50 / 90 + i * 0.04))),
        prob_saving_below_charge: r2(Math.min(0.6, Math.max(0.01, 0.35 - p50 / 90 + i * 0.04))),
      }
    }),
    building: { prob_fully_funded: a.package.fully_funded ? 0.82 : 0.28, funding_gap: { p10: 0, p50: Math.round(a.package.funding_gap), p90: Math.round(a.package.funding_gap * 1.8 + 3000) } },
    drivers: [
      { key: 'occupant_use', label: 'How much hot water and heating people use', share_of_variance: 0.44 },
      { key: 'prices', label: 'Electricity and gas prices', share_of_variance: 0.26 },
      { key: 'equipment', label: 'How well the equipment performs', share_of_variance: 0.18 },
      { key: 'weather', label: 'How hot or cold the year is', share_of_variance: 0.12 },
    ],
    inputs_varied: [{ key: 'occupant_use', label: 'How much hot water and heating people use', low: 0.7, high: 1.3, distribution: 'triangular', source: 'assumption' }],
    safe_share: { savings_share_to_charge: 0.68, meaning: 'The share at which 95% of runs leave the tenant no worse off.' },
  }
}
function microOf(id: string): Microclimate {
  const f = mockBuildings.features.find((x) => x.properties.id === id)
  if (!f) throw missing(`We could not find a building called ${id}.`)
  const an = f.properties.heat_anomaly_c
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const adj = r1(0.3 + 0.25 * an)
  return {
    building_id: id,
    heat_anomaly_c: an,
    heat_band: f.properties.heat_band,
    air_temp_adjustment: { day_c: adj, night_c: r1(adj * 0.6), method: 'Satellite surface heat is scaled down to a small, capped air temperature adjustment.', kind: 'assumption' },
    base_weather: { source: 'ERA5 via Open-Meteo', year: 2025, grid_km: 9 },
    summer: { mean_max_c_base: 29.8, mean_max_c_local: r1(29.8 + adj), days_over_35_base: 21, days_over_35_local: Math.round(21 + adj * 5), cooling_degree_hours_base: 5200, cooling_degree_hours_local: Math.round(5200 + adj * 700) },
    monthly: labels.map((label, i) => {
      const base = 22 + 8.5 * Math.cos(((i % 12) * Math.PI) / 6)
      return { month: i + 1, label, mean_max_c_base: r1(base), mean_max_c_local: r1(base + adj) }
    }),
    notes: ['Surface temperature from satellite is not air temperature. The adjustment is an assumption.', 'Example weather file for demonstration only.'],
  }
}
function epwOf(id: string): string {
  const m = microOf(id)
  const head = [
    `LOCATION,Lakemba,NSW,AUS,Example,000000,-33.92,151.07,10.0,10.0`,
    `COMMENTS 1,Example file from a prototype. Local air temperature adjustment of +${m.air_temp_adjustment.day_c} C by day is an assumption.`,
    `DESIGN CONDITIONS,0`,
    `TYPICAL/EXTREME PERIODS,0`,
    `GROUND TEMPERATURES,0`,
    `HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0`,
    `COMMENTS 2,Only 24 sample hours are included in this demonstration file.`,
    `DATA PERIODS,1,1,Data,Sunday, 1/ 1,12/31`,
  ]
  const rows: string[] = []
  for (let h = 1; h <= 24; h++) rows.push(`2025,1,1,${h},60,?,${r1(24 + 6 * Math.sin(((h - 9) * Math.PI) / 12) + m.air_temp_adjustment.day_c)},15.0,60,101300,999999`)
  return [...head, ...rows].join('\n') + '\n'
}
function planOf(b: PlanBody): PlanResult {
  const ids = (b.building_ids?.length ? b.building_ids : mockBuildings.features.map((f) => f.properties.id)).slice(0, 120)
  const obj = b.objective
  const rows = ids.map((id) => {
    const a = assess({ building_id: id, existing: b.existing as Partial<Existing>, package: b.package as Partial<Package>, finance: b.finance as Partial<Finance>, tariff: b.tariff as Partial<Tariff> })
    const top = a.flat_groups[0]
    const bandN = ['cooler', 'average', 'warm', 'hot', 'hottest'].indexOf(a.building.heat_band ?? 'average')
    const hrs = Math.max(0, top.comfort.hours_above_30c_baseline - top.comfort.hours_above_30c_upgraded)
    const raw = obj === 'co2' ? a.impact.co2e_t_per_year_saved : obj === 'heat_relief' ? hrs * (1 + bandN * 0.2) * top.count : obj === 'flats_reached' ? a.building.flats : top.net_saving_per_month * a.building.flats
    return { id, a, top, hrs, raw }
  })
  const maxRaw = Math.max(1, ...rows.map((r) => r.raw))
  rows.sort((x, y) => y.raw / Math.max(1, x.a.package.net_capex) - x.raw / Math.max(1, y.a.package.net_capex) || 0)
  rows.sort((x, y) => y.raw / Math.max(1, y.a.package.net_capex) - x.raw / Math.max(1, x.a.package.net_capex))
  let capLeft = b.capital_budget
  let grantLeft = b.grant_budget
  const selected: PlanResult['selected'] = []
  const not: PlanResult['not_selected'] = []
  for (const r of rows) {
    const gap = r.a.package.funding_gap
    const net = r.a.package.net_capex
    const label = r.a.building.label
    if (r.raw <= 0) not.push({ building_id: r.id, label, reason: 'No benefit for tenants with this package' })
    else if (gap > grantLeft) not.push({ building_id: r.id, label, reason: 'Gap larger than remaining grant' })
    else if (net - gap > capLeft) not.push({ building_id: r.id, label, reason: 'Not enough capital left' })
    else {
      capLeft -= net - gap
      grantLeft -= gap
      selected.push({ building_id: r.id, label, flats: r.a.building.flats, net_capex: net, capital_used: Math.round(net - gap), grant_used: Math.round(gap), tenant_net_saving_per_month: r1(r.top.net_saving_per_month), co2e_t_per_year_saved: r.a.impact.co2e_t_per_year_saved, top_floor_hours_above_30c_avoided: Math.round(r.hrs), score: r2(r.raw / maxRaw) })
    }
  }
  const sum = (k: 'flats' | 'capital_used' | 'grant_used') => selected.reduce((s, x) => s + x[k], 0)
  const hw = sum('flats')
  const bulk = b.bulk !== false
  const saved = bulk ? Math.round(selected.reduce((s, x) => s + x.capital_used, 0) * 0.04) : 0
  return {
    selected,
    not_selected: not,
    totals: {
      buildings: selected.length,
      flats: hw,
      capital_used: sum('capital_used'),
      grant_used: sum('grant_used'),
      capital_left: Math.round(capLeft),
      grant_left: Math.round(grantLeft),
      tenant_saving_per_year: Math.round(selected.reduce((s, x) => s + x.tenant_net_saving_per_month * x.flats * 12, 0)),
      co2e_t_per_year_saved: r1(selected.reduce((s, x) => s + x.co2e_t_per_year_saved, 0)),
      building_peak_kw_change: r1(-hw * 0.12),
    },
    bulk: { applied: bulk, tiers: bulk ? [{ item: 'heat_pump_hot_water', units: hw, discount_pct: hw >= 100 ? 8 : 4, kind: 'assumption' }] : [], capex_saved: saved },
    method: 'Blocks are ranked by the chosen result for each dollar of capital. Each is taken if its funding gap fits the grant left and the rest fits the capital left.',
  }
}

// ---------- views ----------
function summaryOf(p: Proj): Project['summary'] {
  const a = assessOf(p)
  const gap = Math.max(0, a.package.funding_gap - p.grant)
  return {
    net_capex: a.package.net_capex,
    funding_gap: Math.round(a.package.funding_gap),
    grant_allocated: p.grant,
    fully_funded: gap <= 0,
    charge_per_month_building: a.finance.charge_per_month_building,
    tenant_net_saving_per_month: a.flat_groups[0].net_saving_per_month,
    co2e_t_per_year_saved: a.impact.co2e_t_per_year_saved,
  }
}
function projectOf(p: Proj): Project {
  const nx = nextStage(p.stage)
  const fl = flatsOf(p)
  const flags: string[] = []
  if (fl.some((f) => f.charge_status === 'paused')) flags.push('charge_paused')
  if (p.stage === 'active' && p.startMonth) {
    const last = S.mv.filter((x) => x.project_id === p.id).map((x) => x.period.to).sort().pop() ?? p.startMonth
    if (mIdx(S.now) - mIdx(last) >= 12) flags.push('true_up_due')
  }
  return {
    id: p.id,
    programme_id: 1,
    building_id: p.building_id,
    label: p.label,
    stage: p.stage,
    stage_since: p.stage_since,
    owner_org: { id: p.owner_org.id, name: p.owner_org.name },
    installer_org: p.installer_org ? { id: p.installer_org.id, name: p.installer_org.name } : null,
    flats: fl.length,
    heat_band: p.heat_band,
    summary: summaryOf(p),
    consent: consentSummary(p),
    next_step: NEXT_STEP[p.stage],
    blocked_by: nx ? guards(p, nx) : [],
    flags,
  }
}
interface Who {
  role: Role
  user: User
  org: OrgRef | null
  flat_id?: number
  project_id?: number
}
function canSee(w: Who, p: Proj): boolean {
  if (w.role === 'manager' || w.role === 'funder') return true
  if (w.role === 'owner') return p.owner_org.id === w.org?.id
  if (w.role === 'tenant') return p.id === w.project_id
  const id = w.org?.id
  return !!id && (p.installer_org?.id === id || (p.stage === 'procurement' && !!p.tender?.orgs.includes(id)) || S.wos.some((x) => x.project_id === p.id && x.installer_org.id === id) || S.quotes.some((q) => q.project_id === p.id && q.installer_org.id === id))
}
function flatOut(f: Flat, w: Who): Flat {
  const o = { ...f }
  if (w.role === 'government' || w.role === 'funder' || w.role === 'installer') o.meter_id = f.meter_id.length > 10 ? f.meter_id.slice(0, 6) + '••••' + f.meter_id.slice(-4) : f.meter_id
  if (w.role === 'funder') {
    o.tenant_name = null
    delete o.access_code
  }
  if (w.role === 'installer') {
    o.tenant_name = null
    delete o.access_code
  }
  if (w.role === 'tenant') {
    o.tenant_name = f.tenant_name
  }
  return o
}
function detailOf(p: Proj, w: Who): ProjectDetail {
  const base = projectOf(p)
  const a = assessOf(p)
  const quotes = S.quotes.filter((q) => q.project_id === p.id && (w.role !== 'installer' || q.installer_org.id === w.org?.id))
  return {
    ...base,
    building: { ...a.building },
    existing: p.existing,
    package: p.package,
    finance: p.finance,
    tariff: p.tariff,
    assessment: p.frozen,
    sizing: p.sizing,
    schedule: p.schedule,
    audit: p.audit,
    quotes,
    work_order: S.wos.find((x) => x.project_id === p.id) ?? null,
    flats_list: flatsOf(p).map((f) => flatOut(f, w)),
    stage_history: p.history,
    mv: S.mv.filter((x) => x.project_id === p.id),
  }
}
function programmeOf(): Programme {
  const act = S.projects.filter((p) => stageIdx(p.stage) >= stageIdx('installation'))
  const deployed = act.reduce((s, p) => s + (p.quoted ?? assessOf(p).package.net_capex), 0)
  const repaid = S.ledger.filter((l) => l.kind === 'payment').reduce((s, l) => s + l.amount, 0)
  const arrears = S.flats.reduce((s, f) => s + Math.max(0, f.balance_owing), 0)
  return {
    ...S.programme,
    capital_deployed: Math.round(deployed),
    grant_used: S.projects.filter((p) => stageIdx(p.stage) >= stageIdx('procurement')).reduce((s, p) => s + p.grant, 0),
    reserve_balance: Math.round(S.reserve.length ? S.reserve[S.reserve.length - 1].balance_after : 0),
    repaid_to_date: Math.round(repaid),
    arrears: Math.round(arrears),
  }
}
function overviewOf(): Overview {
  const pg = programmeOf()
  const pipeline: Record<string, number> = {}
  for (const s of STAGES) pipeline[s] = S.projects.filter((p) => p.stage === s).length
  const fl = S.flats.filter((f) => f.charge_status !== 'not_started' && f.charge_status !== 'ended')
  const latest = new Map<number, MvRun>()
  for (const r of S.mv) latest.set(r.project_id, r)
  const runs = [...latest.values()]
  const nv = runs.reduce((s, r) => s + r.flats_verified, 0)
  const rate = runs.length ? r2(runs.reduce((s, r) => s + r.realisation_rate * r.flats_verified, 0) / Math.max(1, nv)) : null
  const share = Number(S.programme.finance.savings_share_to_charge)
  const act = S.projects.filter((p) => p.stage === 'active')
  const modelledYear = act.reduce((s, p) => s + assessOf(p).flat_groups[0].saving_per_year * flatsOf(p).length * (1 - share), 0)
  const co2 = act.reduce((s, p) => s + assessOf(p).impact.co2e_t_per_year_saved, 0)
  const months = [...S.stats.keys()].sort().slice(-24)
  return {
    programme: pg,
    pipeline,
    flats: { total: S.flats.length, active_charges: fl.filter((f) => f.charge_status === 'active').length, paused: fl.filter((f) => f.charge_status === 'paused').length },
    money: { deployed: pg.capital_deployed, repaid: pg.repaid_to_date, interest: Math.round(pg.repaid_to_date * 0.18), arrears: pg.arrears, reserve: pg.reserve_balance, grant_used: pg.grant_used },
    verified: { projects: runs.length, realisation_rate: rate, tenant_saving_per_year: Math.round(runs.reduce((s, r) => s + (r.verified_saving_per_month - 0.8 * r.verified_saving_per_month) * r.flats_verified * 12, 0)), co2e_t_per_year: r1(co2 * (rate ?? 0)) },
    modelled: { tenant_saving_per_year: Math.round(modelledYear), co2e_t_per_year: r1(co2) },
    monthly: months.map((m) => ({ month: m, ...statOf(m) })),
  }
}
function docsOf(p: Proj, w: Who): Doc[] {
  if (stageIdx(p.stage) < stageIdx('offer')) return []
  const at = `${p.stage_since}T09:00:00Z`
  const mk = (kind: string, title: string, f?: Flat): Doc => ({ kind, title, ...(f ? { flat_id: f.id } : {}), url: `/api/programme/documents/${p.id}/${kind}.html${f ? `?flat_id=${f.id}` : ''}`, generated_at: at })
  const out: Doc[] = []
  if (w.role !== 'tenant') {
    out.push(mk('owner_agreement', 'Owner agreement'), mk('funder_term_sheet', 'Funder term sheet'))
    if (stageIdx(p.stage) >= stageIdx('commissioned')) out.push(mk('commissioning_certificate', 'Commissioning certificate'))
    if (S.mv.some((m) => m.project_id === p.id)) out.push(mk('mv_report', 'Measured savings report'))
  }
  for (const f of flatsOf(p)) {
    if (w.role === 'tenant' && f.id !== w.flat_id) continue
    if (f.consent === 'declined') continue
    out.push(mk('tenant_disclosure', `Tenant disclosure, flat ${f.unit}`, f), mk('charge_schedule', `Charge schedule, flat ${f.unit}`, f))
  }
  return out
}
function docHtml(p: Proj, kind: string, f: Flat | null): string {
  const a = assessOf(p)
  const titles: Record<string, string> = {
    tenant_disclosure: 'Tenant disclosure',
    owner_agreement: 'Owner agreement',
    funder_term_sheet: 'Funder term sheet',
    charge_schedule: 'Charge schedule',
    commissioning_certificate: 'Commissioning certificate',
    mv_report: 'Measured savings report',
  }
  const t = titles[kind] ?? kind
  const rows: [string, string][] = [['Block', p.label], ['Owner', p.owner_org.name], ['Upgrades', a.package.items.filter((i) => i.selected).map((i) => i.label).join(', ') || 'None']]
  if (f) rows.push(['Flat', `${f.unit} (${f.meter_id})`], ['Charge on the meter', `$${f.charge_per_month.toFixed(2)} a month`])
  rows.push(['Net cost', `$${Math.round(a.package.net_capex).toLocaleString('en-AU')}`], ['Charge for the whole block', `$${Math.round(a.finance.charge_per_month_building).toLocaleString('en-AU')} a month over ${a.finance.term_years} years`])
  if (kind === 'tenant_disclosure') rows.push(['If equipment fails', 'The charge pauses and the reserve covers the gap.'], ['If you move out', 'The charge stays with the meter. You owe nothing after you leave.'], ['To complain', 'Contact the housing provider or use the report a problem form.'])
  const body = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>${t}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#2a2622}h1{font-size:1.6rem}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd;vertical-align:top}th{width:35%}.note{margin-top:24px;padding:10px 14px;background:#fff0c2;border:1px dashed #c99200;border-radius:8px;font-weight:600}@media print{.note{border:1px solid #999}}</style></head><body><h1>${t}</h1><p>${p.label}</p><table>${body}</table><p class="note">Example document produced by a prototype. Not legal or financial advice.</p></body></html>`
}

// ---------- seed ----------
function newProj(bid: string, owner: OrgRef, over: Partial<Proj> = {}): Proj {
  const f = mockBuildings.features.find((x) => x.properties.id === bid)
  if (!f) throw missing(`We could not find a building called ${bid}.`)
  const pr = f.properties
  const p: Proj = {
    id: nid('proj'),
    building_id: bid,
    label: pr.label,
    storeys: pr.storeys,
    flats: pr.flats_est,
    roof_m2: pr.roof_m2,
    heat_band: pr.heat_band,
    stage: 'screened',
    stage_since: dayOf(S.now, 10),
    owner_org: owner,
    installer_org: null,
    existing: { ...mockMeta.defaults.existing },
    package: { ...mockMeta.defaults.package },
    finance: { cost_of_capital: 0.055, term_years: 10, savings_share_to_charge: 0.8, reserve: 0.05, apply_rebates: true },
    tariff: { ...mockMeta.defaults.tariff },
    audit: null,
    frozen: null,
    sizing: null,
    schedule: null,
    ownerSigned: false,
    tender: null,
    grant: 0,
    startMonth: null,
    history: [{ stage: 'screened', at: dayOf(S.now, 10), by: 'Programme office', note: 'Project created from a pilot building' }],
    rate: null,
    quoted: null,
    ...over,
  }
  S.projects.push(p)
  makeFlats(p)
  return p
}
function saveAudit(p: Proj, input: Partial<Audit>, by: string): Audit {
  const f = mockBuildings.features.find((x) => x.properties.id === p.building_id)!.properties
  const guess: Record<string, unknown> = { storeys: f.storeys, flats: f.flats_est, roof_m2: f.roof_m2, roof_colour: 'dark' }
  const au: Audit = {
    visited_on: input.visited_on ?? dayOf(S.now, 8),
    by: input.by ?? by,
    storeys: Number(input.storeys ?? p.storeys),
    flats: Number(input.flats ?? p.flats),
    roof_m2: Number(input.roof_m2 ?? p.roof_m2),
    roof_condition: input.roof_condition ?? 'sound',
    roof_colour: input.roof_colour ?? 'dark',
    existing: input.existing,
    switchboard_amps: Number(input.switchboard_amps ?? 63),
    hot_water_layout: input.hot_water_layout ?? 'per_flat',
    gas_meters: Number(input.gas_meters ?? p.flats),
    notes: input.notes ?? '',
  }
  const changes: NonNullable<Audit['changes']> = []
  for (const k of ['storeys', 'flats', 'roof_m2', 'roof_colour'] as const) if (au[k] !== guess[k]) changes.push({ field: k, from: guess[k], to: au[k] })
  for (const [k, v] of Object.entries(au.existing ?? {})) if (v !== mockMeta.defaults.existing[k as keyof Existing]) changes.push({ field: k, from: mockMeta.defaults.existing[k as keyof Existing], to: v })
  au.changes = changes
  const count = au.flats
  p.storeys = au.storeys
  p.roof_m2 = au.roof_m2
  p.existing = { ...p.existing, ...(au.existing ?? {}), roof: au.roof_colour }
  p.audit = au
  if (count !== p.flats) {
    p.flats = count
    makeFlats(p)
  } else refreshCharges(p)
  logAdd(by, 'manager', 'audit_saved', p.id, `Site audit saved with ${changes.length} changes`)
  return au
}
/** Satisfies every guard on the way, the way the real service would be driven. */
function walk(p: Proj, to: Stage, opts: { agree?: number; declined?: number } = {}) {
  while (stageIdx(p.stage) < stageIdx(to)) {
    const nx = nextStage(p.stage)!
    if (nx === 'audit') {
      // nothing to prepare
    }
    if (nx === 'offer' && !p.audit) saveAudit(p, p.building_id === 'demo_007' ? { flats: p.flats, roof_m2: Math.round(p.roof_m2 * 0.92), roof_condition: 'sound' } : {}, 'Programme office')
    if (nx === 'procurement') {
      p.ownerSigned = true
      const fl = flatsOf(p)
      const dec = opts.declined ?? 0
      fl.forEach((f, i) => {
        f.consent = i < dec ? 'declined' : i < (opts.agree ?? fl.length) + dec ? 'agreed' : 'pending'
        if (f.consent === 'declined') f.charge_per_month = 0
      })
    }
    if (nx === 'installation') {
      const org = ORG.instA
      p.tender = { orgs: [org.id, ORG.instB.id], closes_on: dayOf(addM(S.now, 0), 28) }
      addQuote(p, ORG.instB, 1.07)
      acceptQuote(addQuote(p, org, 0.97))
      p.grant = Math.round(assessOf(p).package.funding_gap)
    }
    if (nx === 'commissioned') for (const c of makeWo(p).checklist) c.done = true
    setStage(p, nx, 'Programme office', 'Seeded step')
  }
}
function makeWo(p: Proj): WorkOrder {
  let wo = S.wos.find((w) => w.project_id === p.id)
  if (wo) return wo
  const keys = Object.keys(ITEM_LABELS).filter((k) => (k !== 'roof_coating_thickness' || p.package.cool_roof) && (k !== 'ac_installed' || p.package.reverse_cycle) && (k !== 'heat_pump_installed' || p.package.heat_pump_hot_water))
  wo = { id: nid('wo'), project_id: p.id, installer_org: p.installer_org ?? ORG.instA, scheduled_start: dayOf(addM(S.now, 1), 3), completed_on: null, checklist: keys.map((key) => ({ key, label: ITEM_LABELS[key], done: false, by: null, at: null })), warranty_years: 5 }
  S.wos.push(wo)
  return wo
}
function quoteItems(p: Proj, factor: number) {
  const a = assessOf(p)
  return a.package.items
    .filter((i) => i.selected)
    .map((i) => {
      const qty = i.applies_to === 'building' ? 1 : p.flats
      const unit = Math.round((i.capex / qty) * factor)
      return { key: i.key, label: i.label, qty, unit_price: unit, total: unit * qty }
    })
}
function addQuote(p: Proj, org: OrgRef, factor: number, items = quoteItems(p, factor), valid?: string, note = 'Example quote'): Quote {
  const q: Quote = { id: nid('quote'), project_id: p.id, installer_org: { id: org.id, name: org.name }, submitted_on: dayOf(S.now, 9), valid_until: valid ?? dayOf(addM(S.now, 2), 28), items, total: items.reduce((s, i) => s + i.total, 0), modelled_total: assessOf(p).package.capex_total, status: 'submitted', note }
  S.quotes.push(q)
  return q
}
function acceptQuote(q: Quote) {
  const p = S.projects.find((x) => x.id === q.project_id)!
  for (const o of S.quotes) if (o.project_id === q.project_id) o.status = o.id === q.id ? 'accepted' : 'declined'
  p.installer_org = { id: q.installer_org.id, name: q.installer_org.name }
  p.quoted = q.total
}

function init() {
  const base = '2026-10'
  S = {
    base,
    offset: 0,
    now: base,
    programme: { id: 1, name: 'Western Sydney community housing pilot', example: true, route: 'community_housing', route_status: 'usable_now', finance: { cost_of_capital: 0.055, term_years: 10, savings_share_to_charge: 0.8, reserve: 0.05 }, capital_committed: 1500000, capital_deployed: 0, grant_pool: 300000, grant_used: 0, reserve_balance: 0, repaid_to_date: 0, arrears: 0 },
    orgs: Object.values(ORG),
    users: [
      { key: 'manager', name: 'Alex Example (programme office)', email: 'manager@example.org', role: 'manager', org: ORG.office },
      { key: 'owner', name: 'Sam Sample (asset officer)', email: 'owner@example.org', role: 'owner', org: ORG.provider },
      { key: 'installer', name: 'Jo Demo (installer)', email: 'installer@example.org', role: 'installer', org: ORG.instA },
      { key: 'funder', name: 'Pat Placeholder (funder)', email: 'funder@example.org', role: 'funder', org: ORG.funder },
      { key: 'government', name: 'Robin Sample (state oversight)', email: 'government@example.org', role: 'government', org: ORG.state },
      { key: 'utility', name: 'Kim Demo (distributor)', email: 'utility@example.org', role: 'utility', org: ORG.distributor },
    ],
    projects: [],
    flats: [],
    ledger: [],
    faults: [],
    quotes: [],
    wos: [],
    readings: new Map(),
    mv: [],
    reserve: [],
    log: [],
    runs: new Map(),
    stats: new Map(),
    ids: {},
  }
  const pr = ORG.provider
  const pr2 = ORG.provider2
  // two active projects with history
  const hist = (p: Proj, start: string, rate: number) => {
    S.now = addM(start, -3)
    p.rate = rate
    walk(p, 'commissioned', { agree: p.flats - 1, declined: 1 })
    S.now = start
    walk(p, 'active')
    for (const m of monthsBetween(addM(start, 1), S.base)) {
      S.now = m
      runMonth(m, null, { month: m, billing_runs: 0, readings_added: 0, faults_opened: 0, faults_resolved: 0, payments: 0, mv_runs: 0 })
    }
    S.now = S.base
  }
  const a1 = newProj('demo_004', pr)
  const a2 = newProj('demo_012', pr2)
  hist(a1, '2025-07', 0.96)
  hist(a2, '2025-08', 0.72)
  // a story: a fault, a tenancy change, an open fault now
  S.now = '2026-02'
  const fa = flatsOf(a1)[2]
  const f1 = reportFault(fa, 'heat_pump_hot_water', 'No hot water', 'tenant')
  S.now = '2026-04'
  resolveFault(f1, 'Replaced the controller')
  S.now = '2026-03'
  const ft = flatsOf(a1)[4]
  tenancyChange(ft, 'V. Newcomer', '2026-03-10')
  S.now = '2026-09'
  const fb = flatsOf(a2).find((f) => f.charge_status === 'active')
  if (fb) reportFault(fb, 'reverse_cycle', 'Air conditioner not cooling', 'tenant')
  S.now = S.base
  // pipeline
  const inst = newProj('demo_017', pr)
  walk(inst, 'installation', { agree: inst.flats })
  const wo = makeWo(inst)
  wo.checklist.forEach((c, i) => {
    if (i < Math.ceil(wo.checklist.length / 2)) Object.assign(c, { done: true, by: 'Jo Demo (installer)', at: `${dayOf(S.now, 3)}T10:00:00Z` })
  })
  const proc = newProj('demo_021', pr2)
  walk(proc, 'procurement', { agree: proc.flats })
  proc.tender = { orgs: [ORG.instA.id, ORG.instB.id], closes_on: dayOf(addM(S.now, 1), 15) }
  addQuote(proc, ORG.instA, 0.96)
  addQuote(proc, ORG.instB, 1.09)
  const con = newProj('demo_008', pr)
  walk(con, 'consent', { agree: 0 })
  con.ownerSigned = true
  flatsOf(con).forEach((f, i) => (f.consent = i < Math.floor(con.flats * 0.5) ? 'agreed' : 'pending'))
  const off = newProj('demo_025', pr2)
  walk(off, 'offer')
  const aud = newProj('demo_007', pr)
  walk(aud, 'audit')
  saveAudit(aud, { flats: aud.flats + 2, roof_m2: Math.round(aud.roof_m2 * 0.9), roof_condition: 'needs_repair', roof_colour: 'light', notes: 'Roof needs minor repair first.' }, 'Programme office')
  newProj('demo_013', pr)
  newProj('demo_019', pr2)
  newProj('demo_028', pr)
  // codes for the demo
  flatsOf(a1).filter((f) => f.consent === 'agreed')[0].access_code = 'FLAT-7K2Q'
  flatsOf(con)[0].access_code = 'FLAT-3M9X'
  flatsOf(a2).filter((f) => f.consent === 'agreed')[1].access_code = 'FLAT-5R4W'
  logAdd('Programme office', 'manager', 'seed', null, 'Example programme created')
}
function tenancyChange(f: Flat, name: string, date: string) {
  const m = date.slice(0, 7)
  if (f.balance_owing > 0) ledgerAdd(f, m, 'write_off', f.balance_owing, 'Old tenant balance settled at move-out')
  f.tenant_name = name
  f.tenancy_start = date
  f.access_code = codeFor(f.id + 1000 + S.ledger.length)
  logAdd('Programme office', 'manager', 'tenancy_change', f.project_id, `New tenant for flat ${f.unit}. The charge stays with the meter.`)
}

// ---------- routing ----------
interface Ctx {
  params: URLSearchParams
  body: unknown
  who: Who | null
}
type Out = { status?: number; body?: unknown; text?: string; contentType?: string }
const need = (c: Ctx, ...roles: Role[]): Who => {
  if (!c.who) throw new HttpErr(401, 'Please sign in to continue.', 'unauthorized')
  if (roles.length && !roles.includes(c.who.role)) throw nope()
  return c.who
}
const obj = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {})
const projOf = (id: string, w: Who): Proj => {
  const p = S.projects.find((x) => x.id === Number(id))
  if (!p) throw missing('We could not find that project.')
  if (!canSee(w, p)) throw nope()
  return p
}
const flatOf = (id: string, w: Who): Flat => {
  const f = S.flats.find((x) => x.id === Number(id))
  if (!f) throw missing('We could not find that flat.')
  if (w.role === 'tenant' && w.flat_id !== f.id) throw nope()
  if (w.role !== 'tenant' && !canSee(w, projOfFlat(f))) throw nope()
  return f
}
const userOut = (u: UserRec): User => ({ id: S.users.indexOf(u) + 1, name: u.name, email: u.email, role: u.role, org: u.org })
const clock = () => ({ now: `${dayOf(S.now, 4)}T10:00:00Z`, month: S.now, offset_months: S.offset })

function parseCsv(text: string): Reading[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw bad('The file needs a header row and at least one month.')
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const col = (k: string) => head.indexOf(k)
  if (col('month') < 0 || col('electricity_kwh') < 0) throw bad('The first row must name the columns: month, electricity_kwh, gas_mj, indoor_hours_above_30c.')
  return lines.slice(1).map((l, i) => {
    const c = l.split(',').map((x) => x.trim())
    const m = c[col('month')]
    if (!/^\d{4}-\d{2}$/.test(m)) throw bad(`Row ${i + 2}: the month should look like 2027-03.`)
    const num = (k: string) => (col(k) >= 0 && c[col(k)] !== '' ? Number(c[col(k)]) : null)
    const e = num('electricity_kwh')
    if (e === null || !Number.isFinite(e)) throw bad(`Row ${i + 2}: electricity_kwh is not a number.`)
    return { month: m, electricity_kwh: e, gas_mj: num('gas_mj') ?? 0, indoor_hours_above_30c: num('indoor_hours_above_30c'), mean_outdoor_c: null, source: 'uploaded' as const }
  })
}

const routes: [string, RegExp, (c: Ctx, m: string[]) => Out | Promise<Out>][] = [
  ['POST', /^\/api\/auth\/login$/, (c) => {
    const b = obj(c.body)
    const u = S.users.find((x) => x.email === String(b.email).trim().toLowerCase() && String(b.password) === 'demo')
    if (!u) throw new HttpErr(401, 'That email or password is not right.', 'unauthorized')
    return { body: { token: `tok_${u.key}`, user: userOut(u) } }
  }],
  ['POST', /^\/api\/auth\/tenant$/, (c) => {
    const code = String(obj(c.body).code ?? '').trim().toUpperCase()
    const f = S.flats.find((x) => x.access_code === code)
    if (!f) throw new HttpErr(401, "That access code isn't right. Check it and try again.", 'unauthorized')
    return { body: { token: `tok_tenant_${f.id}`, flat_id: f.id, project_id: f.project_id } }
  }],
  ['GET', /^\/api\/auth\/me$/, (c) => {
    const w = need(c)
    return { body: w.role === 'tenant' ? { role: 'tenant', name: w.user.name, flat_id: w.flat_id, project_id: w.project_id } : w.user }
  }],
  ['GET', /^\/api\/auth\/demo-users$/, () => {
    const out: DemoUser[] = S.users.map((u) => ({ role: u.role, name: u.name, email: u.email, password: 'demo', org: u.org.name }))
    for (const code of ['FLAT-7K2Q', 'FLAT-5R4W', 'FLAT-3M9X']) {
      const f = S.flats.find((x) => x.access_code === code)
      if (f) out.push({ role: 'tenant', name: `Tenant, flat ${f.unit} (${projOfFlat(f).label})`, code })
    }
    return { body: out }
  }],

  ['GET', /^\/api\/programme$/, (c) => {
    need(c, 'manager', 'owner', 'funder')
    return { body: programmeOf() }
  }],
  ['PATCH', /^\/api\/programme$/, (c) => {
    need(c, 'manager')
    const b = obj(c.body)
    for (const k of ['name', 'route', 'route_status', 'capital_committed', 'grant_pool'] as const) if (b[k] !== undefined) (S.programme as unknown as Record<string, unknown>)[k] = b[k]
    if (b.route) S.programme.route_status = b.route === 'community_housing' ? 'usable_now' : 'needs_rule_change'
    if (b.finance) S.programme.finance = { ...S.programme.finance, ...obj(b.finance) } as Programme['finance']
    return { body: programmeOf() }
  }],
  ['GET', /^\/api\/programme\/overview$/, (c) => {
    need(c, 'manager', 'funder')
    return { body: overviewOf() }
  }],
  ['GET', /^\/api\/programme\/projects$/, (c) => {
    const w = need(c, 'manager', 'owner', 'funder', 'installer')
    const st = c.params.get('stage')
    const q = (c.params.get('q') ?? '').toLowerCase()
    return { body: S.projects.filter((p) => canSee(w, p) && (!st || p.stage === st) && (!q || p.label.toLowerCase().includes(q))).map(projectOf) }
  }],
  ['POST', /^\/api\/programme\/projects$/, (c) => {
    const w = need(c, 'manager')
    const b = obj(c.body)
    const owner = S.orgs.find((o) => o.id === Number(b.owner_org_id) && o.kind === 'provider')
    if (!owner) throw bad('Choose the housing provider that owns the block.')
    if (S.projects.some((p) => p.building_id === b.building_id && p.stage !== 'closed')) throw conflict('That block already has a project.')
    const p = newProj(String(b.building_id), owner)
    if (b.package) p.package = { ...p.package, ...(b.package as Record<string, boolean>) }
    if (b.existing) p.existing = { ...p.existing, ...(b.existing as Record<string, string>) }
    logAdd(w.user.name, 'manager', 'project_created', p.id, `Project created for ${p.label}`)
    return { body: detailOf(p, w) }
  }],
  ['GET', /^\/api\/programme\/projects\/(\d+)$/, (c, m) => {
    const w = need(c, 'manager', 'owner', 'funder', 'installer')
    return { body: detailOf(projOf(m[1], w), w) }
  }],
  ['PATCH', /^\/api\/programme\/projects\/(\d+)$/, (c, m) => {
    const w = need(c, 'manager')
    const p = projOf(m[1], w)
    if (p.frozen) throw conflict('The offer has been issued, so the deal is fixed.')
    const b = obj(c.body)
    if (b.package) p.package = { ...p.package, ...(b.package as Record<string, boolean>) }
    if (b.existing) p.existing = { ...p.existing, ...(b.existing as Record<string, string>) }
    if (b.finance) p.finance = { ...p.finance, ...(b.finance as Record<string, number>) }
    if (b.grant_allocated !== undefined) p.grant = Math.max(0, Number(b.grant_allocated) || 0)
    refreshCharges(p)
    return { body: detailOf(p, w) }
  }],
  ['POST', /^\/api\/programme\/projects\/(\d+)\/advance$/, (c, m) => {
    const w = need(c, 'manager')
    const p = projOf(m[1], w)
    const b = obj(c.body)
    const to = String(b.to) as Stage
    if (!STAGES.includes(to)) throw bad('That is not a stage.')
    const nx = nextStage(p.stage)
    if (to !== nx) throw conflict(nx ? `A project moves one stage at a time. The next stage is ${nx}.` : 'This project is already at the last stage.')
    const g = guards(p, to)
    if (g.length) throw new HttpErr(409, 'This step is not ready yet.', 'stage_guard', { conditions: g })
    setStage(p, to, w.user.name, String(b.note ?? ''))
    return { body: detailOf(p, w) }
  }],
  ['GET', /^\/api\/programme\/orgs$/, (c) => {
    need(c, 'manager')
    return { body: S.orgs }
  }],
  ['GET', /^\/api\/programme\/audit-log$/, (c) => {
    need(c, 'manager')
    const pid = c.params.get('project_id')
    const lim = Number(c.params.get('limit') ?? 200)
    return { body: S.log.filter((l) => !pid || l.project_id === Number(pid)).slice(-lim).reverse() }
  }],

  ['PUT', /^\/api\/programme\/projects\/(\d+)\/audit$/, (c, m) => {
    const w = need(c, 'manager', 'owner')
    const p = projOf(m[1], w)
    if (stageIdx(p.stage) >= stageIdx('consent')) throw conflict('The offer has been issued, so the audit can no longer change.')
    saveAudit(p, obj(c.body) as Partial<Audit>, w.user.name)
    if (p.stage === 'screened') setStage(p, 'audit', w.user.name, 'Audit saved')
    return { body: detailOf(p, w) }
  }],
  ['POST', /^\/api\/programme\/projects\/(\d+)\/consent\/owner$/, (c, m) => {
    const w = need(c, 'manager', 'owner')
    const p = projOf(m[1], w)
    const b = obj(c.body)
    p.ownerSigned = b.signed !== false
    logAdd(w.user.name, w.role, 'owner_consent', p.id, `Owner agreement signed by ${String(b.name ?? w.user.name)}`)
    return { body: detailOf(p, w) }
  }],
  ['POST', /^\/api\/programme\/flats\/(\d+)\/consent$/, (c, m) => {
    const w = need(c, 'manager', 'owner', 'tenant')
    const f = flatOf(m[1], w)
    const v = obj(c.body).consent
    if (v !== 'agreed' && v !== 'declined') throw bad('Choose agree or decline.')
    f.consent = v
    f.charge_per_month = v === 'declined' ? 0 : r2(groupFor(assessOf(projOfFlat(f)), f.position).charge_per_month)
    logAdd(w.user.name, w.role, 'flat_consent', f.project_id, `Flat ${f.unit}: ${v}`)
    return { body: flatOut(f, w) }
  }],
  ['POST', /^\/api\/programme\/projects\/(\d+)\/tender$/, (c, m) => {
    const w = need(c, 'manager')
    const p = projOf(m[1], w)
    if (p.stage !== 'procurement') throw conflict('A tender can open once the project reaches procurement.')
    const b = obj(c.body)
    const ids = Array.isArray(b.installer_org_ids) ? b.installer_org_ids.map(Number) : []
    if (!ids.length) throw bad('Choose at least one installer.')
    p.tender = { orgs: ids, closes_on: String(b.closes_on || dayOf(addM(S.now, 1), 28)) }
    logAdd(w.user.name, 'manager', 'tender_opened', p.id, `Tender opened to ${ids.length} installers`)
    return { body: { ok: true, tender: p.tender } }
  }],
  ['GET', /^\/api\/programme\/tenders$/, (c) => {
    const w = need(c, 'installer', 'manager')
    const out: Tender[] = S.projects
      .filter((p) => p.stage === 'procurement' && p.tender && (w.role === 'manager' || p.tender.orgs.includes(w.org?.id ?? -1)))
      .map((p) => ({
        project: projectOf(p),
        items: assessOf(p).package.items.filter((i) => i.selected).map((i) => {
          const qty = i.applies_to === 'building' ? 1 : p.flats
          return { key: i.key, label: i.label, qty, modelled_unit_price: Math.round(i.capex / qty) }
        }),
        sizing: p.sizing,
        closes_on: p.tender!.closes_on,
      }))
    return { body: out }
  }],
  ['POST', /^\/api\/programme\/projects\/(\d+)\/quotes$/, (c, m) => {
    const w = need(c, 'installer')
    const p = projOf(m[1], w)
    if (p.stage !== 'procurement' || !p.tender?.orgs.includes(w.org!.id)) throw nope('This tender is not open to you.')
    const b = obj(c.body)
    const raw = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : []
    if (!raw.length) throw bad('Add at least one line to the quote.')
    const items = raw.map((i) => {
      const qty = Number(i.qty)
      const unit = Number(i.unit_price)
      if (!(qty > 0) || !(unit >= 0)) throw bad('Each line needs a quantity and a price.')
      return { key: String(i.key) as PackageKey, label: String(i.label ?? ITEM_LABELS[String(i.key)] ?? i.key), qty, unit_price: unit, total: Math.round(qty * unit) }
    })
    for (const o of S.quotes) if (o.project_id === p.id && o.installer_org.id === w.org!.id && o.status === 'submitted') o.status = 'withdrawn'
    const q = addQuote(p, w.org!, 1, items, String(b.valid_until || dayOf(addM(S.now, 2), 28)), String(b.note ?? ''))
    logAdd(w.user.name, 'installer', 'quote_submitted', p.id, `Quote of $${q.total} submitted`)
    return { body: q }
  }],
  ['POST', /^\/api\/programme\/quotes\/(\d+)\/accept$/, (c, m) => {
    const w = need(c, 'manager')
    const q = S.quotes.find((x) => x.id === Number(m[1]))
    if (!q) throw missing('We could not find that quote.')
    if (q.status !== 'submitted') throw conflict('Only a submitted quote can be accepted.')
    acceptQuote(q)
    const p = S.projects.find((x) => x.id === q.project_id)!
    logAdd(w.user.name, 'manager', 'quote_accepted', p.id, `Quote from ${q.installer_org.name} accepted`)
    return { body: detailOf(p, w) }
  }],
  ['POST', /^\/api\/programme\/projects\/(\d+)\/work-order$/, (c, m) => {
    const w = need(c, 'manager')
    const p = projOf(m[1], w)
    if (p.stage !== 'installation') throw conflict('A work order is created once the project is in installation.')
    if (S.wos.some((x) => x.project_id === p.id)) throw conflict('This project already has a work order.')
    const wo = makeWo(p)
    wo.scheduled_start = String(obj(c.body).scheduled_start || wo.scheduled_start)
    return { body: wo }
  }],
  ['POST', /^\/api\/programme\/work-orders\/(\d+)\/checklist$/, (c, m) => {
    const w = need(c, 'installer', 'manager')
    const wo = S.wos.find((x) => x.id === Number(m[1]))
    if (!wo) throw missing('We could not find that work order.')
    if (w.role === 'installer' && wo.installer_org.id !== w.org?.id) throw nope()
    const b = obj(c.body)
    const it = wo.checklist.find((x: ChecklistItem) => x.key === b.key)
    if (!it) throw bad('That checklist item does not exist.')
    it.done = b.done !== false
    it.by = it.done ? w.user.name : null
    it.at = it.done ? `${dayOf(S.now, 10)}T10:00:00Z` : null
    return { body: wo }
  }],
  ['GET', /^\/api\/programme\/projects\/(\d+)\/flats$/, (c, m) => {
    const w = need(c, 'manager', 'owner', 'funder')
    return { body: flatsOf(projOf(m[1], w)).map((f) => flatOut(f, w)) }
  }],
  ['POST', /^\/api\/programme\/flats\/(\d+)\/tenancy-change$/, (c, m) => {
    const w = need(c, 'manager', 'owner')
    const f = flatOf(m[1], w)
    const b = obj(c.body)
    if (!String(b.new_tenant_name ?? '').trim()) throw bad("Enter the new tenant's name.")
    tenancyChange(f, String(b.new_tenant_name), String(b.date || dayOf(S.now, 1)))
    return { body: flatOut(f, w) }
  }],
  ['GET', /^\/api\/programme\/flats\/(\d+)\/ledger$/, (c, m) => {
    const w = need(c, 'manager', 'owner', 'tenant')
    const f = flatOf(m[1], w)
    return { body: S.ledger.filter((l) => l.flat_id === f.id) }
  }],
  ['POST', /^\/api\/programme\/flats\/(\d+)\/payments$/, (c, m) => {
    const w = need(c, 'manager', 'owner')
    const f = flatOf(m[1], w)
    const b = obj(c.body)
    const amt = Number(b.amount)
    if (!(amt > 0)) throw bad('Enter an amount above zero.')
    pay(f, amt, String(b.month || S.now), 'Payment recorded by staff')
    return { body: { ok: true, balance_owing: f.balance_owing } }
  }],

  ['POST', /^\/api\/programme\/billing\/run$/, (c) => {
    need(c, 'manager')
    const month = String(obj(c.body).month || S.now)
    if (!/^\d{4}-\d{2}$/.test(month)) throw bad('The month should look like 2026-10.')
    return { body: billMonth(month) }
  }],
  ['GET', /^\/api\/programme\/billing\/export$/, (c) => {
    const w = need(c, 'manager', 'owner')
    const month = c.params.get('month') || S.now
    const pid = c.params.get('project_id')
    const rows = ['unit,meter_id,charge,status']
    for (const p of S.projects) {
      if (!canSee(w, p) || (pid && p.id !== Number(pid)) || p.stage !== 'active') continue
      for (const f of flatsOf(p)) if (f.consent !== 'declined') rows.push(`${p.label.replace(/,/g, '')} ${f.unit},${f.meter_id},${f.charge_status === 'paused' ? 0 : f.charge_per_month.toFixed(2)},${f.charge_status}`)
    }
    return { text: rows.join('\n') + '\n', contentType: `text/csv; charset=utf-8; month=${month}` }
  }],
  ['GET', /^\/api\/programme\/faults$/, (c) => {
    const w = need(c, 'manager', 'owner', 'installer')
    const st = c.params.get('status')
    const pid = c.params.get('project_id')
    return { body: S.faults.filter((f) => (!st || f.status === st) && (!pid || f.project_id === Number(pid)) && canSee(w, projOfFlat(S.flats.find((x) => x.id === f.flat_id)!))).reverse() }
  }],
  ['POST', /^\/api\/programme\/flats\/(\d+)\/faults$/, (c, m) => {
    const w = need(c, 'manager', 'owner', 'tenant')
    const f = flatOf(m[1], w)
    const b = obj(c.body)
    if (!String(b.description ?? '').trim()) throw bad('Tell us what is wrong.')
    return { body: reportFault(f, String(b.item || 'other'), String(b.description), w.role === 'tenant' ? 'tenant' : w.role) }
  }],
  ['POST', /^\/api\/programme\/faults\/(\d+)\/resolve$/, (c, m) => {
    const w = need(c, 'manager', 'installer')
    const ft = S.faults.find((x) => x.id === Number(m[1]))
    if (!ft) throw missing('We could not find that fault.')
    if (!canSee(w, S.projects.find((p) => p.id === ft.project_id)!)) throw nope()
    if (ft.status === 'resolved') throw conflict('That fault is already resolved.')
    resolveFault(ft, String(obj(c.body).note ?? ''))
    return { body: ft }
  }],
  ['GET', /^\/api\/programme\/reserve$/, (c) => {
    need(c, 'manager', 'funder')
    return { body: { balance: Math.round(S.reserve.length ? S.reserve[S.reserve.length - 1].balance_after : 0), entries: [...S.reserve].reverse() } satisfies Reserve }
  }],

  ['GET', /^\/api\/programme\/flats\/(\d+)\/readings$/, (c, m) => {
    const w = need(c, 'manager', 'owner', 'tenant')
    return { body: S.readings.get(flatOf(m[1], w).id) ?? [] }
  }],
  ['POST', /^\/api\/programme\/flats\/(\d+)\/readings$/, async (c, m) => {
    const w = need(c, 'manager', 'owner')
    const f = flatOf(m[1], w)
    let list: Reading[]
    if (c.body instanceof FormData) {
      const file = c.body.get('file')
      if (!(file instanceof Blob)) throw bad('Choose a CSV file.')
      list = parseCsv(await file.text())
    } else {
      const arr = obj(c.body).readings
      if (!Array.isArray(arr) || !arr.length) throw bad('No readings were sent.')
      list = (arr as Reading[]).map((r) => ({ ...r, source: 'uploaded' as const }))
    }
    for (const r of list) putReading(f.id, r)
    return { body: { added: list.length, source: 'uploaded' } }
  }],
  ['POST', /^\/api\/programme\/projects\/(\d+)\/mv\/run$/, (c, m) => {
    const w = need(c, 'manager')
    const p = projOf(m[1], w)
    if (!p.startMonth) throw conflict('Charges have not started yet, so there is nothing to check.')
    const b = obj(c.body)
    return { body: runMv(p, String(b.from || addM(S.now, -11)), String(b.to || S.now)) }
  }],
  ['GET', /^\/api\/programme\/projects\/(\d+)\/mv$/, (c, m) => {
    const w = need(c, 'manager', 'owner', 'funder')
    const p = projOf(m[1], w)
    return { body: S.mv.filter((x) => x.project_id === p.id) }
  }],

  ['GET', /^\/api\/programme\/projects\/(\d+)\/documents$/, (c, m) => {
    const w = need(c, 'manager', 'owner', 'funder', 'installer')
    return { body: docsOf(projOf(m[1], w), w) }
  }],
  ['GET', /^\/api\/programme\/documents\/(\d+)\/([a-z_]+)\.html$/, (c, m) => {
    const w = need(c, 'manager', 'owner', 'funder', 'tenant', 'installer')
    const p = projOf(m[1], w)
    const fid = c.params.get('flat_id')
    const f = fid ? S.flats.find((x) => x.id === Number(fid)) ?? null : null
    if (w.role === 'tenant' && f?.id !== w.flat_id) throw nope()
    return { text: docHtml(p, m[2], f), contentType: 'text/html; charset=utf-8' }
  }],
  ['GET', /^\/api\/programme\/flats\/(\d+)\/data-consent$/, (c, m) => {
    const w = need(c, 'tenant', 'manager', 'owner')
    const id = Number(m[1])
    if (w.role === 'tenant' && w.flat_id !== id) throw new HttpErr(403, "You don't have access to that.", 'forbidden')
    return { body: dataConsent.get(id) ?? { given: false, given_on: null, expires_on: null } }
  }],
  ['POST', /^\/api\/programme\/flats\/(\d+)\/data-consent$/, (c, m) => {
    const w = need(c, 'tenant', 'manager', 'owner')
    const id = Number(m[1])
    if (w.role === 'tenant' && w.flat_id !== id) throw new HttpErr(403, "You don't have access to that.", 'forbidden')
    const b = obj(c.body)
    const rec = b.given === true ? { given: true, given_on: S.now.slice(0, 10), expires_on: String(b.expires_on || addM(S.now.slice(0, 7), 12) + '-' + S.now.slice(8, 10)) } : { given: false, given_on: null, expires_on: null }
    dataConsent.set(id, rec)
    return { body: rec }
  }],
  ['GET', /^\/api\/programme\/my-flat$/, (c) => {
    const w = need(c, 'tenant')
    const f = S.flats.find((x) => x.id === w.flat_id)!
    const p = projOfFlat(f)
    const a = assessOf(p)
    const g = groupFor(a, f.position)
    const modelled = r1(g.saving_per_year / 12)
    const run = [...S.mv].reverse().find((r) => r.project_id === p.id && r.by_flat.some((b) => b.flat_id === f.id))
    const vf = run?.by_flat.find((b) => b.flat_id === f.id)
    const start = p.startMonth ?? addM(S.now, 3)
    const body: MyFlat = {
      flat: flatOut(f, w),
      project: { label: p.label, stage: p.stage },
      deal: { installed: a.package.items.filter((i) => i.selected).map((i) => ({ key: i.key, label: i.label })), charge_per_month: f.charge_per_month, modelled_saving_per_month: modelled, net_saving_per_month: r1(modelled - f.charge_per_month), term_ends: addM(start, finNum(p, 'term_years') * 12 - 1) },
      verified: run && vf ? { verified_saving_per_month: vf.result.verified_saving_per_month, realisation_rate: vf.result.realisation_rate, as_of: run.run_on } : null,
      ledger: S.ledger.filter((l) => l.flat_id === f.id),
      faults: S.faults.filter((x) => x.flat_id === f.id),
      documents: docsOf(p, w),
      protections: [
        'You never pay more than 80% of what the upgrades save you. You keep at least 20%.',
        'If the equipment fails, your charge is paused until it is fixed.',
        'If you move out, the charge stays with the meter. You do not owe anything after you leave.',
        'You can decline the upgrades. Nothing changes for you if you do.',
        'Savings are checked against your real meter readings every year. If they fall short, your charge goes down and you get a refund.',
      ],
    }
    return { body }
  }],

  ['GET', /^\/api\/sim\/clock$/, (c) => {
    need(c)
    return { body: clock() }
  }],
  ['POST', /^\/api\/sim\/advance$/, (c) => {
    need(c, 'manager')
    const b = obj(c.body)
    const n = Number(b.months)
    if (!(n >= 1 && n <= 36)) throw bad('Choose between 1 and 36 months.')
    const sc = b.scenario ? String(b.scenario) : null
    const res: AdvanceResult = { month: S.now, billing_runs: 0, readings_added: 0, faults_opened: 0, faults_resolved: 0, payments: 0, mv_runs: 0 }
    for (let i = 0; i < n; i++) {
      S.offset++
      S.now = addM(S.base, S.offset)
      runMonth(S.now, sc, res)
    }
    res.month = S.now
    return { body: res }
  }],
  ['POST', /^\/api\/sim\/reset$/, (c) => {
    need(c, 'manager')
    aCache.clear()
    ready = false
    ensure()
    return { body: { ...clock(), reset: true } }
  }],

  ['GET', /^\/api\/buildings\/([^/]+)\/microclimate$/, (_c, m) => ({ body: microOf(decodeURIComponent(m[1])) })],
  ['GET', /^\/api\/buildings\/([^/]+)\/weather\.epw$/, (_c, m) => ({ text: epwOf(decodeURIComponent(m[1])), contentType: 'text/plain' })],
  ['POST', /^\/api\/sizing$/, (c) => ({ body: sizingOf(c.body as AssessRequest) })],
  ['POST', /^\/api\/schedule$/, (c) => {
    const b = obj(c.body)
    return { body: scheduleOf(c.body as AssessRequest, String(b.start || addM(S.now, 3))) }
  }],
  ['POST', /^\/api\/risk$/, (c) => ({ body: riskOf(c.body as AssessRequest) })],
  ['POST', /^\/api\/portfolio\/plan$/, (c) => {
    const b = obj(c.body) as unknown as PlanBody
    if (!(b.capital_budget >= 0) || !(b.grant_budget >= 0)) throw bad('Enter a capital budget and a grant budget.')
    return { body: planOf(b) }
  }],
]

const dataConsent = new Map<number, { given: boolean; given_on: string | null; expires_on: string | null }>()

function whoFor(token: string | null): Who | null {
  if (!token) return null
  if (token.startsWith('tok_tenant_')) {
    const f = S.flats.find((x) => x.id === Number(token.slice(11)))
    if (!f) return null
    return { role: 'tenant', user: { role: 'tenant', name: f.tenant_name ?? 'Tenant', flat_id: f.id, project_id: f.project_id }, org: null, flat_id: f.id, project_id: f.project_id }
  }
  const u = S.users.find((x) => `tok_${x.key}` === token)
  return u ? { role: u.role, user: userOut(u), org: u.org } : null
}
function ensure() {
  if (!ready) {
    ready = true
    init()
  }
}

/** For the other mock files (gov, utility, property): the shared in-memory programme state and the caller. */
export function mockState(): State {
  ensure()
  return S
}
export function mockWho(token: string | null) {
  ensure()
  return whoFor(token)
}
export type MockState = State

export async function handle(method: string, pathname: string, params: URLSearchParams, body: unknown, token: string | null): Promise<RawReply> {
  await sleep(120)
  ensure()
  try {
    for (const [mt, re, fn] of routes) {
      if (mt !== method) continue
      const m = re.exec(pathname)
      if (!m) continue
      const out = await fn({ params, body, who: whoFor(token) }, m)
      return { status: out.status ?? 200, body: out.body === undefined ? null : structuredClone(out.body), text: out.text, contentType: out.contentType }
    }
    return { status: 404, body: { detail: "We couldn't find that.", code: 'not_found' } }
  } catch (e) {
    if (e instanceof HttpErr) return { status: e.status, body: { detail: e.message, code: e.code, ...e.extra } }
    throw e
  }
}
