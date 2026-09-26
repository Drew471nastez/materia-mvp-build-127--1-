/**
 * ===========================================================================
 *  WHAT A PULL TO REFRESH COSTS, FRAME BY FRAME
 * ===========================================================================
 * The dashboard's pull to refresh was reported as not smooth. "Not smooth" is
 * three separate measurable things, so this measures all three on the real
 * page at phone size with the CPU throttled 4x, and prints the same numbers
 * for this checkout and for an older one so an improvement is a difference
 * rather than a claim:
 *
 *   1. FRAMES. How many the page drew while the finger was down, and the
 *      longest gap between two of them. A gap is a dropped frame.
 *   2. REACT. How many times the dashboard itself re-rendered during the drag,
 *      counted exactly: every render of DashboardClient creates exactly one
 *      element carrying `dashboard-scroll-container`, and the JSX runtime is
 *      wrapped to count them. Plus the style recalcs and layouts the drag
 *      forced, from the browser's own counters.
 *   3. WHAT MOVED. Every style property the drag wrote, collected from a
 *      MutationObserver. Anything outside transform and opacity is a property
 *      that cannot run on the compositor.
 *
 * And two shapes:
 *
 *   4. THE RESISTANCE CURVE, measured rather than computed: the finger is put
 *      down and moved a fixed distance, and the offset the page actually took
 *      is read off the element. Six distances, and the travel at which the
 *      threshold falls.
 *   5. THE SETTLE: the frames, the duration and the overshoot of the spring
 *      that puts the page back.
 *
 * WHAT A NUMBER HERE IS AND IS NOT. Headless Chromium with no GPU, throttled
 * 4x, is not a phone. The absolute milliseconds are not the ones a phone would
 * see, and no probe can produce a frame rate above the panel's own 60 or
 * 120Hz. What carries across is the comparison: the same page, the same
 * gesture, the same machine, two versions of the code.
 *
 *   node scripts/check-pull-refresh.mjs
 *   node scripts/check-pull-refresh.mjs --before=HEAD~1   # compare against that
 *   node scripts/check-pull-refresh.mjs --only=after      # skip the comparison
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { build } from "esbuild"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const BEFORE = arg("before", "HEAD")
const ONLY = arg("only", "both")
const SHOTS = process.env.PTR_SHOTS ?? join(
  "/tmp/claude-0/-home-user-materia-mvp-build-127--1-/68737670-c97a-5eb7-8405-30ea4d9942e8/scratchpad/shots",
)

const VIEW_W = 390
const VIEW_H = 844
const THROTTLE = 4
/** Where the finger goes down. Below the announcement bar, above the fold. */
const TOUCH_X = Math.round(VIEW_W / 2)
const TOUCH_Y = 260
/** The pull the frame numbers are measured over, and how long it takes.
 *  48 moves over 640ms is 75 a second, the rate a phone reports touches at. */
const PULL_TRAVEL = 150
const PULL_MS = 640
const STEP_COUNT = 48
/** The travels the resistance table is measured at. */
const CURVE_POINTS = [20, 40, 60, 80, 120, 200]

const css = await appCss(root)

/* ── The bundle ──────────────────────────────────────────────────────────── */

/**
 * Counting renders, exactly and in a production build.
 *
 * React's Profiler is a no-op outside a profiling build, so it cannot be used
 * here. The JSX runtime can: DashboardClient returns exactly one element with
 * `dashboard-scroll-container` on it, so one of those created is one render of
 * the dashboard body. Every other element it creates is counted too, as a
 * second opinion on the same question.
 */
const JSX_SHIM = `import * as rt from "react/jsx-runtime"
const w = globalThis
w.__jsx = 0
w.__dashRenders = 0
const tally = (props) => {
  w.__jsx++
  if (props && typeof props.className === "string" && props.className.indexOf("dashboard-scroll-container") >= 0) w.__dashRenders++
}
export const Fragment = rt.Fragment
export function jsx(type, props, key) { tally(props); return rt.jsx(type, props, key) }
export function jsxs(type, props, key) { tally(props); return rt.jsxs(type, props, key) }
`

