// Mock of the /api/utility routes (docs/portals-contract.md). Built from the shared programme mock state.
// Demo data only. Meters, readings and remittances are invented.
import type { RawReply } from '../console/api'
import type { Flat, LedgerEntry, Reading } from '../console/types'
import type { GasDisconnection, GasStatus, MeterRow, NetworkImpact, NetworkProject, ReadingsResult, RemittanceResult, SupplyRequest, SupplyStatus, UtilitySummary } from '../console/types-utility'
import { mockState, mockWho } from './programme'
import type { MockState } from './programme'

type Proj = MockState['projects'][number]

const AFTER_OFFER = ['procurement', 'installation', 'commissioned', 'active', 'closed']
const pad = (n: number) => String(n).padStart(2, '0')
const idx = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return y * 12 + mo - 1
}
const addM = (m: string, n: number) => {
  const i = idx(m) + n
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`
}
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const hash = (n: number) => {
  let h = Math.imul(n + 0x9e3779b9, 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

class Err extends Error {
  status: number
  code: string
  constructor(status: number, message: string, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
const bad = (m: string) => new Err(400, m, 'validation')
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ---------- state owned by this file ----------
let gas: GasDisconnection[] | null = null
let supply: SupplyRequest[] | null = null

function projectsInNetwork(S: MockState): Proj[] {
  return S.projects.filter((p) => AFTER_OFFER.includes(p.stage))
}
function flatsOf(S: MockState, p: Proj): Flat[] {
  return S.flats.filter((f) => f.project_id === p.id && f.consent !== 'declined')
}
function commissionedOn(p: Proj): string | null {
  const h = p.history.find((x) => x.stage === 'commissioned')
  if (h) return h.at.slice(0, 10)
  if (p.startMonth) return `${p.startMonth}-15`
  return null
}

function seed(S: MockState) {
  if (gas && supply) return
  gas = []
  supply = []
  const list = S.projects.filter((p) => ['installation', 'commissioned', 'active'].includes(p.stage))
  list.forEach((p, i) => {
    if (!(p.package.disconnect_gas || i % 2 === 0)) return
    const status: GasStatus = (['requested', 'scheduled', 'completed'] as const)[i % 3]
    gas!.push({
      id: gas!.length + 1,
      project_id: p.id,
      meters: p.flats,
      requested_on: `${addM(S.now, -2 - (i % 3))}-12`,
      status,
      scheduled_for: status === 'requested' ? null : `${addM(S.now, status === 'completed' ? -1 : 1)}-20`,
      completed_on: status === 'completed' ? `${addM(S.now, -1)}-20` : null,
      note: status === 'completed' ? 'Gas supply capped at the street.' : 'Gas stays on until the new hot water units are tested.',
    })
  })
  S.projects
    .filter((p) => AFTER_OFFER.includes(p.stage))
    .slice(0, 6)
    .forEach((p, i) => {
      if (i % 3 !== 0 && !(p.sizing?.electrical.switchboard_upgrade_likely)) return
      const status: SupplyStatus = i === 0 ? 'open' : i === 3 ? 'approved' : 'open'
      supply!.push({
        id: supply!.length + 1,
        project_id: p.id,
        kind: i % 2 === 0 ? 'switchboard_upgrade' : 'supply_upgrade',
        detail: i % 2 === 0 ? `The building switchboard may need an upgrade for ${p.flats} new air conditioners and hot water units.` : 'One flat may need a larger service fuse.',
        status,
        raised_on: `${addM(S.now, -1)}-0${2 + i}`,
        response: status === 'approved' ? 'Approved. Allow 6 weeks for the work.' : null,
      })
    })
}

function lastReading(S: MockState, f: Flat): Reading | null {
  const l = S.readings.get(f.id)
  return l && l.length ? l[l.length - 1] : null
}

function meterRows(S: MockState): MeterRow[] {
  const rows: MeterRow[] = []
  for (const p of projectsInNetwork(S)) {
    for (const f of flatsOf(S, p)) {
      const lr = lastReading(S, f)
      rows.push({
        meter_id: f.meter_id,
        project_id: p.id,
        address: `${f.unit}/${p.label}`,
        position: f.position,
        stage: p.stage,
        charge_status: f.charge_status,
        charge_per_month: f.charge_per_month,
        commissioned_on: commissionedOn(p),
        has_gas: p.package.disconnect_gas ? false : hash(f.id) < 0.5,
        retailer_customer: hash(f.id + 99) < 0.6,
        last_reading_month: lr ? lr.month : null,
        reading_source: lr ? lr.source : null,
      })
    }
  }
  return rows
}
const overdue = (S: MockState, r: MeterRow) => r.stage === 'active' && (!r.last_reading_month || idx(r.last_reading_month) < idx(S.now) - 1)

function network(S: MockState): NetworkImpact {
  const by: NetworkProject[] = projectsInNetwork(S)
    .filter((p) => ['installation', 'commissioned', 'active'].includes(p.stage))
    .map((p) => {
      const el = p.sizing?.electrical
      const before = el ? el.building_peak_kw_before : r1(p.flats * 3.6 + hash(p.id) * 4)
      const after = el ? el.building_peak_kw_after : r1(before * (0.92 + hash(p.id + 3) * 0.05))
      const without = el ? el.building_peak_kw_after_without_roof : r1(before * 1.06)
      return {
        project_id: p.id,
        label: p.label,
        stage: p.stage,
        flats: p.flats,
        commissioned_on: commissionedOn(p),
        peak_kw_before: r1(before),
        peak_kw_after: r1(after),
        peak_kw_after_without_roof: r1(without),
        annual_kwh_change: Math.round(p.flats * (620 + hash(p.id + 5) * 200)),
        gas_mj_avoided_per_year: p.package.heat_pump_hot_water ? Math.round(p.flats * 12500) : 0,
        switchboard_upgrade_likely: !!el?.switchboard_upgrade_likely,
      }
    })
  const sum = (f: (b: NetworkProject) => number) => by.reduce((s, b) => s + f(b), 0)
  const pending = by.filter((b) => b.stage !== 'active')
  return {
    as_of: S.now,
    area: 'Penrith and Kingswood',
    totals: {
      projects: by.length,
      flats: sum((b) => b.flats),
      peak_kw_before: r1(sum((b) => b.peak_kw_before)),
      peak_kw_after: r1(sum((b) => b.peak_kw_after)),
      peak_kw_after_without_roof: r1(sum((b) => b.peak_kw_after_without_roof ?? b.peak_kw_before)),
      annual_kwh_change: sum((b) => b.annual_kwh_change),
      gas_mj_avoided_per_year: sum((b) => b.gas_mj_avoided_per_year),
      gas_connections_removed: by.filter((b) => b.gas_mj_avoided_per_year > 0).reduce((s, b) => s + b.flats, 0),
      switchboard_upgrades_likely: by.filter((b) => b.switchboard_upgrade_likely).length,
    },
    by_project: by,
    forecast: Array.from({ length: 6 }, (_, i) => {
      const batch = pending.filter((_b, j) => j % 6 === i % 6 || (j + 2) % 6 === i % 6)
      return {
        month: addM(S.now, i + 1),
        projects_commissioning: batch.length,
        added_peak_kw: r1(batch.reduce((s, b) => s + (b.peak_kw_after - b.peak_kw_before), 0)),
        added_annual_kwh: batch.reduce((s, b) => s + b.annual_kwh_change, 0),
      }
    }),
    basis: 'Modelled design-day peak per building from the sizing module. Not a network study.',
  }
}

function summary(S: MockState, org: UtilitySummary['org']): UtilitySummary {
  const rows = meterRows(S)
  const month = S.now
  const monthLedger = S.ledger.filter((l: LedgerEntry) => l.month === month)
  const activeFlats = S.flats.filter((f) => f.charge_status === 'active')
  return {
    org,
    meters: { total: rows.length, active_charges: rows.filter((r) => r.charge_status === 'active').length, paused: rows.filter((r) => r.charge_status === 'paused').length },
    billing: {
      month,
      to_bill: r2(activeFlats.reduce((s, f) => s + f.charge_per_month, 0)),
      billed: r2(monthLedger.filter((l) => l.kind === 'charge').reduce((s, l) => s + l.amount, 0)),
      remitted: r2(monthLedger.filter((l) => l.kind === 'payment').reduce((s, l) => s + l.amount, 0)),
      outstanding: r2(S.flats.reduce((s, f) => s + Math.max(0, f.balance_owing), 0)),
    },
    network: network(S).totals,
    open: {
      gas_disconnections: (gas ?? []).filter((g) => g.status === 'requested' || g.status === 'scheduled').length,
      supply_requests: (supply ?? []).filter((x) => x.status === 'open').length,
      readings_overdue_meters: rows.filter((r) => overdue(S, r)).length,
    },
  }
}

async function consentOk(flatId: number): Promise<boolean> {
  try {
    const m = (await import('./property')) as unknown as { hasDataConsent?: (id: number) => boolean }
    return m.hasDataConsent ? m.hasDataConsent(flatId) : true
  } catch {
    return true
  }
}

function obj(b: unknown): Record<string, unknown> {
  return b && typeof b === 'object' ? (b as Record<string, unknown>) : {}
}
const validMonth = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)

function csvEsc(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csvReply = (rows: (string | number)[][], name: string): RawReply => ({ status: 200, body: null, text: rows.map((r) => r.map(csvEsc).join(',')).join('\r\n') + '\r\n', contentType: `text/csv; filename=${name}` })

export async function handle(method: string, pathname: string, params: URLSearchParams, body: unknown, token: string | null): Promise<RawReply | null> {
  if (!pathname.startsWith('/api/utility/')) return null
  await sleep(120)
  const S = mockState()
  seed(S)
  const who = mockWho(token)
  if (!who) return { status: 401, body: { detail: 'Please sign in to continue.', code: 'unauthorized' } }
  const readOnlyOk = who.role === 'manager' && method === 'GET'
  if (who.role !== 'utility' && !readOnlyOk) return { status: 403, body: { detail: "You don't have access to that.", code: 'forbidden' } }
  const ok = (b: unknown): RawReply => ({ status: 200, body: structuredClone(b) })
  const withLabel = <T extends { project_id: number }>(x: T) => ({ ...x, label: S.projects.find((p) => p.id === x.project_id)?.label ?? `Project ${x.project_id}` })

  try {
    if (method === 'GET' && pathname === '/api/utility/summary') return ok(summary(S, who.org ?? { id: 9, name: 'Example Network Distributor' }))

    if (method === 'GET' && pathname === '/api/utility/meters') {
      const q = (params.get('q') ?? '').toLowerCase()
      const stage = params.get('stage')
      const cs = params.get('charge_status')
      return ok(meterRows(S).filter((r) => (!q || r.address.toLowerCase().includes(q) || r.meter_id.toLowerCase().includes(q)) && (!stage || r.stage === stage) && (!cs || r.charge_status === cs)))
    }

    if (method === 'GET' && pathname === '/api/utility/network-impact') return ok(network(S))

    if (method === 'GET' && pathname === '/api/utility/readings/template.csv') {
      const rows = meterRows(S)
      let due = rows.filter((r) => overdue(S, r))
      if (due.length === 0) due = rows.filter((r) => r.stage === 'active').slice(0, 5)
      const month = addM(S.now, -1)
      return csvReply([['meter_id', 'month', 'electricity_kwh', 'gas_mj'], ...due.map((r) => [r.meter_id, month, '', ''])], 'readings-template.csv')
    }

    if (method === 'POST' && pathname === '/api/utility/readings') {
      const list = obj(body).readings
      if (!Array.isArray(list)) throw bad('Send a list of readings.')
      if (list.length > 5000) throw bad('That is more than 5,000 rows. Split the file and upload it in parts.')
      const out: ReadingsResult = { accepted: 0, rejected: [] }
      const inNet = new Set(meterRows(S).map((r) => r.meter_id))
      for (let i = 0; i < list.length; i++) {
        const r = obj(list[i])
        const row = i + 2 // row 1 is the header in the file
        const meter = String(r.meter_id ?? '')
        const f = S.flats.find((x) => x.meter_id === meter)
        const rej = (reason: string) => out.rejected.push({ row, reason, meter_id: meter })
        if (!f || !inNet.has(meter)) {
          rej('meter not found in your network area')
          continue
        }
        if (!validMonth(r.month)) {
          rej('month should look like 2027-03')
          continue
        }
        const kwh = Number(r.electricity_kwh)
        const mj = Number(r.gas_mj ?? 0)
        if (!Number.isFinite(kwh) || kwh < 0 || String(r.electricity_kwh ?? '') === '' || !Number.isFinite(mj) || mj < 0) {
          rej('electricity_kwh and gas_mj must be numbers of zero or more')
          continue
        }
        if (!(await consentOk(f.id))) {
          rej('no current data consent')
          continue
        }
        const l = S.readings.get(f.id) ?? []
        const next: Reading = { month: r.month, electricity_kwh: kwh, gas_mj: mj, indoor_hours_above_30c: null, mean_outdoor_c: null, source: 'utility' }
        const at = l.findIndex((x) => x.month === r.month)
        if (at >= 0) l[at] = next
        else {
          l.push(next)
          l.sort((a, b) => a.month.localeCompare(b.month))
        }
        S.readings.set(f.id, l)
        out.accepted++
      }
      return ok(out)
    }

    if (method === 'GET' && pathname === '/api/utility/charge-file') {
      const month = params.get('month') ?? S.now
      if (!validMonth(month)) throw bad('The month should look like 2027-03.')
      const rows = meterRows(S).filter((r) => r.stage === 'active' || r.stage === 'commissioned')
      return csvReply(
        [['meter_id', 'amount', 'status', 'paused'], ...rows.map((r) => [r.meter_id, r.charge_status === 'paused' ? '0.00' : r.charge_per_month.toFixed(2), r.charge_status, r.charge_status === 'paused' ? 'yes' : 'no'])],
        `charge-file-${month}.csv`,
      )
    }

    if (method === 'POST' && pathname === '/api/utility/remittance') {
      const b = obj(body)
      if (!validMonth(b.month)) throw bad('The month should look like 2027-03.')
      const list = b.rows
      if (!Array.isArray(list) || list.length === 0) throw bad('Add at least one row of meter id and amount.')
      if (list.length > 5000) throw bad('That is more than 5,000 rows. Split the file and upload it in parts.')
      const res: RemittanceResult = { month: b.month, rows: list.length, total_received: 0, total_due: 0, posted: 0, mismatches: [] }
      const nextId = () => S.ledger.reduce((m, l) => Math.max(m, l.id), 0) + 1
      for (const raw of list) {
        const r = obj(raw)
        const meter = String(r.meter_id ?? '')
        const amt = Number(r.amount)
        const f = S.flats.find((x) => x.meter_id === meter)
        if (!f) {
          res.mismatches.push({ meter_id: meter, received: Number.isFinite(amt) ? amt : 0, reason: 'meter not found in your network area' })
          continue
        }
        if (!Number.isFinite(amt) || amt < 0) {
          res.mismatches.push({ meter_id: meter, reason: 'amount must be a number of zero or more' })
          continue
        }
        const due = f.charge_status === 'active' ? f.charge_per_month : 0
        res.total_due = r2((res.total_due ?? 0) + due)
        res.total_received = r2((res.total_received ?? 0) + amt)
        if (Math.abs(amt - due) > 0.005) res.mismatches.push({ meter_id: meter, expected: due, received: amt, reason: amt > due ? 'more than the charge for the month' : 'less than the charge for the month' })
        if (amt > 0) {
          f.balance_owing = r2(f.balance_owing - amt)
          S.ledger.push({ id: nextId(), flat_id: f.id, month: b.month, at: `${b.month}-28T09:00:00Z`, kind: 'payment', amount: r2(amt), balance_after: f.balance_owing, note: 'Remitted by utility' })
          res.posted = (res.posted ?? 0) + 1
        }
      }
      return ok(res)
    }

    if (method === 'GET' && pathname === '/api/utility/gas-disconnections') return ok(gas!.map(withLabel))
    let m = /^\/api\/utility\/gas-disconnections\/(\d+)$/.exec(pathname)
    if (method === 'POST' && m) {
      const g = gas!.find((x) => x.id === Number(m![1]))
      if (!g) return { status: 404, body: { detail: "We couldn't find that.", code: 'not_found' } }
      const b = obj(body)
      const st = b.status as GasStatus
      if (!['requested', 'scheduled', 'completed', 'cancelled'].includes(st)) throw bad('Choose a status.')
      if (st === 'scheduled' && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.scheduled_for ?? ''))) throw bad('Add the date the work is scheduled for.')
      g.status = st
      if (b.scheduled_for) g.scheduled_for = String(b.scheduled_for)
      if (st === 'completed') g.completed_on = `${S.now}-15`
      if (typeof b.note === 'string') g.note = b.note
      return ok(withLabel(g))
    }

    if (method === 'GET' && pathname === '/api/utility/supply-requests') return ok(supply!.map(withLabel))
    m = /^\/api\/utility\/supply-requests\/(\d+)$/.exec(pathname)
    if (method === 'POST' && m) {
      const s = supply!.find((x) => x.id === Number(m![1]))
      if (!s) return { status: 404, body: { detail: "We couldn't find that.", code: 'not_found' } }
      const b = obj(body)
      const st = b.status as SupplyStatus
      if (!['open', 'approved', 'not_needed', 'completed'].includes(st)) throw bad('Choose a status.')
      if (!String(b.response ?? '').trim()) throw bad('Write a short response for the programme.')
      s.status = st
      s.response = String(b.response)
      return ok(withLabel(s))
    }
    return { status: 404, body: { detail: "We couldn't find that.", code: 'not_found' } }
  } catch (e) {
    if (e instanceof Err) return { status: e.status, body: { detail: e.message, code: e.code } }
    throw e
  }
}
