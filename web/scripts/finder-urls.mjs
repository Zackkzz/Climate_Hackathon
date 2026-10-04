// Prints the URLs of the finder's Build and Share steps for one block, for axe and screenshots.
// Usage: node scripts/finder-urls.mjs <baseUrl>
import { chromium } from 'playwright-core'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const base = process.argv[2]
function findChrome() {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  for (const d of readdirSync(root)) {
    const p = join(root, d, 'chrome-win64', 'chrome.exe')
    if (d.startsWith('chromium-') && existsSync(p)) return p
  }
}
const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
await page.goto(base + '/finder')
await page.getByRole('table').first().waitFor()
await page.getByRole('table').first().locator('tbody a, tbody button').first().click()
await page.waitForTimeout(800)
console.log((await page.getByRole('button').allInnerTexts()).join(' | ').slice(0, 600))
const btn = page.getByRole('button', { name: /build|deal/i }).filter({ hasNotText: /^2\./ }).first()
if (await btn.count()) await btn.click()
await page.waitForTimeout(1500)
console.log('BUILD', page.url().replace(base, ''))
await page.getByRole('button', { name: /3\. Share it/ }).click().catch(() => {})
await page.waitForTimeout(1500)
console.log('SHARE', page.url().replace(base, ''))
await browser.close()
