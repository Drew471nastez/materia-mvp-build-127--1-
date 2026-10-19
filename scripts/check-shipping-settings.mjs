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
 *   EVERYWHERE ELSE  the rest-of-world zone has a globe tile in the flags'
 *              column, the size of a flag, drawn (round Z7), in the list and
 *              in the summary
 *   TOAST      saving a rate, a zone, a package and a location each shows
 *              one short toast ("Rate saved" ...): filmed every frame, its
 *              fade and rise in and its fade out, where it sits (under the
 *              header on a phone, bottom right on a computer, inside the
 *              screen), and gone by itself after its time (round Z7)
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
      { id: "z3", profileId: "p1", name: "Everywhere else", countries: [], regions: [], restOfWorld: true, rates: [rate("z3", "r4", { name: "International", priceCents: 4500, freeOverCents: null, minDays: 5, maxDays: 12 })] },
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
      else if (u.startsWith("/api/physical/packages")) {
        if (req.method === "PATCH" && body.name) state.packages = state.packages.map((pk) => (u.endsWith(`/${pk.id}`) ? { ...pk, name: body.name } : pk))
        out = { packages: state.packages }
      } else if (u.startsWith("/api/physical/locations/") && req.method === "PATCH") {
        state.locations = state.locations.map((l) => (u.endsWith(`/${l.id}`) ? { ...l, name: body.name ?? l.name } : l))
        out = { location: state.locations.find((l) => u.endsWith(`/${l.id}`)) }
      }
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

