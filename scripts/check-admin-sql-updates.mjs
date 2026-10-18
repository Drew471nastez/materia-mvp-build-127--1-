/** Local production smoke: start with placeholder services and BLOG_ADMIN_SECRET=local-admin-sql-validation-only. */
import assert from "node:assert/strict"
import { createHash, createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import puppeteer from "puppeteer-core"

const base = process.env.LOCAL_SQL_BASE || "http://127.0.0.1:3105"
assert.equal(new URL(base).hostname, "127.0.0.1", "this fixture credential must never leave loopback")
assert.equal((await fetch(`${base}/api/admin/sql-updates`)).status, 401)
const issued = Date.now().toString(36), nonce = "local-validation"
const signature = createHmac("sha256", "local-admin-sql-validation-only").update(`blog-admin.${issued}.${nonce}`).digest("hex")
const token = `v2.${issued}.${nonce}.${signature}`
const headers = { Cookie: `blog_admin=${token}` }
const response = await fetch(`${base}/api/admin/sql-updates`, { headers })
assert.equal(response.status, 200)
assert.match(response.headers.get("cache-control"), /no-store/)
const report = await response.json()
const catalog = JSON.parse(readFileSync("lib/admin/sql-catalog.generated.json", "utf8"))
assert.equal(report.revision, createHash("sha256").update(catalog.map(row => `${row.id}:${row.file}:${row.sha256}:${row.manual}`).join("\n")).digest("hex"))
assert(report.updates.find(row => row.id === "61").manual)
assert.equal(report.ledgerReady, false, "placeholder services cannot supply real execution history")
assert(report.updates.filter(row => !row.manual).every(row => row.state === "unknown"))
const regular = report.updates.filter(row => !row.manual)
const exportResponse = await fetch(`${base}/api/admin/sql-updates?revision=${report.revision}&files=${regular[0].id},${regular[1].id}`, { headers })
assert.equal(exportResponse.status, 200)
const exported = await exportResponse.text()
assert.match(exported, /COMMIT;\n$/)
assert(exported.includes("VALUES ('67', '67_applied_parts.sql'"))
assert.equal((await fetch(`${base}/api/admin/sql-updates?files=${regular[0].id}&revision=old`, { headers })).status, 409)
assert.equal((await fetch(`${base}/api/admin/sql-updates?revision=${report.revision}&files=../../secrets`, { headers })).status, 400)
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
try {
  await browser.setCookie({ name: "blog_admin", value: token, domain: "127.0.0.1", path: "/", httpOnly: true })
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  await page.setViewport({ width: 1440, height: 1000 })
  await page.goto(`${base}/admin/sql-updates`, { waitUntil: "networkidle2", timeout: 120000 })
  await page.waitForSelector('input[type="checkbox"]')
  assert((await page.$eval("h1", node => node.textContent)).includes("SQL updates"))
  await page.click('input[type="checkbox"]')
  await page.evaluate(() => [...document.querySelectorAll("button")].find(button => button.textContent === "Copy full SQL").click())
  await page.waitForSelector('textarea[aria-label="Full selected SQL"]')
  assert.match(await page.$eval("textarea", node => node.value), /COMMIT;\n$/)
  await page.screenshot({ path: "/tmp/storelib-sql-desktop.png", fullPage: false })
  await page.setViewport({ width: 390, height: 844 })
  await page.screenshot({ path: "/tmp/storelib-sql-mobile.png", fullPage: false })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no mobile horizontal overflow")
  await page.click('input[type="search"]')
  await page.type('input[type="search"]', "92_site_password")
  await page.waitForFunction(() => document.querySelectorAll('input[type="checkbox"]').length === 1)
  assert((await page.$eval('input[type="checkbox"]', node => node.parentElement.textContent)).includes("92_site_password"))
  assert.deepEqual(errors, [])
  console.log(`Admin SQL browser/API checks passed: auth, no-store, ${report.updates.length} source files, safe exports, stale revision rejection, selection/copy, search, 390px layout, no browser errors.`)
} finally { await browser.close() }
