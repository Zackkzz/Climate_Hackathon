// Accessibility check: signs in (demo account), visits each path and runs axe with WCAG 2.2 AA rules.
// Usage: node scripts/axe.mjs <baseUrl> <demoEmail|public|tenant:CODE> <path> [<path>...] [--mobile]
// Prints violations of any impact, serious and critical first. Exit code 1 if any serious or critical.
import { chromium } from 'playwright-core'
import AxeBuilder from '@axe-core/playwright'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const [base, who, ...rest] = process.argv.slice(2)
const mobile = rest.includes('--mobile')
const paths = rest.filter((p) => !p.startsWith('--'))
if (!base || !who || paths.length === 0) {
  console.error('usage: node scripts/axe.mjs <baseUrl> <email|public|tenant:CODE> <path>... [--mobile]')
  process.exit(2)
}

function findChrome() {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  if (!existsSync(root)) return undefined
  for (const d of readdirSync(root)) {
    if (!d.startsWith('chromium-')) continue
    const p = join(root, d, 'chrome-win64', 'chrome.exe')
    if (existsSync(p)) return p
  }
  return undefined
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const ctx = await browser.newContext({ viewport: mobile ? { width: 320, height: 800 } : { width: 1280, height: 900 } })
const page = await ctx.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 200)))

if (who !== 'public') {
  await page.goto(base + '/signin')
  await page.waitForSelector('h1')
  if (who.startsWith('tenant:')) {
    await page.getByRole('textbox', { name: 'Access code' }).fill(who.slice(7))
    await page.getByRole('button', { name: 'See my flat' }).click()
  } else {
    // use the form with the demo password for the chosen account
    await page.getByLabel('Email address').fill(who)
    await page.getByLabel('Password').fill(process.env.DEMO_PASSWORD ?? 'demo')
    await page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
  }
  await page.waitForTimeout(1500)
}

let bad = 0
for (const p of paths) {
  await page.goto(base + p)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1200)
  const alerts = await page.locator('[role=alert]').allInnerTexts()
  if (alerts.length) console.log('  ALERTS: ' + alerts.map((a) => a.replace(/\s+/g, ' ').slice(0, 160)).join(' | '))
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 }
  const v = res.violations.sort((a, b) => order[a.impact] - order[b.impact])
  const hard = v.filter((x) => x.impact === 'serious' || x.impact === 'critical')
  bad += hard.length
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  console.log(`\n${p}  [${await page.title()}]  violations: ${v.length} (serious/critical: ${hard.length})${mobile ? '  reflow overflow: ' + overflow : ''}`)
  if (errs.length) { console.log('  console errors: ' + errs.length); for (const e of [...new Set(errs)].slice(0, 5)) console.log('    ' + e); errs.length = 0 }
  for (const x of v) {
    console.log(`  - ${x.impact}: ${x.id}: ${x.help} (${x.nodes.length} nodes)`)
    for (const n of x.nodes.slice(0, 2)) console.log(`      ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1] ?? ''}`)
  }
}
await browser.close()
process.exit(bad ? 1 : 0)
