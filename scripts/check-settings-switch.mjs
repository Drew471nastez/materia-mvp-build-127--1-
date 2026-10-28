/**
 * ===========================================================================
 *  SETTINGS: A PRESS ON A SECTION, MEASURED AGAINST A SLOW SERVER
 * ===========================================================================
 * "Clicking a category reloads the whole settings page; switching is slow."
 * The real Settings in the real sheet (scripts/render-settings-switch.tsx),
 * every /api answer held back by SWITCH_DELAY ms (400 by default), at a
 * computer's width and a phone's. Every section is pressed in turn, twice:
 *
 *   COLD      the first press after the sheet has risen (its data fetched
 *             ahead while it rose, so normally kept by then)
 *   WARM      every section again, with everything kept
 *
 * and on every animation frame after a press this reads:
 *
 *   RESPONSE  the first frame the pressed row or pill is the open one
 *   SECTION   the first frame the new section is in the page
 *   SHELL     the column, the pill row and the page's title are the same
 *             DOM nodes before and after every press (nothing remounted)
 *   BLANK     a frame with no section, or only the waiting spinner
 *   LONG      the browser's long tasks in the 500ms after the press
 *
 * Then every section is opened once more in a development build of React,
 * and every console error and warning is reported (a key warning, a
 * setState in render, a crash). Plan is measured centred in the sheet on a
 * computer (its column's centre within 2px of the panel's centre).
 *
 *   node scripts/check-settings-switch.mjs            (SWITCH_DELAY=ms, CPU_SLOWDOWN=4)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const DELAY = Number(process.env.SWITCH_DELAY ?? 400)
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".settings-switch-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => window.__path
export const useSearchParams = () => new URLSearchParams(location.search)
const router = { push(h) { window.__nav.push.push(h) }, replace(h) { window.__nav.replace.push(h) }, prefetch() {}, refresh() { window.__nav.refresh++ }, back() { window.__nav.back++ } }
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, sizes, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, ...rest }) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
const bundle = (env, out) => execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-settings-switch.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, out)}`,
  `--define:process.env.NODE_ENV="${env}"`,
  `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
  `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
  `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })
try {
  bundle("production", "prod.js")
  bundle("development", "dev.js")
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const css = await appCss(root)
const page = (js, physical) => `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__nav={back:0,push:[],replace:[],refresh:0};window.__path="/app";window.__physical=${physical}</script><script>${js}</script></body></html>`
const prodJs = readFileSync(join(dir, "prod.js"), "utf8")
const devJs = readFileSync(join(dir, "dev.js"), "utf8")
rmSync(dir, { recursive: true, force: true })

const free = { id: "free", name: "Free", price_cents: 0, billing_period: "month", features: ["1 store"] }
const pro = { id: "pro", name: "Pro", price_cents: 2900, billing_period: "month", features: ["Your own domain", "No Storelib fee"] }
const API = {
  "/api/billing/overview": { plans: [free, pro], subscription: null, currentPlan: free, invoices: [], paymentMethod: null },
  "/api/billing/subscription": { currentPlan: free },
  "/api/domains": { domains: [] },
  "/api/notifications/preferences": { categories: [] },
  "/api/store/settings": { settings: { storeName: "Mara Lind", phone: null, phoneCountry: null, defaultCountry: "SE", checkout: {}, defaultSalesChannelId: null, ready: true }, detectedCountry: "SE", supportEmail: "hello@maralind.se", currency: "SEK" },
  "/api/physical/settings": { settings: { defaultLocationId: "loc-1" }, locations: [{ id: "loc-1", name: "Studio" }], zones: [], rates: [], packages: [] },
  "/api/ai-memory": { memories: [], ready: true },
  /* The same answers scripts/check-languages-settings.mjs and check-settings-panels.mjs stub these routes with. */
  "/api/store/currency": { ready: true, country: "SE", currency: "SEK", chosen: "SEK", suggested: "SEK", unsupportedLocal: null, detectedCountry: "SE", currencies: [{ code: "SEK", label: "SEK" }], catalog: { products: 1, variants: 1, shippingRates: 0, coupons: 0, total: 1 }, lastChange: null },
  "/api/store/markets": { ready: true, localization: { defaultLanguage: "en", languages: [], markets: [{ id: "home", name: "Home", primary: true, countries: [], currency: null, language: null, rounding: "none", adjustBps: 0, active: true }], visitorLanguage: false, autoTranslate: false }, autoTranslate: { run: null, available: true }, baseCurrency: "SEK", chargeCurrency: "SEK", fx: { asOf: "2026-10-13", fresh: true, currencies: ["EUR", "USD"], rates: { EUR: 1, SEK: 11.4 } } },
  "/api/store/taxes": { enabled: false, included: true, onShipping: false, digital: false, ready: true, detectedCountry: "SE", currency: "SEK", regions: [], overrides: [], products: [] },
  "/api/store/channels": { ready: true, defaultKey: null, channels: [{ id: null, kind: "storefront", name: "Online store", description: "Your website.", enabled: true, off: 0 }] },
  "/api/store/reasons": { return: [], refund: [], ready: true },
  "/api/store/activity": { entries: [], more: false, missing: false },
  "/api/store/integrations": { tracking: {}, ready: true },
  "/api/store/integrations/catalog": { overrides: [] },
  "/api/physical/integrations": { integrations: [] },
  "/api/integrations/popularity": { scores: {} },
}
let html = ""
const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const path = req.url.split("?")[0]
    /* What the probe has no real answer for is answered as a failure, which every section has its own state for (an answer of {} would be a shape no route sends). */
    const failed = !(path in API)
    setTimeout(() => { res.writeHead(failed ? 503 : 200, { "content-type": "application/json" }); res.end(JSON.stringify(failed ? { error: "Not reachable in the probe" } : API[path] ?? {})) }, DELAY)
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"], headless: true })

