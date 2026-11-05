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
 * Then a tab from before a deploy: the sections' code split into files the
 * way the app's is, those files answered 404 after the page has loaded, and
 * Taxes pressed. The whole page must not load again (it did: the section
 * threw into app/(storelib)/app/error.tsx, whose error screen reloads for stale code);
 * the column stays and Taxes says, in its own place, that Storelib updated.
 *
 * Then every section is opened once more in a development build of React,
 * and every console error and warning is reported (a key warning, a
 * setState in render, a crash). Plan is measured centred in the sheet on a
 * computer (its column's centre within 2px of the panel's centre).
 *
 *   node scripts/check-settings-switch.mjs            (SWITCH_DELAY=ms, CPU_SLOWDOWN=4,
 *                                                      SWITCH_ONLY=switch|stale|hang|dev, SWITCH_BEFORE=c18b792,
 *                                                      SWITCH_PROFILE=security,taxes, SWITCH_SHOT=dir)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
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
/*
  A TAB FROM BEFORE A DEPLOY. The same page split the way the app is: every
  section's code a file of its own, fetched when Settings asks for it, so the
  probe can answer those files as a deploy that renamed them does (404).
  SWITCH_BEFORE=<commit> builds it against that commit's lazy-panels and no
  section boundary, to see what the press did before (c18b792 is the last
  one without the boundary: the page loads again).
*/
const before = process.env.SWITCH_BEFORE || ""
if (before) {
  writeFileSync(join(dir, "lazy-before.tsx"), execFileSync("git", ["show", `${before}:components/app/settings/lazy-panels.tsx`]))
  writeFileSync(join(dir, "boundary-before.tsx"), `export function SettingsSectionBoundary({ children }) { return children }\n`)
}
const split = () => execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-settings-switch.tsx"),
  "--bundle", "--splitting", "--format=esm", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outdir=${join(dir, "split")}`,
  '--define:process.env.NODE_ENV="production"', "--entry-names=entry", "--chunk-names=chunk-[hash]",
  `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
  `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
  ...(before ? [`--alias:@/components/app/settings/lazy-panels=${join(dir, "lazy-before.tsx")}`, `--alias:@/components/app/settings/section-boundary=${join(dir, "boundary-before.tsx")}`] : []),
  `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })
