/**
 * ===========================================================================
 *  BULK FULFILMENT AND SEVERAL PARCELS, IN A BROWSER
 * ===========================================================================
 * The real Orders page and order panel (scripts/render-bulkfulfil.tsx) at
 * 390x844 (touch, CPU slowed 4x) and 1440x900, against a server that answers
 * like /api. On each:
 *
 *   LIST      ticking orders shows Mark as fulfilled and Packing slips in the
 *             selection bar; the bar fits the screen
 *   BULK      Mark as fulfilled lists each order with what it has left and a
 *             tracking field, the refused one apart with its reason, a count
 *             of what will happen; one carrier for all; Mark posts each order
 *             with its carrier and number; the answer says, order by order,
 *             what happened
 *   IMPORT    a CSV is previewed row by row, a formula row shown in red,
 *             Import only after; nothing is posted as an import before
 *   PARCELS   the Fulfill dialog splits into two parcels, units move between
 *             them, each has its own tracking; the post carries both parcels
 *   LAYOUT    nothing runs off the side of the phone; motion is transform and
 *             opacity only (the Modal's own)
 *
 *   PROBE_CSS=source node scripts/check-bulkfulfil.mjs
 *   SHOTS_DIR=/some/dir PROBE_CSS=source node scripts/check-bulkfulfil.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}`)
const css = (await appCss(root)) + "\n" + interFaces(root)
const out = mkdtempSync(join(tmpdir(), "storelib-bulkfulfil-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".bulkfulfil-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `import React from "react"
const listeners = new Set()
for (const m of ["pushState", "replaceState"]) { const orig = history[m].bind(history); history[m] = (...a) => { orig(...a); listeners.forEach((l) => l()) } }
window.addEventListener("popstate", () => listeners.forEach((l) => l()))
const sub = (l) => { listeners.add(l); return () => listeners.delete(l) }
export function useSearchParams() { const s = React.useSyncExternalStore(sub, () => location.search, () => ""); return React.useMemo(() => new URLSearchParams(s), [s]) }
export const usePathname = () => "/app/orders"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() { history.back() } })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-bulkfulfil.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`, `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error"], { cwd: root, stdio: "inherit" })
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const bundle = readFileSync(join(out, "probe.js"))

/* ── the stand-ins for the routes ─────────────────────────────────────── */
const C = (n) => `${n}`.repeat(8) + "-" + `${n}`.repeat(4) + "-4" + `${n}`.repeat(3) + "-8" + `${n}`.repeat(3) + "-" + `${n}`.repeat(12)
const R = (n) => `a1a1a1a1-0000-4000-8000-00000000000${n}`
const bulkOrders = {
  [R(1)]: { id: R(1), checkoutId: C(1), number: "#1005", buyerName: "Ada Lind", country: "DE", lines: [{ orderId: "l1", title: "Desk lamp", variantName: null, sku: "LAMP", open: 2, imageUrl: null }], refused: null },
  [R(3)]: { id: R(3), checkoutId: C(3), number: "#1003", buyerName: "Cid Moreau", country: "DE", lines: [], refused: "Already fulfilled." },
  [R(4)]: { id: R(4), checkoutId: C(4), number: "#1002", buyerName: "Dot Rivera", country: "DE", lines: [{ orderId: "l4", title: "Desk lamp", variantName: "Brass", sku: "LAMP-B", open: 1, imageUrl: null }, { orderId: "l4b", title: "Linen shade", variantName: null, sku: "SHADE", open: 1, imageUrl: null }], refused: null },
}
/* The Orders page's rows: five orders that ship, one of them already fulfilled. */
const H = 3_600_000
const at = (h) => new Date(Date.now() - h * H).toISOString()
const lamp = { id: "p-lamp", title: "Desk lamp", type: "physical", thumbnail_url: null }
const shade = { id: "p-shade", title: "Linen shade", type: "physical", thumbnail_url: null }
const row = (n, over) => ({ id: R(n), product_id: lamp.id, product: lamp, amount_cents: 4000, fee_cents: 60, status: "completed", created_at: at(n), buyer_email: "ana@example.com", buyer_first_name: "Ana", buyer_last_name: "Pop", buyer_country: "Germany", buyer_country_code: "DE", card_brand: "visa", card_last4: "4242", payment_method: "card", receipt_token: `tok-${n}`, stripe_payment_intent_id: `pi_${n}`, stripe_session_id: `cs_${n}`, buyer_notified_at: null, source: "website", checkout_id: C(n), quantity: 1, shipping_cents: 500, physical_fulfillment: "unfulfilled", physical_return: "none", physical_method: "Standard", physical_pickup: false, ...over })
const ROWS = [
  row(1, { quantity: 2, amount_cents: 8000, buyer_first_name: "Ada", buyer_last_name: "Lind" }),
  row(2, { product_id: shade.id, product: shade, amount_cents: 1500, buyer_first_name: "Ben", buyer_last_name: "Okafor" }),
  row(3, { buyer_first_name: "Cid", buyer_last_name: "Moreau", physical_fulfillment: "fulfilled" }),
  row(4, { buyer_first_name: "Dot", buyer_last_name: "Rivera" }),
  row(5, { product_id: shade.id, product: shade, amount_cents: 3000, quantity: 2, buyer_first_name: "Eli", buyer_last_name: "Novak" }),
]
const LISTING = { rows: ROWS, numbers: Object.fromEntries(ROWS.map((r, i) => [r.id, 1006 - i - 1])), pageIds: ROWS.map((r) => r.id), before: null, after: null, matching: ROWS.length, range: { page: 1, pages: 1, from: 1, to: ROWS.length }, metrics: [], summary: { total: ROWS.length, earliest: at(10), ships: true, views: ["all", "unfulfilled"], currency: "EUR" }, figures: true, partial: false }
const address = { name: "Ada Lind", line1: "Gartenweg 2", city: "Berlin", postalCode: "10117", country: "DE" }
const line = (orderId, title, quantity, extra = {}) => ({ orderId, productId: "p", variantId: null, title, variantName: null, sku: null, imageUrl: null, type: "physical", quantity, unitCents: 4000, discountCents: 0, amountCents: 4000 * quantity, refundedCents: 0, requiresShipping: true, locationId: "loc-home", fulfillmentMethod: "self", fulfilled: 0, returned: 0, receiptToken: null, ...extra })
const freshOrder = () => ({ id: C(7), creatorId: "me", status: "paid", fulfillmentStatus: "unfulfilled", returnStatus: "none", currency: "EUR", buyerEmail: "bea@example.com", buyerName: "Bea Buyer", buyerPhone: null, itemsSubtotalCents: 13500, discountCents: 0, shippingCents: 500, shippingDiscountCents: 0, taxCents: 0, taxIncluded: false, taxLabel: "Tax", totalCents: 14000, refundedCents: 0, platformFeeCents: 0, payment: "card", cashCollectedAt: null, couponCode: null, address, delivery: { name: "Standard", priceCents: 500, minDays: 1, maxDays: 3 }, deliveryMethod: "ship", pickup: null, processingAt: null, deliveredAt: null, buyerNote: null, cartAttributes: {}, merchantNote: null, receiptToken: "t", paidAt: new Date().toISOString(), createdAt: new Date().toISOString(), cancelledAt: null, lines: [line("lamp", "Desk lamp", 3, { sku: "LAMP" }), line("shade", "Linen shade", 1, { sku: "SHADE", unitCents: 1500 })], shipments: [], returns: [], events: [] })
let order = freshOrder()
const posts = []
const slipAsks = []
const preview = { error: null, counts: { orders: 1, parcels: 2, units: 2, errors: 2, rows: 4 }, orders: [], rows: [
  { line: 2, order: "#1005", carrier: "DHL", tracking: "00340434160000000201", trackingUrl: "", sku: "LAMP", quantity: 1, error: null, checkoutId: C(1), number: "#1005", ships: "1 × Desk lamp", units: 1 },
  { line: 3, order: "#1005", carrier: "DPD", tracking: "01234567890201", trackingUrl: "", sku: "LAMP", quantity: 1, error: null, checkoutId: C(1), number: "#1005", ships: "1 × Desk lamp", units: 1 },
  { line: 4, order: "#1002", carrier: "=HYPERLINK(\"https://evil.example\")", tracking: "01234567890202", trackingUrl: "", sku: "", quantity: null, error: "A cell starts with =, +, - or @, which a spreadsheet runs as a formula. Nothing from this row is used.", checkoutId: null, number: null, ships: null, units: 0 },
  { line: 5, order: "#99999", carrier: "DHL", tracking: "00340434160000000203", trackingUrl: "", sku: "", quantity: null, error: "We couldn't find that order.", checkoutId: null, number: null, ships: null, units: 0 },
] }

