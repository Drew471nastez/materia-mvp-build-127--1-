/**
 * ===========================================================================
 *  FILMING THE BUILT SITE'S HEADER: THE MENU OPENING, AND THE STICKY REVEAL
 * ===========================================================================
 * "When I open the navigation sidebar the header glitches and closes,
 *  refreshes, flashes, and the nav sidebar is not even smooth."
 * "This sticky on scroll-up behaviour is not smooth."
 *
 * Neither of those is a DOM question. A flash is a PAINT, and smoothness is
 * the SPACING BETWEEN paints — a drawer can arrive at exactly the right
 * place, with exactly the right transform, and still be reported as broken
 * because it got there in four frames instead of twenty.
 *
 * So this films it. Page.startScreencast streams real PNG frames; each one
 * is decoded here (node:zlib and forty lines, rather than a dependency the
 * repo does not have) and compared with the frame before it on two axes:
 *
 *   • how much of the picture changed — the share of sampled pixels whose
 *     luminance moved by more than 8 levels. A slide is a small steady
 *     number; a flash is a step out and back.
 *   • how far the MEAN luminance moved. A flash is the whole picture going
 *     lighter or darker for a frame or two and then coming back, which no
 *     slide ever does.
 *
 * Beside the film, three things the film cannot say on its own:
 *
 *   • FRAME TIMES, from a rAF recorder inside the page. The screencast only
 *     emits a frame when something changed, so a gap in it is ambiguous.
 *     rAF intervals are not: 16.7ms is a frame delivered, 50ms is two
 *     dropped. Median, 95th percentile and the count over 32ms.
 *   • THE SCROLL OFFSET, sampled every frame across the open and the close.
 *     A scroll lock that moves the page is the "it jumps" half of the
 *     report and is invisible in a still.
 *   • WHAT IS ANIMATING, from document.getAnimations() — the property, so a
 *     transition on `top` or `height` (layout, on the main thread) can be
 *     told from one on `transform` or `opacity` (the compositor).
 *
 * Plus the two structural questions behind "it refreshes": does the header
 * element survive the interaction (a remount is a new node), and does the
 * document navigate (it must not).
 *
 * All three surfaces the same markup renders in, because they differ in the
 * one thing that matters here — what scrolls:
 *
 *   live          the published page: the document scrolls
 *   canvas-mobile the editor's phone preview: #wb-preview-root scrolls
 *   canvas-desktop the editor canvas at desktop width: the same scroller
 *
 *   node scripts/check-header-motion.mjs
 *   MODES=live node scripts/check-header-motion.mjs      # just one
 *   KEEP=1 node scripts/check-header-motion.mjs          # keep the frames
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inflateSync } from "node:zlib"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const VIEW_W = 390
const VIEW_H = 700
/* A phone's worth of CPU, not a server's. Every number below is taken with
   this on, because at full speed nothing janks and the probe says nothing. */
const CPU_THROTTLE = Number(process.env.CPU ?? 4)
const MODES = (process.env.MODES ?? "live,canvas-mobile,canvas-desktop").split(",").map((s) => s.trim()).filter(Boolean)

/* ── A PNG, DECODED ────────────────────────────────────────────────────────
   Chrome's screencast frames are 8-bit RGB or RGBA, not interlaced. That is
   the whole surface this has to cover, so it covers exactly that and says so
   loudly when handed anything else. */
function decodePng(buf) {
  let pos = 8
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0
  const idat = []
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString("ascii", pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4)
      depth = data[8]; ctype = data[9]; interlace = data[12]
    } else if (type === "IDAT") idat.push(data)
    else if (type === "IEND") break
    pos += 12 + len
  }
  if (depth !== 8 || interlace !== 0 || (ctype !== 2 && ctype !== 6)) {
    throw new Error(`unsupported PNG: depth ${depth}, colour type ${ctype}, interlace ${interlace}`)
  }
  const ch = ctype === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.allocUnsafe(h * stride)
  let rp = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++]
    const line = raw.subarray(rp, rp + stride); rp += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= ch ? prev[x - ch] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = v & 0xff
    }
  }
  return { w, h, ch, data: out }
}

/* Luminance over a sampled grid — every third pixel each way, which is a
   ninth of the work and, at 390x700, still thirty thousand samples. */
