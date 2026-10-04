// Debug helper: node scripts/dbg.mjs <baseUrl> <email> <path> <js expression run in the page>
import { chromium } from 'playwright-core'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const [base, who, path, expr] = process.argv.slice(2)
function findChrome() {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  for (const d of readdirSync(root)) {
    const p = join(root, d, 'chrome-win64', 'chrome.exe')
    if (d.startsWith('chromium-') && existsSync(p)) return p
  }
}
const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const page = await (await browser.newContext({ viewport: { width: Number(process.env.W ?? 1280), height: 900 } })).newPage()
await page.goto(base + '/signin')
await page.getByLabel('Email address').fill(who)
await page.getByLabel('Password').fill('Penrith-demo-2026!')
await page.getByRole('button', { name: 'Sign in', exact: true }).first().click()
await page.waitForTimeout(1500)
await page.goto(base + path)
await page.waitForTimeout(1500)
console.log(JSON.stringify(await page.evaluate(expr), null, 1))
await browser.close()
