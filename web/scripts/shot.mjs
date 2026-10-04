// Screenshots for a visual check. Usage: node scripts/shot.mjs <baseUrl> <email|public> <outDir> <width> <path>...
// Signs in once with the demo password (public pages need no sign-in). Also prints console errors, including CSP violations.
import { chromium } from 'playwright-core'
import { existsSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [base, who, out, width, ...paths] = process.argv.slice(2)
function findChrome() {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  if (!existsSync(root)) return undefined
  for (const d of readdirSync(root)) {
    const p = join(root, d, 'chrome-win64', 'chrome.exe')
    if (d.startsWith('chromium-') && existsSync(p)) return p
  }
}
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 } })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 300)) })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)))
if (who !== 'public') {
  await page.goto(base + '/signin')
  await page.getByLabel('Email address').fill(who)
  await page.getByLabel('Password').fill('Penrith-demo-2026!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
  await page.waitForTimeout(2000)
}
for (const p of paths) {
  await page.goto(base + p)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(out, p.replace(/[^a-z0-9]+/gi, '_') + '.png'), fullPage: false })
  console.log('shot', p)
}
await browser.close()
