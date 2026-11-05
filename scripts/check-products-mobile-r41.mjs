/**
 * ===========================================================================
 *  PRODUCTS ON A PHONE: THE PRESS, THE WAY IN, THE WAY BACK, THE PULL
 * ===========================================================================
 * The owner, on an iPhone: the spinner a pressed row shows moved its price;
 * Edit product and New product appeared "direct and glitchy"; the way back
 * had to be as smooth; and the pull to refresh spinner came out under the
 * title and New product instead of above them.
 *
 * scripts/render-layer-motion.tsx draws the list, the editor and the stage on
 * the React the app router runs. At 390 with touch, this measures:
 *
 *   THE PRESS     with the editor 1.5s away, every frame for 900ms after the
 *                 tap: the pressed row's name, price and height against the
 *                 frame before the tap (0px is the bar), and that the
 *                 spinner did show.
 *   THE WAY IN    a product and New product, with view transitions and in an
 *                 engine without them (WebKit before Safari 18), CPU at a
 *                 quarter: the layer's translateY on every frame of the
 *                 move, frames part way, the largest gap.
 *   THE WAY BACK  Back (Discard when the fixture asks): the drop's frames,
 *                 the list back, its scroll where it was left, the row you
 *                 came from tinted.
 *   THE PULL      a finger pulling 160px down at the top of the list: the
 *                 spinner's top against the title's top (it must be above),
 *                 and that the title moved with the pull.
 *
 *   node scripts/check-products-mobile-r41.mjs
 *   BASE=HEAD node scripts/check-products-mobile-r41.mjs   (the list as committed, for the before numbers)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const THROTTLE = Number(process.env.THROTTLE ?? 4)
const BASE = process.env.BASE || null
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

const stubs = mkdtempSync(join(tmpdir(), "storelib-products-r41-"))
writeFileSync(join(stubs, "navigation.js"), `import React from "react"
export const __RouteContext = React.createContext({ path: "/app/products", search: "" })
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = {
  push: (h) => { log("push", h); window.__navigate(h, "push") },
  replace: (h) => { log("replace", h); window.__navigate(h, "replace") },
  prefetch: (h, o) => log("prefetch", h),
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
export default function Image({ src, alt, fill, sizes, priority, quality, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
writeFileSync(join(stubs, "supabase-client.js"), `function from() {
  const q = { select() { return q }, eq() { return q }, order() { return q }, limit() { return q }, in() { return q }, is() { return q }, neq() { return q },
    single() { return Promise.resolve({ data: null, error: null }) }, maybeSingle() { return Promise.resolve({ data: null, error: null }) },
    then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej) } }
  return q
}
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) }, from, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } }
`)
writeFileSync(join(stubs, "description-action.js"), `export async function cleanDescription(html) { return { ok: true, html: String(html ?? "") } }
`)
/* The list as committed, for the before numbers: its relative imports made absolute. */
let oldClient = null
/* BASE_FILES=a,b: those files too as at BASE (the layer and the way back, for the before numbers of the drop). */
const oldFiles = []
if (BASE && process.env.BASE_FILES) {
  for (const f of process.env.BASE_FILES.split(",")) {
    const out = join(stubs, `old-${f.replace(/[\/]/g, "_")}`)
    writeFileSync(out, execFileSync("git", ["show", `${BASE}:${f}`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 }))
    oldFiles.push([f.replace(/\.tsx?$/, ""), out])
  }
}
if (BASE && !process.env.BASE_FILES) {
  oldClient = join(stubs, "old-products-client.tsx")
  writeFileSync(
    oldClient,
    execFileSync("git", ["show", `${BASE}:app/(storelib)/app/products/products-client.tsx`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 })
      .replace(/from "\.\/(?!\.)/g, 'from "@/app/(storelib)/app/products/')
      .replace(/from "\.\.\/orders\//g, 'from "@/app/(storelib)/app/orders/'),
  )
}

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
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /description-action$/ }, () => ({ path: join(stubs, "description-action.js") }))
        for (const [f, out] of oldFiles) {
          const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "$")
          b.onResolve({ filter: re }, () => ({ path: out }))
        }
        if (oldClient) b.onResolve({ filter: /app\/app\/products\/products-client$/ }, () => ({ path: oldClient }))
      },
    },
  ],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const css = await appCss(root)
