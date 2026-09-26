/**
 * ===========================================================================
 *  THE FOUR /app SHEETS, ON A PHONE'S CPU, EVERY FRAME AND EVERY TAP TIMED
 * ===========================================================================
 * "The share your story sheet creates a lot of lag. When I tap the pill it's
 * clunky." And the account sheet, the notifications sheet and the date range
 * sheet, which should all be as smooth as the website builder's.
 *
 * scripts/render-app-sheets-frames.tsx mounts the real home page (its pill,
 * its share sheet, its date picker), the real account sheet and the real
 * notifications sheet at 390px. With the CPU slowed to a quarter
 * (Emulation.setCPUThrottlingRate 4, about a mid range phone) each thing a
 * person does to them is done with real touch events, and for each one the
 * probe reads:
 *
 *   TAP       the slowest interaction the browser timed for it (Event Timing:
 *             from the finger to the next paint, which is what "instant"
 *             means), in ms
 *   BUSY      main thread time in the first 120ms after it
 *   FRAMES    the longest gap between two frames while it moved, and how
 *             many gaps were over 20ms (a dropped frame at 60Hz)
 *   LONG      main thread tasks over 50ms, summed
 *   HOME      how many times the home page drew again because of it
 *
 * It fails when a sheet that is already built restyles more than half the
 * page on an open, a close, a drag or a change of view, or lays out new
 * boxes when it opens (it was not built ahead). Times are printed, and with
 * STRICT=1 judged: no tap over TAP_BUDGET_MS to paint, no long task while a
 * sheet moves.
 *
 *   node scripts/check-app-sheets-frames.mjs
 *   RUNS=3 JSON=1 node scripts/check-app-sheets-frames.mjs   (median of three, as JSON)
 *   git worktree add ../base <commit>
 *   RUNS=3 COMPARE=../base node scripts/check-app-sheets-frames.mjs   (that commit and this one, in turns)
 *   TRACE='<pattern>' node scripts/check-app-sheets-frames.mjs   (where the main thread's time went)
 *   DROP_RULES='<regex>' node scripts/check-app-sheets-frames.mjs   (what the style rules whose selector matches cost)
 *   NATIVE=1 node scripts/check-app-sheets-frames.mjs   (as the Android app draws it: <html class="capacitor"> from the first paint,
 *                                                        which the root layout's head script sets, so every html.capacitor rule applies)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const RUNS = Number(process.env.RUNS ?? 1)
const THROTTLE = Number(process.env.THROTTLE ?? 4)
/* What a tap may take to paint on a 4x slowed CPU. Chrome calls 200ms "good"
   for a whole page on a real phone; a sheet's own tap should be far inside it. */
const TAP_BUDGET_MS = Number(process.env.TAP_BUDGET_MS ?? 120)
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const out = mkdtempSync(join(tmpdir(), "storelib-app-sheets-"))
writeFileSync(join(out, "navigation.js"), `export const usePathname = () => "/app"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) {
  return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { e.preventDefault(); rest.onClick && rest.onClick(e) } }, children)
})
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(out, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, width, height, ...rest })
}
`)
writeFileSync(join(out, "dynamic.jsx"), `import React from "react"
export default function dynamic(load, opts) {
  return function Dynamic(props) { return opts && opts.loading ? React.createElement(opts.loading, {}) : null }
}
`)
/* A Supabase client that answers every chain with no rows. */
writeFileSync(join(out, "supabase.js"), `function chain() {
  const done = { data: [], error: null, count: 0 }
  const p = new Proxy(function () {}, {
    get(_, k) {
      if (k === "then") return (res) => Promise.resolve(done).then(res)
      return () => p
    },
    apply() { return p },
  })
  return p
}
export function createClient() {
  const channel = { on() { return channel }, subscribe() { return channel } }
  return {
    channel: () => channel,
    removeChannel() {},
    from: () => chain(),
    rpc: () => chain(),
    auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  }
}
`)
/**
 * The page, built from a checkout's own components and stylesheet. COMPARE
 * names a second checkout (an older commit in a worktree, say) whose page is
 * built the same way from this checkout's fixture, and the two are run in
 * turns, so a machine that is busier for one minute than the next slows both
 * alike and what is compared is the code.
 */
