/**
 * ===========================================================================
 *  SETTINGS > SHIPPING, FOR A STORE THAT IS SET UP, MEASURED IN A BROWSER
 * ===========================================================================
 * The real ShippingSettings (scripts/render-shipsetup.tsx) for a Romanian
 * store selling in lei with Shippo connected, at 390x844 (touch) and
 * 1280x900, against a server that answers like /api and keeps what is
 * saved (each write answers after 450ms, so the pending state can be seen):
 *
 *   LAYOUT     nothing scrolls sideways; every field in an open form is one
 *              height; the rate kinds are one radiogroup; Carrier calculated
 *              is offered because Shippo is connected
 *   NO BAND    the rate form, its buttons and every ancestor up to the zone
 *              sit on white: no grey box behind Cancel and Save
 *   ALIGNED    Cancel and Save share a top and a height, and Save's right
 *              edge is the fields' right edge
 *   CONTRAST   every piece of text drawn in the open settings is at least
 *              4.5:1 against what it sits on (disabled controls aside)
 *   SAVE       an unchanged rate cannot be saved; a change can; pressed, the
 *              button shows the spinner at the same width; the PATCH carries
 *              the price, free over and days typed; the row then says Saved
 *   ZONE, PACKAGE, LOCATION   their forms open on white with the same buttons
 *
 *   node scripts/check-shipping-settings.mjs
 *   SHOTS=/some/dir PROBE_CSS=source node scripts/check-shipping-settings.mjs
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

const dir = join(root, ".shipping-settings-probe")
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
const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "SK", "SI", "ES", "SE"]
const rate = (zoneId, id, extra) => ({ id, zoneId, name: "Standard", kind: "flat", priceCents: 1500, minValue: null, maxValue: null, tiers: [], freeOverCents: 20000, minDays: 1, maxDays: 3, active: true, position: 0, ...extra })
let state
let posted = []
const fresh = () => ({
  settings: { fulfillmentModel: "self", defaultLocationId: LOC, defaultPackageId: null, unitSystem: "metric", returnsEnabled: true, returnWindowDays: 30, taxMode: "none", pricesIncludeTax: false, taxOnShipping: false, lowStockDefault: 5, lowStockAlerts: true, onboardedAt: "2026-10-17T09:00:00Z" },
  locations: [{ id: LOC, name: "Studio", kind: "home", country: "RO", city: "Cluj-Napoca", addressLine1: "Strada Florilor 3", addressLine2: null, region: "CJ", postalCode: "400001", phone: null, email: null, active: true, fulfillsOrders: true, holdsInventory: true, priority: 0, forwarding: "none", pickupEnabled: true, pickupInstructions: null, pickupReady: "24h", pickupHours: null, localDelivery: { enabled: true, codes: ["400"], priceCents: 1000, minOrderCents: null, freeOverCents: null, note: null } }],
  profiles: [
    { id: "p1", name: "General", isDefault: true, zones: [
      { id: "z1", profileId: "p1", name: "Romania", countries: ["RO"], regions: [], restOfWorld: false, rates: [rate("z1", "r1"), rate("z1", "r2", { name: "Express", kind: "weight", priceCents: 2500, tiers: [{ from: 0, priceCents: 2500 }, { from: 2000, priceCents: 3500 }], freeOverCents: null, minDays: 1, maxDays: 1, position: 1 })] },
      { id: "z2", profileId: "p1", name: "Rest of the EU", countries: EU, regions: [], restOfWorld: false, rates: [rate("z2", "r3", { kind: "carrier", carrier: "shippo", serviceCode: null, priceCents: 0, freeOverCents: null, minDays: 3, maxDays: 7 })] },
    ] },
  ],
  packages: [{ id: "pk1", name: "Standard box", kind: "box", lengthMm: 300, widthMm: 200, heightMm: 100, weightGrams: 200, isDefault: true }],
  taxRates: [],
  carrierApps: [{ id: "shippo", name: "Shippo", connected: true }, { id: "easypost", name: "EasyPost", connected: false }],
  origin: { country: "RO", address: { addressLine1: "Strada Florilor 3", addressLine2: "", city: "Cluj-Napoca", region: "CJ", postalCode: "400001", country: "RO" } },
  shippingProducts: [{ id: "prod1", title: "Linen apron", imageUrl: null, profileId: null }],
})

const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    let raw = ""
    req.on("data", (c) => { raw += c })
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {}
      if (req.method !== "GET") posted.push({ url: req.url, method: req.method, body })
      let out = {}
      const u = req.url.split("?")[0]
      const rateId = u.match(/^\/api\/physical\/shipping\/rates\/([^/]+)$/)?.[1]
      if (u === "/api/physical/settings" && req.method === "GET") out = state
      else if (u === "/api/physical/settings") { state.settings = { ...state.settings, ...body }; out = { settings: state.settings } }
      else if (u.startsWith("/api/physical/readiness")) out = { physical: 1, live: 1, items: [], blocking: 0, recommended: 0, ready: true, signature: "" }
      else if (rateId && req.method === "PATCH") {
        for (const z of state.profiles[0].zones) z.rates = z.rates.map((r) => (r.id === rateId ? { ...r, ...body, minDays: body.minDays === null ? null : Number(body.minDays), maxDays: body.maxDays === null ? null : Number(body.maxDays) } : r))
        out = { profiles: state.profiles }
      } else if (u.startsWith("/api/physical/shipping")) out = { profiles: state.profiles }
      else if (u.startsWith("/api/physical/packages")) out = { packages: state.packages }
      else if (u.startsWith("/api/store/settings")) out = { settings: { defaultCountry: "RO" } }
      setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)) }, req.method === "GET" ? 60 : 450)
    })
    return
  }
  const file = join(root, "public", decodeURIComponent(req.url.split("?")[0]))
  if (req.url !== "/" && !req.url.startsWith("/?") && !req.url.includes("..") && existsSync(file) && !file.endsWith("/public/")) {
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
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got !== "" ? `   ${String(got).slice(0, 500)}` : ""}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const sideways = (page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth))
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }) }
const type = (page, sel, value) => page.evaluate((s, v) => { const i = document.querySelector(s); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, v); i.dispatchEvent(new Event("input", { bubbles: true })) }, sel, value)

/* Measured in the page: what a form looks like and where its buttons are. */
const measure = (page, formSel) => page.evaluate((formSel) => {
  const rgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a } }
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ground = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c } return { r: 255, g: 255, b: 255, a: 1 } }
  const form = document.querySelector(formSel)
  if (!form) return null
  /* Every ground from the form's buttons up to the zone or card it is in. */
  const actions = form.querySelector("[data-form-actions]")
  const grounds = []
  for (let e = actions; e && e !== document.body; e = e.parentElement) {
    const c = getComputedStyle(e).backgroundColor
    if (rgb(c)?.a > 0) grounds.push(c)
    if (e.matches("[data-zone], section")) break
  }
  const btns = [...(actions?.querySelectorAll("button") ?? [])].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return { text: b.innerText.trim(), top: Math.round(r.top), h: Math.round(r.height), right: Math.round(r.right), w: Math.round(r.width), disabled: b.disabled } })
  const fields = [...form.querySelectorAll('input[type="text"], input:not([type]), select')].filter((i) => i.offsetParent && i.getAttribute("role") !== "switch")
  const heights = [...new Set(fields.map((i) => Math.round(i.getBoundingClientRect().height)))]
  const fieldRight = Math.max(...fields.map((i) => Math.round(i.getBoundingClientRect().right)))
  /* Contrast of every visible piece of text in the open settings. */
  const low = []
  let min = 21
  const walker = document.createTreeWalker(document.querySelector("[data-shipping-settings]"), NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    if (!n.textContent.trim() || !el || !el.offsetParent) continue
    if (el.closest("button:disabled, [aria-disabled=true], input:disabled, option, [aria-hidden=true]")) continue
    const cs = getComputedStyle(el)
    if (cs.visibility !== "visible" || Number(cs.opacity) === 0) continue
    const fg = rgb(cs.color)
    if (!fg) continue
    const bg = ground(el)
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
    const ratio = (a + 0.05) / (b + 0.05)
    min = Math.min(min, ratio)
    if (ratio < 4.5) low.push(`${n.textContent.trim().slice(0, 30)} ${ratio.toFixed(2)}`)
  }
  return { grounds, btns, heights, fieldRight, minContrast: Number(min.toFixed(2)), low: [...new Set(low)].slice(0, 8), radios: form.querySelectorAll('[data-rate-kinds] [role="radio"]').length, kinds: [...form.querySelectorAll("[data-rate-kind]")].map((b) => b.getAttribute("data-rate-kind")) }
}, formSel)

