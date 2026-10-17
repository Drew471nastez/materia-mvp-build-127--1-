/**
 * ===========================================================================
 *  SHIPPING AND DELIVERY FOR A NEW STORE, IN A BROWSER
 * ===========================================================================
 * The real ShippingSettings (scripts/render-shipsetup.tsx) for a Romanian
 * store selling in lei, at 390x844 (touch, CPU slowed 4x) and 1440x900,
 * against a server that answers like /api and keeps what is made:
 *
 *   QUESTION    the first visit asks one question, as one radiogroup: the
 *               arrow keys move the pick, Continue sets the store up
 *   QUICK       then one card proposes a whole first setup: Romania and
 *               the rest of the EU, delivery days filled in, prices empty;
 *               pressing it empty names the missing prices and sends
 *               nothing; typed, it sends exactly what was shown
 *   SUMMARY     after, the page leads with a sentence and a row per zone;
 *               All shipping settings stays closed until Edit
 *   EVERYWHERE  nothing scrolls sideways, no errors
 *
 *   node scripts/check-shipsetup.mjs
 *   SHOTS=/some/dir PROBE_CSS=source node scripts/check-shipsetup.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const dir = join(root, ".shipsetup-probe")
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
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-shipsetup.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
let fonts = ""
try { fonts = interFaces(root) } catch { /* the fallback face */ }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${fonts}</style><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const LOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]
let state
let posted = []
const fresh = (onboarded) => ({
  settings: { fulfillmentModel: onboarded ? "self" : null, defaultLocationId: onboarded ? LOC : null, defaultPackageId: null, unitSystem: "metric", returnsEnabled: true, returnWindowDays: 30, taxMode: "none", pricesIncludeTax: false, taxOnShipping: false, lowStockDefault: 5, lowStockAlerts: true, onboardedAt: onboarded ? "2026-10-17T09:00:00Z" : null },
  locations: onboarded ? [{ id: LOC, name: "Home", kind: "home", country: null, city: null, addressLine1: null, addressLine2: null, region: null, postalCode: null, phone: null, email: null, active: true, fulfillsOrders: true, holdsInventory: true, priority: 0, forwarding: "none", pickupEnabled: false, pickupInstructions: null, pickupReady: "24h", pickupHours: null, localDelivery: null }] : [],
  profiles: onboarded ? [{ id: "p1", name: "General", isDefault: true, zones: [] }] : [],
  packages: [],
  taxRates: [],
  carrierApps: [{ id: "shippo", name: "Shippo", connected: false }, { id: "easypost", name: "EasyPost", connected: false }],
  origin: { country: "RO", address: { addressLine1: "Strada Florilor 3", addressLine2: "", city: "Cluj-Napoca", region: "CJ", postalCode: "400001", country: "RO" } },
  shippingProducts: [{ id: "prod1", title: "Linen apron", imageUrl: null, profileId: null }],
})
const rateOf = (zoneId, id, b, free) => ({ id, zoneId, name: "Standard", kind: "flat", priceCents: b.priceCents, minValue: null, maxValue: null, tiers: [], freeOverCents: free ?? null, minDays: b.minDays ? Number(b.minDays) : null, maxDays: b.maxDays ? Number(b.maxDays) : null, active: true, position: 0 })
const readiness = () => {
  const ships = state.profiles.some((p) => p.zones.some((z) => z.rates.length))
  const items = ships ? [] : [{ id: "delivery", level: "blocking", title: "Add a shipping rate", why: "Checkout has no way to get an order to the buyer, so nobody can buy.", href: "/app/settings?tab=shipping", fix: "Add rate" }]
  return { physical: 1, live: 0, items, blocking: items.length, recommended: 0, ready: ships, signature: ships ? "" : "delivery" }
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
      if (u.startsWith("/api/physical/settings") && req.method === "GET") out = state
      else if (u.startsWith("/api/physical/settings")) { state.settings = { ...state.settings, ...body }; out = { settings: state.settings } }
      else if (u.startsWith("/api/physical/onboarding")) { const next = fresh(true); state = { ...next, settings: { ...next.settings, fulfillmentModel: body.model } }; out = { settings: state.settings } }
      else if (u.startsWith("/api/physical/readiness")) out = readiness()
      else if (u.startsWith("/api/physical/shipping/profiles")) out = { profiles: state.profiles }
      else if (u.startsWith("/api/physical/shipping/quick-setup")) {
        const zones = [{ id: "z1", profileId: "p1", name: "Romania", countries: ["RO"], regions: [], restOfWorld: false, rates: [rateOf("z1", "r1", body.home, body.home.freeOverCents)] }]
        if (body.abroad) zones.push({ id: "z2", profileId: "p1", name: "Rest of the EU", countries: EU.filter((c) => c !== "RO"), regions: [], restOfWorld: false, rates: [rateOf("z2", "r2", body.abroad)] })
        state.profiles = [{ ...state.profiles[0], zones }]
        if (body.shipFrom) state.locations = state.locations.map((l) => ({ ...l, ...body.shipFrom, country: "RO" }))
        out = { profiles: state.profiles, settings: state.settings, locations: state.locations, made: zones.length }
      }
      else if (u.startsWith("/api/store/settings")) out = { settings: { defaultCountry: "RO" } }
      else status = 404
      setTimeout(() => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(out)) }, 80)
    })
    return
  }
  /* The flags' sprite and anything else under public/, as the site serves it. */
  const file = join(root, "public", decodeURIComponent(req.url.split("?")[0]))
  if (req.url !== "/" && !req.url.includes("..") && existsSync(file) && !file.endsWith("/public/")) {
    res.writeHead(200, { "content-type": file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream" })
    res.end(readFileSync(file))
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${String(got).slice(0, 400)}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const sideways = (page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth))
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }) }
const clickText = (page, re, sel = "button") => page.evaluate((src, s) => { const b = [...document.querySelectorAll(s)].find((x) => new RegExp(src).test(x.innerText.trim())); if (b) b.click(); return !!b }, re.source, sel)
const type = (page, sel, value) => page.evaluate((s, v) => { const i = document.querySelector(s); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, v); i.dispatchEvent(new Event("input", { bubbles: true })) }, sel, value)