const STEP = 3
function luma(img) {
  const { w, h, ch, data } = img
  const out = new Float32Array(Math.ceil(w / STEP) * Math.ceil(h / STEP))
  let i = 0, sum = 0
  for (let y = 0; y < h; y += STEP) {
    for (let x = 0; x < w; x += STEP) {
      const p = (y * w + x) * ch
      const v = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
      out[i++] = v; sum += v
    }
  }
  return { grid: out.subarray(0, i), mean: sum / i }
}

const quantile = (xs, q) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]
}
const r1 = (n) => Math.round(n * 10) / 10
const r2 = (n) => Math.round(n * 100) / 100

/* ── The page each mode is filmed in ───────────────────────────────────── */
const CANVAS_CLASS = "relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden border-0 rounded-none w-full h-full"
/*
  Something under the header worth scrolling past, in bands so a scroll is
  visible in the film rather than a flat wall of one colour — and with real
  weight in it. A page of forty empty divs lays out in microseconds, so a
  scroll handler that forces layout on every event costs nothing there and
  the probe reports a smoothness nobody has. Forty rows of twenty spans is
  about four thousand nodes, which is an ordinary shop's front page, and it
  is what makes a forced reflow show up as a dropped frame.
*/
/*
  AND NO TWO SCROLL POSITIONS LOOK ALIKE. The first version banded two greys,
  which repeat every 240px — so scrolling down and back up returned a picture
  identical to one four frames earlier, and the flash detector below, which
  is built to notice exactly that, reported three flashes in a scroll that
  was perfectly smooth. Every row now has its own shade and its own text.
*/
const FILLER = Array.from({ length: 40 }, (_, i) =>
  `<div style="height:120px;background:hsl(${(i * 37) % 360} 24% ${72 + (i % 7) * 3}%);font:14px/24px system-ui;color:#3f3f46;padding:8px">` +
  Array.from({ length: 12 + (i % 9) }, (_, j) => `<span style="display:inline-block;padding:0 6px">cell ${i}-${j}-${(i * 31 + j * 7) % 997}</span>`).join("") +
  `</div>`).join("")

/*
  `display: contents` ON THE MOUNT, AND IT IS THE WHOLE POINT.

  React needs a host element to render into, and a host element is a BOX: a
  `position: sticky` header inside it is stuck to THAT box, which is one
  header tall, so it has nowhere to travel and simply scrolls away with the
  page. The first run of this probe filmed exactly that — the header's rect
  read -1208 with the page at 1220 — and every sticky number it produced was
  a measurement of a header that was not sticky. A host that generates no box
  puts the header where both real surfaces put it: a direct child of the
  thing that scrolls, beside the sections.
*/
function pageHtml(mode, css, bundle) {
  const body = mode === "live"
    ? `<div id="mount" style="display:contents"></div>${FILLER}`
    : `<div id="canvas-frame" style="width:${mode === "canvas-mobile" ? VIEW_W : 1100}px;max-width:100%;height:${VIEW_H}px;position:relative;overflow:hidden;box-sizing:border-box">` +
      `<div id="wb-preview-root" class="${CANVAS_CLASS}" style="touch-action:pan-y;overscroll-behavior:contain">` +
      `<div id="mount" style="display:contents"></div><div style="flex:0 0 auto">${FILLER}</div>` +
      `</div></div>`
  /* The viewport meta is not decoration here: under `mobile: true` a page
     without one lays out at 980px and is scaled down, so every coordinate a
     tap is dispatched at misses and `innerHeight` reads 1759 on a 700px
     screen. The first run of this probe did exactly that. */
  return `<!doctype html><html class="light"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>` +
    `<style>body{margin:0}</style></head><body>${body}` +
    `<script>window.process={env:{NODE_ENV:"production"}};window.__MODE=${JSON.stringify(mode)}</script>` +
    `<script>${bundle}</script></body></html>`
}

/* ── The recorder that lives in the page ─────────────────────────────────
   Two clocks, on purpose. The per-frame one is kept CHEAP — a timestamp, a
   scroll offset, and the header's INLINE transform, which is a string read
   and forces nothing — because a recorder that calls getComputedStyle or
   getAnimations() every frame is itself the jank it claims to measure. The
   expensive sampling (what is animating, and how) runs on a 100ms timer,
   where it costs a twentieth as much and still names every transition that
   lasts longer than a blink. */
