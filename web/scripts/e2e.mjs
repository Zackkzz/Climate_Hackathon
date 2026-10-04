// End-to-end walk of the Meterwise programme against a running server, on a fresh database.
// Usage: node scripts/e2e.mjs [baseUrl]      (default http://localhost:8000)
// Resets the demo database first (POST /api/sim/reset), then runs each step and prints PASS or FAIL with a reason.
// Steps drive the real screens in Chromium where practical and use API calls to set up or read back state.
// Exit code 1 if any step failed. Set HEADED=1 to watch it, ONLY=<text> to run steps whose name contains the text.
import { chromium } from 'playwright-core'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = (process.argv[2] ?? 'http://localhost:8000').replace(/\/$/, '')
const PW = 'Penrith-demo-2026!'
const EMAIL = (n) => `${n}@meterwise.example`

function findChrome() {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  if (!existsSync(root)) return undefined
  for (const d of readdirSync(root)) {
    const p = join(root, d, 'chrome-win64', 'chrome.exe')
    if (d.startsWith('chromium-') && existsSync(p)) return p
  }
  return undefined
}

// ---------- plain API helpers ----------
async function call(token, method, path, body, raw) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* not JSON */
  }
  if (raw) return { status: res.status, json, text }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.detail ?? text.slice(0, 120)}`)
  return json
}
const USERS = {}
async function login(name) {
  const r = await call(null, 'POST', '/api/auth/login', { email: EMAIL(name), password: PW })
  if (r.mfa_required) throw new Error(`${name} needs MFA`)
  USERS[name] = r.user
  return r.token
}

// ---------- step runner ----------
const results = []
const only = process.env.ONLY
async function step(name, fn) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) return
  const t0 = Date.now()
  try {
    const note = await fn()
    results.push({ name, ok: true })
    console.log(`PASS  ${name}${note ? ' - ' + note : ''}  (${Date.now() - t0} ms)`)
  } catch (e) {
    results.push({ name, ok: false, why: String(e.message ?? e).split('\n')[0] })
    console.log(`FAIL  ${name} - ${String(e.message ?? e).split('\n')[0]}`)
    if (process.env.DEBUG) {
      const al = await page.locator('[role=alert]').allInnerTexts().catch(() => [])
      console.log('      at ' + page.url() + ' | alerts: ' + al.join(' | ').replace(/\s+/g, ' ').slice(0, 300))
      await page.screenshot({ path: `${process.env.SHOTS ?? '.'}/fail-${results.length}.png` }).catch(() => {})
    }
  }
}
const must = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

// ---------- start ----------
console.log(`Meterwise end-to-end run against ${BASE}`)
try {
  const h = await fetch(BASE + '/api/health')
  if (!h.ok) throw new Error(String(h.status))
} catch (e) {
  console.log(`FAIL  server not reachable: ${e.message}`)
  process.exit(1)
}
let mgr
try {
  mgr = await login('manager')
} catch (e) {
  console.log(`FAIL  cannot sign in as the manager: ${e.message}. The server limits sign-ins per address (30 in 5 minutes); wait and rerun.`)
  process.exit(1)
}
const reset = await call(mgr, 'POST', '/api/sim/reset', {}, true)
console.log(`Reset: ${reset.status === 200 ? 'database wiped and reseeded' : 'reset returned ' + reset.status + ' ' + (reset.json?.detail ?? '')}`)

const T = {}
for (const n of ['manager', 'council', 'provider', 'strata', 'installer', 'distributor', 'funder']) T[n] = await login(n)
mgr = T.manager
const demo = await call(null, 'GET', '/api/auth/demo-users')
const tenantCode = demo.find((u) => u.code)?.code

const browser = await chromium.launch({ executablePath: findChrome(), headless: !process.env.HEADED })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 160))
})
page.on('pageerror', (e) => consoleErrors.push('pageerror ' + e.message.slice(0, 160)))

let uiLogins = 0
/** Sign in once through the real form (the server limits sign-ins per address); later switches reuse the API session. */
async function signInUi(who) {
  const name = who.replace(/@.*/, '')
  if (uiLogins === 0) {
    uiLogins++
    await page.goto(BASE + '/signin')
    await page.getByRole('textbox', { name: 'Email address' }).fill(EMAIL(name))
    await page.getByLabel('Password').fill(PW)
    await page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
    await page.waitForURL((u) => !u.pathname.startsWith('/signin'), { timeout: 15000 })
    return
  }
  await page.goto(BASE + '/signin?x=1')
  await page.evaluate(([t, u]) => {
    sessionStorage.setItem('meterwise.token', t)
    sessionStorage.setItem('meterwise.user', JSON.stringify(u))
    sessionStorage.setItem('meterwise.signedInAt', String(Date.now()))
  }, [T[name], USERS[name]])
}
async function flatMenu(unit, item) {
  await page.getByRole('button', { name: `Actions for flat ${unit}` }).click()
  await page.getByRole('menuitem', { name: item }).click()
}
const settle = () => page.waitForLoadState('networkidle').catch(() => {})
const alertText = async () => (await page.locator('[role=alert]').allInnerTexts()).join(' | ')
async function confirmDialog(label) {
  const d = page.getByRole('alertdialog')
  await d.waitFor({ timeout: 5000 })
  await (label ? d.getByRole('button', { name: label }).last() : d.getByRole('button').last()).click()
}

// Pick a building that has no project yet, and find the strata and provider blocks.
let projects = await call(mgr, 'GET', '/api/programme/projects')
const buildings = (await call(null, 'GET', '/api/buildings')).features.map((f) => f.properties)
const used = new Set(projects.map((p) => p.building_id))
const fresh = buildings.filter((b) => !used.has(b.id)).sort((a, b) => b.quick_score - a.quick_score)
const target = fresh[0]
let pid = null
const orgs = await call(mgr, 'GET', '/api/programme/orgs')
const provider = orgs.find((o) => /community_housing|landlord/.test(o.kind)) ?? orgs[0]

// ======================================================================= project life cycle
await signInUi('manager')

await step('Create a project from a pilot building (screen)', async () => {
  await page.goto(`${BASE}/government/projects/new?b=${encodeURIComponent(target.id)}`)
  await page.getByRole('button', { name: /start the project|start project/i }).waitFor({ timeout: 15000 })
  await settle()
  await page.getByRole('combobox', { name: /Provider that owns the block/ }).click()
  await page.getByRole('option').first().click()
  await page.getByRole('button', { name: /start the project|start project/i }).click()
  await page.waitForURL(/\/government\/projects\/\d+/, { timeout: 20000 })
  pid = Number(page.url().match(/projects\/(\d+)/)[1])
  const p = await call(mgr, 'GET', `/api/programme/projects/${pid}`)
  must(p.stage === 'screened' && p.building_id === target.id, `stage ${p.stage}`)
  return `project ${pid} for ${p.label}`
})
must(pid, 'no project, cannot continue')
const proj = () => call(mgr, 'GET', `/api/programme/projects/${pid}`)

async function advanceUi(label) {
  await page.goto(`${BASE}/government/projects/${pid}`)
  const btn = page.getByRole('button', { name: new RegExp(`Move to ${label}`) })
  await btn.waitFor({ timeout: 15000 })
  await btn.click()
  await confirmDialog()
}

await step('Advance to Site check (screen)', async () => {
  await advanceUi('Site check')
  await page.waitForTimeout(1200)
  must((await proj()).stage === 'audit', 'stage did not change')
})

await step('Advance to Offer without a site audit shows unmet conditions as a list (screen, 409)', async () => {
  await advanceUi('Offer')
  await page.getByRole('alert').first().waitFor({ timeout: 8000 })
  const items = await page.locator('[role=alert] li').count()
  const text = await alertText()
  must(items >= 1, `no list items in the error: ${text.slice(0, 120)}`)
  must((await proj()).stage === 'audit', 'stage moved despite the guard')
  return `${items} unmet condition(s)`
})

await step('Save a site audit (screen)', async () => {
  await page.goto(`${BASE}/government/projects/${pid}/audit`)
  await page.getByRole('form', { name: 'Site audit form' }).waitFor({ timeout: 15000 })
  const f = page.getByRole('form', { name: 'Site audit form' })
  await f.getByLabel('Date of visit', { exact: true }).fill('2026-10-06')
  await f.getByLabel('Visited by').fill('E2E Inspector (example)')
  const flats = await f.getByLabel('Flats', { exact: true }).inputValue()
  await f.getByLabel('Flats', { exact: true }).fill(String(Number(flats) + 1))
  for (const [label, option] of [['Roof condition', 'Sound'], ['Roof colour now', 'Dark'], ['Hot water layout', 'A unit in each flat']]) {
    await f.getByRole('combobox', { name: label }).click()
    await page.getByRole('option', { name: option, exact: true }).click()
  }
  await f.getByLabel('Switchboard rating (amps)').fill('63')
  await f.getByRole('button', { name: /save/i }).click()
  await page.waitForTimeout(2500)
  const p = await proj()
  must(p.audit && p.audit.by.includes('E2E'), 'audit not saved')
  must((p.audit.changes ?? []).length >= 1, 'no changes from the open-data guess recorded')
  return `${p.audit.changes.length} change(s) from the guess`
})

await step('Advance to Offer, then Consent (screen)', async () => {
  await advanceUi('Offer')
  await page.waitForTimeout(3000)
  must((await proj()).stage === 'offer', `stage ${(await proj()).stage}: ${await alertText()}`)
  await advanceUi('Consent')
  await page.waitForTimeout(1500)
  must((await proj()).stage === 'consent', `stage ${(await proj()).stage}: ${await alertText()}`)
})

await step('Owner signs and tenants agree (owner by screen, flats by API)', async () => {
  await page.goto(`${BASE}/government/projects/${pid}/consent`)
  await settle()
  await page.getByLabel('Full name of the person signing').fill('E2E Asset Officer (example)')
  await page.getByRole('button', { name: 'Record signature' }).click()
  await confirmDialog()
  await page.waitForTimeout(1500)
  let p = await proj()
  must(p.consent.owner_signed, `owner not signed: ${await alertText()}`)
  for (const f of p.flats_list) await call(mgr, 'POST', `/api/programme/flats/${f.id}/consent`, { consent: 'agreed' })
  p = await proj()
  must(p.consent.tenants_agreed === p.consent.tenants_total, 'tenants not all agreed')
  return `${p.consent.tenants_agreed}/${p.consent.tenants_total} agreed`
})

await step('Advance to Quotes (procurement)', async () => {
  await advanceUi('Quotes')
  await page.waitForTimeout(1500)
  must((await proj()).stage === 'procurement', `stage ${(await proj()).stage}: ${await alertText()}`)
})

let quoteId = null
await step('Open a tender to installers (screen)', async () => {
  await page.goto(`${BASE}/government/projects/${pid}/quotes`)
  await settle()
  const boxes = page.getByRole('checkbox')
  await boxes.first().waitFor({ timeout: 10000 })
  const n = await boxes.count()
  for (let i = 0; i < n; i++) await boxes.nth(i).check()
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  await page.getByLabel('Tender closes on', { exact: true }).fill(d.toISOString().slice(0, 10))
  await page.getByRole('button', { name: /open (the )?tender/i }).click()
  if (await page.getByRole('alertdialog').count()) await confirmDialog()
  await page.waitForTimeout(1500)
  const t = await call(T.installer, 'GET', '/api/programme/tenders')
  must(t.some((x) => x.project.id === pid), `tender not visible to the installer: ${await alertText()}`)
})

await step('Installer submits a quote (API as installer)', async () => {
  const t = (await call(T.installer, 'GET', '/api/programme/tenders')).find((x) => x.project.id === pid)
  const valid = new Date()
  valid.setMonth(valid.getMonth() + 2)
  const q = await call(T.installer, 'POST', `/api/programme/projects/${pid}/quotes`, {
    items: t.items.map((i) => ({ key: i.key, label: i.label, qty: i.qty, unit_price: Math.round(i.modelled_unit_price * 0.97) })),
    valid_until: valid.toISOString().slice(0, 10),
    note: 'E2E quote (example)',
  })
  quoteId = q.id
  must(q.total > 0, 'empty quote')
  return `quote ${q.id}, ${Math.round(q.total)} against modelled ${Math.round(q.modelled_total)}`
})

await step('Accept the quote (screen)', async () => {
  await page.goto(`${BASE}/government/projects/${pid}/quotes`)
  await settle()
  await page.getByRole('button', { name: /accept/i }).first().click()
  await confirmDialog()
  await page.waitForTimeout(2500)
  const p = await proj()
  must(p.quotes.some((q) => q.id === quoteId && q.status === 'accepted'), `quote not accepted: ${await alertText()}`)
})

await step('Grant: manager requests (API), council approves (screen)', async () => {
  const p = await proj()
  const gap = Math.max(1000, Math.round(p.summary.funding_gap || 1000))
  const g = await call(mgr, 'POST', '/api/government/grants', { project_id: pid, requested: gap, reason: 'E2E: funding gap after capped charge' })
  try {
    await signInUi('council')
    await page.goto(`${BASE}/government/grants`)
    await settle()
    const row = page.getByRole('row').filter({ hasText: /Waiting for a decision/ }).filter({ hasText: `Project ${pid}` }).first()
    await row.getByRole('button', { name: 'Decide' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click()
    await confirmDialog()
    await page.waitForTimeout(1500)
  } catch (e) {
    if (process.env.DEBUG) await page.screenshot({ path: (process.env.SHOTS ?? '.') + '/grant.png' })
    throw e
  } finally {
    await signInUi('manager')
  }
  const list = await call(T.council, 'GET', '/api/government/grants')
  const mine = list.find((x) => x.id === g.id)
  must(mine && mine.status === 'approved', `grant status ${mine?.status}`)
  return `grant ${g.id} approved`
})

await step('Advance to Installation', async () => {
  await advanceUi('Installation')
  await page.waitForTimeout(1500)
  must((await proj()).stage === 'installation', `stage ${(await proj()).stage}: ${await alertText()}`)
})

await step('Create the work order (screen) and tick the checklist (one by screen, rest by API)', async () => {
  await page.goto(`${BASE}/government/projects/${pid}/installation`)
  await settle()
  const d = new Date()
  d.setDate(d.getDate() + 14)
  await page.getByLabel('Scheduled start', { exact: true }).fill(d.toISOString().slice(0, 10))
  await page.getByRole('button', { name: 'Create work order' }).click()
  if (await page.getByRole('alertdialog').count()) await confirmDialog()
  await page.waitForTimeout(1500)
  let p = await proj()
  must(p.work_order, `no work order: ${await alertText()}`)
  await page.goto(`${BASE}/government/projects/${pid}/installation`)
  await settle()
  await page.getByRole('checkbox').first().click()
  await page.waitForTimeout(1500)
  if (await page.getByRole('alertdialog').count()) await confirmDialog()
  p = await proj()
  for (const c of p.work_order.checklist) if (!c.done) await call(mgr, 'POST', `/api/programme/work-orders/${p.work_order.id}/checklist`, { key: c.key, done: true })
  p = await proj()
  must(p.work_order.checklist.every((c) => c.done), 'checklist not complete')
  return `${p.work_order.checklist.length} items done`
})

await step('Advance to Commissioned, then Active with a start month (screen)', async () => {
  await advanceUi('Commissioned')
  await page.waitForTimeout(1500)
  must((await proj()).stage === 'commissioned', `stage ${(await proj()).stage}: ${await alertText()}`)
  await page.goto(`${BASE}/government/projects/${pid}`)
  const m = page.getByLabel('Start month for charges')
  await m.waitFor({ timeout: 10000 })
  const clock = await call(mgr, 'GET', '/api/sim/clock')
  await m.fill(clock.month)
  await page.getByRole('button', { name: /Move to Active/ }).click()
  await confirmDialog()
  await page.waitForTimeout(2000)
  const p = await proj()
  must(p.stage === 'active', `stage ${p.stage}: ${await alertText()}`)
  return `active, start month ${clock.month}`
})

// ======================================================================= running the charge
let flat = null
await step('Record a payment against a flat (screen)', async () => {
  flat = (await proj()).flats_list.find((f) => f.consent === 'agreed') ?? (await proj()).flats_list[0]
  await page.goto(`${BASE}/government/projects/${pid}/flats`)
  await settle()
  await flatMenu(flat.unit, 'Record a payment')
  const dlg = page.getByRole('dialog').first()
  await dlg.getByLabel('Amount (dollars)').fill('25')
  await dlg.getByRole('button', { name: 'Record payment' }).click()
  await confirmDialog()
  await page.waitForTimeout(1500)
  const led = await call(mgr, 'GET', `/api/programme/flats/${flat.id}/ledger`)
  must(led.some((e) => e.kind === 'payment' && Math.abs(Math.round(e.amount)) === 25), `no $25 payment in the ledger (kinds ${led.map((e) => e.kind + ':' + e.amount).join(',')}): ${await alertText()} ${await page.getByRole('dialog').allInnerTexts().then((t) => t.join(' ').slice(-200))}`)
})

let faultId = null
await step('Tenant reports a fault, manager resolves it (report by API as tenant, resolve by screen)', async () => {
  const code = (await proj()).flats_list.find((f) => f.id === flat.id).access_code
  const tl = await call(null, 'POST', '/api/auth/tenant', { code })
  const f = await call(tl.token, 'POST', `/api/programme/flats/${flat.id}/faults`, { item: 'heat_pump_hot_water', description: 'E2E: no hot water' })
  faultId = f.id
  must(f.charge_paused, 'charge not paused by the fault')
  await page.goto(`${BASE}/government/faults`)
  await settle()
  const row = page.getByRole('row').filter({ hasText: 'E2E: no hot water' }).first()
  await row.getByRole('button', { name: /Resolve fault/ }).click()
  const dlg = page.getByRole('dialog').first()
  await dlg.getByLabel('What was done').fill('Replaced the controller (example)')
  await dlg.getByRole('button', { name: 'Mark as fixed' }).click()
  await page.waitForTimeout(1500)
  const faults = await call(mgr, 'GET', `/api/programme/faults?project_id=${pid}`)
  must(faults.find((x) => x.id === faultId)?.status === 'resolved', `fault not resolved: ${await alertText()}`)
})

await step('Tenancy change on a flat (screen)', async () => {
  await page.goto(`${BASE}/government/projects/${pid}/flats`)
  await settle()
  await flatMenu(flat.unit, 'Change tenant')
  const dlg = page.getByRole('dialog').first()
  await dlg.getByLabel("New tenant's name").fill('E2E New Tenant (example)')
  const clock = await call(mgr, 'GET', '/api/sim/clock')
  await dlg.getByLabel('Move-in date', { exact: true }).fill(`${clock.month}-20`)
  await dlg.getByRole('button', { name: 'Change tenant' }).click()
  await confirmDialog()
  await page.waitForTimeout(1500)
  const f2 = (await proj()).flats_list.find((f) => f.id === flat.id)
  must(f2.tenant_name?.includes('E2E New Tenant'), `tenant is ${f2.tenant_name}: ${await alertText()}`)
  must(f2.access_code && f2.access_code !== flat.access_code, 'no new access code')
  flat = f2
  return 'charge stays with the meter, new access code issued'
})

await step('Tenant gives and withdraws meter-data consent on their own page (screen)', async () => {
  const ctx2 = await browser.newContext({ viewport: { width: 360, height: 800 } })
  const tp = await ctx2.newPage()
  await tp.goto(BASE + '/signin')
  await tp.getByRole('textbox', { name: 'Access code' }).fill(flat.access_code)
  await tp.getByRole('button', { name: 'See my flat' }).click()
  await tp.waitForURL(/my-flat/, { timeout: 15000 })
  await tp.getByRole('button', { name: /I agree to share my meter data/ }).click()
  await tp.getByText(/You have agreed/).waitFor({ timeout: 8000 })
  const d1 = await call(mgr, 'GET', `/api/programme/flats/${flat.id}/data-consent`)
  must(d1.active, 'server does not show consent as active')
  must(await tp.getByText(/Your consent ends on/).count(), 'expiry not shown')
  must(await tp.getByText('What it covers').count(), 'scope not shown')
  await tp.getByRole('button', { name: /Withdraw my consent/ }).click()
  await tp.getByRole('alertdialog').getByRole('button', { name: 'Withdraw' }).click()
  await tp.getByText(/You have not agreed/).waitFor({ timeout: 8000 })
  const d2 = await call(mgr, 'GET', `/api/programme/flats/${flat.id}/data-consent`)
  must(!d2.active, 'server still shows consent after withdrawal')
  await tp.getByRole('button', { name: /I agree to share my meter data/ }).click()
  await tp.getByText(/You have agreed/).waitFor({ timeout: 8000 })
  await ctx2.close()
  return 'given, expiry and scope shown, withdrawn, given again'
})

await step('Manager records meter-data consent on a flat sheet with a note (screen), government tab shows it', async () => {
  const other = (await proj()).flats_list.find((f) => f.id !== flat.id)
  await page.goto(`${BASE}/government/projects/${pid}/flats`)
  await settle()
  await flatMenu(other.unit, 'Ledger and details')
  const sheet = page.getByRole('dialog').first()
  await sheet.getByLabel(/How did the tenant give consent/).fill('Signed form on 3 March (example)')
  await sheet.getByRole('button', { name: 'Record consent' }).click()
  await sheet.getByText('Given', { exact: true }).first().waitFor({ timeout: 8000 })
  const c = await call(mgr, 'GET', `/api/programme/flats/${other.id}/data-consent`)
  must(c.active, 'not active on the server')
})

await step('Personal data export and erase on a flat sheet (screen)', async () => {
  await page.goto(`${BASE}/government/projects/${pid}/flats`)
  await settle()
  await flatMenu(flat.unit, 'Ledger and details')
  const sheet = page.getByRole('dialog').first()
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), sheet.getByRole('button', { name: 'Export personal data' }).click()])
  const body = readFileSync(await dl.path(), 'utf8')
  must(JSON.parse(body).flat_id === flat.id, 'export is not for this flat')
  await sheet.getByRole('button', { name: 'Erase personal data' }).click()
  await confirmDialog('Erase')
  await sheet.getByText(/former tenancy record/).waitFor({ timeout: 8000 })
  return 'export downloaded, erase confirmed (the previous tenant name becomes "Former tenant")'
})

await step('Billing run for the month and CSV export (screen)', async () => {
  await page.goto(`${BASE}/government/billing`)
  await settle()
  await page.getByRole('button', { name: /run billing/i }).click()
  await confirmDialog()
  await page.getByText(/flats billed/i).first().waitFor({ timeout: 15000 })
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: /csv|export|download/i }).first().click()])
  const text = readFileSync(await dl.path(), 'utf8')
  must(text.split('\n').length > 2, 'CSV has no rows')
  return `${text.split('\n').length - 1} CSV lines`
})

await step('Demo clock: advance 3 months (screen)', async () => {
  await page.goto(`${BASE}/government/overview`)
  await settle()
  const before = (await call(mgr, 'GET', '/api/sim/clock')).month
  await page.getByRole('button', { name: /advance 3 months/i }).click()
  if (await page.getByRole('alertdialog').count()) await confirmDialog()
  await page.getByText(/Moved to/).waitFor({ timeout: 90000 })
  const after = (await call(mgr, 'GET', '/api/sim/clock')).month
  must(after !== before, 'clock did not move')
  return `${before} to ${after}`
})

await step('Utility readings upload with a rejected row for a meter without consent (screen)', async () => {
  const p = await proj()
  const month = (await call(mgr, 'GET', '/api/sim/clock')).month
  const noConsent = []
  const withConsent = []
  for (const f of p.flats_list) {
    const c = await call(mgr, 'GET', `/api/programme/flats/${f.id}/data-consent`)
    if (c.active) withConsent.push(f)
    else noConsent.push(f)
  }
  must(noConsent.length > 0 && withConsent.length > 0, `need one flat with and one without consent (have ${withConsent.length} with, ${noConsent.length} without)`)
  const csv = `meter_id,month,electricity_kwh,gas_mj\n${withConsent[0].meter_id},${month},210,0\n${noConsent[0].meter_id},${month},180,0\nNMI-NOT-A-METER,${month},100,0\n`
  const consentRows = []
  await ctx.clearCookies()
  await signInUi('distributor')
  await page.goto(`${BASE}/utility/readings`)
  await settle()
  const ta = page.getByRole('textbox', { name: /paste|csv/i }).first()
  await ta.fill(csv)
  await page.getByRole('button', { name: /upload|send|check|submit/i }).first().click()
  if (await page.getByRole('alertdialog').count()) await confirmDialog()
  await page.getByText(/accepted/i).first().waitFor({ timeout: 15000 })
  const txt = await page.locator('main').innerText()
  must(/rejected/i.test(txt) && /no current data consent/i.test(txt), 'no "no current data consent" rejection shown')
  must(/NOT-A-METER/.test(txt), 'unknown meter row not listed')
  void consentRows
  return 'accepted and rejected rows reported'
})

await step('Utility remittance with a mismatch report (screen)', async () => {
  const meters = await call(T.distributor, 'GET', '/api/utility/meters')
  const m = meters.find((x) => x.charge_status === 'active') ?? meters[0]
  const month = (await call(mgr, 'GET', '/api/sim/clock')).month
  await page.goto(`${BASE}/utility/charges`)
  await settle()
  const ta = page.getByRole('textbox', { name: /remittance|paste|csv|rows/i }).last()
  await ta.fill(`meter_id,amount\n${m.meter_id},${(m.charge_per_month * 0.5).toFixed(2)}\n`)
  const mo = page.getByLabel(/month/i).last()
  await mo.fill(month).catch(() => {})
  await page.getByRole('button', { name: /remittance|post|record/i }).last().click()
  if (await page.getByRole('alertdialog').count()) await confirmDialog()
  await page.getByText(/mismatch/i).first().waitFor({ timeout: 15000 })
})

await step('Run measured savings on an active project (screen)', async () => {
  await signInUi('manager')
  const active = (await call(mgr, 'GET', '/api/programme/projects')).filter((p) => p.stage === 'active').map((p) => p.id)
  const target2 = active.find((id) => id !== pid) ?? active[0]
  await page.goto(`${BASE}/government/projects/${target2}/savings`)
  await settle()
  const clock = (await call(mgr, 'GET', '/api/sim/clock')).month
  const from = `${Number(clock.slice(0, 4)) - 1}-${clock.slice(5)}`
  await page.getByLabel('First month').fill(from)
  await page.getByLabel('Last month').fill(clock)
  await page.getByRole('button', { name: 'Run check' }).click()
  await confirmDialog()
  await page.waitForTimeout(3000)
  const mv = await call(mgr, 'GET', `/api/programme/projects/${target2}/mv`)
  must(mv.length >= 1, `no measured savings run: ${await alertText()}`)
  return `project ${target2}: ${mv.length} run(s)`
})

await step('Reserve top-up (screen)', async () => {
  const before = (await call(mgr, 'GET', '/api/programme/reserve')).balance
  await page.goto(`${BASE}/government/reserve`)
  await settle()
  await page.getByLabel(/Amount/).fill('500')
  await page.getByRole('button', { name: /^top up$/i }).click()
  await confirmDialog('Top up')
  await page.waitForTimeout(1500)
  const after = (await call(mgr, 'GET', '/api/programme/reserve')).balance
  must(Math.round(after - before) === 500, `balance ${before} to ${after}: ${await alertText()}`)
})

await step('Portfolio planner and create projects for the selection (screen)', async () => {
  const n0 = (await call(mgr, 'GET', '/api/programme/projects')).length
  await page.goto(`${BASE}/government/planner`)
  await settle()
  await page.getByRole('button', { name: /plan the portfolio|plan/i }).first().click()
  await page.getByText(/Chosen blocks|blocks chosen/i).first().waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: /start \d+ project|create .*project/i }).first().click()
  await confirmDialog()
  await page.waitForTimeout(8000)
  const n1 = (await call(mgr, 'GET', '/api/programme/projects')).length
  must(n1 > n0, `no new projects (${n0} to ${n1}): ${await alertText()}`)
  return `${n1 - n0} project(s) created`
})

let enquiryId = null
await step('Landlord enquiry submitted on the public form (screen)', async () => {
  const ctx3 = await browser.newContext()
  const ep = await ctx3.newPage()
  await ep.goto(BASE + '/enquiry')
  await ep.getByLabel('Your name').fill('E2E Landlord (example)')
  await ep.getByLabel('Email address').fill('e2e@example.org')
  await ep.getByRole('combobox', { name: /You are a/ }).click()
  await ep.getByRole('option', { name: 'Landlord' }).click()
  await ep.getByLabel('Address of the block').fill('12 Example Street, Penrith')
  await ep.getByLabel('Number of flats').fill('8')
  await ep.getByRole('button', { name: 'Send enquiry' }).click()
  await ep.getByText('Enquiry received').waitFor({ timeout: 10000 })
  await ctx3.close()
  const list = await call(mgr, 'GET', '/api/programme/enquiries')
  const e = list.find((x) => x.name?.includes('E2E Landlord'))
  must(e, 'enquiry not listed for the manager')
  enquiryId = e.id
})

await step('Convert the enquiry to a project (screen)', async () => {
  const n0 = (await call(mgr, 'GET', '/api/programme/projects')).length
  await page.goto(`${BASE}/government/enquiries`)
  await settle()
  const row = page.getByRole('row').filter({ hasText: 'E2E Landlord' }).first()
  await row.getByRole('button', { name: /convert|start/i }).click()
  if (await page.getByRole('alertdialog').count()) await confirmDialog()
  await page.waitForTimeout(3000)
  const n1 = (await call(mgr, 'GET', '/api/programme/projects')).length
  must(n1 === n0 + 1, `projects ${n0} to ${n1}: ${await alertText()}`)
  void enquiryId
})

// ======================================================================= strata block
await step('Strata resolution recorded on the strata user block (screen)', async () => {
  // set up a strata-owned block at the consent stage (the seeded strata block is already past consent)
  const strataOrg = orgs.find((o) => o.kind === 'strata')
  must(strataOrg, 'no strata organisation in the seed')
  const taken = new Set((await call(mgr, 'GET', '/api/programme/projects')).map((x) => x.building_id))
  const b2 = buildings.filter((b) => !taken.has(b.id)).sort((x, y) => y.quick_score - x.quick_score)[0]
  const np = await call(mgr, 'POST', '/api/programme/projects', { building_id: b2.id, owner_org_id: strataOrg.id })
  await call(mgr, 'POST', `/api/programme/projects/${np.id}/advance`, { to: 'audit' })
  await call(mgr, 'PUT', `/api/programme/projects/${np.id}/audit`, { visited_on: '2026-10-06', by: 'E2E', storeys: np.building.storeys, flats: np.building.flats, roof_m2: np.building.roof_m2, roof_condition: 'sound', roof_colour: 'dark', switchboard_amps: 63, hot_water_layout: 'per_flat', gas_meters: np.building.flats, notes: '' })
  await call(mgr, 'POST', `/api/programme/projects/${np.id}/advance`, { to: 'offer' })
  await call(mgr, 'POST', `/api/programme/projects/${np.id}/advance`, { to: 'consent' })
  await signInUi('strata')
  const blk = { id: np.id }
  await page.goto(`${BASE}/property/blocks/${blk.id}/consent`)
  await settle()
  await page.getByRole('button', { name: 'Record resolution and sign' }).click()
  const dlg = page.getByRole('dialog').first()
  await dlg.getByLabel('Name of the person signing for the committee').fill('E2E Chair (example)')
  await dlg.getByLabel('Meeting date', { exact: true }).fill('2026-09-30')
  await dlg.getByLabel('Votes for', { exact: true }).fill('12')
  await dlg.getByLabel('Votes against', { exact: true }).fill('2')
  const review = dlg.getByRole('button', { name: /^(review|continue)/i })
  if (await review.count()) await review.first().click()
  await dlg.getByRole('button', { name: 'Record and sign' }).click()
  await page.waitForTimeout(2000)
  const p = await call(T.strata, 'GET', `/api/programme/projects/${blk.id}`)
  must(p.consent.owner_signed, `not signed: ${await alertText()}`)
})

await browser.close()

// ======================================================================= summary
const pass = results.filter((r) => r.ok).length
console.log(`\n${pass} of ${results.length} steps passed.`)
if (consoleErrors.length) console.log(`Console errors seen (${consoleErrors.length}): ${[...new Set(consoleErrors)].slice(0, 5).join(' || ')}`)
for (const r of results.filter((x) => !x.ok)) console.log(`  FAILED: ${r.name} - ${r.why}`)
process.exit(results.some((r) => !r.ok) ? 1 : 0)