const page = `<!doctype html><html class="light app-layout" lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};localStorage.setItem("storelib_timezone","Europe/Berlin");window.__LISTING__=${JSON.stringify(LISTING)}</script><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  const json = (body, status = 200) => setTimeout(() => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 120)
  /* The carriers' logos, from public/ as the site serves them. */
  if (req.url.startsWith("/carriers/") && /^\/carriers\/[a-z0-9-]+\.webp$/.test(req.url) && existsSync(join(root, "public", req.url))) { res.writeHead(200, { "content-type": "image/webp" }); return res.end(readFileSync(join(root, "public", req.url))) }
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  const read = (then) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => then(b ? JSON.parse(b) : {})) }
  if (req.url.startsWith("/api/physical/orders/packing-slips")) {
    slipAsks.push(new URL(req.url, "http://x").searchParams.get("ids") ?? "")
    res.writeHead(200, { "content-type": "text/html" })
    return res.end("<!doctype html><html lang=en><head><title>Packing slips</title></head><body><main class=paper>slips</main></body></html>")
  }
  if (req.url.startsWith("/api/physical/orders/bulk")) {
    return read((b) => {
      posts.push(b)
      if (b.action === "load") return json({ orders: b.ids.map((id) => bulkOrders[id] ?? { id, checkoutId: null, number: "", buyerName: null, lines: [], refused: "Not found, or not an order that ships." }) })
      if (b.action === "fulfil") return json({ results: [...b.orders.map((o) => ({ id: o.id, checkoutId: bulkOrders[o.id].checkoutId, number: bulkOrders[o.id].number, ok: true, error: null, units: bulkOrders[o.id].lines.reduce((n, l) => n + l.open, 0), parcels: 1 }))] })
      if (b.action === "preview") return json({ preview })
      if (b.action === "import") return json({ preview, results: [{ id: C(1), checkoutId: C(1), number: "#1005", ok: true, error: null, units: 2, parcels: 2 }] })
      return json({ error: "Unknown action." }, 400)
    })
  }
  const m = req.url.match(/^\/api\/physical\/orders\/([^/?]+)$/)
  if (m) {
    if (req.method === "POST") return read((b) => {
      posts.push(b)
      if (b.action === "fulfil" && Array.isArray(b.parcels)) {
        for (const [n, p] of b.parcels.entries()) {
          for (const i of p.items) order.lines.find((l) => l.orderId === i.orderId).fulfilled += i.quantity
          order.shipments.push({ id: `f${n}`, status: "shipped", locationId: "loc-home", provider: "manual", carrier: p.carrier, service: null, trackingNumber: p.trackingNumber, trackingUrl: null, shippedAt: new Date().toISOString(), deliveredAt: null, createdAt: new Date().toISOString(), items: p.items, events: [] })
        }
        order.fulfillmentStatus = "fulfilled"
      }
      json({ order })
    })
    return json({ order, locations: [{ id: "loc-home", name: "Workshop" }] })
  }
  if (req.url.startsWith("/api/app/orders/list")) return json(LISTING)
  /* No shipping app connected: the dialog offers tracking only, as for most stores. */
  if (/^\/api\/physical\/orders\/[^/]+\/label/.test(req.url)) return json({ apps: [], packages: [], defaultPackageId: null, itemsGrams: 0, unitSystem: "metric", labels: [] })
  if (req.url.startsWith("/api/")) return json({})
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok || got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.innerText ?? "", sel)
/* What is open: the phone's sheet or the computer's dialog. */
const SURFACE = "[data-modal-sheet], [data-modal-dialog] [role=dialog]"
const offSide = (p) => p.evaluate((sel) => {
  const scope = document.querySelector(sel)
  if (!scope) return ["no surface"]
  /* Text cut off with an ellipsis inside a box that fits is not off the side: only what can be seen counts. */
  const clipped = (el) => { for (let a = el.parentElement; a && a !== scope; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o !== "visible") return a.getBoundingClientRect().right <= innerWidth + 1 } return false }
  return [...scope.querySelectorAll("*")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !clipped(el) }).slice(0, 4).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)} ${Math.round(el.getBoundingClientRect().right)}`)
}, SURFACE)
const typeInto = async (p, handle, value) => { await handle.click({ clickCount: 3 }); await handle.type(value) }
/* The carrier picker (components/physical/carrier-picker.tsx): a popover on a computer, a sheet on a phone; searched, then chosen. */
const pickCarrier = async (p, scope, query, id, phone) => {
  const field = await p.waitForSelector(`${scope} [data-carrier-field]`, { visible: true })
  if (phone) await field.tap()
  else await field.click()
  await p.waitForSelector(phone ? '[data-carrier-list="phone"]' : "[data-carrier-popover]", { visible: true })
  await sleep(phone ? 500 : 150)
  const search = await p.waitForSelector("[data-carrier-search]", { visible: true })
  if (phone) await search.tap()
  await search.type(query)
  await sleep(300)
  const option = await p.waitForSelector(`[data-carrier-option="${id}"]`, { visible: true })
  if (phone) await option.tap()
  else await p.keyboard.press("Enter")
  await sleep(phone ? 800 : 250)
}