try {
  bundle("production", "prod.js")
  bundle("development", "dev.js")
  split()
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const splitFiles = new Map(readdirSync(join(dir, "split")).map((f) => [f, readFileSync(join(dir, "split", f), "utf8")]))
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
  /* scripts/render-customer-emails-probe.tsx's answer. */
  "/api/store/emails": { shop: { name: "Mara Lind", supportEmail: "hello@maralind.se", storeUrl: "https://maralind.storelib.com", logoUrl: null, phone: null, currency: "SEK" }, copy: {}, ready: true },
  "/api/integrations/popularity": { scores: {} },
}
let html = ""
/* While true, every split file but the page's own entry is gone, as after a deploy. */
let staleChunks = false
/* While true, every split file but the entry is asked for and never answered: a phone whose connection stalled mid fetch. */
let hangChunks = false
const hung = []
const server = createServer((req, res) => {
  if (req.url.startsWith("/split/")) {
    const f = req.url.slice(7).split("?")[0]
    if (hangChunks && f !== "entry.js") { hung.push(res); return }
    if (!splitFiles.has(f) || (staleChunks && f !== "entry.js")) { res.writeHead(404); res.end(""); return }
    res.writeHead(200, { "content-type": "text/javascript" })
    res.end(splitFiles.get(f))
    return
  }
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
  const asked = p.__asked ?? []
  const askedFrom = asked.length
  const tp = await p.evaluate((sel, tab) => { const el = document.querySelector(sel); if (!el) return null; window.__record(tab); const t = performance.now(); el.click(); return t }, sel, tab)
  if (tp === null) return { on: null, shown: null, blank: 0, same: true, long: [], gone: true }
  await wait(DELAY + 450)
  const frames = (await p.evaluate(() => window.__stop())).filter((f) => f.t >= tp)
  const same = await p.evaluate(() => { const now = [document.querySelector("[data-settings-groups]"), document.querySelector("[data-settings-tabs]"), document.querySelector("[data-settings-header]")]; return now.every((n, i) => n === window.__shell[i] && n?.isConnected) })
  const on = frames.find((f) => f.on)
  const shown = frames.find((f) => f.tab === tab)
  const blank = frames.filter((f) => !f.tab || f.spin).length
  const long = (await p.evaluate(() => window.__long)).filter(([s, d]) => s + d >= tp && s <= tp + 500).map(([, d]) => d)
  return { on: on ? Math.round(on.t - tp) : null, shown: shown ? Math.round(shown.t - tp) : null, blank, same, long, asked: asked.slice(askedFrom) }
}

const results = {}
const only = process.env.SWITCH_ONLY ?? ""
for (const [name, vp, phone] of only && only !== "switch" ? [] : [["desktop", { width: 1440, height: 900 }, false], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true }, true]]) {
  console.log(`\n${name} (${vp.width}x${vp.height}), every /api answer ${DELAY}ms late`)
  html = page(prodJs, true)
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.__asked = []
  p.on("request", (r) => { const u = r.url(); if (u.includes("/api/")) p.__asked.push(u.replace(/^https?:\/\/[^/]+/, "")) })
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
    if (pass === "warm") console.log(`    asked again on a warm press: ${rows.filter(([, r]) => r.asked.length).map(([t, r]) => `${t} [${[...new Set(r.asked)].join(" ")}]`).join(", ") || "nothing"}`)
    results[`${name}-${pass}`] = rows
  }
  if (!phone && process.env.SWITCH_PROFILE) {
    const cdp = await p.createCDPSession()
    await cdp.send("Profiler.enable")
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 })
    const sums = new Map()
    for (const tab of process.env.SWITCH_PROFILE.split(",")) {
      await p.evaluate(() => document.querySelector('[data-settings-side-tab="general"]').click())
      await wait(800)
      await cdp.send("Profiler.start")
      await p.evaluate((tab) => document.querySelector(`[data-settings-side-tab="${tab}"]`).click(), tab)
      await wait(600)
      const { profile } = await cdp.send("Profiler.stop")
      const byId = new Map(profile.nodes.map((n) => [n.id, n]))
      const dt = profile.timeDeltas
      profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || "(anon)"}`; sums.set(k, (sums.get(k) ?? 0) + (dt[i] ?? 0) / 1000) })
    }
    const top = [...sums.entries()].filter(([k]) => !/idle|program|garbage/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25)
    console.log("    self time (ms) over the profiled presses:\n" + top.map(([k, v]) => `      ${v.toFixed(1).padStart(7)}  ${k}`).join("\n"))
    const gc = sums.get("(garbage collector)") ?? 0
    console.log(`      ${gc.toFixed(1).padStart(7)}  (garbage collector)`)
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

/* ── A TAB FROM BEFORE A DEPLOY: a section whose code is gone ── */
if (!only || only === "stale") {
console.log(`\na press on a section whose code a deploy removed${before ? ` (as of ${before})` : ""}`)
  html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__nav={back:0,push:[],replace:[],refresh:0};window.__path="/app";window.__physical=false</script><script type="module" src="/split/entry.js"></script></body></html>`
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  let loads = 0
  p.on("load", () => { loads++ })
  await p.evaluateOnNewDocument(INSTRUMENT)
  /* The deploy lands after the page loaded and before Settings fetched its sections. */
  await p.goto(`${base}/app`)
  await p.waitForFunction(() => typeof window.__open === "function")
  staleChunks = true
  const loadsBefore = loads
  await p.evaluate(() => { window.__marker = 1; window.__open() })
  await wait(1200)
  await p.evaluate(() => { window.__column = document.querySelector("[data-settings-groups]") })
  await p.evaluate(() => document.querySelector('[data-settings-side-tab="taxes"]')?.click())
  await wait(2500)
  const after = await p.evaluate(() => ({
    same: window.__marker === 1,
    column: !!window.__column && window.__column.isConnected,
    failed: document.querySelector("[data-settings-section-failed]")?.getAttribute("data-settings-section-failed") ?? null,
    errorScreen: !!document.querySelector("[data-app-error-screen]"),
    lit: !!document.querySelector('[data-settings-side-tab="taxes"][aria-current="page"]'),
  }))
  const reloaded = loads > loadsBefore || !after.same
  console.log(`    page loaded again: ${reloaded}; the column still there: ${after.column}; the app's error screen: ${after.errorScreen}; the section says: ${after.failed ?? "nothing"}`)
  say(!reloaded, "the press does not load the whole page again")
  say(after.column && !after.errorScreen, "the column, and Settings round it, stay on screen")
  say(after.failed === "stale" && after.lit, "Taxes is the open section and says, in its own place, that Storelib was updated, with a Reload of its own")
  staleChunks = false
  await p.close()
}

