/**
 * ===========================================================================
 *  THE SELLER'S ORDERS, ROUND 27, MEASURED
 * ===========================================================================
 * The real Orders page (scripts/render-orders27.tsx) in Chromium at a phone
 * (390x844, touch, CPU four times slower) and a computer (1440x900), with
 * stand-ins for the routes it calls that keep what each action did. The
 * stand-ins answer with the real modules where it matters: the packing slip
 * is lib/physical/packing-slip.ts, the tracking rule lib/physical/carriers.ts.
 *
 *   unseen         three orders nobody opened carry the dot; opening one
 *                  tells the server and the dot is gone back on the list
 *   carriers       the list and the shipment card show the carrier's logo
 *   packing slip   prints from a frame on a computer, is a link on a phone,
 *                  and the page itself (screen and print)
 *   fulfil         the dialog: quantities, the carrier picker (popover on a
 *                  computer, a sheet with no X on a phone), popular carriers
 *                  for the shipping country, search, the number asked for
 *                  and why, the email preview, the post, the logo after
 *   no tracking    Local delivery / no tracking sends no carrier, no number
 *   frames         the phone sheets opening, as frame sheets
 *
 * Screenshots and frame sheets go to SHOTS_DIR (default a temp folder), k27-*.
 *   node scripts/check-orders27.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, extname } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}`)
const css = (await appCss(root)) + "\n" + interFaces(root)
const out = mkdtempSync(join(tmpdir(), "storelib-k27-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
/* Inside the checkout, so the stubs resolve react from its node_modules; taken away at the end. */
const stubs = join(root, ".orders27-probe")
mkdirSync(stubs, { recursive: true })
process.on("exit", () => rmSync(stubs, { recursive: true, force: true }))
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
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
const esbuild = (args) => execFileSync("npx", ["esbuild", ...args, `--alias:@=${root}`, "--log-level=error"], { cwd: root, stdio: "inherit" })
esbuild([join(root, "scripts/render-orders27.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`, `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic", '--define:process.env.NODE_ENV="production"'])
/* The real slip and the real rule, for the stand-in routes. */
writeFileSync(join(stubs, "server-entry.ts"), `export { packingSlipHtml, slipLines } from "@/lib/physical/packing-slip"\nexport { trackingRuleProblem, carrierTrackingUrl } from "@/lib/physical/carriers"\n`)
esbuild([join(stubs, "server-entry.ts"), "--bundle", "--format=esm", "--platform=node", `--outfile=${join(out, "server.mjs")}`])
const real = await import(join(out, "server.mjs"))
const bundle = readFileSync(join(out, "probe.js"))

/* ── the orders ─────────────────────────────────────────────────────── */
const NOW = Date.now()
const H = 3_600_000
const iso = (h) => new Date(NOW - h * H).toISOString()
const RO = { name: "Jordan Blake", line1: "12 Strada Lipscani", line2: "Ap. 4", city: "Bucharest", region: null, postalCode: "030031", country: "RO", phone: "+40 712 345 678" }
const GB = { name: "Amelia Hart", line1: "4 Mill Lane", city: "Leeds", postalCode: "LS1 4AP", country: "GB", phone: null }
const line = (orderId, title, quantity, unitCents, locationId, extra = {}) => ({ orderId, productId: "p", variantId: null, title, variantName: null, sku: null, imageUrl: null, type: "physical", quantity, unitCents, discountCents: 0, amountCents: unitCents * quantity, refundedCents: 0, requiresShipping: true, locationId, fulfillmentMethod: "self", fulfilled: 0, returned: 0, receiptToken: null, ...extra })
const order = (id, over) => ({ id, creatorId: "me", status: "paid", fulfillmentStatus: "unfulfilled", returnStatus: "none", currency: "RON", buyerEmail: "jordan@example.com", buyerName: "Jordan Blake", buyerPhone: null, itemsSubtotalCents: 0, discountCents: 0, shippingCents: 1500, shippingDiscountCents: 0, taxCents: 0, taxIncluded: false, totalCents: 0, refundedCents: 0, platformFeeCents: 0, couponCode: null, address: RO, delivery: { name: "Standard", priceCents: 1500, minDays: 1, maxDays: 2 }, deliveryMethod: "ship", pickup: null, processingAt: null, deliveredAt: null, buyerNote: null, merchantNote: null, cartAttributes: {}, receiptToken: "t", paidAt: iso(5), createdAt: iso(5), cancelledAt: null, lines: [], shipments: [], returns: [], events: [], ...over })
const U = "11111111-1111-4111-8111-111111111111"
const N = "44444444-4444-4444-8444-444444444444"
const F = "22222222-2222-4222-8222-222222222222"
const D = "33333333-3333-4333-8333-333333333333"
const shipment = (id, status, carrier, trackingNumber, items, h) => ({ id, status, locationId: "loc-home", provider: "manual", carrier, service: null, trackingNumber, trackingUrl: real.carrierTrackingUrl(carrier, trackingNumber, "RO"), shippedAt: iso(h), deliveredAt: status === "delivered" ? iso(h - 20) : null, createdAt: iso(h), items, events: [] })
let orders
const fresh = () => ({
  [U]: order(U, { buyerNote: "Please leave it with the neighbour.", lines: [line("u-1", "Linen shirt", 2, 18900, "loc-home", { variantName: "M / Natural", sku: "LS-M", properties: { Engraving: "Ana" } }), line("u-2", "Stoneware mug", 1, 7900, "loc-home", { variantName: "Sage" })], events: [{ id: 1, kind: "payment.paid", message: "Payment received", actor: "webhook", createdAt: iso(5), detail: null }] }),
  [N]: order(N, { buyerName: "Amelia Hart", address: GB, currency: "GBP", lines: [line("n-1", "Stoneware mug", 1, 2400, "loc-home")] }),
  [F]: order(F, { fulfillmentStatus: "fulfilled", buyerName: "Ana Pop", lines: [line("f-1", "Linen shirt", 1, 18900, "loc-home", { fulfilled: 1 })], shipments: [shipment("f-ship", "in_transit", "FAN Courier", "2345678901234", [{ orderId: "f-1", quantity: 1 }], 40)] }),
  [D]: order(D, { fulfillmentStatus: "delivered", lines: [line("v-1", "Stoneware mug", 1, 7900, "loc-home", { fulfilled: 1 })], shipments: [shipment("f-del", "delivered", "DPD", "80012345678", [{ orderId: "v-1", quantity: 1 }], 110)] }),
})
const byRow = { "u-1": U, "u-2": U, "n-1": N, "f-1": F, "v-1": D }
const locations = [{ id: "loc-home", name: "Home studio" }]

/* The list's rows, as lib/orders/load-rows hands them over (seller_seen_at null: nobody opened it). */
const tee = { id: "p-tee", title: "Linen shirt", type: "physical", thumbnail_url: null }
const mug = { id: "p-mug", title: "Stoneware mug", type: "physical", thumbnail_url: null }
const row = (id, over) => ({ id, product_id: "p-digital", amount_cents: 4900, fee_cents: 150, status: "completed", created_at: iso(30), buyer_email: "ana.pop@example.com", buyer_first_name: "Ana", buyer_last_name: "Pop", buyer_country: "Romania", buyer_country_code: "RO", card_brand: "visa", card_last4: "4242", payment_method: "card", receipt_token: `tok-${id}`, stripe_payment_intent_id: `pi_${id}`, stripe_session_id: null, buyer_notified_at: iso(29.9), source: "website", currency: "RON", seller_seen_at: iso(1), product: { id: "p-digital", title: "Lightroom preset pack", type: "digital", thumbnail_url: null }, ...over })
const phys = (checkout, session, extra) => ({ checkout_id: checkout, stripe_session_id: session, physical_return: "none", physical_pickup: false, physical_method: "Standard", buyer_notified_at: null, ...extra })
const ROWS = [
  row("d-2", { created_at: iso(1), seller_seen_at: null }),
  row("u-1", { product_id: tee.id, product: tee, amount_cents: 37800, quantity: 2, shipping_cents: 1500, variant_name: "M / Natural", created_at: iso(5), buyer_first_name: "Jordan", buyer_last_name: "Blake", buyer_email: "jordan@example.com", seller_seen_at: null, ...phys(U, "cs_u", { physical_fulfillment: "unfulfilled" }) }),
  row("u-2", { product_id: mug.id, product: mug, amount_cents: 7900, quantity: 1, shipping_cents: 0, created_at: iso(5), buyer_first_name: "Jordan", buyer_last_name: "Blake", buyer_email: "jordan@example.com", seller_seen_at: null, ...phys(U, "cs_u", { physical_fulfillment: "unfulfilled" }) }),
  row("n-1", { product_id: mug.id, product: mug, amount_cents: 2400, currency: "GBP", quantity: 1, created_at: iso(8), buyer_first_name: "Amelia", buyer_last_name: "Hart", buyer_email: "amelia@example.com", buyer_country_code: "GB", seller_seen_at: null, ...phys(N, "cs_n", { physical_fulfillment: "unfulfilled" }) }),
  row("f-1", { product_id: tee.id, product: tee, amount_cents: 18900, quantity: 1, created_at: iso(50), ...phys(F, "cs_f", { physical_fulfillment: "fulfilled", physical_carrier: "FAN Courier" }) }),
  row("v-1", { product_id: mug.id, product: mug, amount_cents: 7900, quantity: 1, created_at: iso(120), buyer_first_name: "Sam", buyer_last_name: "Rivera", ...phys(D, "cs_d", { physical_fulfillment: "delivered", physical_carrier: "DPD" }) }),
  row("d-1", { created_at: iso(200) }),
]
const PAGE = ["d-2", "u-1", "n-1", "f-1", "v-1", "d-1"]
const listing = {
  rows: ROWS,
  numbers: { "d-1": 1001, "v-1": 1002, "f-1": 1003, "n-1": 1004, "u-1": 1005, "d-2": 1006 },
  pageIds: PAGE,
  before: null,
  after: null,
  matching: PAGE.length,
  range: { page: 1, pages: 1, from: 1, to: PAGE.length },
  metrics: [],
  summary: { total: PAGE.length, earliest: iso(200), ships: true, views: ["all", "unfulfilled"], currency: "RON" },
  figures: true,
  partial: false,
}

const posts = []
const seen = []
let eventId = 100
function act(o, b) {
  if (b.action === "fulfil") {
    const rule = real.trackingRuleProblem(b.carrier, b.trackingNumber)
    if (rule) return rule
    const id = `f-${eventId++}`
    for (const i of b.items) o.lines.find((l) => l.orderId === i.orderId).fulfilled += i.quantity
    o.shipments.push({ id, status: "shipped", locationId: b.locationId ?? null, provider: "manual", carrier: b.carrier, service: null, trackingNumber: b.trackingNumber, trackingUrl: b.trackingUrl ?? real.carrierTrackingUrl(b.carrier, b.trackingNumber, o.address?.country), shippedAt: new Date().toISOString(), deliveredAt: null, createdAt: new Date().toISOString(), items: b.items.filter((i) => i.quantity > 0), events: [] })
    const want = o.lines.reduce((n, l) => n + l.quantity, 0)
    const done = o.lines.reduce((n, l) => n + l.fulfilled, 0)
    o.fulfillmentStatus = done < want ? "partially_fulfilled" : "fulfilled"
  }
  return null
}
const TT = (s, v) => s.replace(/\{(\w+)(?:, plural, one \{([^}]*)\} other \{([^}]*)\})?\}/g, (_, k, one, other) => (other ? (Number(v?.[k]) === 1 ? one : other).replace("#", String(v?.[k])) : String(v?.[k] ?? "")))

