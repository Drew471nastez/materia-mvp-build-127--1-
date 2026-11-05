/**
 * ===========================================================================
 *  A LAYER RISES AND DROPS, AN ORDER TOO, AND THE SEARCH LISTING FOLDS OPEN
 * ===========================================================================
 * "When I click on a product to go to the edit product page, make sure that
 * slide is smooth. It should not slide to the left or right. It should come
 * from the bottom, very smooth and clean. When I click back or cancel, the
 * same thing reversed. The same for the new product page." And the order
 * page, "not that sliding". And the search engine listing's pencil: "it
 * should just slide down and reveal the other settings", no sheet, no pop up.
 *
 * scripts/render-layer-motion.tsx draws the Products list, the editor (saved
 * and new) and Orders with the stage, on the React the app router runs, so
 * the layer's move is React's own view transition at a real commit. At 360,
 * 390 and 430 on a phone, with the CPU slowed to a quarter (a mid range
 * phone), each of these trips is made twice:
 *
 *   products list -> a product -> Back
 *   products list -> New product -> Cancel
 *   orders list -> an order -> Back
 *
 * GOING BACK IS PLAYED BY THE LAYER ITSELF in every engine (page-layer
 * dropAtCommit): the editor stays live until the commit that brings the
 * page under it, and a still of it drops from there. So every way back here
 * is measured as a move by hand, with or without view transitions; only the
 * way in is a view transition where the engine has them.
 *
 * THE FIRST TIME, TIMED. Every frame the page's own clock sees while the
 * move runs: how far along it is (the translateY it is at), the gaps between
 * frames (a gap over 20ms is a dropped frame at 60Hz; the first one, where
 * the transition takes its pictures, is counted apart), the main thread's
 * long tasks inside the move. The press: from the finger to the first frame
 * that shows it pressed. The list's scroll, before and after.
 *
 * THE SECOND TIME, FROZEN. The move is paused at 0, 25, 50, 75, 90 and 100%
 * and photographed (layer-motion-<trip>-<width>-<pct>.png): in each, the
 * share of the page area that is neither bare page nor white (no frame
 * without a page), and for a layer, whether the black /app header shows
 * anywhere the layer already covers (it must not: the header is under the
 * layer, always).
 *
 * THE SLOW PAGE. With the list 700ms away, Back answers on its frame, a
 * spinner is up and turning 150ms later with the editor still live, and the
 * drop still plays once the list is there.
 *
 * THE SEARCH LISTING, at 390 and 1280: no dialog or sheet, the fields' box
 * growing frame by frame, nothing above the card moving, the fields
 * focusable once open and inert once closed.
 *
 * WITH NO VIEW TRANSITIONS, the two products trips again in an engine that
 * has none (WebKit before Safari 18, which is what the owner was looking at
 * when he said the editor was "direct"). There page-layer.tsx plays the move
 * itself: the layer's own box coming in over a still of the list, a still of
 * the editor going back over the list as it commits. The same numbers are
 * taken for those moves, plus the share of their frames that arrived on time
 * and one picture of each caught part way (layer-motion-<trip>-<in|back>-
 * hand-390.png).
 *
 * At 1280 a layer does not move (the editor is a page in the shell there),
 * and under reduced motion nothing moves, with or without view transitions.
 *
 *   node scripts/check-layer-motion.mjs
 *   ONLY=390 node scripts/check-layer-motion.mjs     (one phone width, and 1280)
 *   SHOTS_DIR=/some/dir node scripts/check-layer-motion.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const THROTTLE = Number(process.env.THROTTLE ?? 4)
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const stubs = mkdtempSync(join(tmpdir(), "storelib-layer-motion-"))
const shots = process.env.SHOTS_DIR || join(stubs, "shots")
mkdirSync(shots, { recursive: true })

writeFileSync(join(stubs, "navigation.js"), `import React from "react"
export const __RouteContext = React.createContext({ path: "/app/products", search: "" })
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = {
  push: (h) => { log("push", h); window.__navigate(h, "push") },
  replace: (h) => { log("replace", h); window.__navigate(h, "replace") },
  prefetch: (h, o) => log("prefetch", h + (o && o.kind ? " " + o.kind : "")),
  back: () => { log("back"); window.__back() },
  refresh: () => log("refresh"),
}
export const useRouter = () => router
export const usePathname = () => React.useContext(__RouteContext).path
export const useSearchParams = () => { const r = React.useContext(__RouteContext); return React.useMemo(() => new URLSearchParams(r.search), [r.search]) }
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); window.__navigate(href, "push") } } }, children)
})
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
/* The database, for the composer's own reads as it opens (who is sending): answered with a studio's rows, nothing written. */
writeFileSync(join(stubs, "supabase-client.js"), `const rows = { profiles: { display_name: "Ana Pop", username: "anapop", avatar_url: null, email: "ana@example.com" }, creators: { id: "cr-1", support_email: "hello@anapop.studio" } }
function from(table) {
  const q = { select() { return q }, eq() { return q }, order() { return q }, limit() { return q }, in() { return q }, is() { return q }, neq() { return q },
    single() { return Promise.resolve({ data: rows[table] ?? null, error: null }) },
    maybeSingle() { return Promise.resolve({ data: rows[table] ?? null, error: null }) },
    then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej) } }
  return q
}
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "ana@example.com" } } }), getSession: async () => ({ data: { session: null } }) }, from, storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } }
`)
writeFileSync(join(stubs, "description-action.js"), `export async function cleanDescription(html) { return { ok: true, html: String(html ?? "") } }
`)

const { build } = await import("esbuild")
const compiled = (p) => join(root, "node_modules/next/dist/compiled", p)
await build({
  entryPoints: [join(root, "scripts/render-layer-motion.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@": ".",
    /* The React the app router runs: Next's own build, with <ViewTransition>. */
    react: compiled("react"),
    "react-dom": compiled("react-dom"),
    "next/navigation": join(stubs, "navigation.js"),
    "@/lib/supabase/client": join(stubs, "supabase-client.js"),
    "next/link": join(stubs, "link.jsx"),
    "next/image": join(stubs, "image.jsx"),
  },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
  plugins: [
    {
      name: "server-action-stub",
      setup(b) {
        b.onResolve({ filter: /description-action$/ }, () => ({ path: join(stubs, "description-action.js") }))
      },
    },
  ],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const css = await appCss(root)
/* Inter from the build, served under the probe's own address: a page at http:// may not read file://. */
const inter = interFaces(root).replace(/url\(file:\/\//g, "url(http://probe.test/__file")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>
<script>
  window.__moves = []; window.__long = []; window.__shifts = []
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }) }).observe({ type: "longtask", buffered: true })
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ t: e.startTime, v: e.value }) }).observe({ type: "layout-shift", buffered: true }) } catch {}
  const start = document.startViewTransition && document.startViewTransition.bind(document)
  if (start) document.startViewTransition = function (arg) {
    const t = start(arg)
    const m = { at: performance.now() }
    window.__moves.push(m)
    t.ready.then(() => { m.ready = performance.now(); performance.mark("vt-ready") }, () => { m.skipped = true })
    t.finished.then(() => { m.done = performance.now(); performance.mark("vt-done") }, () => { m.done = performance.now() })
    return t
  }
</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
writeFileSync(join(stubs, "index.html"), html)
/* BUILD_ONLY=1: write the page and say where, for a profile of one move by hand. */
if (process.env.BUILD_ONLY) {
  console.log(join(stubs, "index.html"))
  process.exit(0)
}

/* ── In the page ──────────────────────────────────────────────────────── */