async function bundle(dir, { before = null } = {}) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
  writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
  writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, priority, fill, sizes, quality, placeholder, blurDataURL, loader, unoptimized, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt: alt || "", width, height, ...rest })
}
`)
  const shim = join(dir, "jsx-count.js")
  writeFileSync(shim, JSX_SHIM)

  /* The older files go into a folder of their own, mirroring their real paths
     so their own relative imports still resolve. */
  const swaps = {}
  let oldDir = null
  if (before) {
    oldDir = join(root, `.ptr-old-${process.pid}-probe`)
    const show = (file) => execFileSync("git", ["show", `${before}:${file}`], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    mkdirSync(join(oldDir, "hooks"), { recursive: true })
    mkdirSync(join(oldDir, "components/app"), { recursive: true })
    writeFileSync(join(oldDir, "hooks/use-pull-to-refresh.ts"), show("hooks/use-pull-to-refresh.ts"))
    writeFileSync(join(oldDir, "components/app/pull-to-refresh-indicator.tsx"), show("components/app/pull-to-refresh-indicator.tsx"))
    writeFileSync(join(oldDir, "components/app/dashboard-client.tsx"), show("components/app/dashboard-client.tsx"))
    swaps["@/hooks/use-pull-to-refresh"] = join(oldDir, "hooks/use-pull-to-refresh.ts")
    swaps["@/components/app/dashboard-client"] = join(oldDir, "components/app/dashboard-client.tsx")
  }

  const redirect = {
    name: "ptr-probe-redirects",
    setup(b) {
      b.onResolve({ filter: /^react\/jsx-runtime$/ }, (args) => (args.importer === shim ? undefined : { path: shim }))
      for (const [spec, file] of Object.entries(swaps)) {
        const filter = new RegExp(`^${spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
        b.onResolve({ filter }, () => ({ path: file }))
      }
    },
  }

  await build({
    entryPoints: [join(root, "scripts/render-pull-refresh.tsx")],
    bundle: true,
    format: "iife",
    outfile: join(dir, "probe.js"),
    alias: {
      "next/link": join(dir, "link.jsx"),
      "next/image": join(dir, "image.jsx"),
      "next/navigation": join(dir, "navigation.js"),
      "@": root,
    },
    loader: { ".jsx": "jsx", ".css": "empty", ".svg": "dataurl" },
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_SUPABASE_URL": '"https://probe.invalid"',
      "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"probe-anon-key"',
    },
    plugins: [redirect],
    logLevel: "error",
  })

  const file = join(dir, "index.html")
  writeFileSync(file,
    `<!doctype html><html class="light"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>` +
    `<style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
    `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});` +
    `window.process={env:{NODE_ENV:"production"}}</script>` +
    `<script src="probe.js"></script></body></html>`)
  return { file, oldDir }
}

/* ── The page's side of the measurement ──────────────────────────────────── */

const ARM = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await new Promise((r) => setTimeout(r, 900))
  if (!window.__ran || window.__threw) return JSON.stringify({ ran: false, threw: window.__threw || null, errors: (window.__err || []).slice(0, 3) })

  const scroller = document.querySelector(".dashboard-scroll-container")
  if (!scroller) return JSON.stringify({ ran: false, threw: "no scroller" })

  /* The indicator and the thing that slides.

     The older build carries no marker, so it is found by position: the
     dashboard puts exactly one \`relative\` box directly inside the scroller,
     and that box holds the indicator and then the wrapper that moves. A
     looser selector (".relative > .absolute") matched a card somewhere up the
     page instead, and the whole before column measured an element that never
     moves — which is what a probe naming its subject by assumption gets. */
  const ring = document.querySelector("[data-ptr-indicator]")
  const box = scroller.querySelector(":scope > .relative")
  const ringEl = ring || (box && box.children[0])
  const contentEl = ringEl ? ringEl.nextElementSibling : null
  if (!contentEl) return JSON.stringify({ ran: false, threw: "no content wrapper" })

  window.__ptrEls = { scroller, ring: ringEl, content: contentEl }

  /* ── frames ── */
  window.__frames = []
  window.__watch = true
  /* Off the inline style: a string parse, never a layout, so watching the
     drag cannot slow the drag down. */
  const inlineY = () => {
    const m = /translate(?:3d|Y)?\\(([^)]*)\\)/.exec(contentEl.style.transform || "")
    if (!m) return 0
    const parts = m[1].split(",")
    return parseFloat(parts.length > 1 ? parts[1] : parts[0]) || 0
  }
  /*
    THE SETTLE IS READ DIFFERENTLY, AND IT HAS TO BE.

    The older build hands the snap back to a CSS transition, so its inline
    style jumps from the pull offset straight to the resting one and every
    frame in between is the compositor's. Read inline, that settle looks like
    a single instant jump, which is the opposite of the truth. The computed
    transform shows what is actually on screen; it costs a style recalc per
    frame, which is why it is only used while the finger is up.
  */
  const computedY = () => {
    const t = getComputedStyle(contentEl).transform
    if (!t || t === "none") return 0
    const nums = t.slice(t.indexOf("(") + 1, -1).split(",").map((x) => parseFloat(x))
    return t.startsWith("matrix3d") ? nums[13] : nums[5]
  }
  window.__computed = false
  window.__ring = []
  const tick = (t) => {
    if (!window.__watch) return
    window.__frames.push(t)
    if (window.__computed) {
      window.__offsets.push(computedY())
      /* How long the spinner is actually on screen, which is the only way to
         tell a deliberate refresh from one that flashes and is gone. */
      window.__ring.push(parseFloat(getComputedStyle(ringEl).opacity) || 0)
    } else {
      window.__offsets.push(inlineY())
    }
    requestAnimationFrame(tick)
  }
  window.__offsets = []
  requestAnimationFrame(tick)

  /* ── long tasks ── */
  window.__long = []
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__long.push(Math.round(e.duration * 10) / 10) })
      .observe({ entryTypes: ["longtask"] })
  } catch (e) { window.__long = null }

  /* ── what the drag writes ── */
  window.__props = {}
  /* Values, not names. A style attribute rewritten in place still carries the
     properties that did not move (the ring's \`top\`), and counting those would
     report a layout property being written on every frame of a drag that never
     touches it. */
  const styleMap = (text) => {
    const out = {}
    for (const bit of (text || "").split(";")) {
      const i = bit.indexOf(":")
      if (i < 0) continue
      out[bit.slice(0, i).trim().toLowerCase()] = bit.slice(i + 1).trim()
    }
    return out
  }
  window.__mo = new MutationObserver((records) => {
    if (!window.__collect) return
    for (const r of records) {
      if (r.attributeName === "style") {
        const was = styleMap(r.oldValue)
        const now = styleMap(r.target.getAttribute("style"))
        for (const p of new Set([...Object.keys(was), ...Object.keys(now)])) {
          if (was[p] !== now[p]) window.__props[p] = (window.__props[p] || 0) + 1
        }
      } else if (r.attributeName) {
        const k = "@" + r.attributeName
        window.__props[k] = (window.__props[k] || 0) + 1
      }
    }
  })
  /* The ring and everything in it, and the wrapper ITSELF but not its
     contents: the dashboard below it keeps its own components alive (the
     banner rotates its slides on a timer), and those writes are not the
     pull's. */
  window.__mo.observe(ringEl, { attributes: true, attributeOldValue: true, subtree: true })
  window.__mo.observe(contentEl, { attributes: true, attributeOldValue: true, subtree: false })

  /* What actually reached the page. The first thing worth knowing when a
     gesture probe reports nothing happened. */
  window.__moves = 0
  window.__cancelled = 0
  scroller.addEventListener("touchmove", (e) => { window.__moves++; if (e.defaultPrevented) window.__cancelled++ }, { passive: true })

  /* Both scrollers. The dashboard's own box scrolls, and in this harness the
     document overflows too, so a pull the page is too slow to claim becomes a
     scroll of whichever one takes it, and the next measurement then starts
     somewhere down the page. */
  window.__toTop = () => {
    scroller.scrollTop = 0
    const d = document.scrollingElement || document.documentElement
    if (d) d.scrollTop = 0
  }
  window.__reset = () => {
    window.__toTop()
    window.__moves = 0
    window.__cancelled = 0
    window.__frames.length = 0
    window.__offsets.length = 0
    window.__ring.length = 0
    window.__long.length = 0
    window.__jsx = 0
    window.__dashRenders = 0
    window.__props = {}
    window.__mark = performance.now()
  }
  window.__collect = false

  /* Computed, so a sample taken between renders reports what is on screen
     rather than what React last wrote. */
  window.__readOffset = () => Math.round(computedY() * 100) / 100

  const ptr = window.__ptr || null
  return JSON.stringify({
    ran: true,
    marked: !!ring,
    height: scroller.scrollHeight,
    numbers: ptr && ptr.PULL_TO_REFRESH ? ptr.PULL_TO_REFRESH : null,
  })
})()`

