/**
 * ===========================================================================
 *  THE SETTINGS SHEET ON A COMPUTER, MEASURED
 * ===========================================================================
 * The real Settings in the real sheet over a page shaped like the dashboard
 * (scripts/render-settings-sheet-desktop.tsx), at 1440x900, in Chromium.
 *
 *   OPEN          from the press to the first frame the sheet moves, and its
 *                 rise frame by frame: only ever up, transform only, done
 *                 by IN_MS plus a little
 *   A SECTION     pressed in the column while scrolled far down the longest
 *                 one: the scroll glides to the top over several frames,
 *                 only ever up, never in one jump, and no frame shows empty
 *                 space where the section should be
 *   THE COLUMN    the open row has depth (a shadow, not none) and a press
 *                 gives under the pointer (scale under 1 while held)
 *   CLOSE         down frame by frame, only ever down, and Back once only
 *                 when it is gone
 *   LONG TASKS    the browser's own long task count while it moves, reported
 *
 *   node scripts/check-settings-sheet-desktop.mjs       (CPU_SLOWDOWN=4 to throttle)
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

const dir = join(root, ".settings-desktop-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => window.__path
export const useSearchParams = () => new URLSearchParams(location.search)
const router = { push(h) { window.__nav.push.push(h) }, replace(h) { window.__nav.replace.push(h) }, prefetch() {}, refresh() {}, back() { window.__nav.back++ } }
export const useRouter = () => router
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
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-settings-sheet-desktop.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__nav={back:0,push:[],replace:[]};window.__path="/app"</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const free = { id: "free", name: "Free", price_cents: 0, billing_period: null, features: [] }
    const body = req.url.startsWith("/api/billing/overview") ? { plans: [free], subscription: null, currentPlan: free, invoices: [], paymentMethod: null }
      : req.url.startsWith("/api/billing/subscription") ? { currentPlan: free }
      : req.url.startsWith("/api/domains") ? { domains: [] }
      : req.url.startsWith("/api/notifications/preferences") ? { categories: [] } : {}
    setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 80)
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"], headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
/* The router's Back is the browser's: counted, and the sheet goes as the slot would. */
await page.evaluateOnNewDocument(() => {
  history.back = () => { window.__nav.back++; window.dispatchEvent(new PopStateEvent("popstate")); setTimeout(() => window.__closed?.(), 0) }
  window.__long = []
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: "longtask", buffered: true }) } catch { /* none */ }
  window.__frames = null
  window.__record = () => {
    window.__frames = []
    const tick = (t) => {
      if (!window.__frames) return
      const panel = document.querySelector("[data-settings-sheet]")
      const scroller = document.querySelector("[data-settings-sheet-scroll]")
      const section = document.querySelector("[data-settings-panel]")
      let ty = null
      if (panel) {
        const m = getComputedStyle(panel).transform
        ty = m === "none" ? 0 : Math.round(new DOMMatrix(m).m42 * 10) / 10
      }
      let shown = null
      if (scroller && section) {
        const a = scroller.getBoundingClientRect(), b = section.getBoundingClientRect()
        shown = Math.round(Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)))
      }
      window.__frames.push({ t, ty, scroll: scroller ? Math.round(scroller.scrollTop) : null, tab: section?.getAttribute("data-settings-panel") ?? null, shown, rail: [...document.querySelectorAll("[data-rail-on]")].map((n) => n.getAttribute("data-rail-row")).join(",") })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  window.__stop = () => { const f = window.__frames; window.__frames = null; return f }
})
await page.goto(`${base}/app`)
await page.waitForFunction(() => typeof window.__open === "function")
const slow = Number(process.env.CPU_SLOWDOWN || 1)
if (slow > 1) { const cdp = await page.createCDPSession(); await cdp.send("Emulation.setCPUThrottlingRate", { rate: slow }) }

let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const longIn = async (t0, t1) => (await page.evaluate(() => window.__long)).filter(([s, d]) => s + d >= t0 && s <= t1)

/* ── OPEN ── */
console.log("\nopen")
const t0 = await page.evaluate(() => { window.__record(); const t = performance.now(); window.__open(); return t })
await wait(900)
let frames = await page.evaluate(() => window.__stop())
const moving = frames.filter((f) => f.ty !== null)
const firstMove = moving.find((f) => f.ty > 0 && f.ty < 900)
const settled = moving.find((f) => f.ty === 0)
const ups = moving.slice(moving.indexOf(firstMove)).map((f) => f.ty)
const onlyUp = ups.every((y, i) => i === 0 || y <= ups[i - 1] + 0.5)
const openLong = await longIn(t0, t0 + 600)
console.log(`    first frame moving ${firstMove ? Math.round(firstMove.t - t0) : "never"}ms after the press, at rest at ${settled ? Math.round(settled.t - t0) : "never"}ms, ${ups.length} frames; long tasks ${JSON.stringify(openLong)}`)
say(!!firstMove, "the sheet rises over frames, not in one step")
say(onlyUp, "only ever up on the way in")
say(!!settled && settled.t - t0 < 900, "at rest with no transform inside 900ms")
say(frames.every((f) => f.rail === "Dashboard"), `the rail keeps Dashboard lit, and only it, the whole time (${[...new Set(frames.map((f) => f.rail))].join(" | ")})`)

