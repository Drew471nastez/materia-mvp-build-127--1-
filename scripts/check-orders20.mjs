/**
 * ===========================================================================
 *  ORDERS FOR THINGS THAT SHIP, MEASURED (round 20)
 * ===========================================================================
 * The real Orders page (scripts/render-orders20.tsx) in Chromium at a phone
 * (390x844, touch, CPU four times slower) and a computer (1440x900), with a
 * stand-in for /api/physical/orders/[id] that keeps what each action did.
 * It walks what a shop does with a parcel and checks it with numbers:
 *
 *   the list        a physical order says where it is (Unfulfilled ... ),
 *                   the Unfulfilled view and the Fulfillment filter find it,
 *                   a download keeps its own words
 *   the order       an Unfulfilled card per place, Fulfill items posts the
 *                   quantities, carrier and number, the carrier guessed from
 *                   the number, the buyer emailed; the shipment's card shows
 *                   the tracking link; Mark as delivered; the bar and the
 *                   list's row follow
 *   the side        the address card copies the address, the method and
 *                   what was paid for it
 *   the timeline    shipped with its Track link, delivered, a note posted
 *   mixed           the download keeps its card, the parcel its own
 *   layout          no sideways scroll on a phone, columns on a computer
 *
 * Screenshots go to SHOTS_DIR (default a temp folder), prefixed o20-.
 *   node scripts/check-orders20.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}`)
const css = (await appCss(root)) + "\n" + interFaces(root)
const out = mkdtempSync(join(tmpdir(), "storelib-o20-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".orders20-probe")
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
execFileSync("npx", ["esbuild", join(root, "scripts/render-orders20.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`, `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error"], { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(out, "probe.js"))

/* ── the stand-in for the physical order route ─────────────────────── */
const H = 3_600_000
const iso = (h) => new Date(Date.now() - h * H).toISOString()
const address = { name: "Jordan Blake", line1: "12 Strada Lipscani", line2: "Ap. 4", city: "Bucharest", region: null, postalCode: "030031", country: "RO", phone: "+40 712 345 678" }
const line = (orderId, title, quantity, unitCents, locationId, extra = {}) => ({ orderId, productId: "p", variantId: null, title, variantName: null, sku: null, imageUrl: null, type: "physical", quantity, unitCents, discountCents: 0, amountCents: unitCents * quantity, refundedCents: 0, requiresShipping: true, locationId, fulfillmentMethod: "self", fulfilled: 0, returned: 0, receiptToken: null, ...extra })
function order(id, over) {
  return { id, creatorId: "me", status: "paid", fulfillmentStatus: "unfulfilled", returnStatus: "none", currency: "USD", buyerEmail: "jordan@example.com", buyerName: "Jordan Blake", buyerPhone: "+40 712 345 678", itemsSubtotalCents: 0, discountCents: 0, shippingCents: 500, shippingDiscountCents: 0, taxCents: 0, taxIncluded: false, totalCents: 0, refundedCents: 0, platformFeeCents: 0, couponCode: null, address, delivery: { name: "Standard", priceCents: 500, minDays: 3, maxDays: 5 }, deliveryMethod: "ship", pickup: null, processingAt: null, deliveredAt: null, buyerNote: null, merchantNote: null, receiptToken: "t", paidAt: iso(5), createdAt: iso(5), cancelledAt: null, lines: [], shipments: [], returns: [], events: [], ...over }
}
const unf = "11111111-1111-4111-8111-111111111111"
const mix = "22222222-2222-4222-8222-222222222222"
const del = "33333333-3333-4333-8333-333333333333"
let orders
const fresh = () => ({
  [unf]: order(unf, { buyerNote: "Please leave it with the neighbour.", lines: [line("u-1", "Linen shirt", 2, 4500, "loc-home", { variantName: "M / Natural", sku: "LS-M" }), line("u-2", "Stoneware mug", 1, 2400, "loc-wh")], events: [{ id: 1, kind: "payment.paid", message: "Payment of $119.00 received", actor: "webhook", createdAt: iso(5), detail: null }, { id: 2, kind: "email.sent", message: "Order confirmation emailed to the buyer", actor: "system", createdAt: iso(4.9), detail: null }] }),
  [mix]: order(mix, { fulfillmentStatus: "fulfilled", buyerName: "Ana Pop", address: { ...address, name: "Ana Pop" }, delivery: { name: "Express", priceCents: 700, minDays: 1, maxDays: 2 }, shippingCents: 700, lines: [line("m-1", "Linen shirt", 1, 4500, "loc-home", { fulfilled: 1 }), { ...line("m-2", "Lightroom preset pack", 1, 1900, null), type: "digital", requiresShipping: false }], shipments: [{ id: "f-mix", status: "in_transit", locationId: "loc-home", provider: "manual", carrier: "UPS", service: null, trackingNumber: "1Z999AA10123456784", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784", shippedAt: iso(40), deliveredAt: null, createdAt: iso(40), items: [{ orderId: "m-1", quantity: 1 }], events: [] }] }),
  [del]: order(del, { fulfillmentStatus: "delivered", lines: [line("v-1", "Stoneware mug", 1, 2400, "loc-home", { fulfilled: 1 })], shipments: [{ id: "f-del", status: "delivered", locationId: "loc-home", provider: "manual", carrier: "USPS", service: null, trackingNumber: "9400111899223197428490", trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490", shippedAt: iso(110), deliveredAt: iso(60), createdAt: iso(110), items: [{ orderId: "v-1", quantity: 1 }], events: [] }] }),
})
orders = fresh()
const byRow = { "u-1": unf, "u-2": unf, "m-1": mix, "m-2": mix, "v-1": del }
const locations = [{ id: "loc-home", name: "Home studio" }, { id: "loc-wh", name: "Cluj warehouse" }]
const posts = []
let eventId = 100
function restate(o) {
  const ship = o.lines.filter((l) => l.requiresShipping)
  const want = ship.reduce((n, l) => n + l.quantity, 0)
  const done = ship.reduce((n, l) => n + l.fulfilled, 0)
  const live = o.shipments.filter((s) => s.status !== "cancelled")
  o.fulfillmentStatus = done === 0 ? "unfulfilled" : done < want ? "partially_fulfilled" : live.every((s) => s.status === "delivered") ? "delivered" : "fulfilled"
}
function act(o, b) {
  if (b.action === "fulfil") {
    const id = `f-${eventId++}`
    for (const i of b.items) o.lines.find((l) => l.orderId === i.orderId).fulfilled += i.quantity
    const url = b.carrier === "UPS" ? `https://www.ups.com/track?tracknum=${b.trackingNumber}` : null
    o.shipments.push({ id, status: "shipped", locationId: b.locationId ?? null, provider: "manual", carrier: b.carrier, service: null, trackingNumber: b.trackingNumber, trackingUrl: url, shippedAt: new Date().toISOString(), deliveredAt: null, createdAt: new Date().toISOString(), items: b.items.filter((i) => i.quantity > 0), events: [] })
    if (b.notifyBuyer) o.events.unshift({ id: eventId++, kind: "email.sent", message: "Shipping email sent to the buyer", actor: "system", createdAt: new Date(Date.now() + 1000).toISOString(), detail: null })
  } else if (b.action === "shipment") {
    const s = o.shipments.find((x) => x.id === b.fulfillmentId)
    s.status = b.status
    if (b.status === "delivered") s.deliveredAt = new Date().toISOString()
  } else if (b.action === "comment") {
    o.events.unshift({ id: eventId++, kind: "note", message: b.text.slice(0, 300), actor: "creator", createdAt: new Date().toISOString(), detail: { text: b.text } })
  }
  restate(o)
}

const page = `<!doctype html><html class="light app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};localStorage.setItem("storelib_timezone","Europe/Bucharest")</script><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  const json = (body, status = 200) => setTimeout(() => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 120)
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  const m = req.url.match(/^\/api\/physical\/orders\/([^/?]+)/)
  if (m) {
    const o = orders[decodeURIComponent(m[1])] ?? orders[byRow[decodeURIComponent(m[1])]]
    if (!o) return json({ error: "Not found." }, 404)
    if (req.method === "POST") {
      let body = ""
      req.on("data", (c) => (body += c))
      req.on("end", () => { const b = JSON.parse(body); posts.push(b); act(o, b); json({ order: o }) })
      return
    }
    return json({ order: o, locations })
  }
  if (req.url.startsWith("/api/")) return json({})
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
const clickText = (p, scope, label) => p.evaluate((scope, label) => { const b = [...document.querySelectorAll(`${scope} button, ${scope} a`)].find((x) => x.innerText.trim() === label); if (!b) return false; b.click(); return true }, scope, label)
const rowStage = (p, id) => p.evaluate((id) => document.querySelector(`.orders-list tr[data-order-id="${id}"] [data-ship-stage]`)?.textContent ?? null, id)
const sideways = (p) => p.evaluate(() => [...document.querySelectorAll(".orders-detail, .orders-detail *")].some((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible" && el.getBoundingClientRect().right > innerWidth + 1))

for (const [name, vp] of [["phone", PHONE], ["desk", DESK]]) {
  console.log(`\n${name} ${vp.width}x${vp.height}`)
  orders = fresh()
  const p = await browser.newPage()
  await p.emulateTimezone("Europe/Bucharest")
  await p.setViewport(vp)
  if (name === "phone") { const cdp = await p.createCDPSession(); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }) }
  await p.goto(`${origin}/app/orders`, { waitUntil: "load" })
  await p.waitForSelector(".orders-scroller table tbody tr")
  await sleep(300)
  await p.screenshot({ path: join(shots, `o20-${name}-list.png`) })

  /* The list */
  const stages = await p.evaluate(() => [...document.querySelectorAll("[data-ship-stage]")].map((e) => e.textContent))
  expect(stages.includes("Unfulfilled") && stages.includes("Fulfilled") && stages.includes("Delivered"), "physical rows say where they are", stages)
  const digital = await p.evaluate(() => document.querySelector('.orders-list tr[data-order-id="d-1"]')?.innerText ?? "")
  expect(/Fulfilled/.test(digital) && !/Delivered\s+Delivered/.test(digital), "a download keeps its own words", digital.replace(/\s+/g, " "))
  const method = await p.evaluate(() => document.querySelector('.orders-list tr[data-order-id="u-1"]')?.innerText ?? "")
  expect(/Standard/.test(method), "the delivery method column names the rate", method.replace(/\s+/g, " "))
  await clickText(p, "[role=tablist]", "Unfulfilled")
  await sleep(250)
  const unfRows = await p.evaluate(() => [...document.querySelectorAll(".orders-list tbody tr")].map((r) => r.dataset.orderId))
  expect(unfRows.length === 1 && unfRows[0] === "u-1", "the Unfulfilled view shows what is still to send", unfRows)
  await clickText(p, "[role=tablist]", "All")
  await p.evaluate(() => document.querySelector('[aria-label="Search and filter"]').click())
  await sleep(200)
  await clickText(p, ".orders-strip", "Fulfillment")
  await sleep(200)
  await p.evaluate(() => [...document.querySelectorAll("[role=menuitemradio]")].find((b) => b.innerText.trim() === "Delivered").click())
  await sleep(250)
  const delRows = await p.evaluate(() => [...document.querySelectorAll(".orders-list tbody tr")].map((r) => r.dataset.orderId))
  expect(delRows.length === 1 && delRows[0] === "v-1" && /fulfillment=delivered/.test(await p.evaluate(() => location.search)), "the Fulfillment filter finds delivered orders, and the address keeps it", delRows)
  await p.screenshot({ path: join(shots, `o20-${name}-filter.png`) })
  await p.evaluate(() => document.querySelector('[aria-label="Clear Fulfillment"]').click())
  await sleep(200)

  /* The order to ship */
  await p.evaluate(() => document.querySelector('.orders-list tr[data-order-id="u-1"] a').click())
  await p.waitForSelector("[data-unfulfilled-card]")
  await sleep(500)
  const cards = await p.evaluate(() => [...document.querySelectorAll("[data-unfulfilled-card]")].map((c) => c.innerText.replace(/\s+/g, " ")))
  expect(cards.length === 2 && /Home studio/.test(cards.join()) && /Cluj warehouse/.test(cards.join()), "one Unfulfilled card per place it leaves from", cards)
  const side = await text(p, "[data-shipping-card]")
  expect(/Jordan Blake/.test(side) && /Lipscani/.test(side) && /Standard/.test(side) && /\$5\.00/.test(side), "the address, the method and what was paid for it", side.replace(/\s+/g, " "))
  const pay = await p.evaluate(() => [...document.querySelectorAll(".orders-body section")].map((s) => s.innerText).find((t) => /Subtotal/.test(t)) ?? "")
  expect(/Shipping\s+Standard\s+\$5\.00/.test(pay), "the payment has its Shipping row", pay.replace(/\s+/g, " "))
  expect(/leave it with the neighbour/.test(await text(p, ".orders-body")), "the buyer's note is on the page")
  await p.evaluate(() => document.querySelector("[data-copy-address]").click())
  await sleep(150)
  expect(/Address copied|Could not copy/.test(await p.evaluate(() => document.body.innerText)), "the address copies in one press")
  await p.screenshot({ path: join(shots, `o20-${name}-order.png`), fullPage: false })
  expect(!(await sideways(p)), "nothing runs off the side")

  /* Fulfill items */
  await p.evaluate(() => document.querySelector("[data-unfulfilled-card] [data-fulfil]").click())
  await p.waitForSelector("[data-fulfil-submit]")
  await sleep(450)
  const field = await p.evaluateHandle(() => [...document.querySelectorAll("input")].find((i) => i.closest("label, div")?.innerText?.includes("Tracking number") && i.placeholder === "Optional"))
  await field.asElement().type("1Z999AA10123456784")
  await sleep(150)
  const carrier = await p.evaluate(() => [...document.querySelectorAll("select")].map((s) => s.value).find((v) => v) ?? "")
  const hint = await text(p, "[data-tracking-link]")
  expect(carrier === "UPS" && /ups\.com/.test(hint), "the carrier is guessed from the number, and the link is named", { carrier, hint })
  await p.screenshot({ path: join(shots, `o20-${name}-fulfil.png`) })
  const label = await text(p, "[data-fulfil-submit]")
  expect(label === "Fulfill 2 items", "the button says how many go", label)
  await p.evaluate(() => document.querySelector("[data-fulfil-submit]").click())
  await p.waitForSelector("[data-shipment]")
  await sleep(500)
  const post = posts.at(-1)
  expect(post?.action === "fulfil" && post.items[0].quantity === 2 && post.carrier === "UPS" && post.trackingNumber === "1Z999AA10123456784" && post.notifyBuyer === true && post.locationId === "loc-home", "Fulfill posts quantities, carrier, number, the place and the email", post)
  const shipCard = await text(p, "[data-shipment]")
  expect(/Fulfilled/.test(shipCard) && /1Z999AA10123456784/.test(shipCard) && /Track/.test(shipCard), "the shipment's card has its tracking and a Track link", shipCard.replace(/\s+/g, " "))
  const bar = await p.evaluate(() => document.querySelector(".orders-detail [data-orders-bar] [data-ship-stage]")?.textContent)
  expect(bar === "Partially fulfilled", "the bar follows: partially fulfilled", bar)
  const tl = await text(p, "[data-order-timeline]")
  expect(/2 items shipped/.test(tl) && /UPS 1Z999AA10123456784/.test(tl), "the timeline says it shipped, with the number", tl.replace(/\s+/g, " ").slice(0, 400))
  await p.screenshot({ path: join(shots, `o20-${name}-shipped.png`) })

  /* A note */
  await p.evaluate(() => document.querySelector("[data-note-composer] textarea").scrollIntoView({ block: "center" }))
  await p.type("[data-note-composer] textarea", "Called Jordan, the mug ships Monday.")
  await p.evaluate(() => document.querySelector("[data-note-post]").click())
  await sleep(700)
  const note = await p.evaluate(() => [...document.querySelectorAll("[data-timeline-note]")].map((n) => n.innerText))
  expect(note.includes("Called Jordan, the mug ships Monday.") && posts.at(-1)?.action === "comment" && typeof posts.at(-1)?.key === "string", "a note is posted to the timeline", note)
  expect((await p.evaluate(() => document.querySelector("[data-note-composer] textarea").value)) === "", "and the box empties")
  await p.screenshot({ path: join(shots, `o20-${name}-note.png`) })
  await p.evaluate(() => document.querySelector("[data-shipment]").scrollIntoView({ block: "start" }))
  await sleep(100)
  await p.screenshot({ path: join(shots, `o20-${name}-shipcard.png`) })

  /* Delivered */
  await p.evaluate(() => document.querySelector("[data-mark-delivered]").click())
  await sleep(700)
  const after = await p.evaluate(() => document.querySelector("[data-shipment]")?.innerText ?? "")
  expect(/Delivered/.test(after) && posts.at(-1)?.status === "delivered", "Mark as delivered", after.replace(/\s+/g, " "))
  expect(/2 items delivered/.test(await text(p, "[data-order-timeline]")), "the timeline says delivered")

  /* Back: the list's row follows */
  await p.evaluate(() => document.querySelector('[aria-label="Back to orders"]').click())
  await sleep(900)
  expect((await rowStage(p, "u-1")) === "Partially fulfilled", "the list's row follows the order", await rowStage(p, "u-1"))

  /* Mixed */
  await p.evaluate(() => document.querySelector('.orders-list tr[data-order-id="m-1"] a').click())
  await p.waitForSelector("[data-shipment]")
  await sleep(500)
  const digi = await text(p, "[data-digital-card]")
  const ship = await text(p, "[data-shipment]")
  expect(/Lightroom preset pack/.test(digi) && !/Linen shirt/.test(digi) && /Linen shirt/.test(ship) && /In transit/.test(ship), "a mixed order: the download in its card, the parcel in its own", { digi: digi.replace(/\s+/g, " "), ship: ship.replace(/\s+/g, " ") })
  expect(!(await sideways(p)), "nothing runs off the side (mixed)")
  await p.screenshot({ path: join(shots, `o20-${name}-mixed.png`), fullPage: false })
  if (name === "desk") {
    const cols = await p.evaluate(() => {
      const a = document.querySelector("[data-shipment]").getBoundingClientRect()
      const b = document.querySelector("[data-shipping-card]").getBoundingClientRect()
      return { mainRight: Math.round(a.right), sideLeft: Math.round(b.left), sideTop: Math.round(b.top) }
    })
    expect(cols.sideLeft > cols.mainRight, "the address sits in the side column on a computer", cols)
  }
  await p.close()
}

await browser.close()
server.close()
console.log(`\n${broken === 0 ? "all good" : `${broken} failed`}; screenshots in ${shots}`)
process.exit(broken ? 1 : 0)