/* ── Browser plumbing ────────────────────────────────────────────────────── */

async function openBrowser() {
  const proc = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1", "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
  const endpoint = await new Promise((resolve, reject) => {
    let buf = ""
    const timer = setTimeout(() => reject(new Error("the browser never announced a debugging port")), 20000)
    proc.stderr.on("data", (d) => {
      buf += d.toString()
      const m = buf.match(/ws:\/\/[^\s]+/)
      if (m) { clearTimeout(timer); resolve(m[0]) }
    })
  })
  const ws = new WebSocket(endpoint)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("could not attach to the browser")) })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    }
  }
  const send = (method, params, sessionId) =>
    new Promise((resolve, reject) => {
      const n = ++id
      pending.set(n, { resolve, reject })
      ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }))
    })
  return { proc, ws, send }
}

/* ── One run ─────────────────────────────────────────────────────────────── */

async function measure(label, file) {
  const { proc, ws, send } = await openBrowser()
  const { targetId } = await send("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
  const call = (m, p) => send(m, p, sessionId)
  await call("Page.enable", {})
  await call("Runtime.enable", {})
  await call("Performance.enable", {})
  await call("Emulation.setDeviceMetricsOverride", {
    width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: true,
    screenOrientation: { angle: 0, type: "portraitPrimary" },
  })
  await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 })
  await call("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  await call("Page.navigate", { url: "file://" + file })
  await sleep(2600)

  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: 60000 })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.text || r.exceptionDetails))
    return r.result.value
  }

  const armed = JSON.parse(await evaluate(ARM))
  if (!armed.ran) {
    await send("Target.closeTarget", { targetId }, null); ws.close(); proc.kill()
    fail(`[${label}] the dashboard never mounted: ${armed.threw} ${JSON.stringify(armed.errors || [])}`)
  }

  const touch = (type, y) => call("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x: TOUCH_X, y: Math.round(y), radiusX: 12, radiusY: 12, force: 1 }],
  })
  const metrics = async () => {
    const { metrics: m } = await call("Performance.getMetrics", {})
    const pick = (n) => m.find((x) => x.name === n)?.value ?? 0
    return {
      recalc: pick("RecalcStyleCount"), layout: pick("LayoutCount"),
      recalcMs: pick("RecalcStyleDuration") * 1000, layoutMs: pick("LayoutDuration") * 1000,
    }
  }

  /* ── 1. the resistance curve, measured ──────────────────────────────── */
  const curve = []
  for (const dy of CURVE_POINTS) {
    /* Back to the top first. A sample whose pull failed to start leaves the
       scroller a few pixels down, and every sample after it then fails too,
       which is what put holes in this table the first time it was run. */
    await evaluate("window.__toTop()")
    await sleep(120)
    await touch("touchStart", TOUCH_Y)
    await touch("touchMove", TOUCH_Y + dy)
    /* Long enough for a build that re-renders the whole dashboard on the move
       to have finished doing it. At 120ms the older one had not. */
    await sleep(400)
    curve.push({ dy, offset: await evaluate("window.__readOffset()") })
    /* Back above the start: the gesture becomes a scroll and is dropped, so
       releasing cannot arm a refresh and pollute the next sample. */
    await touch("touchMove", TOUCH_Y - 8)
    await touch("touchEnd", 0)
    await sleep(200)
  }

  /* ── 2. a realistic pull, held short of the threshold's release ──────── */
  await evaluate("window.__reset(); window.__collect = true")
  const before = await metrics()
  const STEPS = STEP_COUNT
  const t0 = Date.now()
  await touch("touchStart", TOUCH_Y)
  /*
    THE MOVES ARE NOT AWAITED ONE AT A TIME.

    Waiting for each dispatch to come back costs a round trip through the
    debugger, and under 4x throttling that came to 44ms a move: the page then
    had 28ms of quiet between moves to recover in, which is exactly the quiet
    a real drag does not give it. Sent on a clock instead, they arrive about
    as fast as a finger delivers them, and the websocket keeps them in order.
  */
  const sent = []
  for (let i = 1; i <= STEPS; i++) {
    /* Fast at first and slowing: what a thumb actually does. */
    const u = i / STEPS
    const eased = 1 - Math.pow(1 - u, 2)
    sent.push(touch("touchMove", TOUCH_Y + PULL_TRAVEL * eased))
    const due = t0 + (PULL_MS * i) / STEPS
    const wait = due - Date.now()
    if (wait > 0) await sleep(wait)
  }
  await Promise.all(sent)
  const dragMs = Date.now() - t0
  const drag = JSON.parse(await evaluate(`JSON.stringify({
    frames: window.__frames.length,
    gaps: window.__frames.slice(1).map((t, i) => Math.round((t - window.__frames[i]) * 10) / 10),
    long: window.__long,
    renders: window.__dashRenders,
    jsx: window.__jsx,
    props: window.__props,
    offset: window.__readOffset(),
    moves: window.__moves,
    cancelled: window.__cancelled,
    scrollTop: Math.round(window.__ptrEls.scroller.scrollTop) + Math.round((document.scrollingElement || document.documentElement).scrollTop),
  })`))
  const after = await metrics()
  drag.recalc = after.recalc - before.recalc
  drag.layout = after.layout - before.layout
  drag.recalcMs = Math.round((after.recalcMs - before.recalcMs) * 10) / 10
  drag.layoutMs = Math.round((after.layoutMs - before.layoutMs) * 10) / 10
  drag.ms = dragMs
  drag.steps = STEPS

  const shot = async (name) => {
    const { data } = await call("Page.captureScreenshot", { format: "png" })
    writeFileSync(join(SHOTS, `ptr-${label}-${name}.png`), Buffer.from(data, "base64"))
  }
  await shot("pulled")

  /* ── 3. the release: settle, spinner, exit ───────────────────────────── */
  await evaluate("window.__reset(); window.__computed = true")
  await touch("touchEnd", 0)
  await sleep(160)
  await shot("refreshing")
  /* Long enough for the minimum spinner hold plus the exit. */
  await sleep(1400)
  const release = JSON.parse(await evaluate(`JSON.stringify({
    frames: window.__frames.length,
    offsets: window.__offsets.map((y) => Math.round(y * 100) / 100),
    ring: window.__ring.map((o) => Math.round(o * 100) / 100),
    stamps: window.__frames.map((t) => Math.round((t - window.__mark) * 10) / 10),
    long: window.__long,
    renders: window.__dashRenders,
    props: window.__props,
    rest: window.__readOffset(),
    lifted: (window.__ptrEls.content.style.willChange || "") + "|" + (window.__ptrEls.ring.style.willChange || ""),
  })`))
  await evaluate("window.__collect = false")
  await shot("settled")

  /* ── 4. the same pull with prefers-reduced-motion ────────────────────── */
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] })
  await evaluate("window.__toTop()")
  await sleep(160)
  await touch("touchStart", TOUCH_Y)
  for (let i = 1; i <= 14; i++) {
    await touch("touchMove", TOUCH_Y + (PULL_TRAVEL * i) / 14)
    await sleep(18)
  }
  /* The window opens at the release, not at the pull: the drag itself moves
     under the finger whatever the setting says, and it is the settle that has
     to be a step. */
  await evaluate("window.__reset()")
  await sleep(40)
  await touch("touchEnd", 0)
  await sleep(380)
  const quiet = JSON.parse(await evaluate(`JSON.stringify({ offsets: window.__offsets.map((y) => Math.round(y * 100) / 100) })`))
  await call("Emulation.setEmulatedMedia", { features: [] })
  await evaluate("window.__computed = false")
  await sleep(1400)

  await send("Target.closeTarget", { targetId }, null)
  ws.close()
  proc.kill()
  return { label, numbers: armed.numbers, marked: armed.marked, curve, drag, release, quiet }
}