async function build(from, name) {
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-app-sheets-frames.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, `${name}.js`)}`,
  '--define:process.env.NODE_ENV="production"', "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
  "--define:process.env.NEXT_PUBLIC_SUPABASE_URL=undefined", "--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=undefined",
  `--alias:next/navigation=${join(out, "navigation.js")}`, `--alias:next/link=${join(out, "link.jsx")}`,
  `--alias:next/image=${join(out, "image.jsx")}`, `--alias:next/dynamic=${join(out, "dynamic.jsx")}`,
  `--alias:@/lib/supabase/client=${join(out, "supabase.js")}`,
  "--loader:.jsx=jsx", `--alias:@=${from}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
const file = join(out, `${name}.html`)
writeFileSync(file, `<!doctype html><html${process.env.NATIVE ? ' class="capacitor"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(from)}</style><style>body{margin:0;background:#f8f9fa}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__err=[];addEventListener("error",e=>__err.push(String(e.message)))</script>` +
  `<script>${readFileSync(join(out, `${name}.js`), "utf8")}</script></body></html>`)
if (process.env.KEEP) console.log(`page (${name}): ${file}`)
return file
}
const pages = { now: await build(root, "now") }
if (process.env.COMPARE) pages.before = await build(process.env.COMPARE, "before")

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function session(file) {
  const page = await browser.newPage()
  await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
  /* Every run starts as a first visit: no remembered period, no remembered filter. */
  await page.evaluateOnNewDocument(() => { try { localStorage.clear() } catch {} })
  /* DROP_RULES=<regex>: the style rules whose selector matches are taken out
     before the page draws, to measure what a rule costs the sheets. */
  if (process.env.DROP_RULES) {
    await page.evaluateOnNewDocument((src) => {
      const re = new RegExp(src)
      document.addEventListener("DOMContentLoaded", () => {
        const walk = (l) => { for (let i = l.length - 1; i >= 0; i--) { const r = l[i]; if (r.selectorText && re.test(r.selectorText)) (r.parentRule || r.parentStyleSheet).deleteRule(i); else if (r.cssRules) walk(r.cssRules) } }
        for (const sh of document.styleSheets) walk(sh.cssRules)
      })
    }, process.env.DROP_RULES)
  }
  await page.goto("file://" + file)
  await page.waitForSelector("[data-share-pill]", { timeout: 20000 }).catch(async () => {
    fail("The home page never drew its pill: " + JSON.stringify(await page.evaluate(() => ({ err: window.__err, body: document.body.innerHTML.slice(0, 400) }))))
  })
  /* The home page's quiet first reads, the notifications list read a moment
     after load, and the sheets that are built while the page is idle. */
  await wait(4500)
  await page.evaluate(() => {
    window.__frames = []
    window.__long = []
    window.__events = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }) }).observe({ type: "longtask" })
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__events.push({ t: e.startTime, d: e.duration, name: e.name, id: e.interactionId || 0 })
    }).observe({ type: "event", durationThreshold: 16, buffered: false })
    const tick = (t) => { window.__frames.push(t); requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  const cdp = await page.createCDPSession()
  await cdp.send("Performance.enable")
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  return { page, cdp }
}

const metrics = async (cdp) => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]))

/**
 * One thing a person does, and what it cost. `settle` is how long to watch:
 * the sheet's open is 440ms, its close 340ms, a view change 260ms.
 */
