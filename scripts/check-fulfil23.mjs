/**
 * ===========================================================================
 *  ROUND 23 FULFILMENT, IN A BROWSER, ON A PHONE AND A COMPUTER
 * ===========================================================================
 * The real components (scripts/render-fulfil23.tsx) at 390x844 (touch, CPU
 * slowed 4x) and 1440x900, against a server that answers like /api. It
 * checks, on each:
 *
 *   SETTINGS    no "Reload" anywhere after "Custom shipping profile"; the
 *               line about local delivery and pickup; a location's form has
 *               local delivery and opening hours, and Save sends them
 *   STATUS      the buyer's order page: each package's dated updates, a
 *               delivery problem said plainly, local delivery in the shop's
 *               words, pickup hours, "Return items" with its last day, a
 *               closed window said instead
 *   ORDER       the seller's shipment menu has in transit, out for delivery
 *               and a delivery problem; Approve asks for instructions and
 *               sends them; a received return offers Refund
 *   BUY BOX     the delivery line from the server, under Only N left
 *   CHECKOUT    the postal code reaches the quote; Local delivery shows
 *               beside shipping and Pay sends it
 *
 *   node scripts/check-fulfil23.mjs
 *   SHOTS=/some/dir node scripts/check-fulfil23.mjs
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

const dir = join(root, ".fulfil23-probe")
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
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-fulfil23.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const SHOP = "0f3a9c2e-1111-2222-3333-444455556666"
const LOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const LINE = "11111111-1111-4111-8111-111111111111"
const V = "00000000-0000-4000-8000-000000000001"
let posted = []

const studio = { id: LOC, name: "Studio", kind: "home", country: "RO", city: "Cluj-Napoca", addressLine1: "Str. Lunga 1", addressLine2: null, region: null, postalCode: "400001", phone: null, email: null, active: true, fulfillsOrders: true, holdsInventory: true, priority: 0, forwarding: "none", pickupEnabled: true, pickupInstructions: "Side door", pickupReady: "2h", pickupHours: "Mon to Fri 9:00 to 17:00", localDelivery: { enabled: true, codes: ["400", "401"], priceCents: 500, minOrderCents: 2000, freeOverCents: 8000, note: "Tuesdays and Fridays, 17:00 to 20:00" } }
const settings = () => ({
  settings: { fulfillmentModel: "self", defaultLocationId: LOC, defaultPackageId: null, unitSystem: "metric", returnsEnabled: true, returnWindowDays: 30, taxMode: "none", pricesIncludeTax: false, taxOnShipping: false, lowStockDefault: 5, lowStockAlerts: true, onboardedAt: "2026-10-01T00:00:00Z" },
  locations: [studio],
  profiles: [
    { id: "p1", name: "General", isDefault: true, zones: [{ id: "z1", profileId: "p1", name: "Romania", countries: ["RO"], regions: [], restOfWorld: false, rates: [{ id: "r1", zoneId: "z1", name: "Standard", kind: "flat", priceCents: 1500, minValue: null, maxValue: null, tiers: [], freeOverCents: 10000, minDays: 2, maxDays: 4, active: true, position: 0 }] }] },
    { id: "p2", name: "Heavy items", isDefault: false, zones: [] },
  ],
  packages: [{ id: "b1", name: "Standard box", kind: "box", lengthMm: 300, widthMm: 200, heightMm: 100, weightGrams: 250, isDefault: true }],
  taxRates: [],
  integrations: [],
  shippingProducts: [{ id: SHOP, title: "Linen shirt", imageUrl: null, profileId: null }],
})

let returnStatus = "requested"
const order = () => ({
  id: SHOP, status: "paid", fulfillmentStatus: "fulfilled", returnStatus: returnStatus === "requested" ? "requested" : "in_progress", currency: "USD", buyerName: "Mara Lind", buyerPhone: null, totalCents: 10500, refundedCents: 0, shippingCents: 1500, shippingDiscountCents: 0,
  address: { name: "Mara Lind", line1: "Str. Lunga 5", city: "Cluj", postalCode: "400001", country: "RO" }, delivery: { name: "Local delivery", priceCents: 500, minDays: null, maxDays: null, kind: "local", note: "Tuesdays and Fridays" },
  deliveryMethod: "ship", pickup: null, processingAt: null, buyerNote: null, merchantNote: null, cancelledAt: null,
  lines: [{ orderId: LINE, title: "Linen shirt", variantName: "M / Sand", sku: null, imageUrl: null, type: "physical", quantity: 2, unitCents: 4500, discountCents: 0, requiresShipping: true, locationId: LOC, fulfillmentMethod: "self", fulfilled: 2, returned: returnStatus === "received" ? 1 : 0, amountCents: 9000, refundedCents: 0 }],
  shipments: [{ id: "f1", status: "in_transit", carrier: "UPS", trackingNumber: "1Z999AA10123456784", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784", shippedAt: "2026-10-02T10:00:00Z", deliveredAt: null, createdAt: "2026-10-02T10:00:00Z", locationId: LOC, items: [{ orderId: LINE, quantity: 2 }] }],
  returns: [{ id: "r1", status: returnStatus, reason: "size", reasonLabel: "Size or fit", requestedBy: "buyer", customerNote: "Too small", merchantNote: null, createdAt: "2026-10-05T10:00:00Z", refundedCents: 0, items: [{ id: "ri1", orderId: LINE, quantity: 1, restock: true, restockedQuantity: returnStatus === "received" ? 1 : 0 }] }],
  events: [],
})

function quote(body) {
  const items = body.items || []
  const lines = items.map((i) => ({ productId: i.productId, variantId: i.variantId, title: "Linen shirt", variantName: "M / Sand", imageUrl: null, type: "physical", quantity: i.quantity, unitCents: 4500, discountCents: 0, requiresShipping: true }))
  const sub = lines.reduce((t, l) => t + l.unitCents * l.quantity, 0)
  const options = body.country === "RO" ? [{ id: "r1", name: "Standard", priceCents: 1500, estimate: "2 to 4 business days" }] : []
  /* Only what the server would do: local delivery for a postal code the studio delivers to. */
  if (body.country === "RO" && /^40[01]/.test(String(body.postalCode ?? ""))) options.push({ id: `local:${LOC}`, name: "Local delivery", priceCents: 500, estimate: "" })
  const selected = options.find((o) => o.id === body.deliveryOptionId) ?? options[0] ?? null
  return {
    creatorId: SHOP, lines, dropped: [], stockIssues: [], requiresShipping: true, coupon: null, couponError: null,
    delivery: { ok: true, options, selectedId: selected?.id ?? null, needsCountry: !body.country },
    pickups: [], totals: { itemsSubtotalCents: sub, discountCents: 0, shippingCents: selected?.priceCents ?? 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: false, taxRateBps: 0, totalCents: sub + (selected?.priceCents ?? 0) },
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
        delivery: { lines: ["Delivery $15.00 to Romania, 2 to 4 business days", "Free delivery on orders over $100.00", "Local delivery available near the shop", "Free pickup at Studio. Usually ready in 2 hours"] },
        options: [], variants: [{ id: V, name: "Default", options: [null, null, null], priceCents: 4500, compareAtCents: null, imageUrl: null, soldOut: false, left: 2, maxQuantity: 2 }],
      }
      else if (u.startsWith("/api/physical/settings")) out = settings()
      else if (u.startsWith("/api/physical/shipping/profiles")) out = { profiles: settings().profiles }
      else if (u.startsWith("/api/store/settings")) out = { settings: { defaultCountry: "RO" } }
      else if (u.startsWith(`/api/physical/locations/${LOC}`)) out = { location: { ...studio, pickupHours: body.pickupHours, localDelivery: { ...studio.localDelivery, codes: String(body.localDelivery?.codes ?? "").split(/[,\s]+/).filter(Boolean) } } }
      else if (u.startsWith("/api/physical/orders/")) {
        if (req.method === "POST" && body.action === "return_move") returnStatus = body.status
        out = { order: order(), locations: [{ id: LOC, name: "Studio" }] }
      }
      else if (u.startsWith("/api/store/reasons")) out = { return: [{ value: "size", label: "Size or fit", description: null }], refund: [], ready: true }
      else status = 404
      setTimeout(() => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(out)) }, 80)
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
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${String(got).slice(0, 300)}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const sideways = (page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth))
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }) }
const clickText = (page, re, sel = "button") => page.evaluate((src, s) => { const b = [...document.querySelectorAll(s)].find((x) => new RegExp(src).test(x.innerText.trim())); if (b) b.click(); return !!b }, re.source, sel)