/* ── Report ──────────────────────────────────────────────────────────────── */

mkdirSync(SHOTS, { recursive: true })
/* Inside the repository, not /tmp: esbuild resolves `react` by walking up from
   the stub files, and /tmp has no node_modules. Ignored, and removed below. */
const tmp = join(root, `.ptr-probe-${process.pid}`)
mkdirSync(tmp, { recursive: true })
const runs = {}
const cleanup = []
try {
  if (ONLY !== "after") {
    const { file, oldDir } = await bundle(join(tmp, "before"), { before: BEFORE })
    if (oldDir) cleanup.push(oldDir)
    runs.before = await measure("before", file)
  }
  if (ONLY !== "before") {
    const { file } = await bundle(join(tmp, "after"))
    runs.after = await measure("after", file)
  }
} finally {
  for (const d of cleanup) rmSync(d, { recursive: true, force: true })
  rmSync(tmp, { recursive: true, force: true })
}

const n = (v, w = 6) => String(v).padStart(w)
const pct = (list, p) => {
  if (!list.length) return 0
  const s = [...list].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]
}

/** Where the settle ends, and by how much it went past on the way. */
function settleOf(run, target) {
  const { offsets, stamps } = run.release
  if (!offsets.length) return null

  /* The release opens with a few frames still at the pull offset (the touchEnd
     has to reach the page), so the settle starts at the first frame that moved. */
  let i = 0
  while (i < offsets.length - 1 && Math.abs(offsets[i] - offsets[0]) < 0.05) i++

  /*
    IT ENDS WHERE IT IS SUPPOSED TO END, NOT WHERE IT SLOWS DOWN.

    Looking for a flat run instead found the top of the overshoot, where the
    spring turns around and is momentarily still — and then reported the
    overshoot as the resting place and the overshoot as zero. The target is
    known (the gap the page holds open while it refreshes), so the settle ends
    at the first frame within a third of a pixel of it that stays there.
  */
  /*
    IT ENDS WHERE IT COMES TO REST, NOT WHERE IT FIRST PASSES THE TARGET.

    Two wrong answers were measured before this: looking for a flat run alone
    found the top of the overshoot, where the spring turns round and is
    momentarily still, and reported the overshoot AS the resting place with an
    overshoot of zero; looking for the target alone found the frame on the way
    down that happens to cross it, before the overshoot had happened at all.
    Rest is both at once: within half a pixel of the target and no longer
    moving.
  */
  let end = i
  let held = false
  while (end < offsets.length) {
    if (Math.abs(offsets[end] - target) < 0.5) {
      let still = true
      for (let k = end; k < Math.min(offsets.length, end + 3); k++) if (Math.abs(offsets[k] - offsets[end]) > 0.05) { still = false; break }
      if (still && end + 3 <= offsets.length) { held = true; break }
    }
    end++
  }
  if (end >= offsets.length) end = offsets.length - 1

  const seg = offsets.slice(i, end + 1)
  const down = offsets[0] > target
  /* How far it went PAST the target on the way, which is the overshoot. */
  const overshoot = down ? target - Math.min(...seg) : Math.max(...seg) - target
  return {
    frames: seg.length,
    ms: Math.round((stamps[Math.min(end, stamps.length - 1)] - stamps[Math.min(i, stamps.length - 1)]) * 10) / 10,
    from: offsets[0], to: offsets[end], target, held,
    overshoot: Math.round(Math.max(0, overshoot) * 100) / 100,
  }
}