/* ── A SECTION WHOSE CODE NEVER ARRIVES: the request is taken and never answered ── */
if (!only || only === "hang") {
  console.log("\na press on a section whose code is asked for and never answered")
  html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__nav={back:0,push:[],replace:[],refresh:0};window.__path="/app";window.__physical=false</script><script type="module" src="/split/entry.js"></script></body></html>`
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.evaluateOnNewDocument(INSTRUMENT)
  await p.goto(`${base}/app`)
  await p.waitForFunction(() => typeof window.__open === "function")
  hangChunks = true
  await p.evaluate(() => window.__open())
  await wait(1200)
  const t0 = Date.now()
  await p.evaluate(() => document.querySelector('[data-settings-side-tab="taxes"]')?.click())
  /* What the section's place says, sampled until it says something other than the section before. */
  let state = null
  let left = null
  while (Date.now() - t0 < 15000) {
    state = await p.evaluate(() => ({
      /* The section on screen: one Suspense hid stays in the page under display none. */
      panel: [...document.querySelectorAll("[data-settings-panel]")].find((n) => n.offsetParent !== null || n.getClientRects().length)?.getAttribute("data-settings-panel") ?? null,
      waiting: !!document.querySelector("[data-settings-content] [data-waiting-area], [data-settings-content] [role=progressbar]"),
      failed: document.querySelector("[data-settings-section-failed]")?.getAttribute("data-settings-section-failed") ?? null,
      lit: !!document.querySelector('[data-settings-side-tab="taxes"][aria-current="page"]'),
    }))
    if (left === null && state.panel !== "general" && (state.waiting || state.panel === "taxes")) left = Date.now() - t0
    if (state.failed) break
    await wait(100)
  }
  const ms = Date.now() - t0
  console.log(`    General gone after ${left}ms; after ${ms}ms the section says ${state?.failed ?? "nothing"}; Taxes lit: ${state?.lit}`)
  say(left !== null && left < 1500, `the press leaves the section before within 1.5s, for a spinner in its place (${left}ms)`)
  say(state?.failed === "slow" && ms < 12000, `within 12s Taxes says it took too long, with Try again (${ms}ms, ${state?.failed ?? "nothing"})`)
  /* The connection comes back: the stalled requests drop, and Try again in the section's own place draws Taxes. */
  hangChunks = false
  for (const r of hung.splice(0)) r.destroy()
  await wait(300)
  await p.evaluate(() => document.querySelector("[data-settings-section-failed] button")?.click())
  let drawn = false
  for (let i = 0; i < 40 && !drawn; i++) {
    await wait(100)
    drawn = await p.evaluate(() => !document.querySelector("[data-settings-section-failed]") && !!document.querySelector('[data-settings-panel="taxes"]') && document.querySelector('[data-settings-panel="taxes"]').getBoundingClientRect().height > 40)
  }
  say(drawn, "with the connection back, Try again draws Taxes in place, without a reload")
  /* Another section pressed while one is stuck is never held behind it. */
  await p.close()
}

/* ── EVERY SECTION IN A DEVELOPMENT BUILD: what React says ── */
if (!only || only === "dev") console.log("\nevery section, development React")
for (const physical of only && only !== "dev" ? [] : [false, true]) {
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