try {
  for (const [label, viewport, slow] of [
    ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 4],
    ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }, 1],
  ]) {
    const open = async (view, extra = "") => {
      const page = await browser.newPage()
      await page.setViewport(viewport)
      if (slow > 1) await (await page.target().createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: slow })
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e)))
      await page.goto(`${base}/?view=${view}${extra}`)
      await wait(900)
      return { page, errors }
    }

    console.log(`\nSettings, ${label}px`)
    {
      const { page, errors } = await open("shipping", "&part=delivery")
      const text = await page.evaluate(() => document.body.innerText)
      const reload = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => /reload/i.test(b.textContent ?? "")).length)
      expect(/Custom shipping profile/.test(text) && !/Reload/i.test(text) && reload === 0, 'no "Reload" after "Custom shipping profile", seen or hidden', `${reload} ${text.slice(-300)}`)
      expect(/Local delivery and local pickup are set on each location, in Locations: local delivery from Studio, and pickup at Studio\./.test(text), "the line naming where local delivery and pickup are set", text.slice(-400))
      expect((await sideways(page)) === 0 && errors.length === 0, "nothing scrolls sideways, no errors", errors.join(" "))
      await shot(page, `settings-delivery-${label}`)
      await page.close()
    }
    {
      const { page, errors } = await open("shipping", "&part=locations")
      const row = await page.evaluate(() => document.querySelector("[data-location]")?.innerText ?? "")
      expect(/Local delivery/.test(row) && /Delivers to 400, 401 · \$5\.00/.test(row) && /Open Mon to Fri 9:00 to 17:00/.test(row), "the location row says local delivery and pickup hours", row)
      await page.click(`[aria-label="Edit Studio"]`)
      await wait(500)
      const form = await page.evaluate(() => ({ local: !!document.querySelector("[data-local-delivery-form]"), codes: document.querySelector("textarea[aria-label='Postal codes']")?.value ?? null, text: document.body.innerText }))
      expect(form.local && form.codes === "400, 401" && /Opening hours/.test(form.text) && /Minimum order/.test(form.text) && /Delivery information/.test(form.text), "the form shows local delivery with its codes, and opening hours", JSON.stringify({ local: form.local, codes: form.codes }))
      await shot(page, `settings-location-form-${label}`)
      posted = []
      await page.evaluate(() => { const t = document.querySelector("textarea[aria-label='Postal codes']"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(t, "400, 401, 407"); t.dispatchEvent(new Event("input", { bubbles: true })) })
      await clickText(page, /^Save location$/)
      await wait(700)
      const sent = posted.find((p) => p.url.includes("/api/physical/locations/"))
      expect(!!sent && sent.body.localDelivery?.enabled === true && sent.body.localDelivery.codes === "400, 401, 407" && sent.body.localDelivery.priceCents === 500 && sent.body.pickupHours === "Mon to Fri 9:00 to 17:00", "Save sends local delivery (in cents) and the hours", JSON.stringify(sent?.body ?? null))
      expect((await sideways(page)) === 0 && errors.length === 0, "nothing scrolls sideways, no errors", errors.join(" "))
      await page.close()
    }

    console.log(`\nThe buyer's order page, ${label}px`)
    {
      let { page, errors } = await open("status", "&state=ship")
      let s = await page.evaluate(() => ({ updates: [...document.querySelectorAll("[data-shipment-updates] li")].map((li) => li.innerText.split("\n")[0]), text: document.body.innerText, ret: !!document.querySelector("[data-return-button]") }))
      expect(s.updates.join("|") === "Delivered|Out for delivery|In transit|Shipped", "each package's updates, newest first, with dates", s.updates.join("|"))
      expect(/Track package/.test(s.text) && s.ret && /Until /.test(s.text), "Track package, Return items and its last day", s.text.slice(0, 200))
      await page.evaluate(() => document.querySelector("[data-return-button]").click())
      await wait(300)
      expect(/Why are you returning this\?/.test(await page.evaluate(() => document.body.innerText)), "the reason list is labelled where the buyer sees it")
      expect((await sideways(page)) === 0 && errors.length === 0, "nothing scrolls sideways, no errors", errors.join(" "))
      await shot(page, `status-delivered-${label}`)
      await page.close()
      ;({ page, errors } = await open("status", "&state=problem"))
      s = await page.evaluate(() => ({ text: document.body.innerText, status: document.querySelector("[data-shipment-status]")?.getAttribute("data-shipment-status") }))
      expect(s.status === "failed" && /Delivery problem/.test(s.text) && /The carrier reported a problem delivering this package\. Linen & Co will be in touch/.test(s.text), "a delivery problem said plainly", s.text.slice(0, 300))
      await shot(page, `status-problem-${label}`)
      await page.close()
      ;({ page, errors } = await open("status", "&state=local"))
      s = await page.evaluate(() => ({ text: document.body.innerText }))
      expect(/On its way to you today/.test(s.text) && /Delivered by the shop/.test(s.text) && /Tuesdays and Fridays, 17:00 to 20:00/.test(s.text) && !/Track package/.test(s.text), "local delivery in the shop's words, with its note", s.text.slice(0, 400))
      await shot(page, `status-local-${label}`)
      await page.close()
      ;({ page, errors } = await open("status", "&state=pickup"))
      s = await page.evaluate(() => ({ hours: document.querySelector("[data-pickup-hours]")?.innerText ?? "" }))
      expect(/Open Mon to Fri 9:00 to 17:00, Sat 10:00 to 14:00/.test(s.hours), "pickup shows its opening hours", s.hours)
      await shot(page, `status-pickup-${label}`)
      await page.close()
      ;({ page, errors } = await open("status", "&state=closed"))
      s = await page.evaluate(() => ({ closed: document.querySelector("[data-return-closed]")?.innerText ?? "", button: !!document.querySelector("[data-return-button]"), reason: document.querySelector("[data-return-status]")?.innerText ?? "" }))
      expect(!s.button && /The return window for this order closed on/.test(s.closed) && /Reason: Size or fit/.test(s.reason), "window closed: no button, the date said, the return's reason shown", JSON.stringify(s))
      await page.close()
    }

    console.log(`\nThe seller's order, ${label}px`)
    {
      returnStatus = "requested"
      const { page, errors } = await open("order")
      /* The shipment's menu: open it as a finger or a mouse would, and read the items. */
      const menu = !!(await page.$('[data-shipment] button[aria-label$="more actions"]'))
      await page.click('[data-shipment] button[aria-label$="more actions"]')
      await wait(700)
      const items = await page.evaluate(() => document.body.innerText)
      expect(/Mark as out for delivery/.test(items) && /Report a delivery problem/.test(items) && /Mark as in transit/.test(items) === false, "an in transit shipment offers out for delivery and a delivery problem", `${menu} ${items.slice(0, 300)}`)
      await page.keyboard.press("Escape")
      await wait(300)
      await page.evaluate(() => document.body.click())
      await shot(page, `order-requested-${label}`)
      const local = await page.evaluate(() => document.querySelector("[data-local-delivery]")?.innerText ?? "")
      expect(/You deliver this one yourself/.test(local), "the order says the seller delivers it locally", local)
      await clickText(page, /^Approve$/)
      await wait(300)
      const asked = await page.evaluate(() => ({ answer: !!document.querySelector("[data-return-answer=approved]"), text: document.body.innerText }))
      expect(asked.answer && /Instructions for the buyer/.test(asked.text), "Approve asks for instructions first", asked.text.slice(0, 200))
      await page.evaluate(() => { const t = document.querySelector("[data-return-answer] textarea"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(t, "Post it to the studio."); t.dispatchEvent(new Event("input", { bubbles: true })) })
      posted = []
      await clickText(page, /^Approve and email$/)
      await wait(700)
      const sent = posted.find((p) => p.body?.action === "return_move")
      expect(!!sent && sent.body.status === "approved" && sent.body.note === "Post it to the studio.", "Approve and email sends the instructions", JSON.stringify(sent?.body ?? null))
      returnStatus = "received"
      await page.reload()
      await wait(1000)
      await page.evaluate(() => { window.refundOpened = 0 })
      const refund = await page.evaluate(() => { const b = document.querySelector("[data-return-refund]"); b?.click(); return !!b })
      expect(refund && (await page.evaluate(() => window.refundOpened)) === 1 && /Close without refund/.test(await page.evaluate(() => document.body.innerText)), "a received return offers Refund (the order's dialog) and Close without refund")
      await shot(page, `order-received-${label}`)
      expect((await sideways(page)) === 0 && errors.length === 0, "nothing scrolls sideways, no errors", errors.join(" "))
      await page.close()
    }

    console.log(`\nBuy box, ${label}px`)
    {
      const { page, errors } = await open("buybox")
      const lines = await page.evaluate(() => [...document.querySelectorAll("[data-delivery-promise] li")].map((l) => l.innerText))
      expect(lines.length === 4 && lines[0] === "Delivery $15.00 to Romania, 2 to 4 business days" && /Only 2 left/.test(await page.evaluate(() => document.body.innerText)), "the delivery line under Only 2 left", lines.join(" | "))
      expect((await sideways(page)) === 0 && errors.length === 0, "nothing scrolls sideways, no errors", errors.join(" "))
      await shot(page, `buybox-${label}`)
      await page.close()
    }

    console.log(`\nCheckout, ${label}px`)
    {
      const items = Buffer.from(JSON.stringify([[SHOP, V, 1]])).toString("base64url")
      const { page, errors } = await open("checkout", `&items=${items}`)
      await page.select("select[autocomplete=country]", "RO")
      await wait(900)
      posted = []
      await page.type("input[autocomplete=postal-code]", "400123")
      await wait(1500)
      const quoted = posted.filter((p) => p.url.startsWith("/api/physical/checkout/quote")).pop()
      const names = await page.evaluate(() => [...document.querySelectorAll("input[name=delivery]")].map((i) => i.closest("label")?.innerText.replace(/\s+/g, " ").trim()))
      expect(!!quoted && quoted.body.postalCode === "400123", "the postal code reaches the server's quote", JSON.stringify(quoted?.body ?? null))
      expect(names.length === 2 && names.some((n) => /^Local delivery \D*5\.00$/.test(n)), "Local delivery shows beside Standard", names.join(" | "))
      await shot(page, `checkout-local-${label}`)
      expect((await sideways(page)) === 0 && errors.length === 0, "nothing scrolls sideways, no errors", errors.join(" "))
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
