/**
 * ===========================================================================
 *  SETTINGS: NOTHING MOVES AS YOU LAND ON IT
 * ===========================================================================
 * "When landing on the settings page, the content drifts/bumps toward the
 * right." The real Settings page in a shell shaped like /app, landing by the
 * stage's own playEntrance (scripts/render-settings-landing.tsx), at 390 and
 * 1280, with real scrollbars, recorded on every animation frame from the
 * first one that shows it, for a second and a half:
 *
 *   THE TITLE, THE TAB BAR'S FIRST TAB AND THE FIRST CARD, where they are.
 *   From the first frame each shows it must not move sideways at all, and
 *   down by no more than the stage's own 2px rise, which every page has.
 *   WHAT SCROLLS SIDEWAYS: the tab bar, the page's two overflow-x-hidden
 *   wrappers and the scroller, whose scrollLeft must stay 0 (a hidden
 *   overflow can still be scrolled by script, and moves everything in it).
 *   LAYOUT SHIFT, the browser's own count, which must stay 0.
 *
 *   node scripts/check-settings-landing.mjs
 *   SETTINGS_SHOTS=<dir> node scripts/check-settings-landing.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".settings-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-settings-landing.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root, process.env.SETTINGS_CSS || null)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

/* Every API answers quickly with an empty success, the way a fast network would. */
const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const free = { id: "free", name: "Free", price_cents: 0, billing_period: null, features: [] }
    const body = req.url.startsWith("/api/billing/overview")
      ? { plans: [free, { id: "growth", name: "Growth", price_cents: 2990, billing_period: "month", features: [] }, { id: "pro", name: "Pro", price_cents: 9900, billing_period: "month", features: [] }], subscription: null, currentPlan: free, invoices: [], paymentMethod: null }
      : req.url.startsWith("/api/domains") ? { domains: [] } : {}
    setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 120)
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/* Real scrollbars: puppeteer hides them by default, and then every width here is the same whether a bar came or not. */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], ignoreDefaultArgs: ["--hide-scrollbars"], headless: true })
/* Every /app page lands with the stage's 2px rise (lib/ui/app-navigation NAV_ENTER_RISE_PX); that is the one movement allowed, and only downward. */
const RISE = Number(/export const NAV_ENTER_RISE_PX = (\d+)/.exec(readFileSync(join(root, "lib/ui/app-navigation.ts"), "utf8"))?.[1] ?? 0)
const problems = []
const report = {}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 800, deviceScaleFactor: 1 }],
]) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.evaluateOnNewDocument(() => {
    window.__rec = []
    window.__shift = 0
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shift += e.value }).observe({ type: "layout-shift", buffered: true })
    } catch {}
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10] }
    const tick = (t) => {
      const h1 = document.querySelector("h1")
      const bar = document.querySelector("[data-settings-tabs]")
      const panel = document.querySelector("[data-settings-panel]")
      const card = panel?.firstElementChild?.firstElementChild ?? panel?.firstElementChild
      const s = document.querySelector(".app-content-scroll")
      const sideways = []
      for (let el = card; el && el !== document.documentElement; el = el.parentElement) if (el.scrollLeft) sideways.push([el.className.slice(0, 30), el.scrollLeft])
      window.__rec.push({ t, h1: box(h1), tab: box(bar?.querySelector("button")), card: box(card), barScroll: bar ? bar.scrollLeft : null, sideways, gutter: s ? s.offsetWidth - s.clientWidth : null, wrapperBar: s?.firstElementChild ? Math.max(...Array.from(s.querySelectorAll(":scope > *, :scope > * > *")).map((el) => el.offsetWidth - el.clientWidth)) : null })
      if (t < 1800) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.goto(`${base}/app/settings`)
  await page.waitForSelector("[data-settings-panel]")
  await wait(1900)
  const rec = await page.evaluate(() => window.__rec)
  const shift = await page.evaluate(() => window.__shift)
  if (process.env.SETTINGS_SHOTS) await page.screenshot({ path: join(process.env.SETTINGS_SHOTS, `settings-landing-${label}.png`) })
  await page.close()
  const moved = (key) => {
    const seen = rec.filter((r) => r[key])
    if (!seen.length) return null
    const end = seen[seen.length - 1][key]
    return { x: Math.max(...seen.map((r) => Math.abs(r[key][0] - end[0]))), y: Math.max(...seen.map((r) => Math.abs(r[key][1] - end[1]))), end }
  }
  const gutters = [...new Set(rec.map((r) => r.gutter).filter((g) => g != null))]
  const out = { frames: rec.length, h1: moved("h1"), tab: moved("tab"), card: moved("card"), barScroll: [...new Set(rec.map((r) => r.barScroll))], sideways: rec.filter((r) => r.sideways.length).slice(0, 2), gutter: gutters, wrapperBars: [...new Set(rec.map((r) => r.wrapperBar).filter((g) => g != null))], shift: Math.round(shift * 10000) / 10000, errors: errors.slice(0, 3) }
  report[label] = out
  for (const k of ["h1", "tab", "card"]) {
    if (!out[k]) problems.push(`at ${label}: no ${k} was drawn`)
    else if (out[k].x > 0.5 || out[k].y > RISE + 0.5) problems.push(`at ${label}: the ${k} moved ${out[k].x}px sideways and ${out[k].y}px down after it showed`)
  }
  if (out.barScroll.some((x) => x)) problems.push(`at ${label}: the tab bar scrolled sideways on its own (${out.barScroll.join(", ")})`)
  if (out.sideways.length) problems.push(`at ${label}: something the page sits in was scrolled sideways ${JSON.stringify(out.sideways)}`)
  if (out.gutter.length > 1) problems.push(`at ${label}: a scrollbar came or went (${out.gutter.join(", ")})`)
  if (out.wrapperBars.some((w) => w > 0)) problems.push(`at ${label}: a box inside the scroller drew a scrollbar of its own (${out.wrapperBars.join(", ")}px)`)
  if (out.shift > 0) problems.push(`at ${label}: layout shift ${out.shift}`)
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 1))
if (problems.length) fail(problems.join("\n"))
console.log("ok: landing on Settings, the title, the tabs and the first card hold still from their first frame, at 390 and 1280")
