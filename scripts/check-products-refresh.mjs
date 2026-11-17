/** Products toolbar, filters, creation and link import at phone and desktop widths.
 * Run: CHROMIUM_PATH=/path/to/chromium node scripts/check-products-refresh.mjs
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
const root = process.cwd()
const executablePath = process.env.CHROMIUM_PATH || await chromium.executablePath()
execFileSync(process.execPath, ['scripts/check-products-sheets.mjs'], { stdio: 'inherit', env: { ...process.env, CHROMIUM_PATH: executablePath, BUILD_ONLY: '1', KEEP: '1', PROBE_FONT: 'fallback' } })
import assert from 'node:assert/strict'
const browser = await puppeteer.launch({executablePath,args:['--no-sandbox','--disable-gpu','--allow-file-access-from-files']})
let assertions = 0
const check = (value, label) => { assert.ok(value, label); assertions++; console.log(`ok ${label}`) }
const sleep = ms => new Promise(r=>setTimeout(r,ms))
try {
 for (const width of [360, 390, 1280]) {
  const page = await browser.newPage()
  await page.setViewport({width,height:844,isMobile:width<768,hasTouch:width<768,deviceScaleFactor:1})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`file://${join(root, ".products-sheets-probe/index.html")}#many-physical`)
  await page.waitForSelector('[data-products-list]')
  check(await page.$eval('[data-new-product]',e=>e.textContent.trim())==='Add',`${width}: Add label`)
  check(await page.$eval('[data-export]',e=>parseFloat(getComputedStyle(e).borderRadius)>=e.clientHeight/2),`${width}: circular export`)
  check(await page.$$eval('[data-views]',els=>els.length===0),`${width}: no status tabs`)
  check(await page.$$eval('[data-list] [data-meta]',els=>!els.some(e=>e.textContent.includes('Active'))),`${width}: no Active badges`)
  await page.click('[data-search-open]');await page.waitForSelector('[data-search] input')
  check(await page.$eval('[data-search] input',e=>document.activeElement===e),`${width}: search focused`)
  await page.type('[data-search] input','Product 10');await sleep(200)
  check(await page.$$eval('[data-list] [data-row]:not([hidden])',els=>els.length===1),`${width}: search filters products`)
  await page.click('[data-search-cancel]');await sleep(200)
  check(await page.$$eval('[data-search] input',els=>els.length===0),`${width}: back closes and clears search`)
  await page.click('[data-product-filters]');await sleep(450)
  const dialog = await page.$('[role=dialog]')
  check(!!dialog,`${width}: filter sheet/dialog opens`)
  await page.evaluate(()=>{const e=[...document.querySelectorAll('label')].find(e=>e.textContent.trim()==='Draft');e.click()})
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Apply filters').click())
  await sleep(550)
  const statuses = await page.$$eval('[data-list] [data-row]:not([hidden]) [data-meta]',els=>els.map(e=>e.textContent))
  check(statuses.length>0 && statuses.every(e=>e.includes('Draft')),`${width}: Apply filters shows drafts`)
  await page.click('[data-product-filters]');await sleep(450)
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Reset').click());await sleep(550)
  check(await page.$$eval('[data-list] [data-row]:not([hidden])',els=>els.length===50),`${width}: reset restores paginated catalogue`)
  await page.click('[data-new-product]');await sleep(450)
  check(await page.$$eval('[data-new-product-chooser]',els=>els.length===1),`${width}: creation sheet opens`)
  check(await page.$eval('[data-new-product-chooser]',e=>e.textContent.includes('Create new product')),`${width}: creation heading`)
  check(await page.$$eval('[data-kind-list] [data-kind] > span',els=>!els.some(e=>e.textContent.includes('Files people'))),`${width}: no card subheadings`)
  await page.click('[data-import-products]');await page.waitForSelector('[data-link-import]')
  check(await page.$eval('[data-link-import]',e=>!!e.querySelector('input[type=url]')),`${width}: import subpage accepts a link`)
  await page.evaluate(() => {
    window.fetch = async (_url, init) => {
      const body = JSON.parse(init.body)
      return new Response(JSON.stringify(body.action === 'preview' ? {
        product: { source: 'gumroad', title: 'A preset pack', images: [], priceCents: 1999, currency: 'USD', variants: [], type: 'digital', warnings: ['Download files need to be uploaded in the editor.'] }, storeCurrency: 'USD'
      } : { status: 'imported', productId: 'imported-product', imagesFailed: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  })
  await page.type('input[type=url]', 'https://seller.gumroad.com/l/presets')
  await page.evaluate(() => document.querySelector('[data-link-import] form').requestSubmit())
  await page.waitForFunction(() => document.querySelector('[data-link-import]')?.textContent.includes('A preset pack'))
  check(await page.$eval('[data-link-import] select', e => e.value) === 'digital', `${width}: imported type is selected`)
  await page.select('[data-link-import] select', 'course')
  await page.evaluate(() => [...document.querySelectorAll('[data-link-import] button')].find(e => e.textContent.trim() === 'Import as draft').click())
  await page.waitForFunction(() => document.querySelector('[data-link-import] [role=status]')?.textContent.includes('1 images'))
  check(await page.$eval('[data-link-import] [role=status]', e => e.textContent.includes('could not be copied')), `${width}: partial image copies are reported before opening the draft`)
  await page.evaluate(()=>[...document.querySelectorAll('[data-link-import] button')].find(e=>e.textContent.trim()==='Back').click())
  await page.waitForSelector('[data-kind-list]')
  check(await page.$$eval('[data-link-import]',els=>els.length===0),`${width}: import Back restores choices`)
  check(await page.$$eval('[data-kind=physical]', els => els.length === 1), `${width}: physical product remains available when enabled`)
  if (process.env.SHOTS_DIR) await page.screenshot({path:join(process.env.SHOTS_DIR, `products-create-${width}.png`)})
  check(!errors.length,`${width}: no browser errors: ${errors.join('; ')}`)
  await page.close()
 }
 console.log(`${assertions} browser assertions passed`)
} finally {await browser.close(); rmSync(join(root, '.products-sheets-probe'), {recursive:true, force:true})}
