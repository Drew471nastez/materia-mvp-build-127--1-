/**
 * ===========================================================================
 *  THE ADJUST WINDOW, MEASURED (round V)
 * ===========================================================================
 * scripts/render-inventory-adjust.tsx mounts the real Inventory page. This
 * answers /api/physical/inventory with three variants at two locations, then
 * at 390x844 (a phone: the app's sheet) and 1280x800 (a dialog):
 *
 *   BOX      the window's or the sheet's box against the viewport
 *   FIELDS   the height of every control (location, the three modes, the
 *            quantity with its minus and plus, reason, note, the settings'
 *            fields), that the quantity and the reason sit on one line at
 *            one height, the steppers the field's own height, and that
 *            nothing scrolls sideways
 *   PREVIEW  Add 5 to 12 on hand shows 17, Set to 1 with 2 committed warns
 *            that a sold unit won't be on the shelf, Remove 13 says only 12
 *            on hand and Save stays off
 *   SAVE     the body the server got: variant, location, mode, quantity,
 *            reason, note and a key
 *
 *   node scripts/check-inventory-adjust.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const work = mkdtempSync(join(tmpdir(), "inventory-adjust-"))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(work, "sonner.js"), `const say = (kind) => (m) => { (window.__toasts ||= []).push(kind + ": " + m) }\nexport const toast = Object.assign(say("info"), { error: say("error"), success: say("success") })\nexport const Toaster = () => null\n`)
writeFileSync(join(work, "link.js"), `import React from "react"\nexport default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }\n`)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-inventory-adjust.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(work, "app.js")}`,
  '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"',
  "--define:process.env.NEXT_PUBLIC_SUPABASE_URL=undefined", "--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=undefined",
  `--alias:sonner=${join(work, "sonner.js")}`, `--alias:next/link=${join(work, "link.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
const css = await appCss(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${css}</style><style>body{margin:0;background:#f8f9fa}</style></head><body><div id="app"></div>` +
  `<script>window.process={env:{NODE_ENV:"production"}};window.__err=[];addEventListener("error",e=>__err.push(String(e.message)))</script>` +
  `<script src="/app.js"></script></body></html>`

const L1 = "00000000-0000-4000-d000-000000000001"
const L2 = "00000000-0000-4000-d000-000000000002"
const loc = (id, name) => ({ id, name, kind: "home", country: "US", city: null, addressLine1: null, addressLine2: null, region: null, postalCode: null, phone: null, email: null, active: true, fulfillsOrders: true, holdsInventory: true, priority: 0, forwarding: "none", pickupEnabled: false, pickupInstructions: null, pickupReady: "24h" })
const row = (i, title, variant, onHand, committed, extra = {}) => ({
  variantId: `00000000-0000-4000-c100-00000000000${i}`, productId: `p${i}`, productTitle: title, productImage: null, variantName: variant, sku: `SKU-${i}`,
  trackInventory: true, keepSelling: false, productKeepsSelling: false, madeToOrder: false, lowStockThreshold: 5, variantLowStock: null, productLowStock: null,
  levels: [{ variantId: `00000000-0000-4000-c100-00000000000${i}`, locationId: L1, onHand, committed, incoming: 0, available: onHand - committed }],
  onHand, committed, available: onHand - committed, incoming: 0, ...extra,
})
const inventory = { rows: [row(1, "Linen shirt with a long name that has to be cut short", "Blue / Large", 12, 2), row(2, "Mug", "Default", 3, 0), row(3, "Poster", "Default", 0, 0)], locations: [loc(L1, "Home studio"), loc(L2, "Warehouse")], lowStockDefault: 5 }
const posts = []
const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://x")
  if (u.pathname === "/") return res.end(html)
  if (u.pathname === "/app.js") { res.setHeader("content-type", "text/javascript"); return res.end(readFileSync(join(work, "app.js"))) }
  res.setHeader("content-type", "application/json")
  if (u.pathname === "/api/physical/inventory" && req.method === "POST") { let b = ""; for await (const c of req) b += c; posts.push(JSON.parse(b)); await wait(120); return res.end('{"applied":true}') }
  if (u.pathname === "/api/physical/inventory") { await wait(100); return res.end(JSON.stringify(inventory)) }
  res.statusCode = 404
  res.end("{}")
})
await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const problems = []
const expect = (ok, what) => { if (!ok) problems.push(what) }
const results = []

for (const vp of [{ width: 390, height: 844, phone: true }, { width: 1280, height: 800 }]) {
  const page = await browser.newPage()
  if (vp.phone) await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
  else await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 })
  await page.goto(base + "/")
  await page.waitForSelector("[data-inventory-adjust]")
  await page.click("[data-inventory-adjust]")
  await page.waitForSelector("[data-adjust-modal]", { visible: true })
  await wait(800)
  /* The settings open too, so their fields are measured. */
  await page.click("[data-adjust-settings-toggle]")
  await wait(450)
  const measure = () => page.evaluate(() => {
    const m = document.querySelector("[data-adjust-modal]")
    const box = (m.closest("[role='dialog']") || m.closest("[data-sheet-panel]") || m).getBoundingClientRect()
    const h = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null }
    const top = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().top) : null }
    const amount = document.querySelector("[data-adjust-amount]")
    const steppers = [...amount.parentElement.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().height * 10) / 10)
    const sideways = [...m.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1 && !["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) && getComputedStyle(el).overflowX !== "visible").length
    const scroller = m.closest("[data-modal-sheet-body]") || m.parentElement
    return {
      box: { x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) },
      heights: {
        location: h("[data-adjust-location]"),
        modes: [...document.querySelectorAll("[data-adjust-modes] button")].map((b) => Math.round(b.getBoundingClientRect().height * 10) / 10),
        amount: h("[data-adjust-amount]"),
        steppers,
        reason: h("[data-adjust-reason]"),
        note: h("[data-adjust-note]"),
        low: h("[data-adjust-low]"),
        incoming: h("[data-adjust-incoming]"),
        save: h("[data-adjust-save]"),
      },
      sameLine: top("[data-adjust-amount]") === top("[data-adjust-reason]"),
      sideways,
      scrolls: scroller.scrollHeight > scroller.clientHeight + 1,
      levels: document.querySelector("[data-adjust-levels]")?.textContent ?? "",
      saveOff: document.querySelector("[data-adjust-save]").disabled,
      warning: document.querySelector("[data-adjust-warning]")?.textContent ?? "",
      error: [...m.querySelectorAll("p")].map((p) => p.textContent).find((t) => /on hand here/.test(t)) ?? "",
    }
  })
  const open = await measure()
  const fieldH = vp.phone ? 44 : 40
  for (const [k, v] of Object.entries({ location: open.heights.location, amount: open.heights.amount, reason: open.heights.reason, note: open.heights.note, low: open.heights.low, incoming: open.heights.incoming })) expect(v === fieldH, `${vp.width}: ${k} is ${v}px, not ${fieldH}`)
  expect(open.heights.steppers.every((s) => s === open.heights.amount), `${vp.width}: steppers ${open.heights.steppers} beside a ${open.heights.amount}px field`)
  expect(open.heights.modes.every((s) => s === 36), `${vp.width}: mode buttons ${open.heights.modes}`)
  expect(open.sameLine, `${vp.width}: quantity and reason are not on one line`)
  expect(open.sideways === 0, `${vp.width}: ${open.sideways} parts scroll sideways`)
  expect(open.box.x >= 0 && open.box.y >= 0 && open.box.x + open.box.w <= vp.width + 0.5 && open.box.y + open.box.h <= vp.height + 0.5, `${vp.width}: the window leaves the viewport ${JSON.stringify(open.box)}`)
  expect(open.saveOff, `${vp.width}: Save is on before anything changed`)

  /* Add 5 to 12. */
  await page.click("[data-adjust-amount]")
  await page.keyboard.type("5")
  await wait(100)
  const added = await measure()
  expect(/12\s*17/.test(added.levels) && !added.saveOff, `${vp.width}: Add 5 showed "${added.levels}"`)
  /* Remove 13: refused in words. */
  await page.click("[data-adjust-modes] button:nth-child(2)")
  await page.click("[data-adjust-amount]", { clickCount: 3 })
  await page.keyboard.press("Backspace")
  await page.keyboard.type("13")
  await wait(100)
  const removed = await measure()
  expect(/Only 12 on hand here\./.test(removed.error) && removed.saveOff, `${vp.width}: Remove 13 said "${removed.error}", Save off ${removed.saveOff}`)
  /* Set to 1 with 2 committed: a warning. */
  await page.click("[data-adjust-modes] button:nth-child(3)")
  await page.click("[data-adjust-amount]", { clickCount: 3 })
  await page.keyboard.press("Backspace")
  await page.keyboard.type("1")
  await wait(100)
  const counted = await measure()
  expect(/1 sold unit won.t be on the shelf/.test(counted.warning), `${vp.width}: Set to 1 warned "${counted.warning}"`)
  /* Back to Add 5, a note, Save. */
  await page.click("[data-adjust-modes] button:nth-child(1)")
  await page.click("[data-adjust-amount]", { clickCount: 3 })
  await page.keyboard.press("Backspace")
  await page.keyboard.type("5")
  await page.click("[data-adjust-note]")
  await page.keyboard.type("Box 4 from the supplier")
  const had = posts.length
  await page.click("[data-adjust-save]")
  await wait(700)
  const body = posts[had] ?? null
  expect(body && body.mode === "add" && body.quantity === "5" && body.reason === "received" && body.note === "Box 4 from the supplier" && body.locationId === L1 && typeof body.key === "string" && body.field === "on_hand", `${vp.width}: the server got ${JSON.stringify(body)}`)
  const errors = await page.evaluate(() => window.__err)
  expect(errors.length === 0, `${vp.width}: page errors ${errors.join(" | ")}`)
  results.push({ viewport: `${vp.width}x${vp.height}`, open, added: added.levels, removed: removed.error, counted: counted.warning, body })
  await page.close()
}

await browser.close()
server.close()
for (const r of results) {
  console.log(`\n${r.viewport}`)
  console.log(`  box       ${r.open.box.w}x${r.open.box.h} at ${r.open.box.x},${r.open.box.y}; scrolls inside: ${r.open.scrolls}; sideways: ${r.open.sideways}`)
  console.log(`  heights   location ${r.open.heights.location}, modes ${r.open.heights.modes.join("/")}, quantity ${r.open.heights.amount} (steppers ${r.open.heights.steppers.join("/")}), reason ${r.open.heights.reason}, note ${r.open.heights.note}, low stock ${r.open.heights.low}, on order ${r.open.heights.incoming}, Save ${r.open.heights.save}`)
  console.log(`  one line  quantity and reason: ${r.open.sameLine}; Save off until a change: ${r.open.saveOff}`)
  console.log(`  preview   add 5: "${r.added.replace(/\s+/g, " ")}"; remove 13: "${r.removed}"; set 1: "${r.counted}"`)
  console.log(`  saved     ${JSON.stringify(r.body)}`)
}
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`)
  process.exit(1)
}
console.log("\nall measurements passed")