/**
 * With prefers-reduced-motion, the settle has to be a step, not a spring: the
 * offsets go straight from the pull to the held gap with nothing in between.
 */
function quietOf(run) {
  const o = run.quiet?.offsets
  if (!o || !o.length) return null
  const from = o[0]
  const to = o[o.length - 1]
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const between = o.filter((y) => y > lo + 0.5 && y < hi - 0.5).length
  return { from, to, between }
}

/** The gap the page holds open while it refreshes: this checkout's number
 *  where the page exports it, and the literal the older one used otherwise. */
const holdOf = (run) => (run.numbers ? run.numbers.refreshHold : 34)

const lines = []
const say = (s = "") => { lines.push(s); console.log(s) }

say(`\nPull to refresh, the dashboard at ${VIEW_W}x${VIEW_H}, CPU throttled ${THROTTLE}x`)
say(`  a phone's own panel is the ceiling: 60Hz is 16.7ms a frame, 120Hz is 8.3ms.`)
say(`  headless Chromium with no GPU is not a phone, so read the two columns against each other.\n`)

for (const key of ["before", "after"]) {
  const run = runs[key]
  if (!run) continue
  const d = run.drag
  const gaps = d.gaps
  say(`── ${key.toUpperCase()}${key === "before" ? ` (${BEFORE})` : ""} ──────────────────────────────────`)
  /* The wall clock, not the schedule: one CDP touch under 4x throttling costs
     more than the 14ms the gesture asks for, so the drag runs longer than a
     thumb would. Reported as it happened rather than as it was asked for. */
  say(`  the drag: ${PULL_TRAVEL}px of finger in ${d.steps} moves over ${d.ms}ms`)
  say(`    frames drawn                 ${n(d.frames)}`)
  say(`    longest gap between frames   ${n(gaps.length ? Math.max(...gaps) : 0)}ms   (median ${pct(gaps, 0.5)}ms, p90 ${pct(gaps, 0.9)}ms)`)
  say(`    gaps over 16.7ms             ${n(gaps.filter((g) => g > 16.7).length)} of ${gaps.length}`)
  say(`    long tasks over 50ms         ${n(d.long === null ? "n/a" : d.long.filter((x) => x > 50).length)}${d.long && d.long.length ? `   (${d.long.join(", ")}ms)` : ""}`)
  say(`    dashboard body renders       ${n(d.renders)}`)
  say(`    React elements created       ${n(d.jsx)}`)
  say(`    style recalcs forced         ${n(d.recalc)}   (${d.recalcMs}ms)`)
  say(`    layouts forced               ${n(d.layout)}   (${d.layoutMs}ms)`)
  const props = Object.keys(d.props).sort()
  say(`    properties written           ${props.length ? props.join(", ") : "none"}`)
  say(`    offset reached               ${n(d.offset)}px   (${d.moves} moves delivered, scrollTop ${d.scrollTop})`)
  say("")
  say(`  resistance: finger travel → offset`)
  for (const c of run.curve) say(`    ${n(c.dy, 5)}px  →  ${n(c.offset, 7)}px`)
  if (run.numbers) {
    const { threshold, maxPull, tension } = run.numbers
    const travel = (threshold * maxPull) / (tension * (maxPull - threshold))
    say(`    threshold ${threshold}px, reached at ${Math.round(travel)}px of finger; limit ${maxPull}px`)
  } else {
    const crossed = run.curve.find((c) => c.offset >= 60)
    say(`    threshold 60px (the old number), first sample past it: ${crossed ? crossed.dy + "px" : "none of these"}`)
  }
  say("")
  const s = settleOf(run, holdOf(run))
  if (s) {
    say(`  settle after release: ${s.from}px → ${s.to}px`)
    say(`    frames                       ${n(s.frames)}`)
    say(`    duration                     ${n(s.ms)}ms`)
    say(`    overshoot                    ${n(s.overshoot)}px${s.held ? "" : "   (it never came to rest there)"}`)
  }
  /* The spinner's own time on screen, from the ring's computed opacity. */
  const vis = run.release.ring || []
  const st = run.release.stamps
  const on = vis.map((o, k) => (o > 0.05 ? st[k] : null)).filter((x) => x !== null)
  if (on.length) say(`    spinner on screen            ${n(Math.round(on[on.length - 1] - on[0]))}ms   over ${on.length} frames`)
  const off = run.release.offsets
  if (off.length) say(`    lowest point of the exit     ${n(Math.min(...off))}px  (it ends at ${off[off.length - 1]}px)`)
  say(`    renders during release+spin  ${n(run.release.renders)}`)
  say(`    will-change when idle        ${run.release.lifted === "|" ? "none" : run.release.lifted}`)
  say(`    resting offset               ${n(run.release.rest)}px`)
  /* With prefers-reduced-motion the page has to BE there, not travel there. */
  const q = quietOf(run)
  if (q) say(`    reduced motion               ${n(q.between)} frames between ${q.from}px and ${q.to}px`)
  say("")
}

