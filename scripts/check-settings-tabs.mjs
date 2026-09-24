/**
 * ===========================================================================
 *  SETTINGS: WHAT MOVES WHEN YOU CHANGE TAB
 * ===========================================================================
 * "When switching between tabs and the new tab content appears, there is a
 * little bump in the content. No layout jumping, bumping, flashing, or
 * strange reflow."
 *
 * The real Settings page in a shell shaped like /app (scripts/render-settings-
 * tabs.tsx), at 390 and 1440. Every tab is visited in turn, once from the top
 * of the page and once from part way down the longest tab, and on every
 * animation frame after each press this reads:
 *
 *   THE TAB BAR      where it is on the screen. It must not move at all.
 *   THE CONTENT      where the new tab's first card is, from the first frame
 *                    it shows. Once it is there it must stay there: a rise,
 *                    a card arriving above it, a scrollbar coming or going
 *                    (which moves everything sideways), all show up here.
 *   ITS LEFT EDGE    the sideways half of the same thing
 *   LAYOUT SHIFT     the browser's own count, which must stay 0
 *   A BLANK FRAME    a frame with no panel at all
 *
 *   node scripts/check-settings-tabs.mjs
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
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-settings-tabs.tsx"),
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

const TABS = ["security", "payments", "billing", "domains", "privacy", "stores", "general"]
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const problems = []
const report = {}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
]) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${base}/app/settings`)
  await page.waitForSelector("[data-settings-panel]")
  await wait(700)
  await page.evaluate(() => {
    window.__rec = []
    window.__shift = 0
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shift += e.value }).observe({ type: "layout-shift" })
    const tick = (t) => {
      const bar = document.querySelector("[data-settings-tabs]")
      const panel = document.querySelector("[data-settings-panel]")
      const first = panel?.firstElementChild?.firstElementChild ?? panel?.firstElementChild
      const s = document.querySelector(".app-content-scroll")
      const fr = first?.getBoundingClientRect()
      window.__rec.push({
        t,
        tab: panel?.getAttribute("data-settings-panel") ?? null,
        bar: bar ? Math.round(bar.getBoundingClientRect().top * 10) / 10 : null,
        top: fr ? Math.round(fr.top * 10) / 10 : null,
        left: fr ? Math.round(fr.left * 10) / 10 : null,
        opacity: panel ? Number(getComputedStyle(panel).opacity) : null,
        scroll: s ? s.scrollTop : null,
        gutter: s ? s.offsetWidth - s.clientWidth : null,
      })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  async function press(tab) {
    const t0 = await page.evaluate(() => performance.now())
    const shift0 = await page.evaluate(() => window.__shift)
    await page.evaluate((tab) => {
      const order = ["general", "security", "payments", "billing", "domains", "privacy", "stores"]
      const b = document.querySelectorAll("[data-settings-tabs] button")[order.indexOf(tab)]
      if (!b) throw new Error("no tab button for " + tab + "; the page reads: " + document.body.innerText.slice(0, 300))
      b.click()
    }, tab)
    await wait(650)
    const rec = await page.evaluate((t0) => window.__rec.filter((r) => r.t >= t0), t0)
    const shift = (await page.evaluate(() => window.__shift)) - shift0
    const before = await page.evaluate((t0) => window.__rec.filter((r) => r.t < t0).slice(-1)[0], t0)
    if (!before) fail(`no frames were recorded before pressing ${tab}: ${errors.join(" | ") || "no errors"} ${JSON.stringify(await page.evaluate(() => [window.__rec.length, document.body.innerText.slice(0, 200)]))}`)
    const mine = rec.filter((r) => r.tab === tab)
    const settled = mine[mine.length - 1]
    const barMoved = Math.max(0, ...rec.filter((r) => r.bar != null).map((r) => Math.abs(r.bar - before.bar)))
    /* From the first frame the new tab shows, how far its first card travels. */
    const contentMoved = mine.length ? Math.max(...mine.map((r) => Math.abs(r.top - settled.top))) : null
    const leftMoved = mine.length ? Math.max(...mine.map((r) => Math.abs(r.left - settled.left))) : null
    const blank = rec.filter((r) => r.tab === null || (r.opacity != null && r.opacity < 0.35)).length
    const gutterChanged = settled && before ? settled.gutter !== before.gutter : false
    return { tab, barMoved, contentMoved, leftMoved, blank, shift: Math.round(shift * 10000) / 10000, gutterChanged, scroll: [before.scroll, settled?.scroll] }
  }

  await wait(300)
  const fromTop = []
  for (const tab of TABS) fromTop.push(await press(tab))
  /* Part way down the longest tab, then a short one. */
  const tallest = await page.evaluate(() => { const s = document.querySelector(".app-content-scroll"); s.scrollTop = Math.min(420, s.scrollHeight - s.clientHeight); return s.scrollTop })
  await wait(200)
  const fromScrolled = []
  for (const tab of ["security", "general", "privacy", "general"]) fromScrolled.push(await press(tab))
  if (process.env.SETTINGS_SHOTS) await page.screenshot({ path: join(process.env.SETTINGS_SHOTS, `settings-${label}.png`) })
  await page.close()

  report[label] = { fromTop, scrolledTo: tallest, fromScrolled, errors: errors.slice(0, 3) }
  for (const r of [...fromTop, ...fromScrolled]) {
    const at = `at ${label}, to ${r.tab}:`
    if (r.barMoved > 0.5) problems.push(`${at} the tab bar moved ${r.barMoved}px`)
    if (r.contentMoved == null) problems.push(`${at} the tab never showed`)
    else if (r.contentMoved > 0.5) problems.push(`${at} the content moved ${r.contentMoved}px after it appeared`)
    if (r.leftMoved > 0.5) problems.push(`${at} the content moved ${r.leftMoved}px sideways`)
    if (r.gutterChanged) problems.push(`${at} a scrollbar came or went`)
    if (r.blank) problems.push(`${at} ${r.blank} blank frames`)
    if (r.shift > 0) problems.push(`${at} layout shift ${r.shift}`)
  }
}

await browser.close()
server.close()
console.log(JSON.stringify(report))
if (problems.length) fail(problems.join("\n"))
console.log("ok: the tab bar and the new tab's content hold still through every switch, at 390 and 1440")
