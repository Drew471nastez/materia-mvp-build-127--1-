/**
 * ===========================================================================
 *  THE PRODUCTS PAGE'S TWO PHONE SHEETS, EVERY FRAME READ, ON A SLOW PHONE
 * ===========================================================================
 * "The bottom sheets must be absolutely optimized for fast loading, 200 fps
 * smooth, not laggy at all, like the others." The phone's toolbar has two
 * (app/(storelib)/app/products/pick-sheet.tsx): the view's name ("All") opens the views
 * alone, and Sort opens the orders alone. This opens and closes each one
 * again and again on the real page (scripts/render-products-probe.tsx, fifty
 * products, the list and the table both drawn), with the CPU slowed four
 * times, and reads on every animation frame where the sheet really is (its
 * computed transform, the running animation included). It asserts:
 *
 *   THE FIRST FRAME     the frame after the tap already holds the sheet,
 *                       below the screen, with its rows in it: nothing is
 *                       waited for before it moves
 *   ONE MOTION          it only rises while opening and only falls while
 *                       closing, reaches its rest, and takes more than five
 *                       frames to leave
 *   NO LONG TASK        no main thread task over 50ms from the tap to rest,
 *                       nor from the pick to the sheet gone
 *   THE LIST IS STILL   React's own commit hook (the one its devtools use)
 *                       says the page (ProductsClient, and so its fifty rows)
 *                       did not render to open the sheet, nor while it moved,
 *                       nor while it left: the pick reaches the page only
 *                       once the sheet is out of the document
 *   THE PICK APPLIES    after it has gone, the list is the view or the order
 *                       picked
 *
 * And prints, per sheet, the frames it took, the worst gap between two
 * frames, the longest task, and how long the tap took to answer (the Event
 * Timing API's duration for the click: from the finger to the frame that
 * showed its effect).
 *
 *   node scripts/check-products-sheets.mjs
 *   CYCLES=10 CPU=4 SHOTS_DIR=<dir> node scripts/check-products-sheets.mjs
 *   BEFORE=<file> node scripts/check-products-sheets.mjs   (the same page from another products-client, to compare)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const CYCLES = Number(process.env.CYCLES ?? 8)
const CPU = Number(process.env.CPU ?? 4)
/*
  THE TAP'S OWN TASK, before the first frame (and the pick's, before the
  sheet starts down): about 13ms at full speed. At 4x it measured 52 to 79ms
  on a shared machine, most of it style work the app's html:has() rules cause
  on every open and close: the browser keeps one :has() invalidation set for
  the whole stylesheet, and the website header's fade rule
  ([&:has(a:hover)_a], sections/renderers/HeaderSection.tsx) puts `a` in it,
  so every link on the page near the screen is restyled. The budget is a
  ceiling that catches a regression, not the goal; the motion itself has none.
*/
const OPEN_BUDGET = Number(process.env.OPEN_BUDGET ?? (CPU >= 4 ? 100 : 25))
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const stubs = join(root, ".products-sheets-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-products-sheets-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/*
  React's commit hook, installed before the page loads. For each commit: when,
  and whether ProductsClient itself rendered in it (the PerformedWork flag on
  its fiber, which is how the devtools decide "did this render").
*/
const HOOK = `
window.__commits = []
window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  isDisabled: false, supportsFiber: true, renderers: new Map(),
  inject: function (r) { this.renderers.set(1, r); return 1 },
  onScheduleFiberRoot: function () {}, onCommitFiberUnmount: function () {}, onPostCommitFiberRoot: function () {}, checkDCE: function () {},
  onCommitFiberRoot: function (id, root) {
    var queue = [root.current], page = null, seen = 0
    while (queue.length && !page && seen < 600) {
      var f = queue.shift(); seen++
      if (f && f.type && f.type.name === "ProductsClient") { page = f; break }
      for (var c = f && f.child; c; c = c.sibling) queue.push(c)
    }
    window.__commits.push({ t: performance.now(), page: !!page && (page.flags & 1) === 1, sheet: !!document.querySelector("[data-app-sheet]:not([data-sheet-ghost])") })
  },
}
`

try {
  /* BEFORE_CSS=<file>: another copy of app/globals.css (an older commit's), compiled over these sources, to compare. */
  const css = await appCss(root, process.env.BEFORE_CSS || null)
  const inter = interFaces(root)
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/products"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  /* The harness, pointed at another products-client when comparing. */
  let entry = "scripts/render-products-probe.tsx"
  if (process.env.BEFORE) {
    const src = readFileSync(join(root, entry), "utf8").replace('from "@/app/(storelib)/app/products/products-client"', `from "@/${relative(root, process.env.BEFORE).replace(/\.tsx$/, "")}"`)
    entry = relative(root, join(stubs, "harness-before.tsx"))
    writeFileSync(join(root, entry), src)
  }
  execFileSync("pnpm", [
    "exec", "esbuild", entry, "--bundle", "--format=iife", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"', "--alias:@=.", "--alias:react=./node_modules/react", "--alias:react-dom=./node_modules/react-dom",
    "--banner:js=var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};",
    `--alias:next/navigation=./${relative(root, join(stubs, "navigation.js"))}`, `--alias:next/link=./${relative(root, join(stubs, "link.jsx"))}`, `--alias:next/image=./${relative(root, join(stubs, "image.jsx"))}`,
    `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
  ], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

  /* BUILD_ONLY=1 KEEP=1: the page alone, in .products-sheets-probe/index.html, for a trace by hand. */
  if (process.env.BUILD_ONLY) process.exit(0)
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
  const open = async (width) => {
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.evaluateOnNewDocument(HOOK)
    await p.evaluateOnNewDocument(() => {
      window.__long = []
      window.__events = []
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }) }).observe({ type: "longtask" }) } catch { /* none */ }
      try {
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "click" || e.name === "pointerup" || e.name === "touchend") window.__events.push({ name: e.name, t: e.startTime, d: e.duration, run: e.processingEnd - e.processingStart, delay: e.processingStart - e.startTime }) }).observe({ type: "event", durationThreshold: 16, buffered: true })
      } catch { /* no Event Timing */ }
    })
    await p.emulate({ viewport: { width, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
    await p.goto(`file://${join(stubs, "index.html")}#many`)
    await p.evaluate(() => document.fonts.ready)
    await p.waitForSelector("[data-toolbar]")
    await wait(1200)
    if (errors.length) fail(`The page threw: ${errors[0]}`)
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
    /* Every frame: where the sheet is, whether it is there, and its rows. */
    await p.evaluate(() => {
      window.__rec = []
      window.__clicks = []
      window.addEventListener("click", () => window.__clicks.push(performance.now()), true)
      const tick = (t) => {
        const el = document.querySelector("[data-app-sheet]:not([data-sheet-ghost]) [data-sheet-panel]")
        window.__rec.push(el ? { t, y: new DOMMatrixReadOnly(getComputedStyle(el).transform).m42, h: el.offsetHeight, rows: el.querySelectorAll("[data-pick], [data-action-sheet] button, fieldset label, [data-kind]").length } : { t, y: null, h: 0, rows: 0 })
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    return { p, errors }
  }
  const now = (p) => p.evaluate(() => performance.now())
  const tapOn = async (p, sel) => {
    const box = await p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, sel)
    if (!box) return false
    await p.touchscreen.tap(box.x, box.y)
    return true
  }
  const slice = (p, a, b) => p.evaluate((a, b) => ({
    rec: window.__rec.filter((r) => r.t >= a && r.t < b),
    long: window.__long.filter((l) => l.t + l.d >= a && l.t < b),
    commits: window.__commits.filter((c) => c.t >= a && c.t < b),
    events: window.__events.filter((e) => e.t >= a && e.t < b),
    clicks: window.__clicks.filter((c) => c >= a && c < b),
  }), a, b)

  const SHEETS = {
    filters: { trigger: "[data-product-filters]", rows: "[role=dialog] button", picks: ["Apply filters", "Reset"] },
    create: { trigger: "[data-new-product]", rows: "[data-sheet-panel] button[aria-label=Close]", picks: ["Close", "Close"] },
    sort: { trigger: "[data-toolbar] button[data-sort]", rows: "[data-pick-sheet=sort] [data-pick]", picks: ["Price high to low", "Newest"] },
  }
  const results = []
  for (const width of [390, 360, 430]) {
    for (const [name, S] of Object.entries(SHEETS)) {
      const { p, errors } = await open(width)
      if (!(await p.$(S.trigger))) {
        console.log(`\n${name} sheet at ${width}: no trigger on this page (${S.trigger})`)
        await p.close()
        continue
      }
      const cycles = width === 390 ? CYCLES : 2
      console.log(`\n${name} sheet at ${width} wide, CPU ${CPU}x slower, ${cycles} opens and picks`)
      const stat = { width, name, frames: 0, firstFrame: [], offscreen: 0, backwards: 0, unfinished: 0, shortExits: 0, maxGap: 0, openTask: 0, pickTask: 0, motionLong: 0, maxMotionLong: 0, apply: 0, pageRendersMoving: 0, applied: 0, noRows: 0, tapMs: [], tapRun: [] }
      for (let i = 0; i < cycles; i++) {
        const t0 = await now(p)
        if (!(await tapOn(p, S.trigger))) { stat.unfinished++; continue }
        await wait(700)
        if (name === "filters" && i % 2 === 0) {
          await p.evaluate(() => [...document.querySelectorAll("fieldset label")].find((e) => e.textContent.trim() === "Draft")?.click())
          await wait(100)
        }
        const t1 = await now(p)
        if (i === 0) await p.screenshot({ path: join(shots, `products-${width}-${name}-sheet.png`) })
        /* The pick: a row that changes something, alternating so every one does. */
        const pickName = S.picks[i % S.picks.length]
        const picked = await p.evaluate((rowsSel, pickName) => {
          const row = [...document.querySelectorAll(rowsSel)].find((b) => (b.textContent.trim() || b.getAttribute("aria-label")) === pickName)
          if (!row) return null
          const r = row.getBoundingClientRect()
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
        }, S.rows, pickName)
        if (!picked) { stat.unfinished++; continue }
        await p.touchscreen.tap(picked.x, picked.y)
        await wait(900)
        const t2 = await now(p)
        const open1 = await slice(p, t0, t1), close1 = await slice(p, t1, t2)
        const click = open1.clicks[0] ?? t0
        const o = open1.rec.filter((r) => r.t > click)
        const present = o.filter((r) => r.y !== null)
        stat.frames += present.length
        /* How many frames from the tap to the first one with the sheet in it. */
        const firstAt = o.findIndex((r) => r.y !== null)
        stat.firstFrame.push(firstAt < 0 ? Infinity : firstAt + 1)
        if (present.length && present[0].y < present[0].h * 0.9) stat.offscreen++
        if (present.length && present[0].rows === 0) stat.noRows++
        for (let k = 1; k < present.length; k++) if (present[k].y > present[k - 1].y + 0.5) stat.backwards++
        if (!present.length || Math.abs(present[present.length - 1].y) > 0.5) stat.unfinished++
        const pickAt = close1.clicks[0] ?? t1
        const c = close1.rec.filter((r) => r.t > pickAt)
        const goneAt = c.find((r) => r.y === null)?.t ?? Infinity
        const leaving = c.filter((r) => r.y !== null)
        for (let k = 1; k < leaving.length; k++) if (leaving[k].y < leaving[k - 1].y - 0.5) stat.backwards++
        if (leaving.filter((r) => r.y > 0.5).length <= 5) stat.shortExits++
        if (goneAt === Infinity) stat.unfinished++
        stat.frames += leaving.length
        /* The worst gap between two frames while the sheet moved, either way. */
        const moving = [...o.filter((r) => r.y !== null && r.t <= (present.find((f) => Math.abs(f.y) <= 0.5)?.t ?? Infinity)), ...c.filter((r) => r.t <= goneAt)]
        for (let k = 1; k < moving.length; k++) {
          const gap = moving[k].t - moving[k - 1].t
          if (gap < 200) stat.maxGap = Math.max(stat.maxGap, gap)
        }
        /*
          THREE PARTS, TIMED APART. The tap's own work, up to the first frame
          (the task the click runs in). The motion: every task after that
          first frame while the sheet rises, and from the pick to the last
          frame the sheet is on screen. And the pick applied, which runs once
          the sheet has finished leaving, in the task that takes it away.
        */
        const firstFrameAt = present[0]?.t ?? click
        const restAt = present.find((f) => Math.abs(f.y) <= 0.5)?.t ?? Infinity
        const lastOnScreen = leaving.length ? leaving[leaving.length - 1].t : pickAt
        const own = (long, at) => long.filter((l) => l.t <= at + 1 && l.t + l.d >= at - 1).map((l) => l.d)
        stat.openTask = Math.max(stat.openTask, ...own(open1.long, click), 0)
        stat.pickTask = Math.max(stat.pickTask, ...own(close1.long, pickAt), 0)
        const closeFirstFrame = c[0]?.t ?? pickAt
        const motion = [...open1.long.filter((l) => l.t > firstFrameAt - 1 && l.t < restAt), ...close1.long.filter((l) => l.t > closeFirstFrame - 1 && l.t < lastOnScreen)]
        for (const l of motion) { stat.motionLong++; stat.maxMotionLong = Math.max(stat.maxMotionLong, l.d) }
        for (const l of close1.long.filter((l) => l.t >= lastOnScreen)) stat.apply = Math.max(stat.apply, l.d)
        /* The page did not render to open the sheet, nor while it moved or left: a commit of the page with the sheet still there after it. */
        stat.pageRendersMoving += open1.commits.filter((x) => x.page).length + close1.commits.filter((x) => x.page && x.sheet).length
        const ev = open1.events.filter((e) => e.name === "click")
        if (ev.length) { stat.tapMs.push(Math.round(ev[0].d)); stat.tapRun.push(+ev[0].run.toFixed(1)) }
        /* Applied, once it had gone. */
        const state = await p.evaluate(() => ({
          draftsOnly: [...document.querySelectorAll("[data-list] [data-row]:not([hidden]) [data-meta]")].every((e) => e.textContent.includes("Draft")),
          first: [...document.querySelectorAll("section[aria-label=Products] ul > li:not([hidden])")].slice(0, 2).map((li) => li.querySelector("[data-price]")?.textContent),
        }))
        const ok = name === "create" ? true : name === "filters" ? state.draftsOnly === (pickName === "Apply filters") : pickName === "Newest" ? state.first[0] === "$12.00" : state.first[0] === "$218.50"
        if (ok) stat.applied++
        else console.log(`        (cycle ${i}: after ${pickName}: ${JSON.stringify(state)})`)
      }
      const first = Math.max(...stat.firstFrame)
      expect(first <= 1, "the frame after the tap already holds the sheet", `worst ${first} frame(s) from the tap, over ${cycles} opens`)
      expect(stat.offscreen === 0 && stat.noRows === 0, "that first frame has it below the screen, rows and all", { atRest: stat.offscreen, empty: stat.noRows })
      expect(stat.backwards === 0 && stat.unfinished === 0, "it rises in one motion to rest and leaves in one motion", { backwards: stat.backwards, unfinished: stat.unfinished })
      expect(stat.shortExits === 0, "it slides out, more than five frames of it on its way down every time", stat.shortExits)
      expect(stat.motionLong === 0, `no main thread task over 50ms while it moves, up or down (CPU ${CPU}x slower)`, { tasks: stat.motionLong, longest: Math.round(stat.maxMotionLong) })
      expect(stat.openTask <= OPEN_BUDGET && stat.pickTask <= OPEN_BUDGET, `the tap's own work before the first frame, and the pick's before the sheet starts down, under ${OPEN_BUDGET}ms (CPU ${CPU}x slower)`, `${Math.round(stat.openTask)} and ${Math.round(stat.pickTask)}ms at worst`)
      expect(stat.pageRendersMoving === 0, "the page and its rows did not render to open it, nor while it moved or left", { renders: stat.pageRendersMoving })
      expect(stat.applied === cycles, "the pick is applied once the sheet has gone", `${stat.applied} of ${cycles}`)
      expect(errors.length === 0, "no errors", errors.slice(0, 2).join(" | "))
      results.push({
        width, sheet: name, opens: cycles, "frames/cycle": Math.round(stat.frames / cycles), "first frame": `${first} after tap`, "worst gap ms": +stat.maxGap.toFixed(1),
        "tap task ms": Math.round(stat.openTask) || "under 50", "pick task ms": Math.round(stat.pickTask) || "under 50", "long tasks moving": stat.motionLong, "tap to paint ms": stat.tapMs.length ? `${Math.min(...stat.tapMs)} to ${Math.max(...stat.tapMs)}` : "under 16",
        "pick applied ms": Math.round(stat.apply) || "under 50", "page renders moving": stat.pageRendersMoving,
      })
      await p.close()
    }
  }
  await browser.close()
  console.log(`\nper sheet${process.env.BEFORE ? ` (BEFORE: ${process.env.BEFORE})` : ""}`)
  console.table(results)
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