const inter = interFaces(root).replace(/url\(file:\/\//g, "url(http://probe.test/__file")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

/* Every frame: where the layer (or the still dropping over the list) is drawn, from the moving thing itself. */
const RECORD = () => {
  window.__frames = []
  window.__recording = true
  /* The last press (a tap ends in a click): what a move is timed from. */
  window.__lastClick = null
  if (!window.__clickWatch) {
    window.__clickWatch = true
    window.addEventListener("click", () => { window.__lastClick = performance.now(); performance.mark("r41-click") }, { capture: true })
  }
  const yOfAnim = (a) => {
    const kf = a.effect.getKeyframes()
    const timing = a.effect.getComputedTiming()
    if (timing.progress == null) return null
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
      const r = /translateY\(([-\d.]+)(%|px)\)/.exec(k.transform || "")
      if (!r) return 0
      return r[2] === "%" ? (Number(r[1]) / 100) * innerHeight : Number(r[1])
    }
    return read(kf[0]) + (read(kf[kf.length - 1]) - read(kf[0])) * prog
  }
  const tick = (t) => {
    if (!window.__recording) return
    let y = null
    let which = null
    for (const a of document.getAnimations()) {
      const e = a.effect
      if (/page-layer/.test(e?.pseudoElement || "")) {
        y = yOfAnim(a)
        which = "view-transition"
        break
      }
      const el = e?.target
      if (!e?.pseudoElement && el?.hasAttribute && (el.hasAttribute("data-page-layer") || el.hasAttribute("data-layer-still")) && e.getKeyframes().some((k) => k.transform)) {
        y = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42
        which = "by hand"
        break
      }
    }
    window.__frames.push({ t, y: y === null ? null : +y.toFixed(1), which })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })

async function openPage({ viewTransitions }) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith("data:")) return r.continue()
    if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
    if (u.startsWith("http://probe.test/app")) return r.respond({ status: 200, contentType: "text/html", body: html })
    return r.respond({ status: 404, contentType: "application/json", body: "{}" })
  })
  if (!viewTransitions) await p.evaluateOnNewDocument(() => { delete Document.prototype.startViewTransition })
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const cdp = await p.createCDPSession()
  await p.goto("http://probe.test/app/products")
  await sleep(1200)
  if (errors.length) fail(`The page threw: ${errors[0]}`)
  return { p, cdp, errors }
}

const centre = (p, sel) =>
  p.$eval(sel, (el) => {
    const b = el.getBoundingClientRect()
    return { x: b.left + Math.min(b.width / 2, 80), y: b.top + b.height / 2 }
  })

async function tap(p, sel) {
  const c = await centre(p, sel)
  await p.touchscreen.tap(c.x, c.y)
}

/* The row in the middle of the list's screen, after scrolling the list down, so a scroll has something to keep. */
async function pickRow(p) {
  await p.evaluate(() => {
    document.querySelector(".orders-pane").scrollTop = 420
  })
  await sleep(300)
  return p.evaluate(() => {
    document.querySelectorAll("[data-probe-pick]").forEach((n) => n.removeAttribute("data-probe-pick"))
    const row = [...document.querySelectorAll("ul[data-list] > [data-row]:not([hidden])")].find((r) => {
      const b = r.getBoundingClientRect()
      return b.height > 0 && b.top > 220 && b.bottom < innerHeight - 140
    })
    row.setAttribute("data-probe-pick", "")
    return row.dataset.row
  })
}