/*
  A toast, filmed: from the press until it is gone, every frame, its opacity,
  how far it is from where it rests, and its box. "in" is the time from its
  first frame to fully shown; "out" the time from its first fading frame to
  gone.
*/
const filmToast = (page) => page.evaluate(() => {
  window.__toast = []
  const t0 = performance.now()
  const tick = (t) => {
    const el = document.querySelector("[data-toast]")
    if (el) {
      const r = el.getBoundingClientRect()
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
      window.__toast.push({ t: Math.round(t - t0), op: +(+getComputedStyle(el).opacity).toFixed(3), dy: +m.m42.toFixed(1), dx: +m.m41.toFixed(1), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), text: el.innerText.trim(), state: el.getAttribute("data-state") })
    } else window.__toast.push({ t: Math.round(t - t0), gone: true })
    if (t - t0 < 5200) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const readToast = async (page) => {
  const film = await page.evaluate(() => window.__toast)
  const seen = film.filter((f) => !f.gone)
  const first = seen[0]
  const full = seen.find((f) => f.op >= 0.99 && Math.abs(f.dy) < 0.5 && Math.abs(f.dx) < 0.5)
  const fading = seen.find((f) => f.state === "closed")
  const goneAt = fading ? film.find((f) => f.t > fading.t && f.gone) : null
  return {
    text: full?.text ?? first?.text ?? null,
    in: first && full ? full.t - first.t : null,
    inFrames: first && full ? seen.filter((f) => f.t >= first.t && f.t < full.t).length : 0,
    startOp: first?.op ?? null,
    startDy: first?.dy ?? null,
    startDx: first?.dx ?? null,
    shown: full && fading ? fading.t - full.t : null,
    out: fading && goneAt ? goneAt.t - fading.t : null,
    outFrames: fading ? seen.filter((f) => f.state === "closed").length : 0,
    box: full ? { top: full.top, bottom: full.bottom, left: full.left, right: full.right } : null,
  }
}
const toastOk = (tt, word, viewport, label) => {
  const phone = viewport.width < 768
  expect(tt.text === word, `${label}: the toast says "${word}"`, JSON.stringify(tt.text))
  expect(tt.in !== null && tt.in >= 180 && tt.in <= 520 && tt.inFrames >= 8 && tt.startOp < 0.5, `${label}: it fades and moves in over ${tt.in}ms (${tt.inFrames} frames, from opacity ${tt.startOp}, ${phone ? `${tt.startDy}px above` : `${tt.startDx}px to the right`})`)
  expect(tt.shown !== null && tt.shown >= 2000 && tt.shown <= 3600, `${label}: it stays ${tt.shown}ms, then goes by itself`)
  expect(tt.out !== null && tt.out >= 120 && tt.out <= 520 && tt.outFrames >= 5, `${label}: it fades out over ${tt.out}ms (${tt.outFrames} frames)`)
  const b = tt.box
  const placed = b && b.left >= 0 && b.right <= viewport.width && b.top >= 0 && b.bottom <= viewport.height && (phone ? b.top >= 60 && b.top <= 140 && b.left >= 15 : b.bottom >= viewport.height - 80 && b.right >= viewport.width - 40)
  expect(!!placed, `${label}: ${phone ? "under the header, between the gutters" : "at the bottom right"}, on screen`, JSON.stringify(b))
}

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
    const worldTile = (scope) => page.evaluate((scope) => {
      const t = document.querySelector(`${scope} [data-world-flag]`)
      const flag = document.querySelector(`${scope} [data-flag]`) ?? document.querySelector("[data-zone] [data-flag]")
      if (!t) return null
      const r = t.getBoundingClientRect(), f = flag?.getBoundingClientRect()
      const svg = t.querySelector("svg")
      return { w: Math.round(r.width), h: Math.round(r.height), flagW: f ? Math.round(f.width) : null, flagH: f ? Math.round(f.height) : null, globe: !!svg && svg.getBoundingClientRect().width >= 8 && svg.querySelectorAll("circle, ellipse, path").length >= 3, bg: getComputedStyle(t).backgroundColor, stroke: svg ? getComputedStyle(svg).stroke : null }
    }, scope)
    const summary = await worldTile("[data-shipping-summary]")
    if (summary) expect(summary.globe && summary.w === 21 && summary.h === 14 && summary.bg !== "rgb(241, 242, 244)", `Everywhere else in the summary: a ${summary.w}x${summary.h} globe tile (a flag is ${summary.flagW}x${summary.flagH}), ${summary.bg}`)
    if ((await page.evaluate(() => document.querySelector("[data-shipping-all]")?.getAttribute("data-shipping-all"))) === "closed") await page.click("[data-shipping-all]")
    await wait(500)

    console.log(`\nThe page, ${label}px`)
    const page0 = await page.evaluate(() => ({ zones: document.querySelectorAll("[data-zone]").length, local: document.querySelector("[data-local-hint]")?.innerText ?? "" }))
    expect(page0.zones === 3, "three zones drawn", page0.zones)
    const tile = await worldTile('[data-zone="z3"]')
    expect(!!tile && tile.globe && tile.w === tile.flagW && tile.h === tile.flagH, `Everywhere else has a globe tile the size of a flag (${tile?.w}x${tile?.h} vs ${tile?.flagW}x${tile?.flagH}), not an empty box`, JSON.stringify(tile))
    const rowText = await page.evaluate(() => { const z = document.querySelector('[data-zone="z1"]'), w = document.querySelector('[data-zone="z3"]'); const name = (el) => el?.querySelector("p")?.getBoundingClientRect().left ?? 0; return { flagsLeft: Math.round(name(z)), worldLeft: Math.round(name(w)) } })
    expect(rowText.worldLeft > 0 && Math.abs(rowText.worldLeft - rowText.flagsLeft) <= 14, `its name starts beside its tile like the others (${rowText.worldLeft} vs ${rowText.flagsLeft}px)`)
    expect(/Local delivery and pickup/.test(page0.local) && /Local delivery from Studio, and pickup at Studio\./.test(page0.local), "local delivery and pickup say where they are set", page0.local.replace(/\n/g, " | "))
    expect((await sideways(page)) === 0, "nothing scrolls sideways", await sideways(page))
    await shot(page, `shipping-all-${label}`)

    console.log(`\nEditing the flat rate, ${label}px`)
    await page.click('[data-rate="r1"] [data-rate-edit]')
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
    await filmToast(page)
    await page.click("[data-rate-save]")
    await wait(120)
    const pending = await page.evaluate(() => { const b = document.querySelector("[data-rate-save]"); return b ? { state: b.getAttribute("data-save-state"), w: Math.round(b.getBoundingClientRect().width), spinner: !!b.querySelector(".activity-spinner, [role='status'], svg") } : null })
    expect(pending?.state === "saving" && pending.w === ready.w, `pressed: the spinner shows and the button keeps its width (${pending?.state}, ${ready?.w} to ${pending?.w}px)`)
    await wait(900)
    const sent = posted.find((p) => p.method === "PATCH" && p.url.endsWith("/rates/r1"))?.body
    expect(!!sent && sent.priceCents === 1850 && sent.freeOverCents === 25000 && String(sent.maxDays) === "4" && String(sent.minDays) === "1" && sent.kind === "flat", "the PATCH carries what was typed", JSON.stringify(sent))
    const after = await page.evaluate(() => ({ form: !!document.querySelector("[data-rate-form]"), mark: !!document.querySelector("[data-saved-mark]"), row: document.querySelector('[data-rate="r1"]')?.innerText ?? "" }))
    expect(!after.form && !after.mark, "the form closes; no second Saved word in the row, the toast says it", JSON.stringify(after))
    await wait(4400)
    toastOk(await readToast(page), "Rate saved", viewport, `Rate, ${label}px`)
    if (SHOTS) {
      await filmToast(page)
      await page.click('[data-zone="z1"] button[aria-label^="Edit"]')
      await wait(300)
      await type(page, "[data-zone-form] input", "Romania home")
      await wait(100)
      await page.click("[data-zone-save]")
      await wait(900)
      await page.screenshot({ path: join(SHOTS, `shipping-toast-${label}.png`) })
      await wait(3600)
      toastOk(await readToast(page), "Zone saved", viewport, `Zone, ${label}px`)
    }
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
    await shot(page, `shipping-package-form-${label}`)
    await type(page, "[data-package-form] input", "Small box")
    await wait(100)
    await filmToast(page)
    await page.click("[data-package-save]")
    await wait(5200)
    toastOk(await readToast(page), "Package saved", viewport, `Package, ${label}px`)
    expect((await sideways(page)) === 0 && errors.length === 0, "nothing scrolls sideways, no errors", errors.join(" "))
    await page.close()

    console.log(`\nLocations, ${label}px`)
    const loc = await browser.newPage()
    await loc.setViewport(viewport)
    const locErrors = []
    loc.on("pageerror", (e) => locErrors.push(String(e)))
    await loc.goto(`${base}/?part=locations`)
    await wait(1000)
    await loc.click(`[data-location="${LOC}"] button[aria-label^="Edit"]`)
    await wait(300)
    m = await measure(loc, "[data-location-form]")
    expect(m.grounds.every((c) => c === "rgb(255, 255, 255)") && m.heights.length === 1 && m.btns.at(-1)?.disabled === true, `on white, one field height (${m.heights.join(", ")}px), Save greyed until changed`)
    expect(m.minContrast >= 4.5, `text contrast at least 4.5:1 (lowest ${m.minContrast}:1)`, m.low.join(" | "))
    expect((await sideways(loc)) === 0, "nothing scrolls sideways")
    await shot(loc, `shipping-location-form-${label}`)
    await type(loc, "[data-location-form] input", "Studio 2")
    await wait(100)
    await filmToast(loc)
    await loc.click("[data-location-save]")
    await wait(5200)
    toastOk(await readToast(loc), "Location saved", viewport, `Location, ${label}px`)
    expect(locErrors.length === 0, "no errors on Locations", locErrors.join(" "))
    await loc.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