/* A frame recorder: every rAF, the time, and how far along the layer's (or the order's) move is. */
const RECORD = () => {
  window.__frames = []
  window.__recording = true
  const tick = (t) => {
    if (!window.__recording) return
    const anims = document.getAnimations()
    const layer = anims.find((a) => /page-layer/.test(a.effect?.pseudoElement || ""))
    /* A move page-layer.tsx plays itself (no view transitions here): on the layer's own box coming in, on the still going back. */
    const hand = anims.find((a) => {
      const t = a.effect?.target
      return !a.effect?.pseudoElement && t?.hasAttribute && (t.hasAttribute("data-page-layer") || t.hasAttribute("data-layer-still")) && a.effect.getKeyframes().some((k) => k.transform)
    })
    const order = document.querySelector(".orders-detail")?.getAnimations().find((a) => a.effect?.getKeyframes().some((k) => k.transform))
    const a = layer || hand || order
    const timing = a?.effect?.getComputedTiming()
    let y = null
    const keys = (a?.effect?.getKeyframes() ?? []).flatMap((k) => Object.keys(k).filter((x) => !["offset", "computedOffset", "easing", "composite"].includes(x)))
    if (a === hand && hand) {
      /* Read off the element, not worked out from the progress: the ground truth of where it is drawn this frame. */
      const m = new DOMMatrixReadOnly(getComputedStyle(hand.effect.target).transform)
      y = +m.m42.toFixed(1)
    } else if (a && timing && timing.progress != null) {
      const kf = a.effect.getKeyframes()
      /* A CSS animation's curve is on its keyframes, so the effect's own progress is linear: the curve is applied here. */
      const m = /cubic-bezier\(([^)]+)\)/.exec(kf[0].easing || "")
      let prog = timing.progress
      if (m) {
        const [x1, y1, x2, y2] = m[1].split(",").map(Number)
        const bx = (t) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t
        const by = (t) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t
        let lo = 0
        let hi = 1
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2
          if (bx(mid) < prog) lo = mid
          else hi = mid
        }
        prog = by((lo + hi) / 2)
      }
      const read = (k) => {
        const m = /translateY\(([-\d.]+)(%|px)\)|translate3d\(0(?:px)?, ([-\d.]+)px/.exec(k.transform || "")
        if (!m) return null
        if (m[1] != null) return m[2] === "%" ? (Number(m[1]) / 100) * innerHeight : Number(m[1])
        return Number(m[3])
      }
      const from = read(kf[0]) ?? 0
      const to = read(kf[kf.length - 1]) ?? 0
      y = +(from + (to - from) * prog).toFixed(1)
    }
    window.__frames.push({ t: +t.toFixed(1), y, props: keys, which: layer ? layer.effect.pseudoElement : hand ? "hand" : order ? "order" : null })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** The page area that is neither bare page nor white: 0 is a blank frame. */
async function inkOf(p, png, top, bottom) {
  return p.evaluate(
    async (b64, top, bottom) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = new OffscreenCanvas(img.width, img.height)
      const g = c.getContext("2d")
      g.drawImage(img, 0, 0)
      const scale = img.width / innerWidth
      const d = g.getImageData(0, Math.round(top * scale), c.width, Math.round((bottom - top) * scale)).data
      let ink = 0
      const near = (i, [r, gg, bb]) => Math.abs(d[i] - r) <= 6 && Math.abs(d[i + 1] - gg) <= 6 && Math.abs(d[i + 2] - bb) <= 6
      for (let i = 0; i < d.length; i += 4) if (!near(i, [248, 249, 250]) && !near(i, [255, 255, 255])) ink++
      return +(ink / (d.length / 4)).toFixed(4)
    },
    png,
    top,
    bottom,
  )
}

/** Header black (#111111) in the rows the layer already covers: its top is at `top`. */
async function headerOverLayer(p, png, top) {
  return p.evaluate(
    async (b64, top) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = new OffscreenCanvas(img.width, img.height)
      const g = c.getContext("2d")
      g.drawImage(img, 0, 0)
      const scale = img.width / innerWidth
      let bad = 0
      let seen = 0
      for (let y = Math.max(2, Math.ceil(top + 4)); y < 66; y += 2) {
        for (const x of [12, innerWidth / 2, innerWidth - 12]) {
          const [r, gg, b] = g.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data
          seen++
          if (r < 30 && gg < 30 && b < 30) bad++
        }
      }
      return { bad, seen }
    },
    png,
    top,
  )
}

async function moveCount(p) {
  return p.evaluate(() => window.__moves.length)
}

async function waitMove(p, n, ms = 4000) {
  const t0 = Date.now()
  for (;;) {
    const m = await p.evaluate((n) => window.__moves[n] ?? null, n)
    if (m && (m.done || m.skipped)) return m
    if (Date.now() - t0 > ms) return m
    await sleep(25)
  }
}