try {
  for (const [label, viewport] of [["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["1280", { width: 1280, height: 900, deviceScaleFactor: 1 }]]) {
    state = fresh()
    posted = []
    const page = await browser.newPage()
    await page.setViewport(viewport)
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.goto(base)
    await wait(1200)
    if ((await page.evaluate(() => document.querySelector("[data-shipping-all]")?.getAttribute("data-shipping-all"))) === "closed") await page.click("[data-shipping-all]")
    await wait(500)

    console.log(`\nThe page, ${label}px`)
    const page0 = await page.evaluate(() => ({ zones: document.querySelectorAll("[data-zone]").length, local: document.querySelector("[data-local-hint]")?.innerText ?? "" }))
    expect(page0.zones === 2, "two zones drawn", page0.zones)
    expect(/Local delivery and pickup/.test(page0.local) && /Local delivery from Studio, and pickup at Studio\./.test(page0.local), "local delivery and pickup say where they are set", page0.local.replace(/\n/g, " | "))
    expect((await sideways(page)) === 0, "nothing scrolls sideways", await sideways(page))
    await shot(page, `shipping-all-${label}`)

    console.log(`\nEditing the flat rate, ${label}px`)
    await page.click('[data-rate="r1"] button[aria-label^="Edit"]')
    await wait(400)
    let m = await measure(page, "[data-rate-form]")
    expect(m.radios === 6 && m.kinds.includes("carrier"), `six kinds, Carrier calculated offered with Shippo connected (${m.kinds.join(", ")})`)
    expect(m.grounds.every((c) => c === "rgb(255, 255, 255)"), `no grey box: every ground from the buttons up to the zone is white (${[...new Set(m.grounds)].join(", ") || "none set"})`)
    expect(m.heights.length === 1, `every field one height: ${m.heights.join(", ")}px`)
    const [cancel, save] = m.btns.slice(-2)
    expect(cancel && save && cancel.top === save.top && cancel.h === save.h, `Cancel and Save share a top and height (${cancel?.top}/${save?.top}, ${cancel?.h}/${save?.h}px)`)
    expect(save && Math.abs(save.right - m.fieldRight) <= 1, `Save's right edge is the fields' right edge (${save?.right} vs ${m.fieldRight})`)
    expect(save?.disabled === true, "unchanged, Save rate is greyed", JSON.stringify(save))
    expect(m.minContrast >= 4.5, `text contrast at least 4.5:1 (lowest ${m.minContrast}:1)`, m.low.join(" | "))
    await shot(page, `shipping-rate-form-${label}`)
    await type(page, "[data-rate-form] [data-rate-price]", "18.50")
    await type(page, "[data-rate-form] [data-rate-free-over]", "250")
    await type(page, '[data-rate-form] [data-days-inputs] input:last-of-type', "4")
    await wait(150)
    m = await measure(page, "[data-rate-form]")
    const ready = m.btns.at(-1)
    expect(ready && !ready.disabled, "changed, Save rate can be pressed", JSON.stringify(ready))
    posted = []
    await page.click("[data-rate-save]")
    await wait(120)
    const pending = await page.evaluate(() => { const b = document.querySelector("[data-rate-save]"); return b ? { state: b.getAttribute("data-save-state"), w: Math.round(b.getBoundingClientRect().width), spinner: !!b.querySelector(".activity-spinner, [role='status'], svg") } : null })
    expect(pending?.state === "saving" && pending.w === ready.w, `pressed: the spinner shows and the button keeps its width (${pending?.state}, ${ready?.w} to ${pending?.w}px)`)
    await wait(900)
    const sent = posted.find((p) => p.method === "PATCH" && p.url.endsWith("/rates/r1"))?.body
    expect(!!sent && sent.priceCents === 1850 && sent.freeOverCents === 25000 && String(sent.maxDays) === "4" && String(sent.minDays) === "1" && sent.kind === "flat", "the PATCH carries what was typed", JSON.stringify(sent))
    const after = await page.evaluate(() => ({ form: !!document.querySelector("[data-rate-form]"), saved: document.querySelector('[data-rate="r1"] [data-saved-mark]')?.innerText ?? null, row: document.querySelector('[data-rate="r1"]')?.innerText ?? "" }))
    expect(!after.form && after.saved === "Saved", "the form closes and the row says Saved", JSON.stringify(after))
    const row = after.row.replace(/\u00a0/g, " ")
    expect(/18\.50 lei/.test(row) && /free over 250\.00 lei/.test(row) && /1 to 4 business days/.test(after.row), "the row shows the new price, free over and days", after.row.replace(/\n/g, " | "))

    console.log(`\nAdding a zone, ${label}px`)
    await page.click("[data-add-zone]")
    await wait(400)
    m = await measure(page, "[data-zone-form]")
    expect(m.grounds.every((c) => c === "rgb(255, 255, 255)"), `the zone form is on white (${[...new Set(m.grounds)].join(", ")})`)
    expect(m.heights.length === 1, `its fields are one height: ${m.heights.join(", ")}px`)
    expect(m.btns.at(-1)?.disabled === true, "Add zone is greyed until a country is picked")
    expect(m.minContrast >= 4.5, `text contrast at least 4.5:1 (lowest ${m.minContrast}:1)`, m.low.join(" | "))
    await shot(page, `shipping-zone-form-${label}`)
    await page.click("[data-zone-form] [data-form-cancel]")
    await wait(200)

    console.log(`\nA package, ${label}px`)
    await page.click('[data-package="pk1"] button[aria-label^="Edit"]')
    await wait(300)
    m = await measure(page, "[data-package-form]")
    expect(m.grounds.every((c) => c === "rgb(255, 255, 255)") && m.heights.length === 1 && m.btns.at(-1)?.disabled === true, `on white, one field height (${m.heights.join(", ")}px), Save greyed until changed`)
    await page.click("[data-package-form] [data-form-cancel]")
    expect((await sideways(page)) === 0 && errors.length === 0, "nothing scrolls sideways, no errors", errors.join(" "))
    await page.close()

    console.log(`\nLocations, ${label}px`)
    const loc = await browser.newPage()
    await loc.setViewport(viewport)
    await loc.goto(`${base}/?part=locations`)
    await wait(1000)
    await loc.click(`[data-location="${LOC}"] button[aria-label^="Edit"]`)
    await wait(300)
    m = await measure(loc, "[data-location-form]")
    expect(m.grounds.every((c) => c === "rgb(255, 255, 255)") && m.heights.length === 1 && m.btns.at(-1)?.disabled === true, `on white, one field height (${m.heights.join(", ")}px), Save greyed until changed`)
    expect(m.minContrast >= 4.5, `text contrast at least 4.5:1 (lowest ${m.minContrast}:1)`, m.low.join(" | "))
    expect((await sideways(loc)) === 0, "nothing scrolls sideways")
    await shot(loc, `shipping-location-form-${label}`)
    await loc.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