/* ── A SECTION, SCROLLED FAR DOWN ── */
console.log("\na section pressed while scrolled down")
await wait(600)
const far = await page.evaluate(() => { const s = document.querySelector("[data-settings-sheet-scroll]"); s.scrollTop = s.scrollHeight; return s.scrollTop })
await wait(200)
for (const tab of ["security", "domains", "notifications"]) {
  /* From the bottom of the longest section each time. */
  await page.evaluate(() => document.querySelector('[data-settings-side-tab="general"]').click())
  await wait(700)
  await page.evaluate(() => { const s = document.querySelector("[data-settings-sheet-scroll]"); s.scrollTop = s.scrollHeight })
  await wait(150)
  const from = await page.evaluate(() => document.querySelector("[data-settings-sheet-scroll]").scrollTop)
  const tp = await page.evaluate((tab) => { window.__record(); const t = performance.now(); document.querySelector(`[data-settings-side-tab="${tab}"]`).click(); return t }, tab)
  await wait(800)
  frames = (await page.evaluate(() => window.__stop())).filter((f) => f.t >= tp)
  const tops = frames.map((f) => f.scroll)
  const end = frames.findIndex((f) => f.scroll === 0)
  const glideFrames = end < 0 ? frames.length : end + 1
  const up = tops.every((y, i) => i === 0 || y <= tops[i - 1])
  /* Each frame's step, as a share of the way. The frame the new section swaps in may carry on from where it is all in view. */
  const steps = tops.slice(1).map((y, i) => tops[i] - y)
  const swap = frames.findIndex((f) => f.tab === tab)
  const biggest = Math.max(0, ...steps.filter((_, i) => i + 1 !== swap))
  const blank = frames.filter((f, i) => i <= end && f.shown !== null && f.shown < 40).length
  const ms = end >= 0 ? Math.round(frames[end].t - tp) : null
  const long = await longIn(tp, tp + 700)
  if (process.env.STEPS) console.log("      " + frames.slice(0, glideFrames).map((f) => `${Math.round(f.t - tp)}:${f.scroll}${f.tab === tab ? "*" : ""}`).join(" "))
  console.log(`    ${tab}: from ${from}px, at the top in ${ms}ms over ${glideFrames} frames, biggest step ${biggest}px, swapped on frame ${swap}, blank frames ${blank}; long tasks ${JSON.stringify(long)}`)
  say(end > 0 && glideFrames >= 8, `${tab}: glides to the top over several frames`)
  say(up, `${tab}: only ever up`)
  say(biggest < Math.max(400, from * 0.45), `${tab}: no single jump`)
  say(blank === 0, `${tab}: never a frame of empty space where the section is`)
}
say(far > 1000, `the longest section scrolls far enough to measure (${far}px)`)

/* ── THE COLUMN ── */
console.log("\nthe column")
const depth = await page.evaluate(() => getComputedStyle(document.querySelector("[data-settings-side-on]")).boxShadow)
say(/rgba\(16, 18, 27, 0\.0[5-9]\) 0px 1px 2px/.test(depth), `the open row has depth (${depth.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px, /g, "")})`)
const box = await page.evaluate(() => { const r = document.querySelector('[data-settings-side-tab="privacy"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
await page.mouse.move(box.x, box.y)
await page.mouse.down()
await wait(160)
const pressed = await page.evaluate(() => getComputedStyle(document.querySelector('[data-settings-side-tab="privacy"]')).scale)
await page.mouse.up()
const scale = pressed === "none" ? 1 : Number(pressed)
say(scale < 1 && scale >= 0.97, `a press gives under the pointer (scale ${scale.toFixed(3)})`)
await wait(400)

/* ── CLOSE ── */
console.log("\nclose")
const tc = await page.evaluate(() => { window.__record(); const t = performance.now(); document.querySelector("[data-settings-sheet-close]").click(); return t })
await wait(700)
frames = (await page.evaluate(() => window.__stop())).filter((f) => f.t >= tc)
const downs = frames.filter((f) => f.ty !== null).map((f) => f.ty)
const onlyDown = downs.every((y, i) => i === 0 || y >= downs[i - 1] - 0.5)
const gone = frames.findIndex((f) => f.ty === null)
const nav = await page.evaluate(() => window.__nav)
const closeLong = await longIn(tc, tc + 600)
console.log(`    ${downs.length} frames moving, gone at ${gone >= 0 ? Math.round(frames[gone].t - tc) : "never"}ms, Back ${nav.back}; long tasks ${JSON.stringify(closeLong)}`)
say(downs.length >= 8, "goes down over frames")
say(onlyDown, "only ever down")
say(nav.back === 1 && nav.push.length === 0, "Back once, never a push")
say(frames.every((f) => f.rail === "Dashboard"), `the rail keeps Dashboard lit as it closes and after (${[...new Set(frames.map((f) => f.rail))].join(" | ")})`)

say(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
server.close()
console.log(bad ? `\n${bad} failed\n` : "\nall good\n")
process.exit(bad ? 1 : 0)