/** Presses `sel` with a finger and times the frame that first shows `pressed`. */
async function pressTimed(p, sel, pressed) {
  await p.evaluate((pressed) => {
    window.__press = { down: null, shown: null }
    /* From the click, which is what every one of these answers to (a touch goes through touchstart and touchend first, as a tap does). */
    window.addEventListener("click", () => { window.__press.down = performance.now() }, { capture: true, once: true })
    const look = () => {
      if (window.__press.shown) return
      if (window.__press.down && document.querySelector(pressed)) {
        window.__press.shown = performance.now()
        return
      }
      requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  }, pressed)
  const box = await p.$eval(sel, (el) => {
    const b = el.getBoundingClientRect()
    return { x: b.left + Math.min(b.width / 2, 60), y: b.top + b.height / 2 }
  })
  await p.touchscreen.tap(box.x, box.y)
}

async function pressLatency(p) {
  for (let i = 0; i < 40; i++) {
    const r = await p.evaluate(() => window.__press)
    if (r?.shown) return +(r.shown - r.down).toFixed(1)
    await sleep(20)
  }
  return null
}

/** The scrollers the stage keeps: the shell's, and the page's own inside it. */
const scrollOf = (p) =>
  p.evaluate(() => {
    const outer = document.querySelector(".app-content-scroll")
    const inner = [...(outer?.querySelectorAll(".page-scroll, .orders-list") ?? [])].find((el) => el.scrollHeight > el.clientHeight + 2)
    return { outer: outer?.scrollTop ?? 0, inner: inner?.scrollTop ?? 0 }
  })

async function scrollListTo(p, y) {
  await p.evaluate((y) => {
    const outer = document.querySelector(".app-content-scroll")
    const inner = [...(outer?.querySelectorAll(".page-scroll, .orders-list") ?? [])].find((el) => el.scrollHeight > el.clientHeight + 2)
    const el = inner || outer
    el.scrollTop = y
    el.dispatchEvent(new Event("scroll"))
  }, y)
  await sleep(200)
}

/**
 * One move, timed: presses `sel`, then reads every frame the move had, the
 * long tasks inside it and the press's answer.
 */
async function timedMove(p, cdp, { sel, pressed, kind }) {
  const n = await moveCount(p)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  await p.evaluate(RECORD)
  const began = await p.evaluate(() => performance.now())
  /* The compositor's own account of its frames (Chrome's PipelineReporter), alongside the page's clock. */
  await p.tracing.start({ categories: ["benchmark", "cc", "blink.user_timing"] })
  await pressTimed(p, sel, pressed)
  let window_ = null
  if (kind === "order" || kind.startsWith("hand")) {
    /* An order's move is Web Animations on the pane, no view transition: it runs from its first to its last recorded frame. Waited for until it has run. */
    for (let i = 0; i < 80; i++) {
      await sleep(50)
      const state = await p.evaluate(() => {
        const moving = window.__frames.filter((f) => f.y !== null)
        return { seen: moving.length, last: window.__frames[window.__frames.length - 1]?.y ?? null }
      })
      if (state.seen > 2 && state.last === null) break
    }
  } else {
    const m = await waitMove(p, n)
    window_ = m
  }
  await sleep(150)
  const data = await p.evaluate(() => {
    window.__recording = false
    return { frames: window.__frames, long: window.__long, shifts: window.__shifts }
  })
  const trace = JSON.parse(Buffer.from(await p.tracing.stop()).toString("utf8")).traceEvents
  const compositor = { presented: 0, partial: 0, dropped: 0 }
  /* Only the frames inside the move (between the marks the page sets when the transition is ready and when it is done): a spinner turning before it is a compositor animation too. */
  const markAt = (name) => trace.filter((e) => e.name === name).map((e) => e.ts).pop()
  const t0 = markAt("vt-ready")
  const t1 = markAt("vt-done")
  for (const e of trace) {
    const f = e.name === "PipelineReporter" && e.ph === "b" ? e.args?.frame_reporter : null
    if (!f?.has_compositor_animation || t0 === undefined || t1 === undefined || e.ts < t0 || e.ts > t1) continue
    if (f.state === "STATE_PRESENTED_ALL") compositor.presented++
    else if (f.state === "STATE_PRESENTED_PARTIAL") compositor.partial++
    else if (f.state === "STATE_DROPPED") compositor.dropped++
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const latency = await pressLatency(p)
  let from
  let to
  if (window_?.ready) {
    from = window_.ready
    to = window_.done ?? window_.ready + 600
  } else {
    const moving = data.frames.filter((f) => f.y !== null)
    from = moving[0]?.t ?? began
    to = moving[moving.length - 1]?.t ?? began
  }
  const inWindow = data.frames.filter((f) => f.t >= from - 1 && f.t <= to + 1)
  /*
    The move proper: from the last frame at its starting place (the layer is
    held there until the screen keeps up, page-layer startWhenFramesFlow) to
    the end. A frame that is late while nothing has moved yet is the wait
    before the move, reported as `held`, not a dropped frame of it.
  */
  const y0 = inWindow.find((f) => f.y !== null)?.y ?? null
  const firstMoving = inWindow.findIndex((f) => f.y !== null && y0 !== null && Math.abs(f.y - y0) > 1)
  const started = firstMoving > 0 ? inWindow.slice(firstMoving - 1) : inWindow
  /* ...to the first frame at its destination: what runs after it (an order taken out of the page once it is down) is after the move. */
  const yEnd = [...started].reverse().find((f) => f.y !== null)?.y ?? null
  const arrived = started.findIndex((f) => f.y !== null && yEnd !== null && Math.abs(f.y - yEnd) <= 1)
  const inMove = arrived >= 0 ? started.slice(0, arrived + 1) : started
  const held = firstMoving > 0 ? +(inWindow[firstMoving - 1].t - inWindow[0].t).toFixed(0) : 0
  const gaps = inMove.slice(1).map((f, i) => +(f.t - inMove[i].t).toFixed(1))
  const dropped = gaps.slice(1).filter((g) => g > 20).length
  const ys = inMove.map((f) => f.y).filter((y) => y !== null)
  const partway = ys.filter((y) => y > 2 && y < (kind === "order" ? 2000 : 2000) && Math.abs(y) > 2).length
  /* Tasks that begin while it moves: the commit itself (the new page drawn, inside the transition's update) ends before the first frame of the move. */
  const moveFrom = inMove[0]?.t ?? from
  const moveTo = inMove[inMove.length - 1]?.t ?? to
  const long = data.long.filter((l) => l.t >= moveFrom && l.t < moveTo).map((l) => +l.d.toFixed(0))
  /* Every frame the page laid out again inside the move: a move on transform alone shifts nothing. */
  const shift = +(data.shifts ?? []).filter((x) => x.t >= moveFrom && x.t < moveTo).reduce((a, x) => a + x.v, 0).toFixed(4)
  /* The frame times, as a distribution rather than a worst case: 16.7 is one frame at 60Hz. */
  const sorted = [...gaps.slice(1)].sort((a, b) => a - b)
  const at = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))] : null)
  /* The share of the move's frames that arrived on time (a gap of one frame at 60Hz). */
  const onTime = sorted.length ? +(sorted.filter((g) => g <= 20).length / sorted.length).toFixed(2) : null
  /* What is actually animated, read off the running move's own keyframes. */
  const props = [...new Set(inMove.flatMap((f) => f.props ?? []))]
  return {
    onTime,
    median: at(0.5),
    p95: at(0.95),
    shift,
    props,
    move: window_ ? { ready: !!window_.ready, skipped: !!window_.skipped, waitedMs: window_.ready ? +(window_.ready - window_.at).toFixed(1) : null, ms: window_.done && window_.ready ? +(window_.done - window_.ready).toFixed(0) : null } : null,
    held,
    frames: inMove.length,
    firstGap: gaps[0] ?? null,
    maxGap: gaps.length > 1 ? Math.max(...gaps.slice(1)) : null,
    dropped,
    partway,
    ys: ys.map((y) => Math.round(y)),
    long,
    latency,
    compositor,
  }
}

/** The same move, paused and photographed at each fraction. */
async function frozenMove(p, cdp, { sel, label, layer, which }) {
  const n = await moveCount(p)
  /*
    The move holds itself at its first position and lets go with play()
    (page-layer startWhenFramesFlow); for the pictures, play() does nothing
    until the walk is over, so every one of them is taken at the time the
    walk sets, the first while the move is still held where it starts.
  */
  await p.evaluate(() => {
    if (!window.__play) window.__play = Animation.prototype.play
    window.__freeze = true
    Animation.prototype.play = function () {
      if (window.__freeze) return
      return window.__play.call(this)
    }
    /* ...and a move held by a rate of 0 is not let go either. */
    const rate = Object.getOwnPropertyDescriptor(Animation.prototype, "playbackRate")
    if (!window.__rate) window.__rate = rate
    Object.defineProperty(Animation.prototype, "playbackRate", {
      configurable: true,
      get() { return rate.get.call(this) },
      set(v) { if (window.__freeze && v !== 0) return; rate.set.call(this, v) },
    })
  })
  await p.$eval(sel, (el) => el.click())
  let m = null
  for (let i = 0; i < 80; i++) {
    m = await p.evaluate((n) => window.__moves[n] ?? null, n)
    if (m && (m.ready || m.skipped)) break
    await sleep(15)
  }
  if (!m?.ready) return { ready: false }
  const vp = p.viewport()
  const pics = []
  const shoot = async (f, y) => {
    const { data: png } = await cdp.send("Page.captureScreenshot", { format: "png" })
    const file = `layer-motion-${label}-${String(Math.round(f * 100)).padStart(3, "0")}.png`
    writeFileSync(join(shots, file), Buffer.from(png, "base64"))
    const ink = await inkOf(p, png, 80, vp.height - 90)
    const header = layer ? await headerOverLayer(p, png, y ?? 0) : null
    pics.push({ at: f, top: y === null ? null : Math.round(y), ink, header: header ? header.bad : null })
  }
  /* The first frame, taken while the move is held there (a paused move set back to its start is not always drawn there again). */
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const heldAtStart = await p.evaluate((which) => document.getAnimations().some((a) => a.effect?.pseudoElement === which && (a.playState === "paused" || a.playbackRate === 0) && (a.currentTime ?? 0) === 0), which)
  if (heldAtStart) await shoot(0, /new/.test(which) ? vp.height : 0)
  const info = await p.evaluate((which) => {
    const all = document.getAnimations().filter((a) => a.effect?.pseudoElement?.startsWith("::view-transition"))
    for (const a of all) a.pause()
    const moving = all.find((a) => a.effect.pseudoElement === which)
    return {
      names: all.map((a) => `${a.effect.pseudoElement} ${a.animationName ?? ""}`),
      dur: moving ? Number(moving.effect.getTiming().duration) : 0,
      easing: moving ? getComputedStyle(document.documentElement, which).animationTimingFunction || moving.effect.getTiming().easing : null,
      frames: moving ? moving.effect.getKeyframes().map((k) => k.transform ?? null) : [],
      motion: document.documentElement.dataset.layerMotion ?? null,
    }
  }, which)
  const out = { ready: true, ...info, shots: pics }
  for (const f of heldAtStart ? [0.25, 0.5, 0.75, 0.9, 1] : [0, 0.25, 0.5, 0.75, 0.9, 1]) {
    const y = await p.evaluate(
      (ms, which) => {
        let y = null
        for (const a of document.getAnimations()) {
          if (!a.effect?.pseudoElement?.startsWith("::view-transition")) continue
          a.pause()
          a.currentTime = ms
          if (a.effect.pseudoElement === which) {
            let p = a.effect.getComputedTiming().progress ?? 0
            const m = /cubic-bezier\(([^)]+)\)/.exec(a.effect.getKeyframes()[0]?.easing || "")
            if (m) {
              const [x1, y1, x2, y2] = m[1].split(",").map(Number)
              const bx = (t) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t
              const by = (t) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t
              let lo = 0
              let hi = 1
              for (let i = 0; i < 30; i++) {
                const mid = (lo + hi) / 2
                if (bx(mid) < p) lo = mid
                else hi = mid
              }
              p = by((lo + hi) / 2)
            }
            y = /new/.test(which) ? (1 - p) * innerHeight : p * innerHeight
          }
        }
        return y
      },
      f * out.dur,
      which,
    )
    /* Two frames for the paused position to reach the screen: the first capture otherwise shows where the move was when it was paused. */
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    await shoot(f, y)
  }
  await p.evaluate(() => {
    window.__freeze = false
    Animation.prototype.play = window.__play
    Object.defineProperty(Animation.prototype, "playbackRate", window.__rate)
    for (const a of document.getAnimations()) if (a.playbackRate === 0) a.playbackRate = 1
    for (const a of document.getAnimations()) if (a.effect?.pseudoElement?.startsWith("::view-transition")) a.play()
  })
  await waitMove(p, n)
  return out
}