const RECORDER = `
window.__film = (() => {
  const st = { frames: [], scroll: [], hdr: [], panel: [], shifts: 0, anims: [], longTasks: [], running: false, t0: 0 }
  const scroller = () => document.getElementById("wb-preview-root")
  const header = () => document.querySelector('[data-chrome]')
  const panelNode = () => document.querySelector('[role="dialog"][aria-label="Menu"]')
  const y = () => { const s = scroller(); return s ? s.scrollTop : window.scrollY }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) st.shifts += e.value })
      .observe({ type: "layout-shift", buffered: true })
  } catch {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (st.running) st.longTasks.push(Math.round(e.duration)) })
      .observe({ type: "longtask", buffered: false })
  } catch {}
  let last = 0
  let timer = 0
  const tick = (now) => {
    if (!st.running) return
    if (last) st.frames.push(now - last)
    last = now
    const at = Math.round(now - st.t0)
    st.scroll.push([at, Math.round(y())])
    const h = header()
    /* The inline transform, which is what the reveal writes. A string read
       off the style attribute: no style resolution, no layout. */
    if (h) st.hdr.push([at, h.style.transform || ""])
    /*
      AND WHERE THE MENU PANEL ACTUALLY IS, THIS FRAME.

      The picture diff cannot answer "is the slide smooth": a backdrop fading
      over the whole screen moves every pixel by more than the threshold on
      its very first frame, so a perfect open and a snap both report that
      nearly all of the picture changed. The panel's own edge can. A slide
      drawn properly walks across in twenty small steps from off screen; a
      slide whose first frames were never painted appears already most of the
      way in, and the first step it is ever seen taking is enormous.

      A rect read, which includes the animated transform and costs no layout
      while nothing has dirtied it.
    */
    const pn = panelNode()
    if (pn) { const r = pn.getBoundingClientRect(); st.panel.push([at, Math.round(r.left), Math.round(r.top)]) }
    requestAnimationFrame(tick)
  }
  const sample = () => {
    if (!st.running) return
    for (const a of document.getAnimations()) {
      const what = a.transitionProperty || a.animationName || "(waapi)"
      const tgt = a.effect && a.effect.target
      const tag = tgt && tgt.tagName ? tgt.tagName.toLowerCase() + (tgt.getAttribute("aria-label") ? "[" + tgt.getAttribute("aria-label") + "]" : "") : "?"
      const key = what + " on " + tag
      if (!st.anims.includes(key)) st.anims.push(key)
    }
  }
  return {
    start() {
      st.frames = []; st.scroll = []; st.hdr = []; st.panel = []; st.shifts = 0; st.anims = []; st.longTasks = []
      st.running = true; last = 0; st.t0 = performance.now()
      requestAnimationFrame(tick)
      timer = setInterval(sample, 100)
    },
    stop() {
      st.running = false
      clearInterval(timer)
      return { frames: st.frames.map((f) => Math.round(f * 10) / 10), scroll: st.scroll, hdr: st.hdr, panel: st.panel, shift: st.shifts, anims: st.anims, longTasks: st.longTasks }
    },
    y,
    /* The header's node, tagged once, so a remount can be seen: a new node
       has no tag on it. */
    tagHeader() {
      const el = header()
      if (el) el.__filmTag = 1
      return !!el
    },
    headerSurvived() {
      const el = header()
      return !!el && el.__filmTag === 1
    },
  }
})()
"ok"`

/* ── Chromium ──────────────────────────────────────────────────────────── */
function reachabilityFlags() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  return proxy ? [`--proxy-server=${proxy}`] : []
}

