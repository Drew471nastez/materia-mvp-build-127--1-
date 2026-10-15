/**
 * ===========================================================================
 *  ROUND 31: THE GLASS UNDER A DRAGGING FINGER, MEASURED
 * ===========================================================================
 * The owner: "the liquid thing as I'm dragging needs to be more flexible, more
 * smooth and clean, more like liquid iOS, because it's too solid and looks
 * really weird."
 *
 * The real buyer tab bar (components/nav/buyer-tab-bar.tsx, its slide in
 * components/nav/tab-lens.tsx), rendered by scripts/render-buyer-tab-bar.tsx
 * on a 390px phone, dragged with touches sent through CDP
 * (Input.dispatchTouchEvent) at three speeds, held, released while still
 * moving, at 1x and at 4x CPU, light and dark. Every frame: the glass's x, its
 * stretch (scaleX, scaleY of `transform`), its lift (`scale`), its opacity,
 * the opacity of its drag layer and where its sheen is. And every finger
 * event's x, in the page's own clock.
 *
 *   FOLLOW    the glass trails a moving finger by a little (a spring, not one
 *             to one), and is under a still finger within a tenth of a second
 *   STRETCH   wider with speed: the faster drag stretches further, the stretch
 *             goes with the glass's speed frame by frame (correlation), and it
 *             is round again (1, 1) once the finger holds still
 *   SMOOTH    no frame jumps: the change of the glass's speed from one frame to
 *             the next stays under a limit, at 1x and at 4x CPU
 *   LANDING   released while moving, it springs onto the slot with exactly one
 *             overshoot past it (0.3px or more), and is still and round within
 *             a settle time
 *   COST      the main thread paints nothing while the finger drags (Paint
 *             events in a devtools trace), the slide's frame loop is not running
 *             once the glass is at rest under a still finger or after it lands,
 *             and only compositor properties animate on the glass
 *   REDUCED   with reduced motion: no stretch, and the glass is where the finger
 *             is on the next frame
 *   PICTURES  light and dark, mid drag and held: SHOTS_DIR (or .lens-round31-shots),
 *             at three times life size, to be looked at
 *
 *   PROBE_CSS=source node scripts/check-lens-round31.mjs
 *
 * BEFORE: BEFORE_DIR=<dir> takes components/nav/tab-lens.tsx and
 * buyer-tab-bar.tsx from that folder instead (the base commit's copies, in a
 * folder inside the checkout, which esbuild can read), to read the same
 * numbers off the previous round. Its verdicts are expected to fail; the
 * numbers are the point. Round 30, measured so: the glass's sharpest change
 * of speed was the finger's own (share 1.0), the stretch sat flat at 0.11
 * for an ordinary drag and a fast one alike, correlated 0.35 to 0.6 with
 * speed, hit the 0.03 squash floor on a stop and took 600ms to be round, and
 * the loop ran every frame under a finger held still.
 *
 * REPS=3 (the default) repeats every drag and judges timing on the median.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const BEFORE = process.env.BEFORE_DIR || null
const shots = process.env.SHOTS_DIR || join(root, ".lens-round31-shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".lens-round31-probe")
mkdirSync(stubs, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const URL_BASE = "https://storelib.com/__lens_round31"

/* ── The page: the bar on a phone, the router stubbed (scripts/check-buyer-tab-bar.mjs) ── */

