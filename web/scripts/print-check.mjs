// Checks the notice strip is present in print emulation on the offer sheet. Usage: node scripts/print-check.mjs <baseUrl> <path> <out.png>
import { chromium } from 'playwright-core'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const [base, path, out] = process.argv.slice(2)
function findChrome() {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  for (const d of readdirSync(root)) {
    const p = join(root, d, 'chrome-win64', 'chrome.exe')
    if (d.startsWith('chromium-') && existsSync(p)) return p
  }
}
const browser = await chromium.launch({ executablePath: findChrome(), headless: true })
const page = await (await browser.newContext({ viewport: { width: 900, height: 1100 } })).newPage()
await page.goto(base + path)
await page.waitForTimeout(2500)
await page.emulateMedia({ media: 'print' })
const notice = page.locator('.mw-demo-notice--top')
console.log('top notice visible in print:', await notice.isVisible(), '|', (await notice.innerText()).slice(0, 60))
console.log('footer notice count:', await page.locator('.mw-demo-notice--footer').count(), 'visible:', await page.locator('.mw-demo-notice--footer').isVisible())
await page.screenshot({ path: out })
await browser.close()