async function measure({ page, cdp }, action, settle = 700) {
  const r0 = await page.evaluate(() => window.__renders.home)
  const t0 = await page.evaluate(() => performance.now())
  const m0 = await metrics(cdp)
  await action()
  await wait(120)
  const m1 = await metrics(cdp)
  await wait(Math.max(0, settle - 120))
  const t1 = await page.evaluate(() => performance.now())
  const got = await page.evaluate((a, b) => ({
    frames: window.__frames.filter((t) => t >= a && t < b),
    long: window.__long.filter((l) => l.t >= a && l.t < b),
    events: window.__events.filter((e) => e.t >= a - 5 && e.t < b),
    home: window.__renders.home,
  }), t0, t1)
  const gaps = got.frames.slice(1).map((t, k) => t - got.frames[k])
  return {
    tapMs: got.events.length ? Math.round(Math.max(...got.events.map((e) => e.d))) : 0,
    busyMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000),
    scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000),
    styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000),
    layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000),
    maxGapMs: gaps.length ? Math.round(Math.max(...gaps) * 10) / 10 : 0,
    dropped: gaps.filter((g) => g > 20.5).length,
    longMs: Math.round(got.long.reduce((s, l) => s + l.d, 0)),
    home: got.home - r0,
  }
}

/* The first match that is on screen: the home page draws a pill and a period for each width. */
const center = (page, sel) => page.evaluate((sel) => {
  const el = Array.from(document.querySelectorAll(sel)).find((e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}, sel)
async function tap(s, sel) {
  const at = await center(s.page, sel)
  if (!at) throw new Error(`nothing to tap at ${sel}`)
  await s.page.touchscreen.tap(at.x, at.y)
}
/** Tap the first element under `scope` whose text is `text`. */
async function tapText(s, scope, text) {
  const at = await s.page.evaluate((scope, text) => {
    const els = Array.from(document.querySelectorAll(`${scope} button, ${scope} [role=tab], ${scope} a`))
    const el = els.find((e) => ((e.textContent || "").trim() === text || e.getAttribute("aria-label") === text) && e.getClientRects().length > 0 && !e.closest("[aria-hidden='true']"))
    if (!el) return null
    el.scrollIntoView({ block: "nearest", inline: "nearest" })
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, scope, text)
  if (!at) throw new Error(`no "${text}" in ${scope}`)
  await s.page.touchscreen.tap(at.x, at.y)
}
/** A thumb on the handle, down 120px and back up to rest: a drag that does not close. */
async function drag(s) {
  const box = await s.page.evaluate(() => {
    const r = document.querySelector("[data-app-sheet='open'] [data-sheet-panel]").getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + 12 }
  })
  const cdpTouch = (type, y) => s.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: box.x, y }] })
  await cdpTouch("touchStart", box.y)
  for (let i = 1; i <= 24; i++) { await cdpTouch("touchMove", box.y + i * 3); await wait(16) }
  for (let i = 23; i >= 0; i--) { await cdpTouch("touchMove", box.y + i * 3); await wait(16) }
  await cdpTouch("touchEnd", box.y)
}
const tapScrim = (s) => s.page.touchscreen.tap(195, 90)
const sheetOpen = (s) => s.page.evaluate(() => !!document.querySelector("[data-app-sheet='open']"))

