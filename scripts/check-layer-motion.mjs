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
 * At 1280 a layer does not move (the editor is a page in the shell there),
 * and under reduced motion nothing moves.
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
  window.__moves = []; window.__long = []
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }) }).observe({ type: "longtask", buffered: true })
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
    const order = document.querySelector(".orders-detail")?.getAnimations().find((a) => a.effect?.getKeyframes().some((k) => k.transform))
    const a = layer || order
    const timing = a?.effect?.getComputedTiming()
    let y = null
    if (a && timing && timing.progress != null) {
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
    window.__frames.push({ t: +t.toFixed(1), y, which: layer ? layer.effect.pseudoElement : order ? "order" : null })
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
  if (kind === "order") {
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
    return { frames: window.__frames, long: window.__long }
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
  return {
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
  const heldAtStart = await p.evaluate((which) => document.getAnimations().some((a) => a.effect?.pseudoElement === which && a.playState === "paused" && (a.currentTime ?? 0) === 0), which)
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
  const openSel = isNew ? open : "a[data-probe-pick]"
  const up = await timedMove(p, cdp, { sel: openSel, pressed: isNew ? "[data-new-product][data-layer-press]" : "[data-row][data-layer-press], [data-row][data-opening]", kind: "enter" })
  const onScreen = await p.evaluate(() => ({ layer: !!document.querySelector("[data-page-layer]"), motion: document.documentElement.dataset.layerMotion ?? null, path: window.__path }))
  report(`${trip} in`, up, "enter")
  expect(onScreen.layer && onScreen.motion === null, "the editor is up, and the move has cleaned up after itself", onScreen)

  const down = await timedMove(p, cdp, { sel: EDITOR_BACK, pressed: `${EDITOR_BACK}[data-leaving]`, kind: "leave" })
  report(`${trip} back`, down, "leave")
  await sleep(200)
  const after = await scrollOf(p)
  const back = await p.evaluate(() => ({ layer: !!document.querySelector("[data-page-layer]"), path: window.__path }))
  expect(!back.layer && back.path === "/app/products", "Back leaves the list on the screen", back)
  expect(Math.abs(after.outer - before.outer) <= 2 && Math.abs(after.inner - before.inner) <= 2, "the list is where it was left", { before, after })

  /* Frozen, for the pictures: in, then out. */
  const shotIn = await frozenMove(p, cdp, { sel: openSel === "a[data-probe-pick]" ? "[data-row]:not([hidden]) a[data-row-link]" : openSel, label: `${trip}-in-${label}`, layer: true, which: "::view-transition-new(page-layer)" })
  pictures(`${trip} in`, shotIn, "enter")
  await sleep(250)
  const shotOut = await frozenMove(p, cdp, { sel: EDITOR_BACK, label: `${trip}-back-${label}`, layer: true, which: "::view-transition-old(page-layer)" })
  pictures(`${trip} back`, shotOut, "leave")
  await sleep(250)
}

function report(name, r, kind) {
  console.log(`        (${name}: ${JSON.stringify({ move: r.move, held: r.held, frames: r.frames, firstGap: r.firstGap, maxGap: r.maxGap, dropped: r.dropped, partway: r.partway, long: r.long, latency: r.latency, compositor: r.compositor })})`)
  console.log(`        (${name} translateY by frame: ${r.ys.join(" ")})`)
  if (!kind.startsWith("order")) expect(!!r.move?.ready && !r.move.skipped, `${name}: one move, started at the commit`, r.move)
  const dir = kind === "leave" || kind === "order-back" ? 1 : -1
  const mono = r.ys.every((y, i) => i === 0 || (y - r.ys[i - 1]) * dir >= -1)
  expect(r.partway >= 8 && mono, `${name}: from the bottom edge and back to it, on translateY alone, ${r.partway} frames part way, never backwards`, { partway: r.partway, first: r.ys[0], last: r.ys[r.ys.length - 1] })
  expect(r.dropped === 0, `${name}: no dropped frame after the first at ${THROTTLE}x slower CPU`, { dropped: r.dropped, maxGap: r.maxGap, firstGap: r.firstGap })
  expect(r.long.length === 0, `${name}: no long task on the main thread while it moves`, r.long)
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

const COMPOSER_BACK = "button[aria-label='Back to emails']"

async function emailsTrip(p, cdp, label) {
  console.log(`  -- emails -> New email -> the composer's Back (app/app/emails/layer-nav.ts)`)
  await p.evaluate(() => window.__navigate("/app/emails"))
  await sleep(700)
  const up = await timedMove(p, cdp, { sel: "[data-new-email]", pressed: "[data-new-email][data-layer-press]", kind: "enter" })
  report("composer in", up, "enter")
  await sleep(700)
  const onScreen = await p.evaluate(() => ({ layer: !!document.querySelector("[data-page-layer]"), path: window.__path, back: !!document.querySelector("button[aria-label='Back to emails']") }))
  expect(onScreen.layer && onScreen.back && onScreen.path === "/app/emails/new", "the composer is up, as a layer, with its Back", onScreen)
  const down = await timedMove(p, cdp, { sel: COMPOSER_BACK, pressed: `${COMPOSER_BACK}[data-layer-press]`, kind: "leave" })
  report("composer back", down, "leave")
  await sleep(300)
  const back = await p.evaluate(() => ({ layer: !!document.querySelector("[data-page-layer]"), path: window.__path }))
  expect(!back.layer && back.path === "/app/emails", "Back leaves the Emails page on the screen", back)
  const shotIn = await frozenMove(p, cdp, { sel: "[data-new-email]", label: `email-in-${label}`, layer: true, which: "::view-transition-new(page-layer)" })
  pictures("composer in", shotIn, "enter")
  await sleep(900)
  const shotOut = await frozenMove(p, cdp, { sel: COMPOSER_BACK, label: `email-back-${label}`, layer: true, which: "::view-transition-old(page-layer)" })
  pictures("composer back", shotOut, "leave")
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

  console.log(`  -- the list 700ms away: Back answers, the screen is given back at once, the spinner turns, the list lands`)
  n = await moveCount(p)
  const t0 = await p.evaluate(() => performance.now())
  await p.$eval(EDITOR_BACK, (el) => el.click())
  await sleep(260)
  const b1 = await readSpin(EDITOR_BACK)
  await sleep(120)
  const b2 = await readSpin(EDITOR_BACK)
  m = await waitMove(p, n, 3000)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  expect(!!m && (m.skipped || !m.ready) && m.done - t0 < 200, "the picture is let go as soon as the page is known to be on its way, not held", m && { heldMs: +(m.done - t0).toFixed(0), skipped: !!m.skipped })
  expect(b1.layer && b1.spinner > 0.9 && b1.state === "running" && b2.t > b1.t, "the editor is live, and Back holds a spinner, turning", { b1, b2 })
  await sleep(900)
  const landed = await p.evaluate(() => ({ path: window.__path, layer: !!document.querySelector("[data-page-layer]") }))
  expect(landed.path === "/app/products" && !landed.layer, "and the list lands when it comes", landed)
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