try {
  for (const [label, viewport, slow] of [
    ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 4],
    ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }, 1],
  ]) {
    state = fresh(false)
    posted = []
    const page = await browser.newPage()
    await page.setViewport(viewport)
    if (slow > 1) await (await page.target().createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: slow })
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.goto(base)
    await wait(1200)

    console.log(`\nThe first question, ${label}px`)
    const q = await page.evaluate(() => ({ group: document.querySelectorAll('[role="radiogroup"][data-fulfil-choice]').length, radios: document.querySelectorAll('[data-fulfil-choice] [role="radio"]').length, stops: document.querySelectorAll('[data-fulfil-choice] [role="radio"][tabindex="0"]').length, rest: !!document.querySelector("[data-shipping-all], [data-quick-setup]") }))
    expect(q.group === 1 && q.radios === 7 && q.stops === 1, "one radiogroup, seven radios, one Tab stop", JSON.stringify(q))
    expect(!q.rest, "nothing else on the page before it is answered", JSON.stringify(q))
    await shot(page, `shipsetup-question-${label}`)
    await page.focus('[data-fulfil-choice] [role="radio"][tabindex="0"]')
    await page.keyboard.press("ArrowDown")
    await wait(200)
    await page.keyboard.press("ArrowUp")
    await wait(200)
    const picked = await page.evaluate(() => ({ checked: document.querySelector('[data-fulfil-choice] [aria-checked="true"]')?.getAttribute("data-radio"), focused: document.activeElement?.getAttribute("data-radio") }))
    expect(picked.checked === "self" && picked.focused === "self", "the arrow keys move the pick and the focus with it", JSON.stringify(picked))
    await clickText(page, /^Continue$/)
    await wait(1500)

    console.log(`\nQuick setup, ${label}px`)
    const card = await page.evaluate(() => {
      const c = document.querySelector("[data-quick-setup]")
      const prices = [...document.querySelectorAll("[data-setup-price]")].map((i) => i.value)
      const days = [...document.querySelectorAll('[data-setup-part] input[inputmode="numeric"], [data-setup-part] input[type="text"]:not([data-setup-price])')].map((i) => i.value)
      return { code: c?.getAttribute("data-quick-setup"), text: c?.innerText ?? "", prices, days, all: document.querySelector("[data-shipping-all]")?.getAttribute("data-shipping-all") }
    })
    expect(card.code === "RO" && /Shipping inside Romania/.test(card.text) && /Shipping to the rest of the EU/.test(card.text) && /26 EU countries/.test(card.text), "one card: Romania and the rest of the EU, said plainly", card.text.slice(0, 300))
    expect(card.prices.length === 2 && card.prices.every((p) => p === ""), "both prices start empty", JSON.stringify(card.prices))
    expect(/2/.test(card.days.join()) && /Strada Florilor 3, Cluj-Napoca, 400001, from your business details/.test(card.text), "delivery days and the ship-from address are filled in from what the store knows", JSON.stringify(card.days) + card.text.slice(-300))
    expect(card.all === "closed", "All shipping settings starts closed", card.all)
    await shot(page, `shipsetup-quick-${label}`)

    posted = []
    await clickText(page, /^Use this setup$/)
    await wait(500)
    const empty = await page.evaluate(() => document.querySelector("[data-quick-setup]")?.innerText ?? "")
    expect(!posted.some((p) => p.url.includes("quick-setup")) && (empty.match(/Type a price, or 0 for free\./g) ?? []).length === 2, "pressed with no prices: nothing sent, both prices asked for", empty.slice(0, 400))
    await shot(page, `shipsetup-quick-missing-${label}`)

    await type(page, '[data-setup-price="home"]', "15")
    await type(page, '[data-setup-price="abroad"]', "40")
    await wait(200)
    await clickText(page, /^Use this setup$/)
    await wait(1500)
    const sent = posted.find((p) => p.url.includes("quick-setup"))?.body
    expect(!!sent && sent.country === "RO" && sent.home.priceCents === 1500 && sent.abroad.priceCents === 4000 && String(sent.home.minDays) === "2" && String(sent.abroad.maxDays) === "7" && sent.shipFrom?.addressLine1 === "Strada Florilor 3", "Use this setup sends exactly what was shown", JSON.stringify(sent))

    console.log(`\nThe summary, ${label}px`)
    const sum = await page.evaluate(() => ({ quick: !!document.querySelector("[data-quick-setup]"), rows: document.querySelector("[data-shipping-summary]")?.getAttribute("data-shipping-summary"), text: document.querySelector("[data-shipping-summary]")?.innerText ?? "", all: document.querySelector("[data-shipping-all]")?.getAttribute("data-shipping-all"), profiles: document.querySelectorAll("[data-shipping-profile]").length }))
    expect(!sum.quick && sum.rows === "2" && /You ship to Romania for 15\.00 lei and to the rest of the EU for 40\.00 lei, 2 to 7 business days\./.test(sum.text.replace(/ /g, " ")), "the page leads with a sentence and a row per zone", sum.text.slice(0, 300))
    expect(sum.all === "closed" && sum.profiles === 0, "the profiles and zones stay under All shipping settings", JSON.stringify(sum))
    expect(/Ships from Strada Florilor 3, Cluj-Napoca\./.test(sum.text), "the ship-from address made it to the location", sum.text.slice(-200))
    await shot(page, `shipsetup-summary-${label}`)
    await page.click("[data-summary-edit]")
    await wait(700)
    const opened = await page.evaluate(() => ({ all: document.querySelector("[data-shipping-all]")?.getAttribute("data-shipping-all"), profiles: document.querySelectorAll("[data-shipping-profile]").length, zones: document.querySelectorAll("[data-zone]").length, fulfil: document.querySelectorAll('[data-fulfil-choice][role="radiogroup"]').length }))
    expect(opened.all === "open" && opened.profiles === 1 && opened.zones === 2 && opened.fulfil === 1, "Edit opens everything: the fulfilment question, the profile and its two zones", JSON.stringify(opened))
    await shot(page, `shipsetup-all-${label}`)
    expect((await sideways(page)) === 0 && errors.length === 0, "nothing scrolls sideways, no errors", errors.join(" "))
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