async function run(file) {
  const s = await session(file)
  const R = {}
  const rec = async (name, fn, settle) => {
    /*
      Every interaction is traced, for two numbers a busy machine cannot
      move: how many elements the browser restyled and how many boxes it
      laid out. Times on a shared machine swing by half from one minute to
      the next; these do not, and style and layout are most of what a tap
      costs here.
      TRACE=<pattern> adds where the longest task's time went.
    */
    const detail = process.env.TRACE && new RegExp(process.env.TRACE).test(name)
    await s.page.tracing.start({ path: join(out, "trace.json"), categories: detail ? ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.invalidationTracking", "blink", "v8.execute"] : ["devtools.timeline"] })
    R[name] = await measure(s, fn, settle)
    await s.page.tracing.stop()
    const events = JSON.parse(readFileSync(join(out, "trace.json"), "utf8")).traceEvents
    R[name].styleEls = events.filter((e) => e.name === "UpdateLayoutTree" && e.ph === "X").reduce((t, e) => t + (e.args?.elementCount ?? 0), 0)
    R[name].layoutObjs = events.filter((e) => e.name === "Layout" && e.ph === "X").reduce((t, e) => t + (e.args?.beginData?.dirtyObjects ?? 0), 0)
    if (detail) {
      const timed = events.filter((e) => e.ph === "X" && e.dur)
      const main = timed.filter((e) => e.name === "RunTask").sort((a, b) => b.dur - a.dur)[0]
      const by = {}
      if (main) {
        for (const e of timed) {
          if (e.tid !== main.tid || e.ts < main.ts || e.ts + e.dur > main.ts + main.dur) continue
          by[e.name] = (by[e.name] || 0) + e.dur / 1000
        }
      }
      const styles = timed.filter((e) => e.name === "UpdateLayoutTree" && e.tid === (main && main.tid) && e.ts >= main.ts && e.ts <= main.ts + main.dur)
      console.log(`TRACE ${name}: style recalcs ${styles.map((e) => `${Math.round(e.dur / 100) / 10}ms/${e.args?.elementCount ?? "?"} el`).join(", ")}; document has ${await s.page.evaluate(() => document.getElementsByTagName("*").length)} elements`)
      const why = {}
      for (const e of events) {
        if (!/InvalidationTracking/.test(e.name)) continue
        const d = e.args?.data || {}
        const k = `${d.reason || e.name} ${d.changedAttribute || d.changedPseudo || d.changedClass || ""} @ ${(d.nodeName || "").slice(0, 60)}`
        why[k] = (why[k] || 0) + 1
      }
      console.log(`TRACE ${name}: recalc sizes ${JSON.stringify(events.filter((e) => e.name === "UpdateLayoutTree" && e.ph === "X").map((e) => e.args?.elementCount).filter((n) => n > 20))}`)
      console.log(`TRACE ${name}: why\n    ` + Object.entries(why).filter(([k]) => !/^Animation/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${v} ${k}`).join("\n    "))
      console.log(`TRACE ${name}: longest task ${main ? Math.round(main.dur / 1000) : 0}ms`, JSON.stringify(Object.fromEntries(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, v]) => [k, Math.round(v * 10) / 10]))))
    }
  }

  /* ── Share your Storelib ── */
  await rec("share: open (tap the pill)", () => tap(s, "[data-share-pill]"), 800)
  if (!(await sheetOpen(s))) throw new Error("the share sheet did not open")
  await rec("share: drag", () => drag(s), 1400)
  /* Every address is a row with its own Copy and Open, and QR code and Share under them
     (components/app/share/share-storelib.tsx). A copy on each row turns its icon into a check.
     The QR code twice: the second time it is the view the sheet already keeps. */
  for (const label of ["OnePage", "Website", "Creator page"]) await rec(`share: copy the ${label}`, () => tapText(s, "[data-share-sheet]", `Copy the ${label} address`), 500)
  await rec("share: open the page", () => tapText(s, "[data-share-sheet]", "Open the Creator page"), 350)
  for (const again of ["", " again"]) {
    await rec(`share: QR code${again}`, () => tapText(s, "[data-share-sheet]", "QR code"), 700)
    await rec(`share: back from QR code${again}`, () => tap(s, "[data-app-sheet='open'] button[aria-label='Back']"), 550)
  }
  /* Long enough for "Copied" to turn back into "Copy" inside this window, not the next one's. */
  await rec("share: copy", () => tap(s, "[data-share-copy]"), 2300)
  await rec("share: close (tap the scrim)", () => tapScrim(s), 700)

  /* ── Account ── */
  await rec("account: open", () => tap(s, "#account-trigger"), 800)
  await rec("account: drag", () => drag(s), 1400)
  await rec("account: close", () => tapScrim(s), 700)

  /* ── Notifications ── */
  await rec("notifications: open", () => tap(s, "#bell"), 900)
  await rec("notifications: drag", () => drag(s), 1400)
  for (const label of ["Updates", "Messages", "Opportunities", "All"]) await rec(`notifications: tab ${label}`, () => tapText(s, "[data-app-sheet='open']", label), 450)
  await rec("notifications: unread only", () => tap(s, "[data-app-sheet='open'] [data-notifications-filter]"), 450)
  await rec("notifications: all again", () => tap(s, "[data-app-sheet='open'] [data-notifications-filter]"), 450)
  await rec("notifications: close", () => tapScrim(s), 700)

  /* ── Date range ── */
  const dateTrigger = "main .md\\:hidden button[aria-haspopup='dialog']:not([data-share-pill])"
  await rec("date: open", () => tap(s, dateTrigger), 800)
  await rec("date: drag", () => drag(s), 1400)
  await rec("date: custom range", () => tapText(s, "[data-app-sheet='open']", "Custom range"), 500)
  await rec("date: previous month", () => tap(s, "[data-app-sheet='open'] button[aria-label='Previous month']"), 400)
  await rec("date: next month", () => tap(s, "[data-app-sheet='open'] button[aria-label='Next month']"), 400)
  await rec("date: back to the list", () => tapText(s, "[data-app-sheet='open']", "Back"), 500)
  await rec("date: close", () => tapScrim(s), 700)
  await rec("date: open again", () => tap(s, dateTrigger), 800)
  await rec("date: pick Last 30 days", () => tap(s, "[data-app-sheet='open'] [data-row='last_30_days']"), 900)

  R.__elements = await s.page.evaluate(() => document.getElementsByTagName("*").length)
  const err = await s.page.evaluate(() => window.__err)
  await s.page.close()
  if (err.length) throw new Error("the page threw: " + err.slice(0, 3).join(" | "))
  return R
}

const runs = { now: [], before: [] }
for (let i = 0; i < RUNS; i++) {
  if (pages.before) runs.before.push(await run(pages.before))
  runs.now.push(await run(pages.now))
}
await browser.close()

/* The median of each number across runs. */
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const median = (list) => {
  const out = {}
  for (const k of Object.keys(list[0])) {
    if (typeof list[0][k] === "number") { out[k] = med(list.map((r) => r[k])); continue }
    out[k] = {}
    for (const f of Object.keys(list[0][k])) out[k][f] = med(list.map((r) => r[k][f]))
  }
  return out
}
const result = median(runs.now)
const before = pages.before ? median(runs.before) : null
const elements = result.__elements
delete result.__elements
if (before) delete before.__elements

if (before) {
  console.log(`\nBefore (${process.env.COMPARE}) and now, CPU ${THROTTLE}x slower, ${RUNS} run${RUNS === 1 ? "" : "s"} each in turns (median)\n`)
  console.log("  " + "what".padEnd(34) + "restyled     laid out     tap ms       busy ms      long ms      >20ms gaps   home")
  const pair = (a, b) => `${a}`.padStart(5) + " → " + `${b}`.padEnd(5)
  for (const k of Object.keys(result)) {
    const a = before[k], b = result[k]
    if (!a) continue
    console.log("  " + k.padEnd(34) + pair(a.styleEls, b.styleEls) + "  " + pair(a.layoutObjs, b.layoutObjs) + "  " + pair(a.tapMs, b.tapMs) + "  " + pair(a.busyMs, b.busyMs) + "  " + pair(a.longMs, b.longMs) + "  " + pair(a.dropped, b.dropped) + "  " + pair(a.home, b.home))
  }
  const sum = (r, f) => Object.values(r).reduce((t, v) => t + v[f], 0)
  console.log(`\n  all of it: restyled ${sum(before, "styleEls")} → ${sum(result, "styleEls")} elements, laid out ${sum(before, "layoutObjs")} → ${sum(result, "layoutObjs")} boxes, tap ${sum(before, "tapMs")} → ${sum(result, "tapMs")}ms, busy ${sum(before, "busyMs")} → ${sum(result, "busyMs")}ms, long tasks ${sum(before, "longMs")} → ${sum(result, "longMs")}ms, dropped ${sum(before, "dropped")} → ${sum(result, "dropped")}`)
  if (process.env.JSON) console.log(JSON.stringify({ before, now: result }))
}

if (process.env.JSON && !before) { console.log(JSON.stringify(result, null, 1)); process.exit(0) }

console.log(`\nThe /app phone sheets at 390px, CPU ${THROTTLE}x slower, ${RUNS} run${RUNS === 1 ? "" : "s"} (median)\n`)
console.log("  " + "what".padEnd(34) + "restyled  laid out  tap ms  busy ms (script style layout)  worst gap  >20ms  long ms  home")
for (const [k, v] of Object.entries(result)) {
  console.log("  " + k.padEnd(34) + String(v.styleEls).padStart(8) + String(v.layoutObjs).padStart(10) + String(v.tapMs).padStart(8) + String(v.busyMs).padStart(9) + `  (${v.scriptMs} ${v.styleMs} ${v.layoutMs})`.padEnd(22) + String(v.maxGapMs).padStart(9) + String(v.dropped).padStart(7) + String(v.longMs).padStart(9) + String(v.home).padStart(6))
}

let bad = 0
const expect = (ok, what) => { console.log(`${ok ? "  ok" : "FAIL"}  ${what}`); if (!ok) bad++ }
console.log("")
/*
  WHAT FAILS. Times on a shared machine swing too far to fail on, so they
  are printed, not judged (STRICT=1 judges them against TAP_BUDGET_MS). What
  is judged is what the browser had to do, which does not swing: a sheet
  that is already built opens, closes, drags and changes view without the
  browser restyling most of the page (a restyle of the whole document is
  what a :has() rule answers an element going in or out with) and without
  laying out the sheet from scratch. The first build of something (the QR
  code), a choice that redraws the page (a preset), and Copy (the clipboard's
  fallback puts a field in the page) are left out.
*/
const judged = Object.entries(result).filter(([k]) => !/QR code$|pick|copy/.test(k))
/* The home page has timers of its own (the announcement's cycle, the live
   count) whose redraws can land in any window, so two are allowed. Before
   the sheets were kept, 41 of these 42 restyled more than half the page. */
const heavy = judged.filter(([, v]) => v.styleEls > elements / 2)
console.log(heavy.length ? `  restyled more than half the page: ${heavy.map(([k, v]) => `${k} ${v.styleEls}`).join(", ")}` : "")
expect(heavy.length <= 2, `nothing restyles more than half the page (${Math.round(elements / 2)} of ${elements} elements), bar the page's own timers landing in a window: ${heavy.length} of ${judged.length}`)
const opens = judged.filter(([k]) => /: open( again| \(tap the pill\))?$/.test(k))
const builtOnTap = opens.filter(([, v]) => v.layoutObjs > 60)
expect(builtOnTap.length === 0, `an open lays out nothing new: the sheet was built ahead${builtOnTap.length ? ": " + builtOnTap.map(([k, v]) => `${k} ${v.layoutObjs} boxes`).join(", ") : ""}`)
if (process.env.STRICT) {
  for (const [k, v] of Object.entries(result)) if (v.tapMs > TAP_BUDGET_MS) expect(false, `${k}: the tap took ${v.tapMs}ms to paint (budget ${TAP_BUDGET_MS}ms)`)
  const moving = judged.filter(([k]) => /open|close|drag|tab |back|custom|month/.test(k))
  const withLong = moving.filter(([, v]) => v.longMs > 0)
  expect(withLong.length === 0, `no long task while a sheet opens, moves, closes or changes view${withLong.length ? ": " + withLong.map(([k, v]) => `${k} ${v.longMs}ms`).join(", ") : ""}`)
}
const homeDrew = Object.entries(result).filter(([k, v]) => !/pick/.test(k) && v.home > 0)
console.log(`  (the home page drew ${homeDrew.reduce((t, [, v]) => t + v.home, 0)} times during the sheets, its own announcement and live count included)`)
console.log("")
if (bad) fail(`${bad} check${bad === 1 ? "" : "s"} failed.`)
console.log("Every sheet opens, follows the thumb, changes view and closes without rebuilding itself or restyling the page.\n")