function summarise(frames, lastClick = null) {
  const moving = frames.filter((f) => f.y !== null)
  if (moving.length === 0) return { frames: 0, partway: 0, late: 0, ys: [], maxGap: null, held: 0, pressToMove: null, which: null }
  /* From the last frame still at its starting place (a move is held there until the screen keeps up, page-layer startWhenFramesFlow): the wait before it is `held`, not a late frame of it. */
  const startY = moving[0].y
  const firstMoved = moving.findIndex((f) => Math.abs(f.y - startY) > 1)
  const i0 = frames.indexOf(moving[Math.max(0, firstMoved - 1)])
  const i1 = frames.indexOf(moving[moving.length - 1])
  const held = +(frames[i0].t - moving[0].t).toFixed(1)
  const span = frames.slice(i0, i1 + 1)
  let maxGap = 0
  let late = 0
  for (let i = 1; i < span.length; i++) {
    const g = span[i].t - span[i - 1].t
    maxGap = Math.max(maxGap, g)
    if (g > 20) late++
  }
  const ys = moving.map((f) => Math.round(f.y))
  const partway = ys.filter((y) => y > 2 && y < 842).length
  /* From the press to the first frame drawn off its starting place: everything the eye waits through. */
  const moved = moving.find((f) => Math.abs(f.y - startY) > 1)
  const pressToMove = lastClick !== null && moved ? +(moved.t - lastClick).toFixed(1) : null
  return { frames: span.length, partway, late, maxGap: +maxGap.toFixed(1), held, pressToMove, ys, which: moving[0].which }
}

async function recordWhile(p, cdp, act, ms = 1400) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  await p.evaluate(RECORD)
  /* The compositor's own account of its frames (Chrome's PipelineReporter), beside the page's clock: a move on transform runs there even while the page is busy. */
  await p.tracing.start({ categories: ["benchmark", "cc", "blink.user_timing"] })
  await act()
  /* Until the move has run and ended (the layer at rest, no still), or `ms` with nothing moving at all, or 6s. */
  const began = Date.now()
  for (;;) {
    await sleep(50)
    const state = await p.evaluate(() => {
      const f = window.__frames
      const seen = f.some((x) => x.y !== null)
      const resting = f.length > 0 && f[f.length - 1].y === null && !document.documentElement.dataset.layerMotion && ![...document.querySelectorAll("[data-layer-still]")].some((n) => n.style.visibility !== "hidden")
      return { seen, resting }
    })
    if (state.seen && state.resting) break
    if (!state.seen && Date.now() - began > ms) break
    if (Date.now() - began > 6000) break
  }
  const { frames, lastClick } = await p.evaluate(() => {
    window.__recording = false
    return { frames: window.__frames, lastClick: window.__lastClick }
  })
  const trace = JSON.parse(Buffer.from(await p.tracing.stop()).toString("utf8")).traceEvents
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const clickAt = trace.filter((e) => e.name === "r41-click").map((e) => e.ts).pop()
  const compositor = { presented: 0, partial: 0, dropped: 0 }
  for (const e of trace) {
    const f = e.name === "PipelineReporter" && e.ph === "b" ? e.args?.frame_reporter : null
    /* The frames of the move: from the last press for as long as a move takes and a little more. */
    if (!f?.has_compositor_animation || clickAt === undefined || e.ts < clickAt || e.ts > clickAt + 700_000) continue
    if (f.state === "STATE_PRESENTED_ALL") compositor.presented++
    else if (f.state === "STATE_PRESENTED_PARTIAL") compositor.partial++
    else if (f.state === "STATE_DROPPED") compositor.dropped++
  }
  return { ...summarise(frames, lastClick), compositor }
}