/* ── The trips ────────────────────────────────────────────────────────── */

const EDITOR_BACK = "[data-editor-bar] [data-leave-button]"
const LAYER_UP = "[data-page-layer]"

async function productsTrip(p, cdp, label, { isNew }) {
  const trip = isNew ? "new" : "edit"
  console.log(`  -- products list -> ${isNew ? "New product -> Cancel" : "a product -> Back"}`)
  await scrollListTo(p, isNew ? 0 : 420)
  const before = await scrollOf(p)
  const open = isNew ? "[data-new-product]" : "[data-row]:not([hidden]) a[data-row-link]"
  if (!isNew) {
    /* The row in the middle of the screen, so the scroll has something to keep. */
    await p.evaluate(() => {
      const rows = [...document.querySelectorAll("[data-row]:not([hidden])")].filter((r) => {
        const b = r.getBoundingClientRect()
        return b.height > 0 && b.top > 200 && b.bottom < innerHeight - 120
      })
      rows[0]?.querySelector("a[data-row-link]")?.setAttribute("data-probe-pick", "")
    })
  }
  /* Round 41: New product asks first, in a sheet (app/(storelib)/app/products/new/kind-chooser.tsx); the editor rises from the pick, once the sheet has gone. */
  const chooseKind = async () => {
    await p.touchscreen.tap(...Object.values(await p.$eval("[data-new-product]", (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })))
    await p.waitForSelector("[data-new-product-chooser] [data-kind]")
    await sleep(600)
  }
  if (isNew) await chooseKind()
  const openSel = isNew ? "[data-new-product-chooser] [data-kind]" : "a[data-probe-pick]"
  const up = await timedMove(p, cdp, { sel: openSel, pressed: isNew ? "[data-new-product-chooser] [data-kind][data-layer-press], [data-new-product-chooser] [data-kind]" : "[data-row][data-layer-press], [data-row][data-opening]", kind: "enter" })
  const onScreen = await p.evaluate(() => ({ layer: !!document.querySelector("[data-page-layer]"), motion: document.documentElement.dataset.layerMotion ?? null, path: window.__path }))
  report(`${trip} in`, up, "enter")
  expect(onScreen.layer && onScreen.motion === null, "the editor is up, and the move has cleaned up after itself", onScreen)

  /* The way back is played by the layer itself in every engine now, at the commit that brings the list (page-layer dropAtCommit): measured as a move by hand. */
  const down = await timedMove(p, cdp, { sel: EDITOR_BACK, pressed: `${EDITOR_BACK}[data-leaving]`, kind: "hand-leave" })
  report(`${trip} back`, down, "hand-leave")
  await sleep(200)
  const after = await scrollOf(p)
  const back = await p.evaluate(() => ({ layer: !!document.querySelector("[data-page-layer]"), path: window.__path }))
  expect(!back.layer && back.path === "/app/products", "Back leaves the list on the screen", back)
  expect(Math.abs(after.outer - before.outer) <= 2 && Math.abs(after.inner - before.inner) <= 2, "the list is where it was left", { before, after })

  /* Frozen, for the pictures: in, then out. */
  if (isNew) await chooseKind()
  const shotIn = await frozenMove(p, cdp, { sel: openSel === "a[data-probe-pick]" ? "[data-row]:not([hidden]) a[data-row-link]" : openSel, label: `${trip}-in-${label}`, layer: true, which: "::view-transition-new(page-layer)" })
  pictures(`${trip} in`, shotIn, "enter")
  await sleep(250)
  await handShot(p, cdp, EDITOR_BACK, `${trip}-back-${label}`, "drop")
  await sleep(250)
}

function report(name, r, kind) {
  console.log(`        (${name}: ${JSON.stringify({ move: r.move, held: r.held, frames: r.frames, firstGap: r.firstGap, median: r.median, p95: r.p95, onTime: r.onTime, maxGap: r.maxGap, dropped: r.dropped, partway: r.partway, shift: r.shift, props: r.props, long: r.long, latency: r.latency, compositor: r.compositor })})`)
  console.log(`        (${name} translateY by frame: ${r.ys.join(" ")})`)
  /*
    WHAT EACH KIND IS HELD TO. A view transition freezes both pages into
    pictures and nothing of either can draw again while it runs, so those
    moves, and an order's (its pane is the only thing moving), drop nothing at
    all. A move played by hand has a LIVE page inside it. Going back that is
    the list committing under a still that is the only thing drawing, and it
    drops nothing either. Coming in it is the product editor, the biggest page
    in the app, rendering for the first time in the same frames as the move:
    on the saved product three or four of its sixteen frames arrive a frame
    late. So the way in is held to most of its frames arriving on time, which
    is what the eye reads as motion, rather than to all of them.
  */
  const hand = kind.startsWith("hand")
  const bar = kind === "hand-enter" ? { p95: 50, onTime: 0.6 } : { p95: 34, onTime: 0.9 }
  expect(r.props.length > 0 && r.props.every((k) => k === "transform" || k === "opacity"), `${name}: transform and opacity only, nothing that lays the page out`, r.props)
  expect(r.median !== null && r.median <= 20 && r.p95 <= bar.p95, `${name}: frame times at ${THROTTLE}x slower CPU (median, 95th, ms)`, { median: r.median, p95: r.p95 })
  expect(r.shift === 0, `${name}: no layout shift inside the move`, r.shift)
  if (!kind.startsWith("order") && !hand) expect(!!r.move?.ready && !r.move.skipped, `${name}: one move, started at the commit`, r.move)
  const dir = kind === "leave" || kind === "order-back" || kind === "hand-leave" ? 1 : -1
  const mono = r.ys.every((y, i) => i === 0 || (y - r.ys[i - 1]) * dir >= -1)
  expect(r.partway >= 8 && mono, `${name}: from the bottom edge and back to it, on translateY alone, ${r.partway} frames part way, never backwards`, { partway: r.partway, first: r.ys[0], last: r.ys[r.ys.length - 1] })
  if (hand) {
    expect(r.onTime !== null && r.onTime >= bar.onTime, `${name}: ${Math.round(bar.onTime * 100)}% of its frames or more on time at ${THROTTLE}x slower CPU (a live page draws inside this move)`, { onTime: r.onTime, dropped: r.dropped, maxGap: r.maxGap })
  } else {
    expect(r.dropped === 0, `${name}: no dropped frame after the first at ${THROTTLE}x slower CPU`, { dropped: r.dropped, maxGap: r.maxGap, firstGap: r.firstGap })
  }
  if (kind === "hand-enter") {
    /* The editor's own first render is the long task here, and it is the page's, not the move's: what matters is that it never stops the move for longer than a frame or two, which the frame times above say. */
    expect(r.long.every((d) => d < 120), `${name}: the page's own first render never stops the main thread for longer than two frames`, r.long)
  } else {
    expect(r.long.length === 0, `${name}: no long task on the main thread while it moves`, r.long)
  }
  expect(r.latency !== null && r.latency <= 50, `${name}: the press shows on the next frames (finger to pressed look, ms, ${THROTTLE}x CPU)`, r.latency)
}

