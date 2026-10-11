/**
 * ===========================================================================
 *  PHYSICAL COMMERCE ON A PHONE AND A COMPUTER
 * ===========================================================================
 * The real components (scripts/render-physical.tsx) at 390 and 1280 against
 * a server that answers like /api/physical. It checks, on each:
 *
 *   CHECKOUT    nothing scrolls sideways; no delivery options until there is
 *               a country, then the shop's; Pay stays off until email,
 *               address and option are in; Pay sends ids, the address and
 *               the option, never a price; a bad code is said and dropped.
 *   BUY BOX     a sold out combination is crossed out and can't be bought;
 *               "Only 2 left" caps the quantity at 2; Buy now goes to the
 *               physical checkout with this line.
 *   SETTINGS    the first question shows and answers; Enter in a field never
 *               submits the Settings form around it; every part opens.
 *   PRODUCT     options typed with Enter make every combination a row.
 *   INVENTORY   rows, the adjust dialog, a change posted with a reason.
 *   ORDER       Fulfill items posts the quantities and tracking.
 *   STATUS      the buyer's order page: steps, tracking, items, a return.
 *   OFF         with the switch off the buy box can't be used and says so.
 *
 *   node scripts/check-physical-commerce.mjs
 *   SHOTS=/some/dir node scripts/check-physical-commerce.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const dir = join(root, ".physical-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-physical.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const SHOP = "0f3a9c2e-1111-2222-3333-444455556666"
const V = (n) => `00000000-0000-4000-8000-00000000000${n}`
const LOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const LOC2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
let posted = []
let onboarded = false

const settings = () => ({
  settings: { fulfillmentModel: onboarded ? "self" : null, defaultLocationId: LOC, defaultPackageId: null, unitSystem: "metric", returnsEnabled: true, returnWindowDays: 30, taxMode: "none", pricesIncludeTax: false, taxOnShipping: false, lowStockDefault: 5, lowStockAlerts: true, onboardedAt: onboarded ? "2026-10-01T00:00:00Z" : null },
  locations: [{ id: LOC, name: "Studio", kind: "home", country: "RO", city: "Cluj", addressLine1: "Str 1", addressLine2: null, region: null, postalCode: "400001", phone: null, email: null, active: true, fulfillsOrders: true, holdsInventory: true, priority: 0, forwarding: "none", pickupEnabled: true, pickupInstructions: "Side door", pickupReady: "24h" }],
  profiles: [{ id: "p1", name: "General", isDefault: true, zones: [
    { id: "z1", profileId: "p1", name: "Romania", countries: ["RO"], regions: [], restOfWorld: false, rates: [{ id: "r1", zoneId: "z1", name: "Standard", kind: "flat", priceCents: 1500, minValue: null, maxValue: null, tiers: [], freeOverCents: 10000, minDays: 2, maxDays: 4, active: true, position: 0 }] },
    { id: "z2", profileId: "p1", name: "Rest of world", countries: [], regions: [], restOfWorld: true, rates: [{ id: "r2", zoneId: "z2", name: "International", kind: "weight", priceCents: 3500, minValue: null, maxValue: 30000, tiers: [{ from: 0, priceCents: 3500 }, { from: 2000, priceCents: 5000 }], freeOverCents: null, minDays: 5, maxDays: 10, active: true, position: 0 }] },
  ] }],
  packages: [],
  taxRates: [],
  integrations: [{ provider: "custom_webhook", status: "disconnected", url: null, keyHint: null, secretHint: null, lastSyncAt: null, lastError: null }],
})

const order = (shipped, pickup = false, processing = false) => ({
  deliveryMethod: pickup ? "pickup" : "ship", pickup: pickup ? { locationId: LOC, name: "Studio", address: ["Str 1", "Cluj, 400001", "Romania"], instructions: "Side door", ready: "24h" } : null, processingAt: processing ? "2026-10-01T11:00:00Z" : null,
  id: SHOP, status: "paid", fulfillmentStatus: shipped ? "fulfilled" : processing ? "processing" : "unfulfilled", returnStatus: "none", currency: "USD", totalCents: 9600, refundedCents: 0, shippingCents: 1500, shippingDiscountCents: 0,
  address: { name: "Mara Lind", line1: "Str. Lunga 5", city: "Cluj", postalCode: "400001", country: "RO" }, delivery: { name: "Standard", priceCents: 1500, minDays: 2, maxDays: 4 },
  buyerNote: "Gift wrap please", merchantNote: null, cancelledAt: null,
  lines: [{ orderId: "11111111-1111-4111-8111-111111111111", title: "Linen shirt", variantName: "M / Sand", sku: "LS-M-S", imageUrl: null, type: "physical", quantity: 2, requiresShipping: true, locationId: LOC, fulfillmentMethod: "self", fulfilled: shipped ? 2 : 0, returned: 0, amountCents: 8700, refundedCents: 0 }],
  shipments: shipped ? [{ id: "f1", status: "shipped", carrier: "UPS", trackingNumber: "1Z999AA10123456784", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784", shippedAt: "2026-10-02T10:00:00Z", deliveredAt: null, locationId: LOC, items: [{ orderId: "11111111-1111-4111-8111-111111111111", quantity: 2 }] }] : [],
  returns: [], events: [{ id: 1, kind: "payment.paid", message: "Payment of $96.00 received", actor: "webhook", createdAt: "2026-10-01T10:00:00Z" }],
})

function quote(body) {
  const items = body.items || []
  const lines = items.map((i, n) => ({ productId: i.productId, variantId: i.variantId, title: n ? "Canvas tote" : "Linen shirt", variantName: n ? null : "M / Sand", imageUrl: null, type: "physical", quantity: i.quantity, unitCents: n ? 2000 : 4500, discountCents: 0, requiresShipping: true }))
  const sub = lines.reduce((t, l) => t + l.unitCents * l.quantity, 0)
  const couponError = body.couponCode === "BAD" ? "That code is not valid." : null
  const options = body.country === "RO" ? [{ id: "r1", name: "Standard", priceCents: 1500, estimate: "2 to 4 business days" }, { id: "r3", name: "Express", priceCents: 3000, estimate: "1 business day" }] : body.country ? [] : []
  const selected = options.find((o) => o.id === body.deliveryOptionId) ?? options[0] ?? null
  const ship = selected ? selected.priceCents : 0
  return {
    creatorId: SHOP, lines, dropped: [], stockIssues: items.some((i) => i.quantity > 5) ? [{ productId: items[0].productId, variantId: items[0].variantId, title: "Linen shirt", available: 5 }] : [],
    requiresShipping: true, coupon: null, couponError,
    delivery: body.country === "RO" || !body.country ? { ok: true, options, selectedId: selected?.id ?? null, needsCountry: !body.country } : { ok: false, error: "Linen shirt can't be shipped to United States yet. Choose pickup instead, or remove it from your order.", options: [], selectedId: null, needsCountry: false },
    pickups: [{ id: `pickup:${LOC}`, name: "Studio", address: ["Str 1", "Cluj, 400001", "Romania"], instructions: "Ring the bell at the side door.", ready: "Usually ready in 24 hours" }],
    totals: { itemsSubtotalCents: sub, discountCents: 0, shippingCents: ship, shippingDiscountCents: 0, taxCents: 0, taxIncluded: false, taxRateBps: 0, totalCents: sub + ship },
  }
}

const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    let raw = ""
    req.on("data", (c) => { raw += c })
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {}
      if (req.method !== "GET") posted.push({ url: req.url, method: req.method, body })
      let out = {}
      let status = 200
      const u = req.url
      if (u.startsWith("/api/physical/checkout/quote")) out = quote(body)
      else if (u === "/api/physical/checkout") out = { url: "/thanks", free: false }
      else if (u.startsWith("/api/physical/storefront/product")) out = {
        product: { id: SHOP, creatorId: SHOP, title: "Linen shirt", slug: "linen-shirt", imageUrl: null },
        options: [{ name: "Size", values: ["S", "M", "L"] }, { name: "Color", values: ["Sand", "Black"] }],
        variants: [
          ["S", "Sand", false, null, 50], ["S", "Black", false, null, 50], ["M", "Sand", false, null, 50], ["M", "Black", true, null, 0], ["L", "Sand", false, 2, 2], ["L", "Black", true, null, 0],
        ].map(([a, b, soldOut, left, max], n) => ({ id: V(n), name: `${a} / ${b}`, options: [a, b, null], priceCents: 4500, compareAtCents: n === 0 ? 6000 : null, imageUrl: null, soldOut, left, maxQuantity: max })),
      }
      else if (u.startsWith("/api/physical/settings")) out = settings()
      else if (u.startsWith("/api/physical/onboarding")) { onboarded = true; out = settings() }
      else if (u.startsWith("/api/physical/shipping/profiles")) out = { profiles: settings().profiles }
      else if (u.startsWith("/api/physical/catalog-context")) out = { locations: [...settings().locations, { ...settings().locations[0], id: LOC2, name: "Warehouse", kind: "warehouse" }], profiles: [{ id: "p1", name: "General", isDefault: true, zoneCount: 2 }], settings: settings().settings }
      else if (u.startsWith("/api/physical/products/")) out = { product: { vendor: null, tags: [], requiresShipping: true, weightGrams: 300, lengthMm: null, widthMm: null, heightMm: null, weightUnit: "kg", dimensionUnit: "cm", originCountry: null, hsCode: null, taxable: true, trackInventory: true, continueSelling: false, lowStockThreshold: null, fulfillmentLocationId: null, shippingProfileId: null, options: [], variants: [], levels: [] } }
      else if (u.startsWith("/api/physical/inventory/movements")) out = { movements: [{ id: 1, variantId: V(0), locationId: LOC, deltaOnHand: 10, deltaCommitted: 0, deltaIncoming: 0, onHandAfter: 10, reason: "initial", note: null, actor: "creator", createdAt: "2026-10-01T10:00:00Z" }] }
      else if (u.startsWith("/api/physical/inventory")) out = req.method === "GET" ? {
        locations: [...settings().locations, { ...settings().locations[0], id: LOC2, name: "Warehouse", kind: "warehouse" }],
        rows: [
          { variantId: V(0), productId: SHOP, productTitle: "Linen shirt with a rather long name that wraps", productImage: null, variantName: "M / Sand", sku: "LS-M-S", trackInventory: true, lowStockThreshold: 5, levels: [{ variantId: V(0), locationId: LOC, onHand: 12, committed: 2, incoming: 0, available: 10 }], onHand: 12, committed: 2, available: 10, incoming: 0 },
          { variantId: V(1), productId: SHOP, productTitle: "Canvas tote", productImage: null, variantName: "Default", sku: null, trackInventory: true, lowStockThreshold: 5, levels: [{ variantId: V(1), locationId: LOC, onHand: 3, committed: 0, incoming: 20, available: 3 }], onHand: 3, committed: 0, available: 3, incoming: 20 },
          { variantId: V(2), productId: SHOP, productTitle: "Enamel pin", productImage: null, variantName: "Default", sku: "PIN", trackInventory: true, lowStockThreshold: 5, levels: [], onHand: 0, committed: 0, available: 0, incoming: 0 },
        ], lowStockDefault: 5,
      } : { level: { onHand: 22, committed: 2, incoming: 0, available: 20 }, applied: true }
      else if (u.startsWith("/api/physical/transfers")) out = { transfers: [] }
      else if (u.startsWith("/api/collections")) out = { collections: [{ id: "c1", title: "Summer", slug: "summer", description: null, kind: "smart", rules: [{ field: "tag", op: "equals", value: "summer" }], match: "all", sort: "manual", published: true, productIds: [SHOP] }], products: [{ id: SHOP, title: "Linen shirt", thumbnail_url: null, type: "physical", status: "published", price_cents: 4500 }] }
      else if (u.startsWith("/api/physical/orders/")) out = { order: order(req.method === "POST" && body.action === "fulfil", u.includes("/pickup"), req.method === "POST" && body.action === "processing"), locations: [{ id: LOC, name: "Studio" }] }
      else if (u === "/api/physical/locations" && req.method === "POST") out = { location: { ...settings().locations[0], id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: body.name, kind: body.kind, email: body.email, forwarding: body.forwarding, pickupEnabled: false } }
      else if (u.startsWith("/api/physical/shipping/rates")) out = { profiles: settings().profiles }
      else status = 404
      setTimeout(() => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(out)) }, 120)
    })
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const sideways = (page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth, ...[...document.querySelectorAll(".orders-pane")].map((p) => p.scrollWidth - p.clientWidth)))
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }) }
const typeInto = async (page, selector, text) => { await page.click(selector, { clickCount: 3 }); await page.type(selector, text) }

try {
  for (const [label, viewport] of [
    ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ["1280", { width: 1280, height: 900, deviceScaleFactor: 1 }],
  ]) {
    const open = async (view, extra = "") => {
      const page = await browser.newPage()
      await page.setViewport(viewport)
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e)))
      await page.goto(`${base}/?view=${view}${extra}`)
      await wait(700)
      return { page, errors }
    }

    /* ── Checkout ─────────────────────────────────────────────── */
    {
      const items = Buffer.from(JSON.stringify([[SHOP, V(2), 2], [V(9), "", 1]])).toString("base64url")
      const { page, errors } = await open("checkout", `&items=${items}`)
      console.log(`\nCheckout, ${label}px`)
      posted = []
      await page.evaluate(() => { const s = document.querySelector("select[autocomplete=country]"); s.value = ""; s.dispatchEvent(new Event("change", { bubbles: true })) })
      await wait(600)
      const before = await page.evaluate(() => ({ text: document.body.innerText, pay: [...document.querySelectorAll("button")].find((b) => /^(Pay|Opening|Continue to payment|Place order)/.test(b.innerText.trim()))?.disabled }))
      expect(/Choose your country to see delivery options/.test(before.text), "no delivery options before a country")
      expect(before.pay === true, "Pay is off until the details are in")
      await page.type("input[type=email]", "mara@example.com")
      await page.select("select[autocomplete=country]", "RO")
      await page.type("input[autocomplete=name]", "Mara Lind")
      await page.type("input[autocomplete=address-line1]", "Str. Lunga 5")
      await page.type("input[autocomplete=address-level2]", "Cluj")
      await page.type("input[autocomplete=postal-code]", "400001")
      await wait(900)
      const after = await page.evaluate(() => ({ radios: document.querySelectorAll("input[name=delivery]").length, pay: [...document.querySelectorAll("button")].find((b) => /^(Pay|Continue to payment|Place order)/.test(b.innerText.trim()))?.disabled, text: document.body.innerText }))
      expect(after.radios === 2, "the shop's two options for Romania", after.radios)
      /* The button says Continue to payment (Stripe's form opens in the page); the server's total is in the order summary. */
      expect(after.pay === false && /\b1\d\d\.\d\d\b/.test(after.text), "Pay is on, with the server's total on the page (in the store's currency)", after.text.match(/\d+\.\d\d/g)?.join(" "))
      expect(await sideways(page) === 0, "nothing scrolls sideways")
      await shot(page, `checkout-${label}`)
      await page.evaluate(() => [...document.querySelectorAll("input[name=delivery]")][1].click())
      await wait(700)
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^(Pay|Continue to payment|Place order)/.test(b.innerText.trim())).click())
      await wait(500)
      const pay = posted.find((p) => p.url === "/api/physical/checkout")
      expect(!!pay && pay.body.deliveryOptionId === "r3" && pay.body.address?.country === "RO" && pay.body.items.length === 2, "Pay sends the chosen option, the address and the items", JSON.stringify(pay?.body ?? null).slice(0, 200))
      expect(!!pay && !/cents|total|price/i.test(JSON.stringify(pay.body)), "and never a price")
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }

    /* ── Checkout: no shipping, and local pickup ─────────────── */
    {
      const items = Buffer.from(JSON.stringify([[SHOP, V(2), 2]])).toString("base64url")
      const { page, errors } = await open("checkout", `&items=${items}`)
      console.log(`\nCheckout pickup, ${label}px`)
      await page.type("input[type=email]", "mara@example.com")
      await page.type("input[autocomplete=name]", "Mara Lind")
      /* Nothing ships to the United States here: said plainly, Pay off, pickup offered. */
      await page.select("select[autocomplete=country]", "US")
      await wait(900)
      const none = await page.evaluate(() => ({ text: document.querySelector("[data-no-shipping]")?.innerText ?? "", pay: [...document.querySelectorAll("button")].find((b) => /^(Pay|Opening|Continue to payment|Place order)/.test(b.innerText.trim()))?.disabled }))
      expect(/Shipping isn't available to United States/.test(none.text) && /Linen shirt can't be shipped to United States yet\. Choose pickup instead/.test(none.text) && none.pay === true, "no rate for the address: the item named, Pay off, pickup offered", none.text)
      /* Pick up: no address, the point's details, Pay sends the pickup and no address. */
      posted = []
      await page.evaluate(() => [...document.querySelectorAll("[role=radio]")].find((b) => b.innerText.trim() === "Pick up").click())
      await wait(900)
      const pk = await page.evaluate(() => ({ text: document.querySelector("[data-pickup]")?.innerText ?? "", address: !!document.querySelector("input[autocomplete=address-line1]") }))
      expect(/Studio/.test(pk.text) && /Usually ready in 24 hours/.test(pk.text) && /side door/i.test(pk.text) && !pk.address, "Pick up shows the point, when it's ready and the instructions, and no address", pk.text.slice(0, 160))
      await shot(page, `checkout-pickup-${label}`)
      expect(await sideways(page) === 0, "nothing scrolls sideways with pickup")
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^(Pay|Continue to payment|Place order)/.test(b.innerText.trim())).click())
      await wait(500)
      const pp = posted.find((p) => p.url === "/api/physical/checkout")
      expect(!!pp && pp.body.deliveryOptionId === "pickup:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" && pp.body.address === null && pp.body.name === "Mara Lind", "Pay for a pickup sends the pickup point, a name and no address", JSON.stringify(pp?.body ?? null).slice(0, 220))
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }

    /* ── Buy box ──────────────────────────────────────────────── */
    {
      const { page, errors } = await open("buybox")
      console.log(`\nBuy box, ${label}px`)
      const chips = await page.evaluate(() => [...document.querySelectorAll("[data-physical-buy-box] fieldset button")].map((b) => b.innerText))
      expect(chips.join() === "S,M,L,Sand,Black", "the options as chips", chips.join())
      const click = (t) => page.evaluate((t) => [...document.querySelectorAll("[data-physical-buy-box] fieldset button")].find((b) => b.innerText === t).click(), t)
      await click("M"); await click("Black"); await wait(200)
      const sold = await page.evaluate(() => ({ text: document.querySelector("[data-physical-buy-box]").innerText, add: [...document.querySelectorAll("[data-physical-buy-box] button")].find((b) => /Sold out|Add to cart/.test(b.innerText))?.disabled }))
      expect(/Sold out/.test(sold.text) && sold.add === true, "a sold out combination can't be bought")
      await click("L"); await click("Sand"); await wait(200)
      const more = () => page.evaluate(() => document.querySelector("[aria-label=More]").click())
      await more(); await more(); await more(); await wait(100)
      const left = await page.evaluate(() => ({ text: document.querySelector("[data-physical-buy-box]").innerText, qty: document.querySelector("[aria-live=polite]").innerText }))
      expect(/Only 2 left/.test(left.text) && left.qty === "2", "Only 2 left, and the quantity stops at 2", left.qty)
      const heights = await page.evaluate(() => [...document.querySelectorAll("[data-physical-buy-box] button")].map((b) => Math.round(b.getBoundingClientRect().height)))
      expect(heights.every((h) => h >= 40), "every button at least 40px", heights.join(" "))
      expect(await sideways(page) === 0, "nothing scrolls sideways")
      await shot(page, `buybox-${label}`)
      await page.evaluate(() => [...document.querySelectorAll("[data-physical-buy-box] button")].find((b) => b.innerText.trim() === "Buy now").click())
      await wait(300)
      expect(page.url().includes("/checkout/physical?shop=") && page.url().includes("items="), "Buy now goes to the physical checkout", page.url())
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }

    /* ── Off ──────────────────────────────────────────────────── */
    {
      const { page } = await open("buybox", "&off=1")
      const text = await page.evaluate(() => document.body.innerText)
      expect(/Not available right now/.test(text), `switched off, the buy box says it can't be bought (${label}px)`)
      await page.close()
    }

    /* ── Settings ─────────────────────────────────────────────── */
    {
      onboarded = false
      const { page, errors } = await open("shipping")
      console.log(`\nShipping settings, ${label}px`)
      const q = await page.evaluate(() => document.body.innerText)
      expect(/How do you fulfil your physical orders\?/.test(q), "the first question", q.slice(0, 300) + " :: " + errors.join(" | "))
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.startsWith("I ship orders myself")).click())
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Continue").click())
      await wait(500)
      expect(!/How do you fulfil/.test(await page.evaluate(() => document.body.innerText)), "answered, it goes away")
      expect(/Romania/.test(await page.evaluate(() => document.body.innerText)) && /Free over|free over/.test(await page.evaluate(() => document.body.innerText)), "zones and rates, with free over")
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Add rate").click())
      await wait(150)
      await page.focus("[data-shipping-settings] input")
      await page.keyboard.press("Enter")
      await wait(150)
      expect(!(await page.evaluate(() => window.submitted)), "Enter in a field never submits the Settings form")
      /* A tiered rate: based on order weight, a second step, posted as tiers. */
      posted = []
      await page.evaluate(() => [...document.querySelectorAll("[data-rate-form] [role=radio]")].find((b) => /Based on order weight/.test(b.innerText)).click())
      await wait(150)
      await page.type("[data-rate-form] input[aria-label='Price, step 1']", "5")
      await page.evaluate(() => [...document.querySelectorAll("[data-rate-form] button")].find((b) => /Add a step/.test(b.innerText)).click())
      await wait(100)
      await page.type("[data-rate-form] input[aria-label='Order weight from, step 2']", "2")
      await page.type("[data-rate-form] input[aria-label='Price, step 2']", "9")
      await page.evaluate(() => [...document.querySelectorAll("[data-rate-form] button")].find((b) => b.innerText.trim() === "Add rate").click())
      await wait(400)
      const tr = posted.find((p) => p.url === "/api/physical/shipping/rates")
      expect(!!tr && tr.body.kind === "weight" && JSON.stringify(tr.body.tiers) === JSON.stringify([{ from: 0, priceCents: 500 }, { from: 2000, priceCents: 900 }]), "a rate by order weight is saved as steps in grams and cents", JSON.stringify(tr?.body ?? null).slice(0, 200))
      expect(/0 kg to 2 kg \$35\.00/.test(await page.evaluate(() => document.body.innerText)), "a tiered rate reads as its steps")
      expect(await sideways(page) === 0, "nothing scrolls sideways")
      await shot(page, `settings-${label}`)
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }
    /* Locations is its own section of Settings now (round T): pickup and low stock emails live there. */
    {
      const { page, errors } = await open("shipping", "&part=locations")
      console.log(`\nLocations, ${label}px`)
      expect(/Local pickup/.test(await page.evaluate(() => document.body.innerText)), "a pickup location says so")
      await page.evaluate(() => document.querySelector("[aria-label='Edit Studio']").click())
      await wait(150)
      const lf = await page.evaluate(() => document.body.innerText)
      expect(/Local pickup/.test(lf) && /Buyers can collect their order/.test(lf) && /Usually ready in/.test(lf) && /Pickup instructions/.test(lf), "pickup: on, ready time and instructions in the location")
      await shot(page, `settings-pickup-${label}`)
      expect(/Email me when stock runs low/.test(lf), "low stock emails sit with the locations")
      await shot(page, `settings-${label}`)
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }

    /* ── Product cards ────────────────────────────────────────── */
    {
      const { page, errors } = await open("product", `&product=${SHOP}`)
      console.log(`\nProduct cards, ${label}px`)
      const tap = (re) => page.evaluate((src) => [...document.querySelectorAll("button")].find((b) => new RegExp(src).test(b.innerText))?.click(), re)
      await tap("^Your own option$")
      await wait(100)
      await page.type("[data-option-name]", "Size")
      const valueBox = "[data-option-new-value]"
      for (const v of ["S", "M", "L"]) { await page.type(valueBox, v); await page.keyboard.press("Enter") }
      await page.click("[data-option-done]")
      await wait(100)
      expect(/Size\s*S\s*M\s*L/.test(await page.evaluate(() => document.querySelector("[data-option-list]")?.innerText ?? "")), "a closed option reads as its name and values")
      await tap("Add another option")
      await wait(100)
      expect(await page.$eval("[data-option-name]", (i) => i.value) === "Color", "the next option starts as Color")
      await page.type(valueBox, "Sand"); await page.keyboard.press("Enter")
      await page.type(valueBox, "Black"); await page.keyboard.press("Enter")
      await page.click("[data-option-done]")
      await wait(300)
      const rows = await page.evaluate(() => document.querySelectorAll("[data-variant-row]").length)
      expect(rows === 6, "3 sizes by 2 colours is 6 variants", rows)
      expect(await page.evaluate(() => document.querySelectorAll("[data-variant-group]").length) === 3, "grouped by size, as Shopify does")
      const check = await page.evaluate(() => window.physicalHandle.current.check())
      expect(check === null, "with a base price, nothing to fix", check)
      /* A group's price fills each of its variants. */
      await page.type("[aria-label='Price for every M']", "30")
      expect(await page.$$eval("[data-variant-group='M'] [data-variant-row] input[aria-label^='Price for']", (els) => els.every((e) => e.value === "30")), "a price on the M group reaches M / Sand and M / Black")
      /* Edit all: one quantity for every variant. */
      await page.click("[data-variants-edit-all]")
      await wait(200)
      await page.type("[role=dialog] input[placeholder='Unchanged'][inputmode='text']", "7")
      await page.click("[data-bulk-apply]")
      await wait(200)
      expect(await page.$$eval("[data-variant-row] input[aria-label^='Quantity for']", (els) => els.length === 6 && els.every((e) => e.value === "7")), "Edit all sets every quantity")
      /* Renaming a value keeps what its rows had. */
      await page.evaluate(() => [...document.querySelectorAll("[data-option-row] button")].find((b) => /^Edit Size/.test(b.getAttribute("aria-label") ?? ""))?.click())
      await wait(100)
      await page.focus("input[aria-label='Value M']")
      await page.$eval("input[aria-label='Value M']", (i) => i.select())
      await page.type("input[aria-label='Value M']", "Medium")
      await page.keyboard.press("Enter")
      await page.click("[data-option-done]")
      await wait(250)
      expect(await page.$$eval("[data-variant-group='Medium'] [data-variant-row] input[aria-label^='Price for']", (els) => els.length === 2 && els.every((e) => e.value === "30")), "M renamed Medium keeps its prices")
      const photo = await page.evaluate(() => document.querySelectorAll("[data-variant-row] button[aria-label^='Add a photo for']").length)
      expect(photo === 6, "every variant can have its own photo", photo)
      await page.evaluate(() => document.querySelector("[data-variant-row] button[aria-label^='Add a photo for']").click())
      await wait(200)
      await page.evaluate(() => document.querySelector("[role=dialog] button[aria-pressed]").click())
      await wait(200)
      expect(await page.evaluate(() => !!document.querySelector("[data-variant-row] img")), "a product photo picked becomes the variant's")
      const card = await page.evaluate(() => document.body.innerText)
      expect(/Track inventory/.test(card) && /You pack and ship it · your store setting/.test(card) && /Advanced/.test(card) && !/How will this product be fulfilled\?/.test(card), "who ships it is the store's setting, one line; no fulfilment question on the page", card.match(/[^\n]*store setting[^\n]*/)?.[0])
      /* Its own fulfilment is under Advanced. */
      await tap("^Advanced")
      await wait(150)
      await page.evaluate(() => [...document.querySelectorAll("[data-advanced-group='Fulfilment'] button[role=switch]")][0]?.click())
      await wait(150)
      await page.evaluate(() => [...document.querySelectorAll("[role=radio]")].find((b) => /A supplier or manufacturer/.test(b.innerText)).click())
      await wait(150)
      expect(await page.evaluate(() => !!document.querySelector("[data-partner-form]")), "dropshipping with no supplier yet asks for one in place")
      posted = []
      await page.type("[data-partner-form] input", "Ana Supplies")
      await page.type("[data-partner-form] input[inputmode=email]", "orders@ana.example")
      await page.evaluate(() => [...document.querySelectorAll("[data-partner-form] button")].find((b) => /Add supplier/.test(b.innerText)).click())
      await wait(400)
      const loc = posted.find((p) => p.url === "/api/physical/locations")
      expect(!!loc && loc.body.kind === "dropshipper" && loc.body.forwarding === "email" && loc.body.email === "orders@ana.example", "the supplier is made to receive orders by email", JSON.stringify(loc?.body ?? null))
      expect(/Orders are emailed to orders@ana\.example/.test(await page.evaluate(() => document.body.innerText)), "and chosen, saying where orders go")
      expect(await sideways(page) === 0, "nothing scrolls sideways")
      await shot(page, `product-${label}`)
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }

    /* ── Inventory ────────────────────────────────────────────── */
    {
      const { page, errors } = await open("inventory")
      console.log(`\nInventory, ${label}px`)
      const t = await page.evaluate(() => document.body.innerText)
      expect(/Linen shirt/.test(t) && /Out of stock/.test(t) && /Low/.test(t), "rows with low and out of stock")
      posted = []
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Adjust" || b.querySelector(".lucide-sliders-horizontal")).click())
      await wait(250)
      await page.type("[role=dialog] input[inputmode]", "10")
      await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.innerText.trim() === "Save").click())
      await wait(400)
      const adj = posted.find((p) => p.url === "/api/physical/inventory")
      expect(!!adj && adj.body.delta === 10 && adj.body.reason === "received" && typeof adj.body.key === "string", "an adjustment is posted with its reason and a key", JSON.stringify(adj?.body ?? null))
      expect(await sideways(page) === 0, "nothing scrolls sideways")
      await shot(page, `inventory-${label}`)
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }

    /* ── Order ────────────────────────────────────────────────── */
    {
      const { page, errors } = await open("order")
      console.log(`\nOrder, ${label}px`)
      /* Round 20: Shopify's layout. Where the order is reads on the card's badge; processing is in the card's menu. */
      const card = await page.evaluate(() => document.querySelector("[data-unfulfilled-card]")?.innerText ?? "")
      expect(/Unfulfilled|In progress/.test(card) && /Fulfill items/.test(card), "the order to fulfil, with Fulfill items", card)
      posted = []
      await page.evaluate(() => document.querySelector("[data-unfulfilled-card] [data-fulfil]").click())
      await wait(400)
      await page.type("input[placeholder='Optional']", "1Z999AA10123456784")
      await wait(100)
      await page.evaluate(() => document.querySelector("[data-fulfil-submit]").click())
      await wait(500)
      const f = posted.find((p) => p.body?.action === "fulfil")
      expect(!!f && f.body.items[0].quantity === 2 && f.body.carrier === "UPS" && f.body.trackingNumber === "1Z999AA10123456784" && f.body.notifyBuyer === true, "Fulfill items posts quantities, tracking (UPS guessed from the number) and the email", JSON.stringify(f?.body ?? null))
      const t = await page.evaluate(() => document.body.innerText)
      expect(/Fulfilled/.test(t) && /Mark as delivered/.test(t), "the shipment shows, with what to do next")
      expect(await sideways(page) === 0, "nothing scrolls sideways")
      await shot(page, `order-${label}`)
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }

    /* ── A pickup order ───────────────────────────────────────── */
    {
      const { page, errors } = await open("order", "&pickup=1")
      console.log(`\nPickup order, ${label}px`)
      const t = await page.evaluate(() => document.body.innerText)
      expect(/Mark ready for pickup/.test(t) && /Pickup at/.test(t) && !/Fulfill items/.test(t) && !/Shipping address/.test(t), "a pickup order says pickup, not shipping")
      await shot(page, `order-pickup-${label}`)
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }

    /* ── Status ───────────────────────────────────────────────── */
    {
      const { page, errors } = await open("status")
      console.log(`\nOrder status, ${label}px`)
      const t = await page.evaluate(() => document.body.innerText)
      expect(/Thank you, Mara!/.test(t) && /Track package/.test(t) && /Download/.test(t), "thanks, tracking and the download")
      expect(await sideways(page) === 0, "nothing scrolls sideways")
      await shot(page, `status-${label}`)
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }

    {
      const { page, errors } = await open("status", "&pickup=1")
      const t = await page.evaluate(() => document.body.innerText)
      expect(/Pick up at Studio/.test(t) && /Ring the bell/.test(t) && /Ready for pickup/.test(t) && !/Shipping address/.test(t), `the buyer's pickup order page (${label}px)`)
      await shot(page, `status-pickup-${label}`)
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }

    /* ── The help guide ───────────────────────────────────────── */
    for (const article of ["how-physical-products-work", "shipping-profiles-zones-and-rates", "local-pickup", "ship-your-orders"]) {
      const { page, errors } = await open("help", `&article=${article}`)
      /* Drawn figures, or the screenshots the guide carries now (scripts that retake them, round of 6d625ec4). */
      const figures = await page.evaluate(() => document.querySelectorAll("figure [role=img], figure img").length)
      expect(figures >= 1, `help: ${article} has its pictures (${label}px)`, figures)
      expect(await sideways(page) === 0, `help: ${article} doesn't scroll sideways (${label}px)`)
      await shot(page, `help-${article}-${label}`)
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }

    /* ── Collections ──────────────────────────────────────────── */
    {
      const { page, errors } = await open("collections")
      console.log(`\nCollections, ${label}px`)
      await page.evaluate(() => document.querySelector('[data-row="c1"] button').click())
      await wait(500)
      const t = await page.evaluate(() => document.querySelector("[data-collection-editor]")?.innerText ?? "")
      expect(/Match by rules/.test(t) && /Products must match/.test(t), "a smart collection opens with its rules")
      expect(/1 product match/.test(t), "and counts the products they catch")
      expect(await sideways(page) === 0, "nothing scrolls sideways")
      await shot(page, `collections-${label}`)
      expect(errors.length === 0, "no errors", errors.join(" | "))
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