/* Back from the editor; the probe's fixture reads as edited, so the discard question is answered. */
async function goBack(p) {
  await tap(p, "[data-editor-bar] [data-leave-button]")
  for (let i = 0; i < 60; i++) {
    await sleep(50)
    const find = () => {
      const b = [...document.querySelectorAll("[role=alertdialog] button, [role=dialog] button")].find((x) => x.textContent.trim() === "Discard" && x.getBoundingClientRect().height > 0)
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    if (await p.evaluate(find)) {
      /* The question comes up as a sheet: pressed once it has settled. */
      await sleep(600)
      const at = await p.evaluate(find)
      if (!at) continue
      await p.touchscreen.tap(at.x, at.y)
      return true
    }
    if (!(await p.evaluate(() => !!document.querySelector("[data-page-layer]")))) return false
  }
  return false
}

try {
  console.log(`\nPRODUCTS AT 390, TOUCH${BASE ? ` (the list as at ${BASE})` : ""}`)

  /* ── THE PRESS ──────────────────────────────────────────────────────── */
  {
    const { p } = await openPage({ viewTransitions: true })
    const id = await pickRow(p)
    await p.evaluate(() => {
      window.__slowMs = 1500
    })
    const sample = () => {
      const row = document.querySelector("[data-probe-pick]")
      const r = (sel) => row.querySelector(sel).getBoundingClientRect()
      const price = r("[data-price]")
      const name = r("[data-name]")
      const spin = row.querySelector("[data-row-opening]")
      return {
        priceLeft: price.left,
        priceRight: price.right,
        priceTop: price.top,
        nameWidth: name.width,
        rowHeight: row.getBoundingClientRect().height,
        spinner: spin ? +getComputedStyle(spin).opacity : 0,
      }
    }
    const before = await p.evaluate(sample)
    await p.evaluate((fn) => {
      window.__samples = []
      const f = new Function(`return (${fn})()`)
      const t0 = performance.now()
      const tick = () => {
        window.__samples.push(f())
        if (performance.now() - t0 < 900) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, sample.toString())
    await tap(p, "[data-probe-pick] a[data-row-link]")
    await sleep(1000)
    const samples = await p.evaluate(() => window.__samples)
    const worst = { price: 0, name: 0, height: 0 }
    for (const s of samples) {
      worst.price = Math.max(worst.price, Math.abs(s.priceLeft - before.priceLeft), Math.abs(s.priceRight - before.priceRight), Math.abs(s.priceTop - before.priceTop))
      worst.name = Math.max(worst.name, Math.abs(s.nameWidth - before.nameWidth))
      worst.height = Math.max(worst.height, Math.abs(s.rowHeight - before.rowHeight))
    }
    const spun = Math.max(...samples.map((s) => s.spinner))
    console.log(`  the press on ${id}, editor 1.5s away: ${samples.length} frames; price moved ${worst.price.toFixed(1)}px, name width ${worst.name.toFixed(1)}px, row height ${worst.height.toFixed(1)}px; spinner opacity up to ${spun}`)
    expect(worst.price === 0 && worst.name === 0 && worst.height === 0, "the pressed row's price, name and height hold still while it opens (0px)", worst)
    expect(spun > 0.9, "and the spinner did show", spun)
    await p.close()
  }

  /* ── THE PULL ───────────────────────────────────────────────────────── */
  {
    const { p, cdp } = await openPage({ viewTransitions: true })
    const title0 = await p.$eval("h1", (h) => h.getBoundingClientRect().top)
    const at = (y) => ({ x: 195, y, radiusX: 4, radiusY: 4, force: 1, id: 0 })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at(240)] })
    for (let y = 240; y <= 400; y += 8) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [at(y)] })
      await sleep(16)
    }
    await sleep(120)
    const held = await p.evaluate(() => {
      const ind = document.querySelector("[data-ptr-indicator]").getBoundingClientRect()
      const h1 = document.querySelector("h1").getBoundingClientRect()
      const bar = document.querySelector("[data-new-product]")?.getBoundingClientRect()
      const ink = +getComputedStyle(document.querySelector("[data-ptr-indicator]")).opacity
      return { spinnerTop: +ind.top.toFixed(1), spinnerBottom: +ind.bottom.toFixed(1), titleTop: +h1.top.toFixed(1), newProductTop: bar ? +bar.top.toFixed(1) : null, spinnerOpacity: ink }
    })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(1500)
    console.log(`  a 160px pull at the top: spinner ${held.spinnerTop}-${held.spinnerBottom}px (opacity ${held.spinnerOpacity}), title top ${title0.toFixed(1)} -> ${held.titleTop}px, New product top ${held.newProductTop}px`)
    expect(held.spinnerOpacity > 0 && held.spinnerBottom <= held.titleTop, "the spinner is above the title, in the room the pull opens", held)
    expect(held.titleTop > title0 + 20, "and the title moves down with the pull", { before: +title0.toFixed(1), during: held.titleTop })
    await p.close()
  }

  /* ── IN AND BACK, WITH AND WITHOUT VIEW TRANSITIONS ─────────────────── */
  for (const viewTransitions of [true, false]) {
    const engine = viewTransitions ? "with view transitions" : "without view transitions (WebKit before Safari 18)"
    console.log(`\n  ${engine}`)
    const { p, cdp, errors } = await openPage({ viewTransitions })
    for (const trip of ["product", "new"]) {
      let id = null
      if (trip === "product") id = await pickRow(p)
      else {
        await p.evaluate(() => {
          document.querySelector(".orders-pane").scrollTop = 0
        })
        await sleep(200)
      }
      const scrollBefore = await p.evaluate(() => document.querySelector(".orders-pane").scrollTop)
      /* New product asks first, in a sheet (./new/kind-chooser): the editor rises once a kind is picked and the sheet has gone. */
      if (trip === "new") {
        await tap(p, "[data-new-product]")
        await p.waitForSelector("[data-new-product-chooser] [data-kind]")
        await sleep(600)
      }
      const rise = await recordWhile(p, cdp, () => tap(p, trip === "product" ? "[data-probe-pick] a[data-row-link]" : "[data-new-product-chooser] [data-kind]"))
      const up = await p.evaluate(() => ({ layer: !!document.querySelector("[data-page-layer]"), path: window.__path, motion: document.documentElement.dataset.layerMotion ?? null }))
      console.log(`  ${trip} in (${rise.which}): ${rise.frames} frames, ${rise.partway} part way, ${rise.late} late, largest gap ${rise.maxGap}ms, held ${rise.held}ms first; translateY ${rise.ys.join(" ")}`)
      expect(up.layer && up.motion === null, `${trip} in: the editor is up and the move has cleaned up`, up)
      expect(rise.partway >= 8 && rise.ys.every((y, i) => i === 0 || y <= rise.ys[i - 1] + 1), `${trip} in: rises from the bottom edge, 8 frames or more part way, never backwards`, { partway: rise.partway })
      /* A moment on the editor before Back, as anyone takes (and the layer lays the list's copy out ahead, page-layer COPY_AHEAD_MS). */
      await sleep(800)
      let asked = false
      const drop = await recordWhile(p, cdp, async () => {
        asked = await goBack(p)
      }, 2500)
      const tinted = id ? await p.evaluate((id) => document.querySelector(`ul[data-list] > [data-row="${id}"]`)?.getAnimations().some((a) => a.effect.getKeyframes().some((k) => k.backgroundColor)) ?? false, id) : null
      await sleep(300)
      const back = await p.evaluate(() => ({
        layer: !!document.querySelector("[data-page-layer]"),
        path: window.__path,
        stills: document.querySelectorAll("[data-layer-still]").length,
        scroll: document.querySelector(".orders-pane")?.scrollTop ?? null,
      }))
      console.log(`  ${trip} back${asked ? " (after Discard)" : ""} (${drop.which}): ${drop.frames} frames, ${drop.partway} part way, ${drop.late} late, largest gap ${drop.maxGap}ms, held ${drop.held}ms first, ${drop.pressToMove}ms from the press to the first frame off the top, compositor ${JSON.stringify(drop.compositor)}; translateY ${drop.ys.join(" ")}`)
      /* Round 41: a product opens untouched, so Back asks nothing ("Discard changes?" with no change made). */
      expect(!asked, `${trip} back: an untouched editor leaves without asking to discard`, { asked })
      /* Round 41: the drop starts on the frame after the press, over a copy of the list, instead of after the list has been drawn. */
      expect(drop.pressToMove !== null && drop.pressToMove <= (THROTTLE > 1 ? 320 : 160), `${trip} back: the editor leaves the top within ${THROTTLE > 1 ? 320 : 160}ms of the press`, drop.pressToMove)
      expect(!back.layer && back.path === "/app/products" && back.stills === 0, `${trip} back: the list is on the screen, nothing left over it`, back)
      expect(drop.partway >= 6 && drop.ys.every((y, i) => i === 0 || y >= drop.ys[i - 1] - 1), `${trip} back: drops to the bottom edge, 6 frames or more part way, never backwards`, { partway: drop.partway })
      expect(Math.abs(back.scroll - scrollBefore) <= 2, `${trip} back: the list's scroll is where it was left`, { before: scrollBefore, after: back.scroll })
      if (id) {
        expect(tinted, `${trip} back: the row you came from is tinted as the list comes back`, tinted)
      }
      await sleep(600)
    }
    if (errors.length) expect(false, "nothing threw", errors)
    await p.close()
  }
} finally {
  await browser.close()
}

console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