function pictures(name, s, kind) {
  if (!s.ready) return expect(false, `${name}: the frozen move started`, s)
  console.log(`        (${name}: ${s.names.join(", ")}; ${s.dur}ms; ${JSON.stringify(s.frames)})`)
  const want = kind === "enter" ? /translateY\(100%\)/ : /translateY\(100%\)/
  expect(want.test(JSON.stringify(s.frames)) && !/translateX/.test(JSON.stringify(s.frames)), `${name}: to and from translateY(100%), never sideways`, s.frames)
  expect(s.dur >= 280 && s.dur <= 380, `${name}: 280 to 380ms`, s.dur)
  expect(s.shots.every((f) => f.ink > 0.01), `${name}: a page in every frame (ink in the page area)`, s.shots.map((f) => f.ink))
  expect(s.shots.every((f) => !f.header), `${name}: the black header never shows where the layer already is`, s.shots.map((f) => ({ at: f.at, top: f.top, header: f.header })))
}

/*
  ===========================================================================
   THE SAME TRIPS WITH NO VIEW TRANSITIONS
  ===========================================================================
  WebKit had none before Safari 18, and in that engine the editor used to
  appear and, on Cancel, vanish in one frame: "not direct" is exactly what
  the owner was looking at. Now page-layer.tsx plays the move itself there,
  on the layer's own box coming in and on a still copy of the editor going
  back, and these trips measure that move by the same numbers as the
  transition's: every frame, the distribution of the frame times, the long
  tasks, the layout shift, and what is animated.
*/

/** One picture of a move played by hand, caught part way and held there. */
async function handShot(p, cdp, sel, label, which) {
  await p.$eval(sel, (el) => el.click())
  /*
    Caught where it is part way, not after a fixed wait: the move is held at
    its first position until the screen keeps up (page-layer
    startWhenFramesFlow), so how long that is depends on the page.
  */
  let at = null
  for (let i = 0; i < 120; i++) {
    at = await p.evaluate(() => {
      const a = document.getAnimations().find((x) => {
        const t = x.effect?.target
        return !x.effect?.pseudoElement && t?.hasAttribute && (t.hasAttribute("data-page-layer") || t.hasAttribute("data-layer-still")) && x.effect.getKeyframes().some((k) => k.transform)
      })
      if (!a) return null
      const m = new DOMMatrixReadOnly(getComputedStyle(a.effect.target).transform)
      const top = +m.m42.toFixed(1)
      if (top <= 40 || top >= innerHeight - 40) return { top, waiting: true }
      a.pause()
      return { top, stills: document.querySelectorAll("[data-layer-still]").length }
    })
    if (at && !at.waiting) break
    await sleep(16)
  }
  if (!at || at.waiting) return expect(false, `${label}: a move to photograph, caught part way`, at)
  /* Two frames for the held position to reach the screen. */
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const { data: png } = await cdp.send("Page.captureScreenshot", { format: "png" })
  writeFileSync(join(shots, `layer-motion-${label}.png`), Buffer.from(png, "base64"))
  const vp = p.viewport()
  const ink = await inkOf(p, png, 80, vp.height - 90)
  const header = await headerOverLayer(p, png, at.top)
  expect(at.top > 40 && at.top < vp.height - 40, `${label}: caught part way, ${Math.round(at.top)}px from its place, one still up`, at)
  expect(at.stills === 1, `${label}: one still under or over the move, never two`, at.stills)
  expect(ink > 0.01, `${label}: a page in the frame (ink in the page area)`, ink)
  expect(header.bad === 0, `${label}: the black header never shows where the layer already is`, header)
  await p.evaluate(() => {
    for (const a of document.getAnimations()) if (a.playState === "paused") a.play()
  })
  await sleep(800)
}

async function handTrip(p, cdp, label, { isNew }) {
  const trip = isNew ? "new" : "edit"
  console.log(`  -- products list -> ${isNew ? "New product -> Cancel" : "a product -> Back"}, with no view transitions`)
  await scrollListTo(p, isNew ? 0 : 420)
  const before = await scrollOf(p)
  if (!isNew) {
    await p.evaluate(() => {
      const rows = [...document.querySelectorAll("[data-row]:not([hidden])")].filter((r) => {
        const b = r.getBoundingClientRect()
        return b.height > 0 && b.top > 200 && b.bottom < innerHeight - 120
      })
      rows[0]?.querySelector("a[data-row-link]")?.setAttribute("data-probe-pick", "")
    })
  }
  const openSel = isNew ? "[data-new-product]" : "a[data-probe-pick]"
  const up = await timedMove(p, cdp, {
    sel: openSel,
    pressed: isNew ? "[data-new-product][data-layer-press]" : "[data-row][data-layer-press], [data-row][data-opening]",
    kind: "hand-enter",
  })
  report(`${trip} in by hand`, up, "hand-enter")
  const onScreen = await p.evaluate(() => ({
    layer: !!document.querySelector("[data-page-layer]"),
    motion: document.documentElement.dataset.layerMotion ?? null,
    hand: document.documentElement.dataset.layerHand ?? null,
    stills: document.querySelectorAll("[data-layer-still]").length,
    transform: getComputedStyle(document.querySelector("[data-page-layer]")).transform,
  }))
  expect(
    onScreen.layer && onScreen.motion === null && onScreen.hand === null && onScreen.stills === 0 && onScreen.transform === "none",
    "the editor is up at rest, and the move has left no still and no mark behind",
    onScreen,
  )

  const down = await timedMove(p, cdp, { sel: EDITOR_BACK, pressed: `${EDITOR_BACK}[data-leaving]`, kind: "hand-leave" })
  report(`${trip} back by hand`, down, "hand-leave")
  await sleep(350)
  const after = await scrollOf(p)
  const back = await p.evaluate(() => ({
    layer: !!document.querySelector("[data-page-layer]"),
    path: window.__path,
    stills: document.querySelectorAll("[data-layer-still]").length,
    motion: document.documentElement.dataset.layerMotion ?? null,
    /* The still is fixed with its overflow hidden: it can never have added height to the page. */
    overflow: Math.max(0, document.documentElement.scrollHeight - innerHeight),
  }))
  expect(
    !back.layer && back.path === "/app/products" && back.stills === 0 && back.motion === null && back.overflow === 0,
    `${isNew ? "Cancel" : "Back"} leaves the list on the screen, with nothing of the move left and no height added`,
    back,
  )
  expect(Math.abs(after.outer - before.outer) <= 2 && Math.abs(after.inner - before.inner) <= 2, "the list is where it was left", { before, after })

  /* The row is a new element after the trip back: picked again for the picture. */
  if (!isNew) {
    await p.evaluate(() => {
      const rows = [...document.querySelectorAll("[data-row]:not([hidden])")].filter((r) => {
        const b = r.getBoundingClientRect()
        return b.height > 0 && b.top > 200 && b.bottom < innerHeight - 120
      })
      rows[0]?.querySelector("a[data-row-link]")?.setAttribute("data-probe-pick", "")
    })
  }
  await handShot(p, cdp, openSel, `${trip}-in-hand-${label}`, "rise")
  await sleep(250)
  await handShot(p, cdp, EDITOR_BACK, `${trip}-back-hand-${label}`, "drop")
  await sleep(250)
}