let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const INSTRUMENT = () => {
  history.back = () => { window.__nav.back++; window.dispatchEvent(new PopStateEvent("popstate")); setTimeout(() => window.__closed?.(), 0) }
  window.__long = []
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: "longtask", buffered: true }) } catch { /* none */ }
  window.__frames = null
  window.__record = (tab) => {
    window.__frames = []
    const tick = (t) => {
      if (!window.__frames) return
      const on = document.querySelector(`[data-settings-side-tab="${tab}"][aria-current="page"], [data-settings-tab="${tab}"][aria-selected="true"]`)
      const section = document.querySelector("[data-settings-panel]")
      const spin = !!section?.closest("[data-settings-content]")?.querySelector("[data-waiting-area], [role=progressbar]") && !section
      const op = section ? Number(getComputedStyle(section).opacity) : 0
      window.__frames.push({ t, on: !!on, tab: section?.getAttribute("data-settings-panel") ?? null, h: section ? Math.round(section.getBoundingClientRect().height) : 0, op, spin })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  window.__stop = () => { const f = window.__frames; window.__frames = null; return f }
}

async function openSheet(p) {
  await p.goto(`${base}/app`)
  await p.waitForFunction(() => typeof window.__open === "function")
  const slow = Number(process.env.CPU_SLOWDOWN || 1)
  if (slow > 1) { const cdp = await p.createCDPSession(); await cdp.send("Emulation.setCPUThrottlingRate", { rate: slow }) }
  const t0 = await p.evaluate(() => { window.__record("general"); const t = performance.now(); window.__open(); return t })
  await wait(900)
  const frames = await p.evaluate(() => window.__stop())
  const first = frames.find((f) => f.tab === "general" && f.op > 0)
  return { firstMs: first ? Math.round(first.t - t0) : null }
}

const tabsOf = (p, phone) => p.evaluate((phone) => [...document.querySelectorAll(phone ? "[data-settings-tab]" : "[data-settings-side-tab]")].map((n) => n.getAttribute(phone ? "data-settings-tab" : "data-settings-side-tab")), phone)

async function press(p, tab, phone) {
  const sel = phone ? `[data-settings-tab="${tab}"]` : `[data-settings-side-tab="${tab}"]`
  const nodes = await p.evaluate(() => { window.__shell = [document.querySelector("[data-settings-groups]"), document.querySelector("[data-settings-tabs]"), document.querySelector("[data-settings-header]")] })
  void nodes
  const tp = await p.evaluate((sel, tab) => { const el = document.querySelector(sel); if (!el) return null; window.__record(tab); const t = performance.now(); el.click(); return t }, sel, tab)
  if (tp === null) return { on: null, shown: null, blank: 0, same: true, long: [], gone: true }
  await wait(DELAY + 450)
  const frames = (await p.evaluate(() => window.__stop())).filter((f) => f.t >= tp)
  const same = await p.evaluate(() => { const now = [document.querySelector("[data-settings-groups]"), document.querySelector("[data-settings-tabs]"), document.querySelector("[data-settings-header]")]; return now.every((n, i) => n === window.__shell[i] && n?.isConnected) })
  const on = frames.find((f) => f.on)
  const shown = frames.find((f) => f.tab === tab)
  const blank = frames.filter((f) => !f.tab || f.spin).length
  const long = (await p.evaluate(() => window.__long)).filter(([s, d]) => s + d >= tp && s <= tp + 500).map(([, d]) => d)
  return { on: on ? Math.round(on.t - tp) : null, shown: shown ? Math.round(shown.t - tp) : null, blank, same, long }
}

const results = {}
for (const [name, vp, phone] of [["desktop", { width: 1440, height: 900 }, false], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true }, true]]) {
  console.log(`\n${name} (${vp.width}x${vp.height}), every /api answer ${DELAY}ms late`)
  html = page(prodJs, true)
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => { errors.push(String(e)); if (process.env.SWITCH_VERBOSE) console.log("    pageerror", String(e.stack || e).slice(0, 600)) })
  await p.evaluateOnNewDocument(INSTRUMENT)
  const open = await openSheet(p)
  console.log(`    open: General drawn ${open.firstMs}ms after the press`)
  say(open.firstMs !== null && open.firstMs < 100, `${name}: the sheet has its first section in it within 100ms of the press (${open.firstMs}ms)`)
  const tabs = (await tabsOf(p, phone)).filter((t) => t !== "general")
  for (const pass of ["cold", "warm"]) {
    const rows = []
    for (const tab of [...tabs, "general"]) {
      const r = await press(p, tab, phone)
      rows.push([tab, r])
    }
    const worstOn = Math.max(...rows.map(([, r]) => r.on ?? 9999))
    const worstShown = Math.max(...rows.map(([, r]) => r.shown ?? 9999))
    console.log(`    ${pass}: ${rows.map(([t, r]) => `${t} ${r.on}/${r.shown}ms${r.blank ? ` blank ${r.blank}` : ""}${r.long.length ? ` long ${r.long.join("+")}` : ""}`).join(", ")}`)
    say(rows.every(([, r]) => r.same), `${name} ${pass}: the column, the pills and the title are never remounted by a press`)
    say(worstOn < 100, `${name} ${pass}: every press lights its row within 100ms (worst ${worstOn}ms)`)
    if (pass === "warm") say(worstShown < 100, `${name} warm: every section is in the page within 100ms of its press (worst ${worstShown}ms; ${rows.filter(([, r]) => (r.shown ?? 9999) >= 100).map(([t, r]) => `${t} ${r.shown}`).join(", ") || "none slower"})`)
    else say(worstShown < DELAY + 200, `${name} cold: every section is in the page before its data could have been fetched from scratch (worst ${worstShown}ms)`)
    say(rows.every(([, r]) => r.blank === 0), `${name} ${pass}: never a frame with no section (${rows.filter(([, r]) => r.blank).map(([t, r]) => `${t} ${r.blank}`).join(", ") || "none"})`)
    results[`${name}-${pass}`] = rows
  }
  if (!phone) {
    await p.evaluate(() => document.querySelector('[data-settings-side-tab="billing"]')?.click())
    await wait(DELAY + 600)
    const c = await p.evaluate(() => {
      const panel = document.querySelector('[data-settings-panel="billing"]')
      const inner = panel?.querySelector("[data-billing-plans], [data-billing-page]") ?? panel?.firstElementChild?.firstElementChild
      if (!panel || !inner) return null
      const a = panel.getBoundingClientRect(), b = inner.getBoundingClientRect()
      return { panel: Math.round(a.left + a.width / 2), inner: Math.round(b.left + b.width / 2), w: Math.round(b.width), pw: Math.round(a.width) }
    })
    say(!!c && Math.abs(c.panel - c.inner) <= 2, `desktop: Plan is centred in its column (${c ? `centre ${c.inner} against ${c.panel}, ${c.w}px wide in ${c.pw}px` : "not found"})`)
    if (process.env.SWITCH_SHOT) await p.screenshot({ path: join(process.env.SWITCH_SHOT, "plan-desktop.png") })
  }
  say(errors.length === 0, `${name}: no page errors (${errors.slice(0, 3).join(" | ") || "none"})`)
  await p.close()
}