let bad = 0
const expect = (ok, what, got) => {
  const line = `${ok ? "  ok" : "FAIL"}  ${what}${got === undefined ? "" : `  →  ${got}`}`
  lines.push(line); console.log(line)
  if (!ok) bad++
}

if (runs.after) {
  const a = runs.after
  expect(a.marked, "the indicator is the one the hook paints", "[data-ptr-indicator]")
  expect(a.drag.renders === 0, "the dashboard body does not render during a drag", `${a.drag.renders} renders`)
  /* Not zero: the home banner runs its own slide timer and keeps rotating
     through a two second drag, which is its business and not the pull's. What
     matters is that nothing renders PER FRAME. */
  expect(a.drag.jsx < a.drag.frames, "nothing on the page renders once per frame of the drag", `${a.drag.jsx} elements over ${a.drag.frames} frames`)
  const props = Object.keys(a.drag.props).filter((p) => p !== "transform" && p !== "opacity" && p !== "will-change" && p !== "@stroke-dasharray")
  expect(props.length === 0, "the drag writes transform and opacity only", props.length ? props.join(", ") : "transform, opacity")
  expect((a.drag.long || []).filter((x) => x > 50).length === 0, "no long task during the drag", `${(a.drag.long || []).filter((x) => x > 50).length}`)
  const curve = a.curve
  expect(curve.every((c, i) => i === 0 || c.offset > curve[i - 1].offset), "the offset never stops following the finger")
  expect(curve[0].offset / curve[0].dy > 0.6, "a short pull is close to the finger", `${Math.round((curve[0].offset / curve[0].dy) * 100)}% at ${curve[0].dy}px`)
  const last = curve[curve.length - 1]
  expect(a.numbers ? last.offset < a.numbers.maxPull : true, "a long pull is still short of the limit", `${last.offset}px of ${a.numbers?.maxPull}px`)
  const s = settleOf(a, holdOf(a))
  expect(s && s.frames >= 5, "the settle is animated, not a jump", `${s?.frames} frames over ${s?.ms}ms`)
  expect(s && s.overshoot > 0.2 && s.overshoot < 6, "and it overshoots by a hair", `${s?.overshoot}px`)
  expect(a.release.lifted === "|", "will-change is gone once nothing is moving", a.release.lifted === "|" ? "none" : a.release.lifted)
  expect(a.release.rest === 0, "the page ends where it started", `${a.release.rest}px`)
  const q = quietOf(a)
  expect(q && q.between === 0, "with reduced motion the page steps there instead of springing", `${q?.between} frames in between`)
}

writeFileSync(join(SHOTS, "ptr-measurements.json"), JSON.stringify({
  viewport: [VIEW_W, VIEW_H], throttle: THROTTLE, before: BEFORE, runs,
}, null, 2))
writeFileSync(join(SHOTS, "ptr-report.txt"), lines.join("\n") + "\n")
console.log(`\n  saved: ${join(SHOTS, "ptr-measurements.json")} and ptr-*.png\n`)

if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("The pull holds its frames, writes nothing but transform and opacity, and renders nothing.\n")