for (const [name, vp] of [["phone", PHONE], ["desk", DESK]]) {
  console.log(`\n${name} ${vp.width}x${vp.height}`)
  posts.length = 0
  order = freshOrder()
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.setViewport(vp)
  if (name === "phone") { const cdp = await p.createCDPSession(); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }) }
  await p.goto(`${origin}/app/orders`, { waitUntil: "load" })
  await p.waitForSelector(".orders-scroller table tbody tr", { timeout: 20000 }).catch(async () => {
    console.log("  the list did not draw:", errors, (await p.evaluate(() => document.body.innerText)).slice(0, 400))
    process.exit(1)
  })
  await sleep(300)

  /* LIST */
  for (const id of [R(1), R(3), R(4)]) await p.evaluate((id) => document.querySelector(`tr[data-order-id="${id}"] input[type=checkbox]`).click(), id)
  await sleep(200)
  /* The buttons the bar shows (a phone puts two under Actions). */
  const bar = await p.evaluate(() => [...document.querySelectorAll("thead button")].filter((b) => b.getClientRects().length > 0).map((b) => b.innerText.trim()))
  expect(name === "phone" ? bar.includes("Export") && bar.includes("Actions") : bar.includes("Mark as fulfilled") && bar.includes("Packing slips") && bar.includes("Export selected"), "the selection bar offers Mark as fulfilled and Packing slips beside Export", bar)
  const barFit = await p.evaluate(() => { const sc = document.querySelector(".orders-scroller").getBoundingClientRect().right; return Math.max(...[...document.querySelectorAll("thead button")].filter((b) => b.getClientRects().length > 0).map((b) => b.getBoundingClientRect().right)) - sc })
  expect(barFit <= 1, "the bar's buttons are inside the table's edge", barFit)
  expect(await p.evaluate(() => !!document.querySelector("[data-orders-import]")), "Import tracking is in the top bar")
  await p.screenshot({ path: join(shots, `bf-${name}-selected.png`) })

  /* PACKING SLIPS, on a computer: printed from a frame, every ticked order in one page */
  if (name === "desk") {
    slipAsks.length = 0
    await p.evaluate(() => document.querySelector("[data-bulk-slips]").click())
    await sleep(600)
    const framed = await p.evaluate(() => !!document.querySelector("iframe[data-packing-slips-frame]"))
    expect(slipAsks.length === 1 && slipAsks[0].split(",").length === 3 && framed, "Packing slips asks for one page of the three ticked orders and prints it from a frame", { asks: slipAsks, framed })
  }

  /* BULK */
  if (name === "phone") {
    await p.evaluate(() => document.querySelector("[data-bulk-more]").click())
    await sleep(500)
    const rowsInSheet = await p.evaluate(() => [...document.querySelectorAll("button, a")].filter((b) => b.getClientRects().length && /^(Mark as fulfilled|Packing slips)$/.test(b.innerText.trim())).map((b) => b.getAttribute("href") ?? "button"))
    expect(rowsInSheet.length === 2 && rowsInSheet.some((h) => /^\/api\/physical\/orders\/packing-slips\?ids=.+,.+,.+/.test(h)), "on a phone, Actions opens a sheet with Mark as fulfilled, and Packing slips as a page for every ticked order", rowsInSheet)
    await p.screenshot({ path: join(shots, `bf-${name}-actions.png`) })
    await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.getClientRects().length && b.innerText.trim() === "Mark as fulfilled").click())
  } else await p.evaluate(() => document.querySelector("[data-bulk-fulfil]").click())
  await p.waitForSelector("[data-bulk-sheet]")
  await sleep(500)
  const count = await text(p, "[data-bulk-count]")
  expect(/2 orders will be marked fulfilled, 4 items in all/.test(count) && /1 order can't be/.test(count), "the count says what will happen", count)
  const listed = await p.evaluate(() => [...document.querySelectorAll("[data-bulk-order]")].map((li) => li.getAttribute("data-bulk-order")))
  expect(listed.join() === "#1005,#1002", "each order to fulfil is listed", listed)
  const left = await text(p, "[data-bulk-left]")
  expect(/#1003/.test(left) && /Already fulfilled/.test(left), "the refused one is apart, with its reason", left.replace(/\s+/g, " "))
  await pickCarrier(p, "[data-bulk-carrier]", "dhl", "dhl", name === "phone")
  const firstTracking = await p.$('[data-bulk-order="#1005"] [data-tracking-number]')
  await typeInto(p, firstTracking, "00340434160000000101")
  await sleep(200)
  const carriers = await p.evaluate(() => [...document.querySelectorAll("[data-bulk-order] [data-carrier-field]")].map((s) => s.dataset.carrierField))
  expect(carriers.length === 2 && carriers.every((c) => c === "dhl"), "one carrier picked for every order, and a typed number keeps it", carriers)
  /* The tracking number rule: an order with a carrier and no number holds the press back, and says so. */
  await p.evaluate(() => document.querySelector("[data-bulk-submit]").click())
  await sleep(300)
  expect(!posts.some((x) => x.action === "fulfil") && /1 order still need/.test(await text(p, "[data-bulk-sheet]")), "a carrier without its number is not sent: the sheet says which still need one", (await text(p, "[data-bulk-sheet]")).slice(-200))
  await typeInto(p, await p.$('[data-bulk-order="#1002"] [data-tracking-number]'), "00340434160000000102")
  await sleep(200)
  expect((await offSide(p)).length === 0, "nothing in the sheet runs off the side", await offSide(p))
  await p.screenshot({ path: join(shots, `bf-${name}-bulk.png`) })
  const submit = await text(p, "[data-bulk-submit]")
  expect(submit === "Mark 2 orders fulfilled", "the button says how many", submit)
  await p.evaluate(() => document.querySelector("[data-bulk-submit]").click())
  await p.waitForSelector("[data-bulk-results]")
  await sleep(300)
  const sent = posts.find((x) => x.action === "fulfil")
  expect(!!sent && sent.orders.length === 2 && sent.orders[0].carrier === "DHL" && sent.orders[0].trackingNumber === "00340434160000000101" && sent.orders[1].carrier === "DHL" && sent.orders[1].trackingNumber === "00340434160000000102" && sent.notifyBuyer === true && typeof sent.key === "string", "Mark posts each order with its carrier and number, and one key", sent)
  expect(/2 orders marked fulfilled, 4 items in all/.test(await text(p, "[data-bulk-results]")), "the answer says what happened", await text(p, "[data-bulk-results]"))
  await p.screenshot({ path: join(shots, `bf-${name}-bulk-done.png`) })
  await p.evaluate(() => document.querySelector("[data-bulk-done]").click())
  await sleep(500)

  /* IMPORT */
  await p.evaluate(() => document.querySelector("[data-orders-import]").click())
  await p.waitForSelector("[data-import-sheet]")
  await sleep(400)
  const csvPath = join(out, "tracking.csv")
  writeFileSync(csvPath, 'Order,Carrier,Tracking number,SKU,Quantity\n#1005,DHL,00340434160000000201,LAMP,1\n#1005,DPD,01234567890201,LAMP,1\n#1002,"=HYPERLINK(""https://evil.example"")",01234567890202,,\n#99999,DHL,00340434160000000203,,\n')
  const file = await p.$("[data-import-file]")
  await file.uploadFile(csvPath)
  await p.waitForSelector("[data-import-preview]")
  await sleep(300)
  expect(!posts.some((x) => x.action === "import"), "choosing a file only previews: nothing is imported yet")
  const rows = await p.evaluate(() => [...document.querySelectorAll("[data-import-row]")].map((r) => r.getAttribute("data-import-row")))
  expect(rows.join() === "ok,ok,error,error", "every row shown, the formula and unknown order in red", rows)
  const formulaText = await p.evaluate(() => document.querySelectorAll("[data-import-row]")[2]?.innerText ?? "")
  expect(/formula/.test(formulaText), "the formula row says why it is left out", formulaText)
  expect(/Import marks 1 order fulfilled: 2 parcels and 2 items/.test(await text(p, "[data-import-count]")), "the count says what Import will do", await text(p, "[data-import-count]"))
  expect((await offSide(p)).length === 0, "nothing in the import sheet runs off the side", await offSide(p))
  await p.screenshot({ path: join(shots, `bf-${name}-import.png`) })
  await p.evaluate(() => document.querySelector("[data-import-submit]").click())
  await p.waitForSelector("[data-bulk-results]")
  const imp = posts.find((x) => x.action === "import")
  expect(!!imp && /HYPERLINK/.test(imp.csv) && typeof imp.key === "string", "Import sends the same file, with its key", imp && { key: imp.key })
  await p.close()

  /* PARCELS */
  const q = await browser.newPage()
  q.on("pageerror", (e) => errors.push(String(e)))
  await q.setViewport(vp)
  await q.goto(`${origin}/app/orders?view=order`, { waitUntil: "load" })
  await q.waitForSelector("[data-unfulfilled-card] [data-fulfil]")
  await sleep(300)
  await q.screenshot({ path: join(shots, `bf-${name}-order.png`) })
  await q.evaluate(() => document.querySelector("[data-unfulfilled-card] [data-fulfil]").click())
  await q.waitForSelector("[data-fulfil-submit]")
  await sleep(900)
  if (errors.length) console.log("  script errors:", errors)
  expect((await text(q, "[data-fulfil-submit]")) === "Fulfill 4 items", "one parcel, as before: Fulfill 4 items", await text(q, "[data-fulfil-submit]"))
  await q.screenshot({ path: join(shots, `bf-${name}-fulfil-one.png`) })
  await q.evaluate(() => document.querySelector("[data-parcel-add]").click())
  await sleep(250)
  expect(await q.evaluate(() => document.querySelectorAll("[data-parcel]").length === 2), "Ship in more than one parcel makes two parcels")
  expect(/Parcel 2 is empty/.test(await q.evaluate(() => document.body.innerText)) && (await q.evaluate(() => document.querySelector("[data-fulfil-submit]").disabled)), "an empty parcel holds the button back, and says so")
  /* One lamp and the shade into parcel 2: taken from parcel 1. */
  await q.evaluate(() => { const plus = [...document.querySelectorAll('[data-parcel="2"] [aria-label="One more"]')]; plus[0].click() })
  await sleep(100)
  await q.evaluate(() => { const plus = [...document.querySelectorAll('[data-parcel="2"] [aria-label="One more"]')]; plus[1].click() })
  await sleep(150)
  const split = await q.evaluate(() => [...document.querySelectorAll("[data-parcel]")].map((p) => p.querySelector("p")?.innerText.replace(/\s+/g, " ")))
  expect(/3 items/.test(split[0] ?? "") === false && /2 items/.test(split[0] ?? "") && /2 items/.test(split[1] ?? ""), "units move from parcel 1 to parcel 2", split)
  await pickCarrier(q, '[data-parcel="1"]', "dhl", "dhl", name === "phone")
  const fields = await q.$$("[data-parcel] [data-tracking-number]")
  await typeInto(q, fields[0], "00340434161234567890")
  await typeInto(q, fields[1], "1Z999AA10123456784")
  await sleep(200)
  const pc = await q.evaluate(() => [...document.querySelectorAll("[data-parcel] [data-carrier-field]")].map((s) => s.dataset.carrierField))
  expect(pc[0] === "dhl" && pc[1] === "ups", "each parcel its own carrier: one picked, one guessed from its number", pc)
  expect((await text(q, "[data-fulfil-submit]")) === "Fulfill 4 items in 2 parcels", "the button names the parcels", await text(q, "[data-fulfil-submit]"))
  expect((await offSide(q)).length === 0, "nothing in the dialog runs off the side", await offSide(q))
  await q.evaluate(() => document.querySelector("[data-parcels]").scrollIntoView({ block: "start" }))
  await q.screenshot({ path: join(shots, `bf-${name}-parcels.png`) })
  await q.evaluate(() => document.querySelector("[data-fulfil-submit]").click())
  await sleep(600)
  const fp = posts.find((x) => x.action === "fulfil" && Array.isArray(x.parcels))
  const units = (p) => p.items.reduce((n, i) => n + i.quantity, 0)
  expect(!!fp && fp.parcels.length === 2 && units(fp.parcels[0]) === 2 && units(fp.parcels[1]) === 2 && fp.parcels[0].carrier === "DHL" && fp.parcels[1].carrier === "UPS" && fp.parcels[1].trackingNumber === "1Z999AA10123456784" && typeof fp.key === "string", "Fulfill posts both parcels with their own tracking, one key", fp)
  expect(errors.length === 0, "no script errors", errors)
  await q.close()
}

await browser.close()
server.close()
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