/* ── EVERY SECTION IN A DEVELOPMENT BUILD: what React says ── */
console.log("\nevery section, development React")
for (const physical of [false, true]) {
  html = page(devJs, physical)
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  const said = []
  p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") said.push(`${m.type()}: ${m.text().slice(0, 240)}`) })
  p.on("pageerror", (e) => said.push(`pageerror: ${String(e).slice(0, 240)}`))
  await p.evaluateOnNewDocument(INSTRUMENT)
  await openSheet(p)
  const tabs = await tabsOf(p, false)
  const missing = []
  for (const tab of tabs) {
    await p.evaluate((tab) => document.querySelector(`[data-settings-side-tab="${tab}"]`)?.click(), tab)
    await wait(DELAY + 500)
    const ok = await p.evaluate((tab) => { const s = document.querySelector(`[data-settings-panel="${tab}"]`); return !!s && s.getBoundingClientRect().height > 40 }, tab)
    if (!ok) missing.push(tab)
  }
  /* The probe's own stubs answer {} for what it does not know: a failed request is the stub, not the page. */
  const real = said.filter((s) => !/Failed to load resource|favicon|net::ERR/.test(s))
  console.log(`    physical commerce ${physical ? "on" : "off"}: ${tabs.length} sections; ${real.length} console errors and warnings`)
  for (const s of [...new Set(real)].slice(0, 12)) console.log(`      ${s}`)
  say(missing.length === 0, `physical ${physical ? "on" : "off"}: every section draws (${missing.join(", ") || "all"})`)
  say(real.length === 0, `physical ${physical ? "on" : "off"}: no React errors or warnings while every section is opened`)
  await p.close()
}

if (process.env.SWITCH_JSON) writeFileSync(process.env.SWITCH_JSON, JSON.stringify(results, null, 2))
await browser.close()
server.close()
console.log(bad ? `\n${bad} failed\n` : "\nall passed\n")
process.exit(bad ? 1 : 0)