/*
  A SLOW EDITOR, BY HAND. "Sometimes it loads for 5 seconds, then the page
  appears with a delay, very abruptly." With the editor SLOW_EDITOR_MS away,
  every frame from the press is sampled: the layer must arrive at the bottom
  edge and rise (frames part way up), never be first seen already in place.
*/
const SLOW_EDITOR_MS = 2500
async function slowHandTrip(p, label) {
  console.log(`  -- products list -> a product ${SLOW_EDITOR_MS}ms away, with no view transitions`)
  await scrollListTo(p, 0)
  await p.evaluate((ms) => {
    window.__slowMs = ms
    const rows = [...document.querySelectorAll("[data-row]:not([hidden])")].filter((r) => {
      const b = r.getBoundingClientRect()
      return b.height > 0 && b.top > 200 && b.bottom < innerHeight - 120
    })
    rows[0]?.querySelector("a[data-row-link]")?.setAttribute("data-probe-slow", "")
  }, SLOW_EDITOR_MS)
  await p.evaluate(() => {
    window.__slow = []
    const t0 = performance.now()
    const tick = () => {
      const layer = document.querySelector("[data-page-layer]")
      let y = null
      if (layer) {
        const r = layer.getBoundingClientRect()
        y = Math.round(r.top)
      }
      window.__slow.push({ t: Math.round(performance.now() - t0), y })
      if (performance.now() - t0 < 5000) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const box = await p.$eval("a[data-probe-slow]", (el) => {
    const b = el.getBoundingClientRect()
    return { x: b.left + Math.min(b.width / 2, 60), y: b.top + b.height / 2 }
  })
  await p.touchscreen.tap(box.x, box.y)
  await sleep(5300)
  const frames = await p.evaluate(() => window.__slow)
  const seen = frames.filter((f) => f.y !== null)
  const first = seen[0]
  const partWay = seen.filter((f) => f.y > 2).length
  const ys = seen.map((f) => f.y)
  const falling = ys.some((y, i) => i > 0 && y > ys[i - 1] + 1)
  console.log(`  slow editor ${label}: first seen at ${first?.t}ms, ${first?.y}px from its place; ${partWay} frames part way up; y ${ys.slice(0, 12).join(" ")}...`)
  expect(!!first && first.t >= SLOW_EDITOR_MS - 50, `${label}: the list stays while the editor is on its way (${first?.t}ms)`, first)
  expect(!!first && first.y > 100 && partWay >= 5 && !falling, `${label}: the slow editor rises from the bottom edge when it lands, not in one frame`, { first, partWay, falling })
  await p.evaluate(() => { window.__slowMs = 0 })
  await p.tap(EDITOR_BACK).catch(() => {})
  await sleep(1200)
}

const COMPOSER_BACK = "button[aria-label='Back to emails']"

async function emailsTrip(p, cdp, label) {
  console.log(`  -- emails -> New email -> the composer's Back (app/(storelib)/app/emails/layer-nav.ts)`)
  await p.evaluate(() => window.__navigate("/app/emails"))
  await sleep(700)
  const up = await timedMove(p, cdp, { sel: "[data-new-email]", pressed: "[data-new-email][data-layer-press]", kind: "enter" })
  report("composer in", up, "enter")
  await sleep(700)
  const onScreen = await p.evaluate(() => ({ layer: !!document.querySelector("[data-page-layer]"), path: window.__path, back: !!document.querySelector("button[aria-label='Back to emails']") }))
  expect(onScreen.layer && onScreen.back && onScreen.path === "/app/emails/new", "the composer is up, as a layer, with its Back", onScreen)
  const down = await timedMove(p, cdp, { sel: COMPOSER_BACK, pressed: `${COMPOSER_BACK}[data-layer-press]`, kind: "hand-leave" })
  report("composer back", down, "hand-leave")
  await sleep(300)
  const back = await p.evaluate(() => ({ layer: !!document.querySelector("[data-page-layer]"), path: window.__path }))
  expect(!back.layer && back.path === "/app/emails", "Back leaves the Emails page on the screen", back)
  const shotIn = await frozenMove(p, cdp, { sel: "[data-new-email]", label: `email-in-${label}`, layer: true, which: "::view-transition-new(page-layer)" })
  pictures("composer in", shotIn, "enter")
  await sleep(900)
  await handShot(p, cdp, COMPOSER_BACK, `email-back-${label}`, "drop")
  await sleep(300)
}

async function ordersTrip(p, cdp, label) {
  console.log(`  -- orders list -> an order -> Back`)
  await scrollListTo(p, 500)
  const before = await scrollOf(p)
  await p.evaluate(() => {
    const rows = [...document.querySelectorAll("tr[data-order-id]")].filter((r) => {
      const b = r.getBoundingClientRect()
      return b.height > 0 && b.top > 220 && b.bottom < innerHeight - 120
    })
    rows[0]?.querySelector("td:nth-child(3)")?.setAttribute("data-probe-pick", "")
  })
  const up = await timedMove(p, cdp, { sel: "[data-probe-pick]", pressed: "tr[data-picked]", kind: "order" })
  report("order in", up, "order")
  const shown = await p.evaluate(() => {
    const d = document.querySelector(".orders-detail")
    const b = d?.getBoundingClientRect()
    return { open: !!d && !d.hasAttribute("data-leaving"), top: b ? Math.round(b.top) : null, transform: d ? getComputedStyle(d).transform : null }
  })
  expect(shown.open && shown.transform === "none" && shown.top >= 68, "the order is up, under the header, and at rest", shown)
  const down = await timedMove(p, cdp, { sel: "button[aria-label='Back to orders']", pressed: "tr[data-picked]", kind: "order" })
  report("order back", down, "order-back")
  await sleep(250)
  const after = await scrollOf(p)
  const gone = await p.evaluate(() => !document.querySelector(".orders-detail"))
  expect(gone, "Back takes the order away once it is down", gone)
  expect(Math.abs(after.outer - before.outer) <= 2 && Math.abs(after.inner - before.inner) <= 2, "the list is where it was left", { before, after })
  /* A still, part way up, for the eye. */
  await p.$eval("[data-probe-pick]", (el) => el.click())
  await sleep(90)
  await p.evaluate(() => document.querySelector(".orders-detail")?.getAnimations().forEach((a) => a.pause()))
  await p.screenshot({ path: join(shots, `layer-motion-order-in-${label}-part.png`) })
  await p.evaluate(() => document.querySelector(".orders-detail")?.getAnimations().forEach((a) => a.play()))
  await sleep(500)
  await p.$eval("button[aria-label='Back to orders']", (el) => el.click())
  await sleep(600)
}

async function slowTrips(p, cdp) {
  console.log(`  -- the editor 700ms away: the row answers, a spinner turns while the list stays live, and the rise plays when it is ready`)
  const readSpin = (scope) =>
    p.evaluate((scope) => {
      const b = document.querySelector(scope)
      const spin = b?.querySelector("[data-activity-spinner]")
      const a = spin?.getAnimations()[0]
      let o = spin
      let opacity = 1
      while (o && o !== b) {
        opacity *= +getComputedStyle(o).opacity
        o = o.parentElement
      }
      return { spinner: spin ? +opacity.toFixed(2) : null, state: a ? a.playState : null, t: a ? a.currentTime : null, layer: !!document.querySelector("[data-page-layer]"), moves: window.__moves.length }
    }, scope)
  await p.evaluate(() => {
    window.__slowMs = 700
    const rows = [...document.querySelectorAll("[data-row]:not([hidden])")].filter((r) => r.getBoundingClientRect().top > 200 && r.getBoundingClientRect().bottom < innerHeight - 120)
    rows[0].setAttribute("data-probe-slow", "")
  })
  let n = await moveCount(p)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  const box = await p.$eval("[data-probe-slow] a[data-row-link]", (el) => {
    const b = el.getBoundingClientRect()
    return { x: b.left + 60, y: b.top + b.height / 2 }
  })
  await p.touchscreen.tap(box.x, box.y)
  await sleep(260)
  const a1 = await readSpin("[data-probe-slow]")
  await sleep(120)
  const a2 = await readSpin("[data-probe-slow]")
  expect(!a1.layer && a1.moves === n, "the list stays live while the editor is on its way: nothing frozen, no picture taken yet", a1)
  expect(a1.spinner > 0.9 && a1.state === "running" && a2.t > a1.t, "the pressed row holds a spinner, turning", { a1, a2 })
  let m = await waitMove(p, n, 3000)
  expect(!!m?.ready && !m.skipped && m.done - m.ready > 250, "and the editor rises once it is ready", m && { ms: +(m.done - m.ready).toFixed(0) })

  /*
    Changed on purpose. The way back used to take a view transition's
    picture and let it go the moment a popstate brought no page, so a list
    that had to be fetched again replaced the editor in one frame: the
    "abrupt, direct" close. Now nothing is photographed; the editor stays
    live with its spinner for as long as the list takes, and drops from
    where it is, over the list, in the commit that brings it.
  */
  /*
    Changed on purpose (round 41): "the editor holds before dropping". The
    press that opened the editor kept a copy of the list (page-layer, THE
    PAGE A LAYER WAS OPENED FROM), so Back drops the editor itself at once,
    over that copy, and the list is drawn once it has landed; the copy goes
    in the commit that brings the list. It used to stand live with a spinner
    until the list came, and only then drop.
  */
  console.log(`  -- the list 700ms away: Back drops the editor at once over a copy of the list, and the list takes the copy's place when it comes`)
  n = await moveCount(p)
  await p.evaluate(() => {
    window.__slowDrop = []
    const t0 = performance.now()
    const tick = () => {
      const layer = document.querySelector("[data-page-layer]")
      const copy = document.querySelector('[data-layer-still="page"]')
      window.__slowDrop.push({
        t: Math.round(performance.now() - t0),
        layer: !!layer,
        copy: !!copy,
        list: !!document.querySelector("[data-new-product]:not([data-layer-still] *)"),
        y: layer ? Math.round(new DOMMatrixReadOnly(getComputedStyle(layer).transform).m42) : null,
      })
      if (performance.now() - t0 < 2200) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await p.$eval(EDITOR_BACK, (el) => el.click())
  await sleep(2300)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const slow = await p.evaluate(() => window.__slowDrop)
  const vts = (await moveCount(p)) - n
  expect(vts === 0, "no view transition is started for the way back: nothing is photographed and let go", vts)
  const firstMoved = slow.find((f) => f.layer && f.y > 2)
  const partWay = slow.filter((f) => f.layer && f.y > 2 && f.y < 842).length
  const listAt = slow.find((f) => f.list)
  const bare = slow.filter((f) => !f.list && !f.copy && !(f.layer && f.y < 2))
  console.log(`        (the editor off the top at ${firstMoved?.t}ms, ${partWay} frames part way; the list drawn at ${listAt?.t}ms; drop y ${slow.filter((f) => f.layer).map((f) => f.y).join(" ")})`)
  expect(!!firstMoved && firstMoved.t <= 250 && partWay >= 5, "Back drops the editor at once, over several frames, without waiting for the list", { at: firstMoved?.t, partWay })
  expect(!!listAt && slow.filter((f) => f.t < listAt.t && !f.layer).every((f) => f.copy), "until the list is drawn, the copy of it is what the editor drops over", { listAt: listAt?.t })
  expect(bare.length === 0, "no frame with neither the editor, the list nor its copy", bare.slice(0, 3))
  const landed = await p.evaluate(() => ({ path: window.__path, layer: !!document.querySelector("[data-page-layer]"), stills: document.querySelectorAll("[data-layer-still]").length }))
  expect(landed.path === "/app/products" && !landed.layer && landed.stills === 0, "and the list is left on the screen", landed)
  await p.evaluate(() => {
    window.__slowMs = 0
  })
  await sleep(200)
}

async function seoFold(p, label) {
  console.log(`  -- the search engine listing folds open in the card`)
  await p.evaluate(() => document.querySelector("[data-seo-card]")?.scrollIntoView({ block: "center" }))
  await sleep(250)
  const read = () =>
    p.evaluate(() => {
      const card = document.querySelector("[data-seo-card]")
      const fields = document.querySelector("[data-seo-fields]")
      const title = card?.querySelector("h2")
      return {
        cardTop: card ? +card.getBoundingClientRect().top.toFixed(1) : null,
        titleTop: title ? +title.getBoundingClientRect().top.toFixed(1) : null,
        height: fields ? +fields.getBoundingClientRect().height.toFixed(1) : null,
        inert: fields?.inert ?? null,
        dialogs: [...document.querySelectorAll("[role=dialog], [data-app-sheet='open']")].filter((d) => d.getBoundingClientRect().height > 0 && getComputedStyle(d).visibility !== "hidden").length,
      }
    })
  const closed = await read()
  await p.evaluate(() => {
    window.__fold = []
    window.__foldOn = true
    const fields = document.querySelector("[data-seo-fields]")
    const card = document.querySelector("[data-seo-card]")
    const tick = () => {
      if (!window.__foldOn) return
      window.__fold.push({ h: +fields.getBoundingClientRect().height.toFixed(1), top: +card.getBoundingClientRect().top.toFixed(1), t: performance.now() })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    document.querySelector("[data-seo-edit]").click()
  })
  await sleep(500)
  const open = await read()
  const fold = await p.evaluate(() => {
    window.__foldOn = false
    return window.__fold
  })
  await p.screenshot({ path: join(shots, `layer-motion-seo-open-${label}.png`) })
  const heights = fold.map((f) => f.h)
  const partway = heights.filter((h) => h > 1 && h < open.height - 1).length
  const grows = heights.every((h, i) => i === 0 || h >= heights[i - 1] - 0.5)
  /* The card's top may move only by the page scrolling to show its foot: measured against the frames before any scroll. */
  const titleSteady = fold.slice(0, Math.max(2, fold.findIndex((f) => f.h >= open.height - 1))).every((f) => Math.abs(f.top - fold[0].top) < 0.5)
  expect(closed.height === 0 && closed.inert === true, "closed: no height, and inert (the Tab key skips it)", closed)
  expect(open.dialogs === 0, "no dialog and no sheet: the fields are in the card", open.dialogs)
  expect(open.height > 150 && open.inert === false, "open: the fields' own height, and reachable", open)
  expect(partway >= 6 && grows, "it grows frame by frame, never back", { partway, frames: heights.length, heights: heights.slice(0, 24) })
  expect(titleSteady, "nothing above the fields moves while they open (the card's top holds until they have their height)", fold.slice(0, 12).map((f) => f.top))
  const focus = await p.evaluate(() => {
    document.getElementById("seoTitle")?.focus()
    return document.activeElement?.id
  })
  expect(focus === "seoTitle", "the SEO title field takes focus", focus)
  await p.evaluate(() => document.querySelector("[data-seo-edit]").click())
  await sleep(120)
  const mid = await read()
  await sleep(400)
  const shut = await read()
  expect(mid.height > 1 && mid.height < open.height && shut.height === 0 && shut.inert === true, "and it folds away the same way", { mid: mid.height, shut: shut.height, inert: shut.inert })
}

/* ── Run ─────────────────────────────────────────────────────────────── */

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  const widths = process.env.ONLY ? process.env.ONLY.split(",").map(Number) : [360, 390, 430]
  for (const width of widths) {
    const label = `${width}`
    console.log(`\nphone ${width}`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    p.on("dialog", (d) => d.accept().catch(() => {}))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("data:")) return r.continue()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      /* The page for an /app address and a small "not here" for anything else (the favicon the browser asks for): answered with the page, a 3MB reply was decoded inside a move. */
      if (!u.startsWith("http://probe.test/app") && u.startsWith("http://probe.test/") && !u.startsWith("http://probe.test/__file")) return r.respond({ status: 404, contentType: "application/json", body: "{}" })
      if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("file:")) return r.continue()
      r.abort()
    })
    await p.setViewport({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: Number(process.env.DPR ?? 2) })
    const cdp = await p.createCDPSession()
    await p.goto("http://probe.test/app/products")
    await sleep(1200)
    if (errors.length) fail(`The page threw: ${errors[0]}`)

    await productsTrip(p, cdp, label, { isNew: false })
    await productsTrip(p, cdp, label, { isNew: true })
    if (width === 390) {
      await slowTrips(p, cdp)
      await p.evaluate(() => {
        const a = [...document.querySelectorAll("[data-row]:not([hidden]) a[data-row-link]")].find((x) => x.getBoundingClientRect().height > 0)
        a.click()
      })
      await sleep(900)
      await seoFold(p, label)
    }
    await emailsTrip(p, cdp, label)
    await p.evaluate(() => window.__navigate("/app/orders"))
    await sleep(900)
    await ordersTrip(p, cdp, label)
    if (errors.length) expect(false, "nothing threw", errors)
    await p.close()
  }

  console.log(`\ndesktop 1280`)
  {
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("data:")) return r.continue()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      /* The page for an /app address and a small "not here" for anything else (the favicon the browser asks for): answered with the page, a 3MB reply was decoded inside a move. */
      if (!u.startsWith("http://probe.test/app") && u.startsWith("http://probe.test/") && !u.startsWith("http://probe.test/__file")) return r.respond({ status: 404, contentType: "application/json", body: "{}" })
      if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: html })
      r.abort()
    })
    await p.setViewport({ width: 1280, height: 800 })
    await p.goto("http://probe.test/app/products")
    await sleep(1200)
    const n = await moveCount(p)
    await p.evaluate(() => {
      const r = [...document.querySelectorAll("[data-row]:not([hidden])")].find((x) => x.getBoundingClientRect().height > 0)
      if (r.tagName === "TR") r.querySelector("td:nth-child(2)").click()
      else r.querySelector("a").click()
    })
    await sleep(700)
    const wide = await p.evaluate(() => ({
      layer: !!document.querySelector("[data-page-layer]"),
      fixed: getComputedStyle(document.querySelector("[data-page-layer]")).position,
      layerAnims: window.__lastLayerAnims ?? 0,
      motion: document.documentElement.dataset.layerMotion ?? null,
    }))
    const m = n < (await moveCount(p)) ? await p.evaluate((n) => window.__moves[n], n) : null
    expect(wide.layer && wide.fixed !== "fixed" && wide.motion === null && (!m || !m.done || m.done - m.ready < 60), "at 1280 the editor is a page in the shell and nothing rises: a transition, if any, swaps in a frame", { ...wide, move: m && { ms: m.done && m.ready ? +(m.done - m.ready).toFixed(0) : null } })
    await seoFold(p, "1280")
    if (errors.length) expect(false, "nothing threw", errors)
    await p.close()
  }

  console.log(`\nphone 390, reduced motion`)
  {
    const p = await browser.newPage()
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("data:")) return r.continue()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      /* The page for an /app address and a small "not here" for anything else (the favicon the browser asks for): answered with the page, a 3MB reply was decoded inside a move. */
      if (!u.startsWith("http://probe.test/app") && u.startsWith("http://probe.test/") && !u.startsWith("http://probe.test/__file")) return r.respond({ status: 404, contentType: "application/json", body: "{}" })
      if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: html })
      r.abort()
    })
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    await p.goto("http://probe.test/app/products")
    await sleep(1200)
    await p.evaluate(() => {
      window.__layerAnims = 0
      const tick = () => {
        window.__layerAnims += document.getAnimations().filter((a) => /page-layer/.test(a.effect?.pseudoElement || "") && a.animationName !== "none").length
        if (window.__layerAnims < 1000) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      const a = [...document.querySelectorAll("[data-row]:not([hidden]) a[data-row-link]")].find((x) => x.getBoundingClientRect().height > 0)
      a.click()
    })
    await sleep(700)
    const still = await p.evaluate(() => ({ layer: !!document.querySelector("[data-page-layer]"), anims: window.__layerAnims }))
    expect(still.layer && still.anims === 0, "with reduced motion the editor is simply there: nothing rises", still)
    await p.close()
  }
  console.log(`\nphone 390, no view transitions (WebKit before Safari 18)`)
  {
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    p.on("dialog", (d) => d.accept().catch(() => {}))
    /* The engine WebKit was before Safari 18: no startViewTransition at all, so neither React's move nor the layer's own transition can run. */
    await p.evaluateOnNewDocument(() => {
      delete Document.prototype.startViewTransition
    })
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("data:")) return r.continue()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (!u.startsWith("http://probe.test/app") && u.startsWith("http://probe.test/") && !u.startsWith("http://probe.test/__file")) return r.respond({ status: 404, contentType: "application/json", body: "{}" })
      if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("file:")) return r.continue()
      r.abort()
    })
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: Number(process.env.DPR ?? 2) })
    const cdp = await p.createCDPSession()
    await p.goto("http://probe.test/app/products")
    await sleep(1200)
    if (errors.length) fail(`The page threw: ${errors[0]}`)
    const none = await p.evaluate(() => typeof document.startViewTransition)
    expect(none !== "function", "this engine has no view transitions to make the move with", none)
    await handTrip(p, cdp, "390", { isNew: false })
    await handTrip(p, cdp, "390", { isNew: true })
    await slowHandTrip(p, "390 by hand")
    if (errors.length) expect(false, "nothing threw", errors)
    await p.close()
  }

  console.log(`\nphone 390, no view transitions, reduced motion`)
  {
    const p = await browser.newPage()
    await p.evaluateOnNewDocument(() => {
      delete Document.prototype.startViewTransition
    })
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("data:")) return r.continue()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (!u.startsWith("http://probe.test/app") && u.startsWith("http://probe.test/") && !u.startsWith("http://probe.test/__file")) return r.respond({ status: 404, contentType: "application/json", body: "{}" })
      if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: html })
      r.abort()
    })
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    await p.goto("http://probe.test/app/products")
    await sleep(1200)
    await p.evaluate(() => {
      window.__hand = 0
      const tick = () => {
        window.__hand += document.getAnimations().filter((a) => {
          const t = a.effect?.target
          return !a.effect?.pseudoElement && t?.hasAttribute && (t.hasAttribute("data-page-layer") || t.hasAttribute("data-layer-still"))
        }).length
        if (window.__hand < 1000) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      const a = [...document.querySelectorAll("[data-row]:not([hidden]) a[data-row-link]")].find((x) => x.getBoundingClientRect().height > 0)
      a.click()
    })
    await sleep(800)
    const still = await p.evaluate(() => ({ layer: !!document.querySelector("[data-page-layer]"), anims: window.__hand, stills: document.querySelectorAll("[data-layer-still]").length }))
    expect(still.layer && still.anims === 0 && still.stills === 0, "with reduced motion the editor is simply there: nothing moves and no still is made", still)
    await p.close()
  }

} finally {
  await browser.close()
  if (!process.env.KEEP) rmSync(join(stubs, "app.js"), { force: true })
}
console.log(`\nScreenshots: ${shots}`)
if (broken) {
  console.error(`\n${broken} check(s) failed.\n`)
  process.exit(1)
}
console.log("\nAll layer motion checks passed.\n")