const css = await appCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-hdrfilm-"))
const stubs = join(root, ".header-motion-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
execFileSync("npx", [
  "esbuild", join(root, "scripts/render-header-motion.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(out, "probe.js"), "utf8")

const proc = spawn(CHROMIUM, [
  "--headless=new", "--remote-debugging-port=0", "--no-sandbox", "--disable-gpu",
  "--disable-dev-shm-usage", "--force-device-scale-factor=1", "--hide-scrollbars",
  ...reachabilityFlags(), "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] })
const reap = () => { try { proc.kill("SIGKILL") } catch {} }
for (const sig of ["exit", "SIGINT", "SIGTERM"]) process.on(sig, reap)
let endpoint = ""
proc.stderr.on("data", (b) => { const m = String(b).match(/ws:\/\/[^\s]+/); if (m && !endpoint) endpoint = m[0] })
for (let i = 0; i < 100 && !endpoint; i++) await sleep(100)
if (!endpoint) { reap(); fail("Chromium never printed a debugging endpoint.") }

const ws = new WebSocket(endpoint)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("could not attach")) })
let id = 0
const pending = new Map()
let onFrame = null
let navigations = 0
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.method === "Page.screencastFrame") {
    if (onFrame) onFrame(msg.params)
    send("Page.screencastFrameAck", { sessionId: msg.params.sessionId }, sessionId).catch(() => {})
    return
  }
  if (msg.method === "Page.frameNavigated" && !msg.params.frame.parentId) navigations++
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
const send = (method, params, session) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    ws.send(JSON.stringify(session == null ? { id: n, method, params } : { id: n, method, params, sessionId: session }))
  })

const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
const call = (m, p = {}) => send(m, p, sessionId)
const evaluate = async (expr) => {
  const res = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? JSON.stringify(res.exceptionDetails))
  return res.result?.value
}
await call("Page.enable")
await call("Runtime.enable")
await call("Performance.enable")
await call("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: true })
await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })

/* ── One take ──────────────────────────────────────────────────────────── */
/*
  THE RENDERER'S OWN COUNTERS, WHICH ARE THE ONLY PLACE FORCED LAYOUT SHOWS
  UP AS A NUMBER. A scroll handler that reads `getBoundingClientRect()` after
  writing a style forces a fresh layout on every scroll event, and from the
  outside that is only ever "a bit janky". `LayoutCount` counts it: 18 wheel
  events with two forced layouts each is a figure nobody can argue with.
*/
const metrics = async () => Object.fromEntries((await call("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]))
const metricDelta = (a, b) => ({
  layouts: Math.round(b.LayoutCount - a.LayoutCount),
  styleRecalcs: Math.round(b.RecalcStyleCount - a.RecalcStyleCount),
  layoutMs: r1((b.LayoutDuration - a.LayoutDuration) * 1000),
  styleMs: r1((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000),
  scriptMs: r1((b.ScriptDuration - a.ScriptDuration) * 1000),
})

async function film(label, act, keepDir) {
  /*
    THE FRAME'S OWN TIMESTAMP, NOT THE ONE ON THE WIRE.

    Timing a frame by when node received it says two frames arrived one
    millisecond apart, which no screen ever shows: the capture batches, and
    the pair reads as a picture that changed and changed back inside a
    millisecond. The flash detector below is built to notice exactly that
    shape, and it duly reported a flash in a scroll that was smooth. The
    screencast hands over the moment each frame was CAPTURED; frames closer
    together than half a frame are the same moment delivered twice and one of
    them is dropped.
  */
  const frames = []
  let t0 = 0
  onFrame = (p) => {
    const ms = (p.metadata?.timestamp ?? 0) * 1000
    if (!t0) t0 = ms
    const t = Math.round(ms - t0)
    const last = frames[frames.length - 1]
    if (last && t - last.t < 8) frames[frames.length - 1] = { t, data: p.data, scrollY: p.metadata?.scrollOffsetY ?? 0 }
    else frames.push({ t, data: p.data, scrollY: p.metadata?.scrollOffsetY ?? 0 })
  }
  await call("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  const m0 = await metrics()
  await evaluate("window.__film.start()")
  await act()
  const rec = await evaluate("JSON.stringify(window.__film.stop())")
  const cost = metricDelta(m0, await metrics())
  await call("Page.stopScreencast")
  onFrame = null
  const { frames: intervals, scroll, hdr, panel, shift, anims, longTasks } = JSON.parse(rec)

  const shots = []
  for (const f of frames) {
    try { shots.push({ t: f.t, ...luma(decodePng(Buffer.from(f.data, "base64"))) }) }
    catch (e) { shots.push({ t: f.t, error: String(e.message) }) }
  }
  const changedBetween = (a, b) => {
    if (!a?.grid || !b?.grid) return 1
    let moved = 0
    for (let i = 0; i < a.grid.length; i++) if (Math.abs(a.grid[i] - b.grid[i]) > 8) moved++
    return moved / a.grid.length
  }
  const stats = shots.map((s, i) => s.error ? { t: s.t, error: s.error } : {
    t: s.t,
    changed: i === 0 ? 0 : r2(changedBetween(shots[i - 1], s)),
    dMean: i === 0 ? 0 : r1(s.mean - (shots[i - 1].mean ?? s.mean)),
    mean: r1(s.mean),
  })
  if (keepDir) frames.forEach((f, i) => writeFileSync(join(keepDir, `${label}-${String(i).padStart(3, "0")}-${f.t}ms.png`), Buffer.from(f.data, "base64")))

  /*
    A FLASH IS A STEP OUT AND BACK — AND "BACK" IS THE WORD THAT HAS TO BE
    MEASURED CAREFULLY.

    The first version of this compared MEAN LUMINANCE against the frame
    before, and called it a flash when the mean left by six levels and
    returned. It flagged the drawer's own slide: a panel coming in from the
    left darkens the picture on one frame and the backdrop lightens it again
    on the next, and the mean cannot tell that apart from the screen blinking.
    Two frames of a normal, correct open were reported as a defect.

    So the comparison is between PICTURES, not averages. A flash is a frame
    that differs from the one before it over a good part of the screen, and a
    frame within three of it that is almost EXACTLY the earlier one again —
    under 3% of samples apart. A slide never returns to where it was; a
    blink, a re-layout, a remount and a header that jumps and comes back all
    do, by definition.
  */
  const flashes = []
  for (let i = 1; i < shots.length; i++) {
    if ((stats[i].changed ?? 0) < 0.12) continue
    for (let j = i + 1; j <= Math.min(i + 3, shots.length - 1); j++) {
      const back = changedBetween(shots[i - 1], shots[j])
      if (back < 0.03) {
        flashes.push({ atMs: stats[i].t, changed: stats[i].changed, backWithinMs: shots[j].t - shots[i - 1].t, residue: r2(back) })
        i = j
        break
      }
    }
  }

  /*
    WHEN THE PICTURE FIRST MOVED, AND THE BIGGEST STEP IT TOOK.

    These two are the whole of "the drawer is not smooth", as numbers. A
    drawer whose transition starts in the same commit as the work that opens
    it does not get a frame until the work is done: nothing moves for a
    tenth of a second and then the panel appears most of the way in, because
    the transition has been running on a clock nobody was painting. So the
    first is how long the tap looked ignored, and the second is how far the
    panel jumped in the frame that finally arrived — 0.99 means the whole
    screen changed at once, which is a snap and not a slide.
  */
  const firstMoved = stats.find((s) => (s.changed ?? 0) > 0.02)

  /*
    THE PANEL'S JOURNEY, AS THE NUMBER OF STEPS IT TOOK AND THE SIZE OF THE
    LARGEST ONE. A 360ms slide at 60fps is about twenty steps of twenty
    pixels. One step of two hundred pixels is a drawer that was drawn for the
    first time when it was already there.
  */
  const moved = []
  /*
    ACROSS, NOT DOWN. The menu comes in from the side, so its travel is the
    left edge. Its TOP moves too, by a whole screen at a time, but that is
    the editor's pin arriving — the drawer is positioned inside the canvas's
    scroller and starts each opening at the offset of the last one — and it
    happens while the panel is still off the side of the screen where nobody
    can see it. Counted separately below rather than mixed in, where it would
    swamp the thing being measured.
  */
  for (let i = 1; i < panel.length; i++) {
    const d = Math.abs(panel[i][1] - panel[i - 1][1])
    if (d > 0) moved.push({ at: panel[i][0], d, left: panel[i][1] })
  }
  const pinJumps = []
  for (let i = 1; i < panel.length; i++) {
    const d = panel[i][2] - panel[i - 1][2]
    if (Math.abs(d) > 2) pinJumps.push({ at: panel[i][0], by: d })
  }
  const slide = {
    steps: moved.length,
    biggestStepPx: Math.max(0, ...moved.map((m) => m.d)),
    startedMs: moved.length ? moved[0].at : null,
    /* Where it was on the first frame anybody saw it move to, against where
       it rests when closed: a drawer seen first at its resting edge slid, one
       seen first in the middle of the screen did not. */
    firstSeenLeft: moved.length ? moved[0].left : null,
    endedMs: moved.length ? moved[moved.length - 1].at : null,
    pinJumps,
  }
  const scrollYs = scroll.map(([, v]) => v)
  /*
    THE HEADER'S OWN TRANSFORM, FRAME BY FRAME, COLLAPSED INTO THE MOVES IT
    MADE. Opening a menu must not move the header, and neither must closing
    one: every entry in this list during a drawer take is a header that slid
    when nothing asked it to. It is read off the inline style, which is
    exactly what the reveal writes, so this is the reveal's own decisions and
    not a paint that might have been something else.
  */
  const moves = []
  for (let i = 1; i < hdr.length; i++) if (hdr[i][1] !== hdr[i - 1][1]) moves.push({ atMs: hdr[i][0], to: hdr[i][1] || "(none)" })

  return {
    frames: frames.length,
    intervals,
    frameMs: { median: r1(quantile(intervals, 0.5)), p95: r1(quantile(intervals, 0.95)), worst: r1(Math.max(0, ...intervals)) },
    droppedFrames: intervals.filter((i) => i > 32).length,
    longestStallMs: r1(Math.max(0, ...intervals)),
    longTasksOver50ms: longTasks.length,
    longestTaskMs: Math.max(0, ...longTasks),
    cost,
    layoutShift: r2(shift),
    animating: anims,
    scroll: { start: scrollYs[0] ?? null, end: scrollYs[scrollYs.length - 1] ?? null, min: Math.min(...scrollYs), max: Math.max(...scrollYs), jump: Math.max(...scrollYs) - Math.min(...scrollYs) },
    headerMoves: moves,
    biggestChange: r2(Math.max(0, ...stats.map((s) => s.changed ?? 0))),
    firstChangeMs: firstMoved ? firstMoved.t : null,
    slide,
    flashes,
    stats,
  }
}

const tap = async (x, y) => {
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 })
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 })
}
const wheel = async (x, y, dy, steps) => {
  for (let i = 0; i < steps; i++) {
    await call("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy })
    await sleep(22)
  }
}

/*
  ── THE SAME THING THREE TIMES ───────────────────────────────────────────
  One take of an open is not a measurement. A headless browser under a
  throttled CPU has enough variance between runs that the same code filmed
  twice reported nought dropped frames and then four, and a fix judged on
  one take is a coin toss dressed up as evidence. So every take is repeated
  and the numbers are pooled: the frame intervals of all three takes go into
  one median and one 95th percentile, the dropped frames and the long tasks
  are added up, and the worst of anything is the worst across all of them.
*/
const REPS = Number(process.env.REPS ?? 3)

function merge(takes) {
  const all = takes.flatMap((t) => t.intervals)
  const union = []
  for (const t of takes) for (const a of t.animating) if (!union.includes(a)) union.push(a)
  const sum = (f) => takes.reduce((n, t) => n + f(t), 0)
  return {
    takes: takes.length,
    frames: sum((t) => t.frames),
    frameMs: { median: r1(quantile(all, 0.5)), p95: r1(quantile(all, 0.95)), worst: r1(Math.max(0, ...all)) },
    droppedFrames: all.filter((i) => i > 32).length,
    longTasksOver50ms: sum((t) => t.longTasksOver50ms),
    longestTaskMs: Math.max(0, ...takes.map((t) => t.longestTaskMs)),
    cost: {
      layouts: sum((t) => t.cost.layouts),
      styleRecalcs: sum((t) => t.cost.styleRecalcs),
      layoutMs: r1(sum((t) => t.cost.layoutMs)),
      styleMs: r1(sum((t) => t.cost.styleMs)),
      scriptMs: r1(sum((t) => t.cost.scriptMs)),
    },
    layoutShift: r2(Math.max(0, ...takes.map((t) => t.layoutShift))),
    animating: union,
    scroll: { jump: Math.max(0, ...takes.map((t) => t.scroll.jump)) },
    headerMoves: takes.flatMap((t) => t.headerMoves),
    biggestChange: r2(Math.max(0, ...takes.map((t) => t.biggestChange))),
    firstChangeMs: r1(quantile(takes.map((t) => t.firstChangeMs ?? 0), 0.5)),
    slide: {
      steps: r1(quantile(takes.map((t) => t.slide.steps), 0.5)),
      fewestSteps: Math.min(...takes.map((t) => t.slide.steps)),
      biggestStepPx: Math.max(0, ...takes.map((t) => t.slide.biggestStepPx)),
      startedMs: r1(quantile(takes.map((t) => t.slide.startedMs ?? 0), 0.5)),
      firstSeenLeft: takes.map((t) => t.slide.firstSeenLeft),
      /* Only where the drawer actually travelled. In a scroll film the panel
         is shut and its top rides the scroller, which is a hundred entries of
         nothing happening. */
      pinJumps: takes.flatMap((t) => (t.slide.steps > 0 ? t.slide.pinJumps : [])),
    },
    flashes: takes.flatMap((t) => t.flashes),
  }
}

const report = {}
const keep = process.env.KEEP ? mkdtempSync(join(tmpdir(), "storelib-hdrfilm-frames-")) : null

for (const mode of MODES) {
  const file = join(out, `${mode}.html`)
  writeFileSync(file, pageHtml(mode, css, bundle))
  await call("Emulation.setCPUThrottlingRate", { rate: 1 })
  navigations = 0
  await call("Page.navigate", { url: `file://${file}` })
  await sleep(1600)
  await evaluate(RECORDER)
  await evaluate("window.__film.tagHeader()")
  const navsAfterLoad = navigations
  await call("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE })

  /** Where a control is on screen right now, or null when it is not there. */
  const where = async (sel) => evaluate(`(() => {
    const b = document.querySelector(${JSON.stringify(sel)})
    if (!b) return null
    const r = b.getBoundingClientRect()
    if (r.width < 4 || r.bottom < 0 || r.top > window.innerHeight) return null
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  const drawerIsOpen = async () => evaluate(`(() => {
    const d = document.querySelector('[role="dialog"][aria-label="Menu"]')
    return !!d && d.getAttribute("aria-hidden") !== "true"
  })()`)
  const tapHamburger = async () => {
    const b = await where('button[aria-label="Open menu"]')
    if (b) await tap(b.x, b.y)
    await sleep(1400)
  }
  const tapDrawerClose = async () => {
    const b = await where('[role="dialog"][aria-label="Menu"] button[aria-label="Close menu"]')
    if (b) await tap(b.x, b.y)
    await sleep(1400)
  }
  const ensureOpen = async () => { if (!(await drawerIsOpen())) await tapHamburger() }
  const ensureClosed = async () => { if (await drawerIsOpen()) await tapDrawerClose() }

  /** N takes of one interaction, each from the same starting state. */
  const repeat = async (label, prepare, act, keepDir) => {
    const takes = []
    for (let i = 0; i < REPS; i++) {
      await prepare()
      await sleep(450)
      takes.push(await film(`${label}-take${i}`, act, i === 0 ? keepDir : null))
    }
    return merge(takes)
  }

  const btn = await where('button[aria-label="Open menu"]')
  /* A canvas drawn at desktop width has no hamburger and no drawer — the
     menu is the row of links. The reveal is still its business, so that mode
     films the scrolling and says so rather than reporting nothing. */
  const mid = { x: Math.round(VIEW_W / 2), y: Math.round(VIEW_H / 2) }
  const noDrawer = { error: "no mobile drawer at this width (the nav is a row of links)" }

  /* ---- 1 & 2. OPEN AND CLOSE, AT THE TOP OF THE PAGE ---- */
  const open = btn ? await repeat(`${mode}-open`, ensureClosed, tapHamburger, keep) : { ...noDrawer }
  open.headerSurvived = await evaluate("window.__film.headerSurvived()")
  if (btn) {
    await ensureOpen()
    open.drawerOnScreen = await evaluate(`(() => {
      const d = document.querySelector('[role="dialog"][aria-label="Menu"]')
      if (!d) return null
      const r = d.getBoundingClientRect()
      const cs = getComputedStyle(d)
      return { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        position: cs.position, transform: cs.transform, inBody: d.parentElement === document.body,
        bodyPosition: getComputedStyle(document.body).position, innerH: window.innerHeight }
    })()`)
  }
  const close = btn ? await repeat(`${mode}-close`, ensureOpen, tapDrawerClose, keep) : { ...noDrawer }
  await ensureClosed()

  /* ---- 3. SCROLL DOWN PAST THE THRESHOLD, THEN BACK UP ---- */
  const toTop = async () => { await evaluate(`(() => { const s = document.getElementById("wb-preview-root"); if (s) s.scrollTop = 0; else window.scrollTo(0, 0); })()`) }
  const toBottom = async () => { await evaluate(`(() => { const s = document.getElementById("wb-preview-root"); if (s) s.scrollTop = 1620; else window.scrollTo(0, 1620); })()`) }
  const down = await repeat(`${mode}-down`, toTop, async () => { await wheel(mid.x, mid.y, 90, 18); await sleep(900) }, keep)
  const up = await repeat(`${mode}-up`, toBottom, async () => { await wheel(mid.x, mid.y, -90, 18); await sleep(900) }, keep)

  /* ---- 4. OPEN AND CLOSE AGAIN, DEEP IN THE PAGE ----
     This is the case in the report: the menu opened from a page that has
     been scrolled, where the reveal is live and the lock has a real offset
     to take and give back. The nudge upward is not decoration — scrolling
     DOWN to get here hides the header, and a hidden header's hamburger is
     `pointer-events: none`, so without it the tap lands on nothing. */
  /** Deep in the page, with the header revealed so its hamburger can be hit. */
  const deepAndRevealed = async () => {
    await evaluate(`(() => { const s = document.getElementById("wb-preview-root"); if (s) s.scrollTop = 1400; else window.scrollTo(0, 1400); })()`)
    await sleep(400)
    await wheel(mid.x, mid.y, -60, 3)
    await sleep(600)
  }
  await deepAndRevealed()
  const yBefore = await evaluate("window.__film.y()")
  const scrolledOpen = btn
    ? await repeat(`${mode}-scrolled-open`, async () => { await ensureClosed(); await deepAndRevealed() }, tapHamburger, keep)
    : { ...noDrawer }
  if (btn) {
    await ensureOpen()
    scrolledOpen.drawerOnScreen = await evaluate(`(() => {
      const d = document.querySelector('[role="dialog"][aria-label="Menu"]')
      if (!d) return null
      const r = d.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
    })()`)
  }
  const scrolledClose = btn
    ? await repeat(`${mode}-scrolled-close`, ensureOpen, tapDrawerClose, keep)
    : { ...noDrawer }
  const yAfter = await evaluate("window.__film.y()")
  const headerAfterAll = await evaluate(`(() => {
    const el = document.querySelector('[data-chrome]')
    if (!el) return null
    const cs = getComputedStyle(el)
    return { transform: cs.transform, opacity: Number(cs.opacity).toFixed(2), position: cs.position }
  })()`)

  await call("Emulation.setCPUThrottlingRate", { rate: 1 })
  report[mode] = {
    navigationsDuringFilm: navigations - navsAfterLoad,
    headerSurvived: open.headerSurvived,
    scrolledRoundTrip: { before: yBefore, after: yAfter, moved: yAfter - yBefore },
    headerAtEnd: headerAfterAll,
    open, close, down, up, scrolledOpen, scrolledClose,
  }
}

reap()
const summary = Object.fromEntries(Object.entries(report).map(([mode, r]) => [mode, r.error ? r : {
  navigationsDuringFilm: r.navigationsDuringFilm,
  headerSurvived: r.headerSurvived,
  scrolledRoundTripMoved: r.scrolledRoundTrip.moved,
  headerAtEnd: r.headerAtEnd,
  ...Object.fromEntries(["open", "close", "down", "up", "scrolledOpen", "scrolledClose"].map((k) => [k, r[k].error ? r[k] : {
    frames: r[k].frames,
    frameMs: r[k].frameMs,
    dropped: r[k].droppedFrames,
    longTasks: r[k].longTasksOver50ms,
    longestTaskMs: r[k].longestTaskMs,
    cost: r[k].cost,
    layoutShift: r[k].layoutShift,
    takes: r[k].takes,
    scrollJump: r[k].scroll.jump,
    biggestChange: r[k].biggestChange,
    firstChangeMs: r[k].firstChangeMs,
    slide: r[k].slide,
    tappedAt: r[k].tappedAt,
    flashes: r[k].flashes,
    headerMoves: r[k].headerMoves,
    animating: r[k].animating,
    drawerOnScreen: r[k].drawerOnScreen,
  }])),
}]))
console.log(JSON.stringify({ cpuThrottle: CPU_THROTTLE, viewport: `${VIEW_W}x${VIEW_H}`, frames: keep, summary }, null, 2))
if (process.env.FULL) writeFileSync(join(tmpdir(), "storelib-header-motion-full.json"), JSON.stringify(report, null, 2))
process.exit(0)