writeFileSync(join(stubs, "navigation.js"), `import { useSyncExternalStore } from "react"
let path = window.__path || "/explore"
let search = ""
const subs = new Set()
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
/* The address changes too, so nothing that watches location (lib/nav/stuck-navigation.ts) reloads the page under the probe. */
const go = (href) => { const [p, q] = href.split("?"); path = p; search = q ? "?" + q : ""; try { history.pushState(null, "", "/__lens_round31" + p) } catch {} subs.forEach((f) => f()) }
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => { log("push", h); setTimeout(() => go(h), 140) }, replace: (h) => { log("replace", h); go(h) }, prefetch: (h) => log("prefetch", h), back: () => {}, refresh: () => {} }
export const usePathname = () => useSyncExternalStore(subscribe, () => path, () => path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(subscribe, () => search, () => search))
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) e.preventDefault() } }, children) })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
const { build } = await import("esbuild")
const before = BEFORE
  ? [{ name: "before", setup(b) { b.onResolve({ filter: /components\/nav\/(tab-lens|buyer-tab-bar)$/ }, (a) => ({ path: join(BEFORE, `${a.path.split("/").pop()}.tsx`) })) } }]
  : []
await build({
  entryPoints: [join(root, "scripts/render-buyer-tab-bar.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.lens-round31-probe/navigation.js", "next/link": "./.lens-round31-probe/link.jsx", "next/image": "./.lens-round31-probe/image.jsx" },
  plugins: before,
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
rmSync(stubs, { recursive: true, force: true })
const css = await appCss(root)
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><script>if(window.__probeDark)document.documentElement.setAttribute("data-sl-dark","")</script><style>${css}</style><style>${themeCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

/* Every frame, the glass; every finger event, its x; and how many times the slide's frame loop (useSlide's `step`) asked for a frame. */
const RECORDER = () => {
  window.__rec = { on: false, frames: [], fingers: [], loopFrames: 0, props: new Set() }
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => {
    if (cb && cb.name === "step") window.__rec.loopFrames++
    return raf(cb)
  }
  for (const type of ["pointerdown", "pointermove", "pointerup"]) {
    window.addEventListener(type, (e) => {
      if (!window.__rec.on) return
      window.__rec.fingers.push({ t: performance.now(), x: e.clientX, type })
      /* The lift, marked in the trace at the moment it reaches the page: the paints before it are the drag's. */
      if (type === "pointerup") console.timeStamp("lens-up")
    }, { capture: true, passive: true })
  }
  /* Stamped with the frame's own time, the one the slide's loop is handed, not the moment this callback happens to run. */
  const frame = (ts) => {
    const r = window.__rec
    if (r.on) {
      const el = document.querySelector("[data-buyer-tabs-lens]")
      if (el) {
        const cs = getComputedStyle(el)
        const m = /matrix\(([^)]+)\)/.exec(cs.transform)
        const mv = m ? m[1].split(",").map(Number) : [1, 0, 0, 1, 0, 0]
        const glass = el.querySelector("[data-buyer-tabs-lens-glass]")
        const sheen = el.querySelector("[data-lens-sheen]")
        for (const a of el.getAnimations({ subtree: true })) r.props.add(a.transitionProperty || Object.keys((a.effect && a.effect.getKeyframes && a.effect.getKeyframes()[0]) || {}).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)).join("+") || "?")
        r.frames.push({
          t: ts,
          x: Number(String(cs.translate).split("px")[0]) || 0,
          sx: mv[0],
          sy: mv[3],
          lead: mv[4],
          lift: Number(cs.scale === "none" ? 1 : cs.scale.split(" ")[0]),
          o: Number(cs.opacity),
          g: glass ? Number(getComputedStyle(glass).opacity) : null,
          sheen: sheen ? Number(String(getComputedStyle(sheen).translate).split("px")[0]) || 0 : null,
        })
      }
    }
    raf(frame)
  }
  raf(frame)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const report = {}
try {
  async function open({ dark = false, cpu = 1, reduced = false, scale = 2 } = {}) {
    const p = await browser.newPage()
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: scale })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(URL_BASE) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("data:") ? r.continue() : r.respond({ status: 404, body: "" })))
    await p.evaluateOnNewDocument((dark) => {
      window.__path = "/explore"
      window.__probeDark = dark
      try {
        localStorage.setItem("storelib_consent", "x")
        localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1", displayName: "Alex Morgan", username: "alex" }))
      } catch {}
    }, dark)
    await p.evaluateOnNewDocument(RECORDER)
    if (reduced) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await p.goto(URL_BASE, { waitUntil: "load" })
    await sleep(500)
    const cdp = await p.createCDPSession()
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
    const geo = await p.evaluate(() => {
      const bar = document.querySelector("[data-buyer-tab-bar] nav")
      const b = bar.getBoundingClientRect()
      const slots = [...bar.querySelectorAll("[data-buyer-tab]")].map((t) => { const r = t.getBoundingClientRect(); return { key: t.getAttribute("data-buyer-tab"), x: r.left + r.width / 2 } })
      const lens = bar.querySelector("[data-buyer-tabs-lens]")
      return { left: b.left, width: b.width, y: b.top + 28, pad: parseFloat(getComputedStyle(bar).paddingLeft), dot: parseFloat(getComputedStyle(lens).width), slots }
    })
    return { p, cdp, errors, geo }
  }
  const touch = (cdp, type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 10, radiusY: 10, force: 1 }] })
  /** A finger from `a` to `b` at `speed` px per ms, an event every `every` ms, placed by the real time elapsed so timer jitter does not change the speed. */
  async function slide(cdp, a, b, y, speed, every = 8) {
    const dist = b - a
    const ms = Math.abs(dist) / speed
    const t0 = Date.now()
    for (;;) {
      const k = Math.min(1, (Date.now() - t0) / ms)
      await touch(cdp, "touchMove", a + dist * k, y)
      if (k >= 1) break
      await sleep(every)
    }
  }
  const leftFor = (geo, fx) => Math.max(geo.pad + geo.dot / 2, Math.min(geo.width - geo.pad - geo.dot / 2, fx - geo.left)) - geo.dot / 2
  const slotLeft = (geo, i) => geo.pad + i * ((geo.width - geo.pad * 2) / geo.slots.length) + ((geo.width - geo.pad * 2) / geo.slots.length - geo.dot) / 2
  /* Paint events in the trace, split at the TimeStamp the probe puts down the moment before the finger lifts. */
  const paints = async (p, mark) => {
    const events = JSON.parse(Buffer.from(await p.tracing.stop()).toString("utf8")).traceEvents
    const stamp = (m) => events.find((e) => e.name === "TimeStamp" && e.args?.data?.message === m)?.ts
    const from = stamp("lens-drag") ?? -Infinity
    const at = stamp(mark) ?? Infinity
    const list = events.filter((e) => e.name === "Paint" && e.ts >= from)
    if (process.env.DEBUG_PAINTS) for (const e of list.filter((e) => e.ts < at)) console.log("    paint", Math.round((e.ts - at) / 1000), "ms before the lift", JSON.stringify(e.args?.data))
    const sum = (xs) => ({ n: xs.length, ms: Math.round(xs.reduce((a, e) => a + (e.dur || 0), 0) / 100) / 10 })
    return { drag: sum(list.filter((e) => e.ts < at)), after: sum(list.filter((e) => e.ts >= at)), marked: from !== -Infinity && at !== Infinity }
  }
  /*
    The stretch is a spring of the speed, so each frame's stretch is compared with the glass's speed a little EARLIER, by
    time rather than by frames (at 4x CPU frames come in uneven lengths, and "two frames ago" is a different moment on each).
    `pairsAt` gives the pairs for a lag in ms; `laggedCorr` the best of 0 to 83ms, and which.
  */
  const pairsAt = (vel, ms) => {
    const out = []
    let j = 0
    for (const f of vel) {
      const t = f.t - ms
      if (t < vel[0].t) continue
      while (j < vel.length - 2 && vel[j + 1].t < t) j++
      const a = vel[j], b = vel[Math.min(j + 1, vel.length - 1)]
      const k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0
      out.push([Math.abs(a.v + (b.v - a.v) * k), f.s])
    }
    return out
  }
  const laggedCorr = (vel) => {
    let best = { r: -1, ms: 0 }
    for (const ms of [0, 17, 33, 50, 67, 83]) {
      const p = pairsAt(vel, ms)
      if (p.length < 4) continue
      const r = pearson(p.map((q) => q[0]), p.map((q) => q[1]))
      if (r > best.r) best = { r, ms }
    }
    return best
  }
  const pearson = (xs, ys) => {
    const n = xs.length
    const mx = xs.reduce((a, b) => a + b, 0) / n
    const my = ys.reduce((a, b) => a + b, 0) / n
    let sxy = 0, sxx = 0, syy = 0
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2 }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0
  }
  const r2 = (n) => Math.round(n * 100) / 100
  const r3 = (n) => Math.round(n * 1000) / 1000

  /**
   * One gesture on a fresh page: down on Home, a slide to `to` at `speed`, then either held for `hold` ms and released,
   * or released while still moving (`hold` 0). Returns every number the verdicts read.
   */
  async function gesture({ dark = false, cpu = 1, speed, to, hold, label }) {
    const { p, cdp, errors, geo } = await open({ dark, cpu })
    const home = geo.slots[0].x
    const target = geo.slots[to].x
    await p.evaluate(() => { window.__rec.frames = []; window.__rec.fingers = []; window.__rec.props = new Set(); window.__rec.on = true })
    await touch(cdp, "touchStart", home, geo.y)
    await sleep(60)
    /* Past the slop first, so the drag is picked up, then traced from there. */
    await touch(cdp, "touchMove", home + 12, geo.y)
    await sleep(30)
    await p.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] })
    const moveFrom = await p.evaluate(() => { console.timeStamp("lens-drag"); return performance.now() })
    await slide(cdp, home + 12, target, geo.y, speed)
    /* Let go while moving: the lift goes straight after the last move, before anything else is asked of the page. */
    if (!hold) await touch(cdp, "touchEnd")
    let loopAtRest = null
    if (hold) {
      await sleep(hold)
      /* Held still and settled: the slide's loop must not be running. */
      const l0 = await p.evaluate(() => window.__rec.loopFrames)
      await sleep(200)
      loopAtRest = (await p.evaluate(() => window.__rec.loopFrames)) - l0
    }
    if (hold) await touch(cdp, "touchEnd")
    await sleep(900)
    const traced = await paints(p, "lens-up")
    const l1 = await p.evaluate(() => window.__rec.loopFrames)
    await sleep(200)
    const loopAfter = (await p.evaluate(() => window.__rec.loopFrames)) - l1
    const rec = await p.evaluate(() => { window.__rec.on = false; return { frames: window.__rec.frames, fingers: window.__rec.fingers, props: [...window.__rec.props] } })
    await p.close()

    const F = rec.frames
    const stopAt = rec.fingers.filter((f) => f.type === "pointermove").at(-1)?.t
    const upAt = rec.fingers.find((f) => f.type === "pointerup")?.t
    if (stopAt == null || upAt == null) throw new Error(`${label}: the page saw no ${stopAt == null ? "move" : "lift"} (${rec.fingers.length} finger events, ${F.length} frames)`)
    const fingerAt = (t) => { let f = null; for (const e of rec.fingers) { if (e.t <= t) f = e; else break } return f }
    /* The drag: frames from the first move past the slop to the lift. */
    const drag = F.filter((f) => f.t >= moveFrom && f.t <= upAt)
    const moving = F.filter((f) => f.t >= moveFrom && f.t <= stopAt + 16)
    /* Glass speed per frame (px/ms), and how sharply it changes: the change of speed over the real time between two frames,
       as px per 60Hz frame per frame, so a long frame at 4x CPU is not counted as a jump. A jump is a big number. */
    const vel = []
    for (let i = 1; i < drag.length; i++) vel.push({ t: drag[i].t, v: (drag[i].x - drag[i - 1].x) / Math.max(1, drag[i].t - drag[i - 1].t), s: drag[i].sx - 1, sy: drag[i].sy, dt: drag[i].t - drag[i - 1].t })
    let worstJerk = 0
    let worstStep = 0
    for (let i = 1; i < vel.length; i++) {
      worstJerk = Math.max(worstJerk, (Math.abs(vel[i].v - vel[i - 1].v) / Math.max(1, vel[i].t - vel[i - 1].t)) * 16.7 * 16.7)
      worstStep = Math.max(worstStep, Math.abs(vel[i].v * vel[i].dt))
    }
    /* The same for the finger, read at the same frames: what the glass is smoothing. */
    let fingerJerk = 0
    {
      const fx = drag.map((f) => { const fg = fingerAt(f.t); return fg ? leftFor(geo, fg.x) : null })
      const fv = []
      for (let i = 1; i < drag.length; i++) if (fx[i] != null && fx[i - 1] != null) fv.push({ t: drag[i].t, v: (fx[i] - fx[i - 1]) / Math.max(1, drag[i].t - drag[i - 1].t) })
      for (let i = 1; i < fv.length; i++) fingerJerk = Math.max(fingerJerk, (Math.abs(fv[i].v - fv[i - 1].v) / Math.max(1, fv[i].t - fv[i - 1].t)) * 16.7 * 16.7)
    }
    const corrBest = laggedCorr(vel)
    const corr = corrBest.r
    const lags = moving.slice(4).map((f) => { const fg = fingerAt(f.t); return fg ? leftFor(geo, fg.x) - f.x : 0 })
    const heldFrames = hold ? F.filter((f) => f.t > stopAt + hold - 120 && f.t <= upAt) : []
    const lastHeld = heldFrames.at(-1)
    const rest = { sx: lastHeld?.sx, sy: lastHeld?.sy, off: lastHeld ? r2(leftFor(geo, target) - lastHeld.x) : null }
    /* When the glass was round again after the finger stopped, and the softest squash on the way. */
    const afterStop = F.filter((f) => f.t > stopAt && f.t <= upAt)
    const roundAt = afterStop.findIndex((f, i) => afterStop.slice(i).every((g) => Math.abs(g.sx - 1) < 0.002 && Math.abs(g.sy - 1) < 0.002))
    /* The landing. */
    const land = F.filter((f) => f.t > upAt)
    const goal = slotLeft(geo, to)
    const e = land.map((f) => f.x - goal)
    /* An overshoot: the glass crosses the slot's place and gets 0.3px or more past it before it turns. */
    const peaks = []
    let side = 0
    for (let i = 0; i < e.length; i++) {
      const s = Math.abs(e[i]) < 0.05 ? 0 : Math.sign(e[i])
      if (!s) continue
      if (side && s !== side) {
        let peak = 0
        for (let j = i; j < e.length && Math.sign(e[j]) === s; j++) peak = Math.max(peak, Math.abs(e[j]))
        if (peak >= 0.3) peaks.push(r2(s * peak))
      }
      side = s
    }
    const overshoots = peaks.length
    if (process.env.DUMP && label.startsWith(process.env.DUMP)) console.log(JSON.stringify(F.filter((f) => f.t > upAt - 120 && f.t < upAt + 600).map((f) => [Math.round(f.t - upAt), r2(f.x - goal), r3(f.sx), r2(f.o)])))
    const settledIdx = land.findIndex((f, i) => land.slice(i).every((g) => Math.abs(g.x - goal) < 0.5 && Math.abs(g.sx - 1) < 0.002))
    const settleMs = settledIdx >= 0 ? Math.round(land[settledIdx].t - upAt) : null
    if (process.env.DEBUG_SETTLE && settleMs > 600) console.log("    late:", JSON.stringify(land.filter((f) => Math.abs(f.x - goal) >= 0.5 || Math.abs(f.sx - 1) >= 0.002).map((f) => [Math.round(f.t - upAt), r2(f.x - goal), f.sx, f.sy, f.o])).slice(0, 1500))
    const out = {
      label, dark, cpu, speed, hold,
      frames: drag.length,
      peakStretch: r3(Math.max(...drag.map((f) => f.sx)) - 1),
      minSy: r3(Math.min(...drag.map((f) => f.sy))),
      squash: r3(Math.min(0, ...afterStop.map((f) => f.sx - 1))),
      corr: r2(corr),
      corrLagMs: corrBest.ms,
      /* Speed and the stretch 33ms later, for the pooled correlation below. */
      pairs: pairsAt(vel, 33),
      fingerJerk: r2(fingerJerk),
      lagMedian: r2([...lags].sort((a, b) => a - b)[Math.floor(lags.length / 2)] ?? 0),
      lagMax: r2(Math.max(0, ...lags.map(Math.abs))),
      worstJerk: r2(worstJerk),
      worstStep: r2(worstStep),
      roundMs: roundAt >= 0 ? Math.round(afterStop[roundAt].t - stopAt) : null,
      rest,
      releaseOffset: land[0] ? r2(land[0].x - goal) : null,
      /* How fast the glass was going towards the slot as the finger lifted, px per ms (positive: towards it). */
      releaseSpeed: drag.length > 1 && land[0] ? r2(((drag.at(-1).x - drag.at(-2).x) / Math.max(1, drag.at(-1).t - drag.at(-2).t)) * -Math.sign(land[0].x - goal || 1)) : 0,
      overshoots, peaks,
      settleMs,
      endX: land.at(-1) ? r2(land.at(-1).x - goal) : null,
      endShape: land.at(-1) ? [land.at(-1).sx, land.at(-1).sy] : null,
      /* The drag layer's opacity on the last frame before the lift: faded all the way in by then, however short the drag. */
      glassWhileDragging: drag.length ? r2(drag.at(-1).g ?? 0) : null,
      sheenRange: drag.some((f) => f.sheen != null) ? [r2(Math.min(...drag.map((f) => f.sheen))), r2(Math.max(...drag.map((f) => f.sheen)))] : null,
      paints: traced.drag,
      paintsAfter: traced.after,
      marked: traced.marked,
      loopAtRest, loopAfter,
      props: rec.props,
      errors,
    }
    console.log(`  ${label.padEnd(26)} peak ${String(out.peakStretch).padEnd(5)} corr ${String(out.corr).padEnd(5)}@${String(out.corrLagMs).padEnd(2)}ms lag med ${String(out.lagMedian).padEnd(5)} max ${String(out.lagMax).padEnd(6)} jerk ${String(out.worstJerk).padEnd(5)}(finger ${String(out.fingerJerk).padEnd(5)}) step ${String(out.worstStep).padEnd(6)} round ${out.roundMs}ms squash ${out.squash} | release ${out.releaseOffset} overshoots ${out.overshoots} ${JSON.stringify(peaks)} settle ${settleMs}ms end ${out.endX} | paints ${out.paints.n} (after ${out.paintsAfter.n}) loop rest ${loopAtRest} after ${loopAfter} | glass ${out.glassWhileDragging} sheen ${JSON.stringify(out.sheenRange)}`)
    if (errors.length) console.log("    page errors:", errors.slice(0, 2))
    return out
  }

  const COMPOSITOR = new Set(["opacity", "translate", "scale", "transform", "color"])
  /*
    EACH GESTURE THREE TIMES (REPS), AND THE MEDIAN. One run of a headless drag at 4x CPU on a shared machine moves a timing
    number by a quarter either way: frames come at 16 to 100ms, and CDP's touches queue behind them. So the timing numbers
    (stretch, correlation, lag, smoothness, settle) are judged on the median of the repetitions, and the numbers that must
    hold every time (nothing painted, the loop parked, compositor properties only, round at rest, exactly on the slot, never
    two overshoots) on every one of them. Every repetition is printed. CPUS=1 for a quicker look; DRAGS_ONLY=1 stops after
    the drags.
  */
  const REPS = Number(process.env.REPS || 3)
  const median = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null }
  const SPECS = [
    { speed: 0.2, to: 2, hold: 500, label: "slow 0.2px/ms, held" },
    { speed: 0.7, to: 3, hold: 500, label: "ordinary 0.7px/ms, held" },
    { speed: 2, to: 3, hold: 500, label: "fast 2px/ms, held" },
    { speed: 0.7, to: 2, hold: 0, label: "ordinary, let go moving" },
    { speed: 1.5, to: 3, hold: 0, label: "flick 1.5px/ms, let go" },
  ]
  for (const cpu of (process.env.CPUS || "1,4").split(",").map(Number)) {
    console.log(`\nDRAGS at ${cpu}x CPU, light, ${REPS} of each`)
    const reps = SPECS.map(() => [])
    for (let k = 0; k < REPS; k++) for (let i = 0; i < SPECS.length; i++) reps[i].push(await gesture({ cpu, ...SPECS[i] }))
    const all = reps.flat()
    const m = reps.map((rs) => ({
      peakStretch: median(rs.map((r) => r.peakStretch)),
      corr: median(rs.map((r) => r.corr)),
      lagMedian: median(rs.map((r) => r.lagMedian)),
      jerkShare: median(rs.map((r) => r.worstJerk / Math.max(0.01, r.fingerJerk))),
      roundMs: median(rs.map((r) => r.roundMs)),
      settleMs: median(rs.map((r) => r.settleMs)),
    }))
    report[`cpu${cpu}`] = { reps, medians: m }
    const [slow, mid, fast] = m
    const held = reps.slice(0, 3).flat()
    for (let i = 0; i < SPECS.length; i++) console.log(`  median ${SPECS[i].label.padEnd(26)} ${JSON.stringify(Object.fromEntries(Object.entries(m[i]).map(([k, v]) => [k, v == null ? v : r2(v)])))}`)
    expect(slow.peakStretch < mid.peakStretch && mid.peakStretch < fast.peakStretch, `${cpu}x STRETCH: the faster the drag, the wider the glass (median peak)`, [slow.peakStretch, mid.peakStretch, fast.peakStretch])
    expect(all.every((r) => r.peakStretch <= 0.2 && r.minSy >= 0.9), `${cpu}x and never past the cap: at most 1.2 wide, never under 0.9 high, in any run`, [r3(Math.max(...all.map((r) => r.peakStretch))), r3(Math.min(...all.map((r) => r.minSy)))])
    /*
      The stretch is compared with the glass's speed 0 to 83ms earlier (it is a spring of it). A let go gesture is only 10 to
      20 frames, and the slow drag's stretch (0.04 at most) is near the size of a 4x frame's unevenness, so those are printed
      and the verdict is on the ordinary and fast drags' medians and on every run pooled (speed against the stretch 33ms later).
    */
    const corrMin = cpu === 1 ? 0.85 : 0.75
    const pooled = pearson(all.flatMap((r) => r.pairs.map((q) => q[0])), all.flatMap((r) => r.pairs.map((q) => q[1])))
    expect(mid.corr >= corrMin && fast.corr >= corrMin && pooled >= corrMin, `${cpu}x frame by frame the stretch goes with the glass's speed, a frame or two behind it (correlation ${corrMin} or more)`, { ordinary: r2(mid.corr), fast: r2(fast.corr), pooled: r2(pooled), slow: r2(slow.corr), letGo: [r2(m[3].corr), r2(m[4].corr)] })
    expect(held.every((r) => r.rest.sx === 1 && r.rest.sy === 1 && Math.abs(r.rest.off) < 0.5), `${cpu}x held still, it is round (1, 1) and under the finger, every run`, held.map((r) => r.rest))
    expect([slow, mid, fast].every((r) => r.roundMs !== null && r.roundMs <= 450), `${cpu}x round again within 450ms of the finger stopping (median)`, [slow, mid, fast].map((r) => r.roundMs))
    expect(held.every((r) => r.squash >= -0.015), `${cpu}x a stop leaves at most a soft squash (1.5%), every run`, r3(Math.min(...held.map((r) => r.squash))))
    expect(mid.lagMedian > 3 && mid.lagMedian < 30, `${cpu}x FOLLOW: an ordinary drag trails the finger a little, not one to one and not far (median lag px)`, mid.lagMedian)
    /*
      Synthetic touches arrive unevenly (two in one frame, none in the next), and a spring this quick (60 rad/s, about a
      60Hz frame) passes some of a one frame jump through. One to one (round 30) passed all of it on (share 1.0, measured).
      The verdict: the sharpest change in the glass's speed is at most two thirds of the finger's own, at the median.
    */
    expect(m.every((r) => r.jerkShare <= 0.67), `${cpu}x SMOOTH: no frame jumps, the glass's sharpest change of speed is at most 0.67 of the finger's own (median)`, m.map((r) => r2(r.jerkShare)))
    /* Never two overshoots in any landing; one when the glass is still heading for the slot (0.2px/ms or more) as the finger lifts, in most such lifts (a lift the page sees late, behind CDP's queue at 4x, can land with none). */
    const letGos = reps.slice(3).flat()
    const moving = letGos.filter((r) => r.releaseSpeed >= 0.2)
    const ones = moving.filter((r) => r.overshoots === 1).length
    expect(all.every((r) => r.overshoots <= 1) && moving.length >= 2 && ones * 2 > moving.length, `${cpu}x LANDING: let go while moving, one soft overshoot past the slot (${ones} of ${moving.length}), then still, never two`, letGos.map((r) => ({ off: r.releaseOffset, speed: r.releaseSpeed, peaks: r.peaks })))
    expect(m.every((r) => r.settleMs !== null && r.settleMs <= 600) && all.every((r) => Math.abs(r.endX) < 0.05 && r.endShape[0] === 1 && r.endShape[1] === 1), `${cpu}x on the slot's exact place and round, within 600ms of letting go (median)`, { settle: m.map((r) => r.settleMs), endX: [...new Set(all.map((r) => r.endX))] })
    expect(all.every((r) => r.paints.n === 0), `${cpu}x COST: nothing painted on the main thread while the finger drags, every run`, all.map((r) => r.paints.n))
    expect(held.every((r) => r.loopAtRest === 0) && all.every((r) => r.loopAfter === 0), `${cpu}x and the slide's frame loop is parked once the glass rests under a still finger, and after it lands`, all.map((r) => [r.loopAtRest, r.loopAfter]))
    expect(all.every((r) => r.props.every((k) => k.split("+").every((x) => COMPOSITOR.has(x)))), `${cpu}x only compositor properties animate on the glass`, [...new Set(all.flatMap((r) => r.props))])
    if (!BEFORE) {
      expect(all.every((r) => r.glassWhileDragging === 1), `${cpu}x the glass's rim and sheen are there while dragging`, all.map((r) => r.glassWhileDragging))
      expect(reps[2].every((r) => r.sheenRange && r.sheenRange[1] - r.sheenRange[0] >= 3), `${cpu}x and the sheen shifts a few px across the bar`, reps[2].map((r) => r.sheenRange))
    }
  }

  if (process.env.DRAGS_ONLY) throw new Error("DRAGS_ONLY")
  console.log("\nDARK at 1x CPU")
  const darkRun = await gesture({ dark: true, speed: 0.7, to: 3, hold: 500, label: "dark ordinary, held" })
  report.dark = darkRun
  expect(darkRun.paints.n === 0 && darkRun.rest.sx === 1, "dark: the same motion, nothing painted", [darkRun.paints, darkRun.rest])

  console.log("\nREDUCED MOTION")
  {
    const { p, cdp, geo } = await open({ reduced: true })
    await p.evaluate(() => { window.__rec.frames = []; window.__rec.fingers = []; window.__rec.on = true })
    const home = geo.slots[0].x
    await touch(cdp, "touchStart", home, geo.y)
    await sleep(40)
    await touch(cdp, "touchMove", home + 12, geo.y)
    await sleep(40)
    const from = await p.evaluate(() => performance.now())
    await slide(cdp, home + 12, geo.slots[3].x, geo.y, 1)
    await sleep(100)
    await touch(cdp, "touchEnd")
    await sleep(500)
    const rec = await p.evaluate(() => { window.__rec.on = false; return window.__rec })
    await p.close()
    const fr = rec.frames.filter((f) => f.t > from)
    const fingerAt = (t) => { let f = null; for (const e of rec.fingers) { if (e.t <= t - 1) f = e; else break } return f }
    const off = fr.filter((f) => fingerAt(f.t)?.type === "pointermove").map((f) => Math.abs(leftFor(geo, fingerAt(f.t).x) - f.x))
    const stretch = Math.max(...fr.map((f) => Math.abs(f.sx - 1)))
    report.reduced = { stretch, offMedian: off.sort((a, b) => a - b)[Math.floor(off.length / 2)] }
    console.log(`  stretch ${stretch}  median off the finger ${r2(report.reduced.offMedian)}px`)
    expect(stretch === 0, "reduced motion: no stretch at all", stretch)
    expect(report.reduced.offMedian < 1, "and the glass is where the finger is (median px)", r2(report.reduced.offMedian))
  }

  console.log("\nPICTURES: mid drag and held, light and dark, three times life size")
  for (const dark of [false, true]) {
    const tag = dark ? "dark" : "light"
    const { p, cdp, geo } = await open({ dark, scale: 3 })
    const home = geo.slots[0].x
    const clip = { x: 0, y: 844 - 70, width: 390, height: 70 }
    await touch(cdp, "touchStart", home, geo.y)
    await sleep(40)
    await touch(cdp, "touchMove", home + 12, geo.y)
    /* A slide under way, photographed as often as the browser will while it moves; the most stretched picture is kept. */
    let going = true
    const moving = slide(cdp, home + 12, geo.slots[3].x, geo.y, 0.5).then(() => { going = false })
    const taken = []
    for (let i = 0; going && i < 12; i++) {
      const buf = await p.screenshot({ clip })
      const sx = await p.evaluate(() => { const m = /matrix\(([^,]+)/.exec(getComputedStyle(document.querySelector("[data-buyer-tabs-lens]")).transform); return m ? Number(m[1]) : 1 })
      taken.push({ buf, sx })
    }
    await moving
    const best = taken.reduce((a, b) => (b.sx > a.sx ? b : a), taken[0])
    writeFileSync(join(shots, `lens-${tag}-mid-drag.png`), best.buf)
    console.log(`  ${tag}: ${taken.length} pictures while moving, stretch read after each ${JSON.stringify(taken.map((t) => r3(t.sx)))}, kept ${r3(best.sx)}`)
    /* Held still between Search and Library: the glass round, at rest under the finger. */
    await slide(cdp, geo.slots[3].x, (geo.slots[1].x + geo.slots[2].x) / 2, geo.y, 0.6)
    await sleep(500)
    await p.screenshot({ path: join(shots, `lens-${tag}-held.png`), clip })
    await touch(cdp, "touchEnd")
    await p.close()
    console.log(`  ${join(shots, `lens-${tag}-mid-drag.png`)}\n  ${join(shots, `lens-${tag}-held.png`)}`)
  }
  writeFileSync(join(shots, "report.json"), JSON.stringify(report, null, 2))
} finally {
  await browser.close()
  if (existsSync(stubs)) rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall ok")
if (broken) process.exit(1)