const page = `<!doctype html><html class="light app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};localStorage.setItem("storelib_timezone","Europe/Bucharest");window.__now=${NOW};window.__listing=${JSON.stringify(listing)}</script><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  const json = (body, status = 200) => setTimeout(() => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 120)
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  if (url.pathname.startsWith("/carriers/")) {
    const file = join(root, "public", url.pathname)
    if (!existsSync(file)) { res.writeHead(404); return res.end() }
    res.writeHead(200, { "content-type": extname(file) === ".webp" ? "image/webp" : "application/octet-stream" })
    return res.end(readFileSync(file))
  }
  if (url.pathname === "/api/app/orders/list") return json(listing)
  if (url.pathname === "/api/app/orders/seen") {
    let body = ""
    req.on("data", (c) => (body += c))
    /* As the real route does: the rows are seen from now on, so a list read again after an action keeps them seen. */
    req.on("end", () => { const b = JSON.parse(body); seen.push(b); for (const r of listing.rows) if (b.ids.includes(r.id) && r.seller_seen_at === null) r.seller_seen_at = new Date().toISOString(); json({ ok: true }) })
    return
  }
  const slip = url.pathname.match(/^\/api\/physical\/orders\/([^/]+)\/packing-slip$/)
  if (slip) {
    const o = orders[slip[1]] ?? orders[byRow[slip[1]]]
    const lines = real.slipLines(o, { shipmentId: url.searchParams.get("f"), locationId: url.searchParams.get("loc") })
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    return res.end(real.packingSlipHtml(o, lines, { name: "Andrew Rullz", logoUrl: null }, { tt: TT, lang: "en", timeZone: "Europe/Bucharest", back: "/app/orders" }))
  }
  const m = url.pathname.match(/^\/api\/physical\/orders\/([^/?]+)$/)
  if (m) {
    const o = orders[decodeURIComponent(m[1])] ?? orders[byRow[decodeURIComponent(m[1])]]
    if (!o) return json({ error: "Not found." }, 404)
    if (req.method === "POST") {
      let body = ""
      req.on("data", (c) => (body += c))
      req.on("end", () => { const b = JSON.parse(body); posts.push(b); const e = act(o, b); e ? json({ error: e }, 400) : json({ order: o }) })
      return
    }
    return json({ order: o, locations })
  }
  if (url.pathname === "/api/store/cases") return json({ cases: [] })
  /* No label app connected: Fulfill items is the carrier and the number. */
  if (/^\/api\/physical\/orders\/[^/]+\/label$/.test(url.pathname)) return json({ apps: [], packages: [], labels: [] })
  if (url.pathname.startsWith("/api/")) return json({})
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.innerText ?? "", sel)
const tapSel = async (p, sel, phone) => {
  const el = await p.waitForSelector(sel, { visible: true })
  if (phone) await el.tap()
  else await el.click()
}
const unseenRows = (p) => p.evaluate(() => [...document.querySelectorAll(".orders-list tr[data-order-id]")].filter((r) => r.querySelector("[data-unseen]")).map((r) => r.dataset.orderId))
const imagesLoaded = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].map((i) => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0 })), sel)

/** Frames of the screen while `run` plays, `ms` long, as one sheet of up to 12. */
async function frameSheet(p, name, run, ms = 700) {
  const cdp = await p.createCDPSession()
  const frames = []
  cdp.on("Page.screencastFrame", async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp })
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 })
  await sleep(80)
  const t0 = Date.now()
  await run()
  await sleep(ms)
  await cdp.send("Page.stopScreencast")
  await cdp.detach().catch(() => {})
  const pick = frames.length <= 12 ? frames : Array.from({ length: 12 }, (_, i) => frames[Math.round((i * (frames.length - 1)) / 11)])
  const tiles = await Promise.all(pick.map((f) => sharp(Buffer.from(f.data, "base64")).resize(195, 422, { fit: "contain", background: "#ffffff" }).png().toBuffer()))
  const cols = 6
  const rows = Math.ceil(tiles.length / cols)
  await sharp({ create: { width: cols * 199, height: rows * 426, channels: 3, background: "#d1d5db" } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * 199 + 2, top: Math.floor(i / cols) * 426 + 2 })))
    .png()
    .toFile(join(shots, `k27-${name}-frames.png`))
  return { frames: frames.length, ms: Date.now() - t0 }
}

/** The longest task while `run` plays: what a 4x slower phone would feel. */
async function longest(p, run, ms = 800) {
  await p.evaluate(() => {
    window.__long = []
    window.__obs?.disconnect()
    window.__obs = new PerformanceObserver((l) => window.__long.push(...l.getEntries().map((e) => Math.round(e.duration))))
    window.__obs.observe({ type: "longtask", buffered: false })
  })
  await run()
  await sleep(ms)
  return p.evaluate(() => (window.__long.length ? Math.max(...window.__long) : 0))
}

for (const [name, vp] of [["phone", PHONE], ["desk", DESK]]) {
  const phone = name === "phone"
  console.log(`\n${name} ${vp.width}x${vp.height}${phone ? ", touch, CPU x4" : ""}`)
  orders = fresh()
  for (const r of listing.rows) if (["d-2", "u-1", "u-2", "n-1"].includes(r.id)) r.seller_seen_at = null
  posts.length = 0
  seen.length = 0
  const p = await browser.newPage()
  p.on("pageerror", (e) => console.log(`        page error: ${String(e?.stack ?? e).slice(0, 900)}`))
  await p.emulateTimezone("Europe/Bucharest")
  await p.setViewport(vp)
  if (phone) { const cdp = await p.createCDPSession(); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }) }
  await p.goto(`${origin}/app/orders`, { waitUntil: "load" })
  await p.waitForSelector(".orders-scroller table tbody tr")
  await sleep(600)
  await p.screenshot({ path: join(shots, `k27-${name}-list.png`) })

  /* AA3: each order in what it was charged in, as the rest of the app writes it: lei as "lei" (never "RON 49.00"), the GBP order in pounds, never a dollar sign, and no amount cut off. */
  const money = await p.evaluate(() => [...document.querySelectorAll(".orders-list tr[data-order-id]")].map((r) => {
    const cells = [...r.querySelectorAll("td")].filter((td) => /\d/.test(td.innerText) && /lei|£|\$|€|RON|GBP|USD/.test(td.innerText))
    return { id: r.dataset.orderId, text: cells.map((c) => c.innerText.trim()).join(" | "), clipped: cells.some((c) => c.scrollWidth > c.clientWidth + 1) }
  }))
  const leiRows = money.filter((m) => m.id !== "n-1")
  expect(money.length > 0 && leiRows.every((m) => /\d lei/.test(m.text.replace(/ /g, " ")) && !/RON|\$/.test(m.text)), "lei orders read lei in the list, never RON or $", money.slice(0, 3))
  expect(/£24\.00/.test(money.find((m) => m.id === "n-1")?.text ?? ""), "the order charged in pounds reads £24.00", money.find((m) => m.id === "n-1"))
  expect(!money.some((m) => m.clipped), "no amount is cut off in its column", money.filter((m) => m.clipped))
  expect(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "  and the list does not run off the side")
  /* MONEY_ONLY=1: the list's money at each width, without the fulfil steps after it. */
  if (process.env.MONEY_ONLY) { await p.close(); continue }

  /* Unseen and the list's carriers */
  const unseen = await unseenRows(p)
  expect(unseen.join() === "d-2,u-1,n-1", "orders nobody opened carry the dot, the others do not", unseen)
  const dot = await p.evaluate(() => { const d = document.querySelector("[data-unseen]").getBoundingClientRect(); const n = document.querySelector('tr[data-order-id="f-1"] td:nth-child(2) a').getBoundingClientRect(); const u = document.querySelector('tr[data-order-id="u-1"] td:nth-child(2) a').getBoundingClientRect(); return { w: d.width, h: d.height, color: getComputedStyle(document.querySelector("[data-unseen]")).backgroundColor, seenLeft: Math.round(n.left), unseenLeft: Math.round(u.left) } })
  expect(dot.w === 6 && dot.h === 6 && dot.seenLeft === dot.unseenLeft, "the dot is small (6px) and the number does not move", dot)
  const listLogos = await p.evaluate(() => [...document.querySelectorAll(".orders-list [data-carrier] img[data-carrier-logo]")].map((i) => ({ id: i.dataset.carrierLogo, ok: i.complete && i.naturalWidth > 0 })))
  expect(listLogos.length === 2 && listLogos.every((l) => l.ok) && listLogos.map((l) => l.id).join() === "fan-courier,dpd", "fulfilled orders show their carrier's logo, loaded from /carriers", listLogos)

  /* The unseen order to ship */
  await p.evaluate(() => document.querySelector('.orders-list tr[data-order-id="u-1"] a').click())
  await p.waitForSelector("[data-unfulfilled-card]")
  await sleep(700)
  expect(seen.length === 1 && seen[0].ids.join() === "u-1,u-2", "opening it tells the server, with every line of the order", seen)

  /* Packing slip */
  await tapSel(p, '[data-unfulfilled-card] button[aria-label="Unfulfilled: more actions"]', phone)
  await sleep(phone ? 700 : 250)
  if (phone) {
    const href = await p.evaluate(() => [...document.querySelectorAll("[data-action-sheet] a")].find((a) => a.innerText.trim() === "Packing slip")?.getAttribute("href") ?? null)
    expect(!!href && /\/packing-slip\?loc=loc-home$/.test(href), "on a phone Packing slip is a link to the slip's page (no pop-up to block)", href)
    await p.screenshot({ path: join(shots, `k27-${name}-slip-menu.png`) })
    await p.evaluate(() => document.querySelector("[data-sheet-root] [data-sheet-panel]") && document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    await sleep(600)
    const sp = await browser.newPage()
    await sp.setViewport(vp)
    await sp.goto(`${origin}${href}`, { waitUntil: "load" })
    await sleep(300)
    await sp.screenshot({ path: join(shots, `k27-${name}-slip.png`), fullPage: true })
    const wide = await sp.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    expect(wide, "the slip fits a phone, no sideways scroll")
    await sp.close()
  } else {
    await p.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].find((b) => b.innerText.trim() === "Packing slip").click())
    await p.waitForFunction(() => document.querySelector("iframe[data-packing-slip-frame]")?.srcdoc?.length > 500, { timeout: 5000 }).catch(() => {})
    const frame = await p.evaluate(() => { const f = document.querySelector("iframe[data-packing-slip-frame]"); return f ? { size: f.getBoundingClientRect().width, html: f.srcdoc } : null })
    expect(!!frame && frame.size === 0 && /Packing slip/.test(frame.html) && /Linen shirt/.test(frame.html) && /Engraving: Ana/.test(frame.html) && /12 Strada Lipscani/.test(frame.html) && /leave it with the neighbour/.test(frame.html), "on a computer it prints from a frame out of sight: items, variants, engraving, address, note", frame ? frame.html.length : null)
    const sp = await browser.newPage()
    await sp.setViewport(vp)
    await sp.goto(`${origin}/api/physical/orders/${U}/packing-slip?loc=loc-home`, { waitUntil: "load" })
    await sleep(300)
    await sp.screenshot({ path: join(shots, `k27-${name}-slip.png`), fullPage: true })
    await sp.emulateMediaType("print")
    await sp.screenshot({ path: join(shots, `k27-${name}-slip-print.png`), fullPage: true })
    const bar = await sp.evaluate(() => getComputedStyle(document.querySelector("[data-slip-bar]")).display)
    expect(bar === "none", "printed, the Back and Print bar is not on the paper", bar)
    await sp.close()
  }

  /* Fulfill items */
  const openFulfil = async () => {
    await tapSel(p, "[data-unfulfilled-card] [data-fulfil]", phone)
    await p.waitForSelector("[data-fulfil-submit]", { visible: true })
    await sleep(phone ? 900 : 350)
  }
  if (phone) {
    const fr = await frameSheet(p, "phone-fulfil-open", openFulfil, 200)
    console.log(`        fulfil sheet: ${fr.frames} frames recorded`)
  } else await openFulfil()
  await p.screenshot({ path: join(shots, `k27-${name}-fulfil.png`) })
  if (phone) expect((await p.evaluate(() => document.querySelectorAll("[data-modal-sheet-head] [data-close]").length)) === 0, "on a phone Fulfill items is a sheet with no X")
  const items = await p.evaluate(() => [...document.querySelectorAll("[data-fulfil-items] li")].map((l) => l.innerText.replace(/\s+/g, " ")))
  expect(items.length === 2 && /Linen shirt M \/ Natural · SKU LS-M/.test(items[0]) && /2 of 2/.test(items[0]), "the items with their variant and how many go", items)
  const before = posts.length
  await tapSel(p, "[data-fulfil-submit]", phone)
  await sleep(300)
  expect(posts.length === before && /Choose the carrier, or Local delivery \/ no tracking\./.test(await text(p, "[data-fulfil-dialog]")), "nothing chosen: not sent, and the seller is told to choose")

  /* The carrier picker */
  const openPicker = async () => {
    await tapSel(p, "[data-carrier-field]", phone)
    await p.waitForSelector(phone ? '[data-carrier-list="phone"]' : "[data-carrier-popover]", { visible: true })
    await sleep(phone ? 900 : 250)
  }
  let longPick = 0
  if (phone) {
    longPick = await longest(p, async () => {
      const fr = await frameSheet(p, "phone-picker-open", openPicker, 100)
      console.log(`        picker sheet: ${fr.frames} frames recorded`)
    }, 100)
  } else await openPicker()
  await p.screenshot({ path: join(shots, `k27-${name}-picker.png`) })
  const groups = await p.evaluate(() => [...document.querySelectorAll("[data-carrier-list] [role=group]")].map((g) => ({ title: g.getAttribute("aria-label"), ids: [...g.querySelectorAll("[data-carrier-option]")].map((o) => o.dataset.carrierOption) })))
  expect(groups[0]?.title === "Popular in Romania" && groups[0].ids.slice(0, 3).join() === "fan-courier,sameday,cargus", "popular in the shipping country first: FAN Courier, Sameday, Cargus", groups[0])
  expect(groups.at(-1)?.ids.join() === "other,none", "Other and Local delivery / no tracking at the end", groups.at(-1))
  const logos = await imagesLoaded(p, "[data-carrier-list] [role=group]:first-child img[data-carrier-logo]")
  expect(logos.length >= 6 && logos.every((l) => l.ok), "each popular carrier with its logo, loaded", logos.map((l) => l.src))
  if (phone) {
    expect((await p.evaluate(() => [...document.querySelectorAll("[data-sheet-root]")].some((r) => r.querySelector('[data-carrier-list="phone"]') && r.querySelector('[aria-label="Close"]')))) === false, "the carrier sheet has no X either")
    console.log(`        longest task while the picker sheet opened (CPU x4): ${longPick}ms`)
  } else {
    const pop = await p.evaluate(() => { const f = document.querySelector("[data-carrier-field]").getBoundingClientRect(); const c = document.querySelector("[data-carrier-popover]").getBoundingClientRect(); return { fieldBottom: Math.round(f.bottom), popTop: Math.round(c.top), fieldW: Math.round(f.width), popW: Math.round(c.width), focus: document.activeElement?.hasAttribute("data-carrier-search") } })
    expect(pop.popTop >= pop.fieldBottom && pop.popTop - pop.fieldBottom <= 10 && pop.popW >= pop.fieldW && pop.focus, "on a computer a popover right under the field, as wide, the search focused", pop)
  }
  /* Search */
  if (phone) await tapSel(p, "[data-carrier-search]", true)
  await p.type("[data-carrier-search]", "fan")
  await sleep(300)
  const found = await p.evaluate(() => [...document.querySelectorAll("[data-carrier-option]")].map((o) => o.dataset.carrierOption))
  expect(found.join() === "fan-courier,other,none", "search finds FAN Courier", found)
  if (phone) await tapSel(p, '[data-carrier-option="fan-courier"]', true)
  else await p.keyboard.press("Enter")
  await sleep(phone ? 800 : 250)
  expect((await p.evaluate(() => document.querySelector("[data-carrier-field]")?.dataset.carrierField)) === "fan-courier" && (await p.evaluate(() => !document.querySelector("[data-carrier-popover], [data-carrier-list=phone]") || !document.querySelector("[data-carrier-list=phone]")?.closest("[data-app-sheet=open]"))), "chosen, and the list closed")
  await tapSel(p, "[data-fulfil-submit]", phone)
  await sleep(300)
  expect(posts.length === before && /Add the tracking number: the buyer follows the parcel with it/.test(await text(p, "[data-fulfil-dialog]")), "a carrier with no number: not sent, and the seller is told why")
  await tapSel(p, "[data-tracking-number]", phone)
  await p.type("[data-tracking-number]", "2345678901234")
  await sleep(300)
  if (phone) await p.evaluate(() => document.activeElement?.blur())
  const hint = await text(p, "[data-tracking-link]")
  expect(/fancourier\.ro/.test(hint), "the buyer's tracking page is named, with a link to check it", hint)
  const preview = await p.evaluate(() => { const e = document.querySelector("[data-email-preview]"); return e ? { text: e.innerText.replace(/\s+/g, " "), href: e.querySelector("a")?.href ?? null, logo: e.querySelector("img[data-carrier-logo]")?.dataset.carrierLogo ?? null } : null })
  expect(!!preview && /Part of order #11111111 is on the way|Order #11111111 is on the way/.test(preview.text) && /Good news, Jordan\./.test(preview.text) && preview.logo === "fan-courier" && /fancourier\.ro\/awb-tracking\/\?tracking=2345678901234/.test(preview.href ?? ""), "the email the buyer gets, previewed: subject, line, the carrier and its Track link", preview)
  await p.evaluate(() => document.querySelector("[data-email-preview]")?.scrollIntoView({ block: "end" }))
  await sleep(200)
  await p.screenshot({ path: join(shots, `k27-${name}-fulfil-filled.png`) })
  await tapSel(p, "[data-fulfil-submit]", phone)
  await p.waitForSelector("[data-shipment]")
  await sleep(700)
  const post = posts.at(-1)
  expect(post?.action === "fulfil" && post.carrier === "FAN Courier" && post.trackingNumber === "2345678901234" && post.trackingUrl === null && post.items.reduce((n, i) => n + i.quantity, 0) === 3, "posted: the items, FAN Courier and its number", post)
  const card = await p.evaluate(() => { const t = document.querySelector("[data-shipment] [data-tracking]"); return t ? { logo: t.querySelector("img[data-carrier-logo]")?.dataset.carrierLogo, truck: !!t.querySelector("svg.lucide-truck"), track: t.querySelector("a")?.href ?? null } : null })
  expect(card?.logo === "fan-courier" && !card.truck && /fancourier\.ro/.test(card.track ?? ""), "the shipment shows FAN Courier's logo, not a truck, and its Track link", card)
  expect((await p.evaluate(() => document.querySelectorAll("[data-timeline-carrier]").length)) >= 1, "the timeline's shipped entry carries the logo")
  await p.evaluate(() => document.querySelector("[data-shipment]").scrollIntoView({ block: "start" }))
  await sleep(200)
  await p.screenshot({ path: join(shots, `k27-${name}-shipped.png`) })

  /* Back: the dot is gone */
  await p.evaluate(() => document.querySelector('[aria-label="Back to orders"]').click())
  /* The dot fades once the list has slid back; wait for it, up to 4s on the slowed phone. */
  const t0 = Date.now()
  await p.waitForFunction(() => !document.querySelector('.orders-list tr[data-order-id="u-1"] [data-unseen]'), { timeout: 4000, polling: 50 }).catch(() => {})
  console.log(`        the dot went ${Date.now() - t0}ms after Back was pressed`)
  const after = await unseenRows(p)
  /* Let the list finish sliding back before the next order is pressed. */
  await sleep(1200)
  expect(after.join() === "d-2,n-1", "back on the list, the opened order has no dot", after)

  /* No tracking, for the order going to the UK */
  await p.evaluate(() => document.querySelector('.orders-list tr[data-order-id="n-1"] a').click())
  await p.waitForSelector("[data-unfulfilled-card]")
  await sleep(600)
  await openFulfil()
  await openPicker()
  const uk = await p.evaluate(() => [...document.querySelectorAll("[data-carrier-list] [role=group]:first-child [data-carrier-option]")].map((o) => o.dataset.carrierOption))
  expect(uk.slice(0, 2).join() === "royal-mail,evri", "an order to the UK: Royal Mail and Evri first", uk)
  await tapSel(p, '[data-carrier-option="none"]', phone)
  await sleep(phone ? 800 : 250)
  const none = await p.evaluate(() => ({ number: !!document.querySelector("[data-tracking-number]"), note: document.querySelector("[data-no-tracking]")?.innerText ?? null }))
  expect(!none.number && /No tracking number/.test(none.note ?? ""), "Local delivery / no tracking: no number asked, and it says what the buyer gets", none)
  await p.screenshot({ path: join(shots, `k27-${name}-no-tracking.png`) })
  await tapSel(p, "[data-fulfil-submit]", phone)
  await p.waitForSelector("[data-shipment]")
  await sleep(500)
  const post2 = posts.at(-1)
  expect(post2?.carrier === null && post2?.trackingNumber === null, "posted with no carrier and no number", post2)
  const noTrack = await p.evaluate(() => document.querySelector("[data-shipment]")?.innerText.replace(/\s+/g, " ") ?? "")
  expect(/No tracking number/.test(noTrack), "the shipment says it has no tracking number", noTrack.slice(0, 120))

  const sideways = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  expect(!sideways, "nothing runs off the side of the page")
  await p.close()
}

await browser.close()
server.close()
console.log(`\n${broken === 0 ? "all good" : `${broken} failed`}; screenshots in ${shots}`)
process.exit(broken ? 1 : 0)
