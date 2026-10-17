/**
 * ===========================================================================
 *  ROUND 27 (E27), MEASURED: THE PAGE EDITOR AT EVERY WIDTH, DRAGGED
 * ===========================================================================
 * Over the real editor in the real community admin shell (scripts/render-page-editor26.tsx) in headless Chromium:
 *
 *   LAYOUT   1440, 1280, 1024 (computers), 820 (tablet, touch), 390 (phone, touch, CPU 4x), and a 1440 window zoomed
 *            150% and 200% (960 and 720 of CSS, device scale 1): side panel or drawer, the panel's width, the page's
 *            laid out width and scale, nothing sideways; one picture each
 *   RESIZE   the panel's edge dragged with the mouse at 1440, 1280, 1024 and 150%: frames a second, the slowest
 *            frames, long animation frames; the page only scaled while dragged (data-preview-live) and laid out once
 *            after; the width kept on a reload; arrows on the keyboard; a frame sheet
 *   WINDOW   the window itself resized step by step, 1440 to 1100 and back: the same numbers
 *   DRAWER   at 390 (touch, CPU 4x) and 820: the drawer's head dragged with a finger to half, to nearly all, flicked
 *            back to the foot; a tap on the grip; a part pressed on the page raises it and is shown above it; frames;
 *            a frame sheet
 *   OUTLINES at 1440 (scaled) and on the phone, a device pixel ratio of 2: the outline is the part's own box (each
 *            edge within one device pixel), its corners the part's own (never a pill), its line one or two device
 *            pixels; the tab with the part's name; the touch badges square; a close up picture
 *   LEGAL    ?legal=1: the page links the creator's Privacy and Terms; the field in the panel
 *
 *   node scripts/check-page-editor27.mjs [LAYOUT RESIZE WINDOW DRAWER OUTLINES LEGAL]
 *   SHOTS_DIR=dir for the pictures (.page-editor27-shots by default; delete it before committing)
 *   FFMPEG=path to ffmpeg for the frame sheets (skipped without it)
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const FFMPEG = process.env.FFMPEG || ""
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const stubs = join(root, ".page-editor27-probe")
const shots = process.env.SHOTS_DIR || join(root, ".page-editor27-shots")
const ORIGIN = "https://storelib.com"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(stubs, { recursive: true })
mkdirSync(shots, { recursive: true })
try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { useMemo, useSyncExternalStore } from "react"
const listeners = new Set()
let state = { pathname: location.pathname, search: location.search, routed: location.pathname + location.search, v: 0 }
const set = (p) => { state = { ...state, ...p }; listeners.forEach((f) => f()) }
const log = (k, a) => (window.__router ||= []).push([k, a])
window.__probeRouter = { subscribe: (f) => (listeners.add(f), () => listeners.delete(f)), get: () => state }
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, refresh: () => log("refresh", ""), back: () => history.back(), forward: () => history.forward() }
export const usePathname = () => useSyncExternalStore(window.__probeRouter.subscribe, () => state.pathname, () => state.pathname)
export const useSearchParams = () => { const s = useSyncExternalStore(window.__probeRouter.subscribe, () => state.search, () => state.search); return useMemo(() => new URLSearchParams(s), [s]) }
export const useRouter = () => router
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })\n`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() { const ch = { on() { return ch }, subscribe() { return ch } }; return { channel: () => ch, removeChannel() {}, auth: { getSession: async () => ({ data: { session: null } }) }, storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } }\nexport const isNativePlatform = () => false\n`)
  const css = await appCss(root)
  const dark = readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-page-editor26.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.page-editor27-probe/navigation.js", "next/link": "./.page-editor27-probe/link.jsx", "next/image": "./.page-editor27-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>${dark}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  /*
    Headless Chromium here rasters and composites in software (no graphics card): every frame's drawing is the CPU's,
    so the frame rates below are a floor for a person's browser, which rasters and composites on the GPU. (SwiftShader,
    the CPU's stand in for a GPU, was tried: far slower still, so it measures nothing useful.)
  */
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 300_000 })
  const SIZES = {
    "1440": { vp: { width: 1440, height: 900, deviceScaleFactor: 1 }, cpu: 1 },
    "1280": { vp: { width: 1280, height: 800, deviceScaleFactor: 1 }, cpu: 1 },
    "1024": { vp: { width: 1024, height: 768, deviceScaleFactor: 1 }, cpu: 1 },
    "820": { vp: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, cpu: 1 },
    "390": { vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, cpu: 4 },
    /* A 1440x900 window at 150% and 200%: the CSS pixels it has. */
    "zoom150": { vp: { width: 960, height: 600, deviceScaleFactor: 1 }, cpu: 1 },
    "zoom200": { vp: { width: 720, height: 450, deviceScaleFactor: 1 }, cpu: 1 },
  }

  async function open(path, vp, { cpu = 1, storage = null } = {}) {
    const context = await browser.createBrowserContext()
    const p = await context.newPage()
    p.on("close", () => void context.close().catch(() => {}))
    await p.setViewport(vp)
    const cdp = await p.createCDPSession()
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
    const errors = []
    const api = []
    p.on("pageerror", (e) => errors.push(String(e.stack || e).slice(0, 1200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        api.push({ url: url.replace(ORIGIN, ""), method: r.method(), body: r.postData() ?? null })
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, questions: [], status: "published" }) })
      }
      if (url.startsWith(`${ORIGIN}/_next/image`)) return r.respond({ status: 404, body: "" })
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("about:") || url.startsWith("blob:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    if (storage) await p.evaluateOnNewDocument((s) => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v) } catch {} }, storage)
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load", timeout: 120_000 })
    await p.evaluate(() => document.fonts.ready)
    await sleep(cpu > 1 ? 2500 : 900)
    return { p, cdp, errors, api }
  }
  const frameOf = async (p) => (await p.$("iframe[data-page-preview]"))?.contentFrame()
  const shot = (p, name, clip) => p.screenshot({ path: join(shots, `${name}.png`), ...(clip ? { clip } : {}) })
  const facts = (p) =>
    p.evaluate(() => {
      const b = (el) => (el ? (({ left, top, width, height }) => ({ x: Math.round(left), y: Math.round(top), w: Math.round(width), h: Math.round(height) }))(el.getBoundingClientRect()) : null)
      const over = (el) => (el ? el.scrollWidth - el.clientWidth : null)
      const pane = document.querySelector(".orders-pane")
      const editor = document.querySelector("[data-page-editor]")
      const tb = document.querySelector("[data-page-toolbar]")
      const tbr = tb?.getBoundingClientRect()
      const clipped = tb ? [...tb.querySelectorAll("button, [role=radiogroup], p")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > tbr.right + 0.5).length : null
      const prev = document.querySelector("[data-preview-pane]")
      const frame = document.querySelector("iframe[data-page-preview]")
      return {
        page: document.documentElement.scrollWidth - innerWidth,
        pane: over(pane),
        toolbarClipped: clipped,
        toolbarRows: tb ? Math.round(tb.getBoundingClientRect().height / 40) : null,
        mode: editor?.getAttribute("data-mode"),
        panel: editor?.getAttribute("data-panel"),
        editorW: editor?.clientWidth,
        side: b(document.querySelector("[data-page-side]")),
        card: b(document.querySelector("[data-page-preview-card]")),
        drawer: b(document.querySelector("[data-page-sheet]")),
        drawerDetent: document.querySelector("[data-page-drawer]")?.getAttribute("data-detent") ?? null,
        scale: Number(prev?.getAttribute("data-preview-scale")),
        laidW: Number(prev?.getAttribute("data-preview-width")),
        frameInnerW: frame?.contentWindow?.innerWidth ?? null,
        device: prev?.getAttribute("data-preview-pane"),
        vh: innerHeight,
        vw: innerWidth,
      }
    })

  /* ── Frame timing, in the page: every frame's time from rAF, and the long animation frames the browser reports ── */
  const startFrames = (p) =>
    p.evaluate(() => {
      const w = window
      w.__frames = []
      w.__loaf = []
      w.__framesOn = true
      const loop = (t) => {
        w.__frames.push(t)
        if (w.__framesOn) requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
      try {
        w.__loafObs = new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__loaf.push(Math.round(e.duration))))
        w.__loafObs.observe({ type: "long-animation-frame" })
      } catch {
        /* no LoAF in this browser */
      }
    })
  const stopFrames = (p) =>
    p.evaluate(() => {
      const w = window
      w.__framesOn = false
      w.__loafObs?.disconnect()
      const t = w.__frames
      const d = t.slice(1).map((x, i) => x - t[i])
      const sorted = [...d].sort((a, b) => a - b)
      const ms = t.length > 1 ? t[t.length - 1] - t[0] : 0
      const pct = (q) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] * 10) / 10 : 0)
      return { frames: t.length, ms: Math.round(ms), fps: ms ? Math.round(((t.length - 1) / ms) * 1000) : 0, p50: pct(0.5), p95: pct(0.95), max: Math.round(Math.max(0, ...d)), over33: d.filter((x) => x > 33.4).length, loaf: w.__loaf.length, loafMax: Math.max(0, ...w.__loaf) }
    })

  /* Screencast frames during a gesture, tiled into one picture to look at. */
  async function screencast(cdp, run, name, { cols = 4, pick = 12, width = 480 } = {}) {
    const frames = []
    const onFrame = async (f) => {
      frames.push(f.data)
      try {
        await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId })
      } catch {}
    }
    cdp.on("Page.screencastFrame", onFrame)
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 })
    await run()
    await sleep(250)
    await cdp.send("Page.stopScreencast")
    cdp.off("Page.screencastFrame", onFrame)
    if (!FFMPEG || frames.length === 0) return frames.length
    const dir = join(stubs, `cast-${name}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const step = Math.max(1, Math.floor(frames.length / pick))
    const chosen = frames.filter((_, i) => i % step === 0).slice(0, pick)
    chosen.forEach((d, i) => writeFileSync(join(dir, `f${String(i).padStart(3, "0")}.jpg`), Buffer.from(d, "base64")))
    const rows = Math.ceil(chosen.length / cols)
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-framerate", "1", "-i", join(dir, "f%03d.jpg"), "-vf", `scale=${width}:-1,tile=${cols}x${rows}:padding=4:color=white`, "-frames:v", "1", join(shots, `sheet-${name}.jpg`)])
    return frames.length
  }

  /* ── LAYOUT ─────────────────────────────────────────────────────────── */
  if (want("LAYOUT")) {
    console.log("\nLAYOUT")
    for (const name of ["1440", "1280", "1024", "820", "390", "zoom150", "zoom200"]) {
      const { vp, cpu } = SIZES[name]
      const { p, errors } = await open("/app/community/salajanywood/page", vp, { cpu })
      if (vp.width >= 960) await p.evaluate(() => document.querySelector(".orders-pane")?.scrollTo(0, document.querySelector("[data-community-header]")?.offsetHeight ?? 0))
      await sleep(600)
      const f = await facts(p)
      expect(f.page <= 0 && (f.pane ?? 0) <= 0, `${name}: nothing sideways on the page or the pane`, { page: f.page, pane: f.pane })
      expect(f.toolbarClipped === 0, `${name}: the row of controls fits, nothing cut`, { clipped: f.toolbarClipped, rows: f.toolbarRows })
      const wantSide = !["820", "390"].includes(name)
      expect(f.mode === (wantSide ? "side" : "drawer"), `${name}: ${wantSide ? "the panel beside the page" : "the drawer"} (editor ${f.editorW}px)`, f.mode)
      if (wantSide) expect(!!f.side && f.side.w >= 300 && f.card.w >= 300, `${name}: panel ${f.side?.w}px, page ${f.card?.w}px`, { side: f.side, card: f.card })
      else expect(f.drawerDetent === "peek" && !!f.drawer && f.card.y + f.card.h <= f.drawer.y + f.drawer.h, `${name}: the drawer at its foot, the page above it`, { drawer: f.drawer, card: f.card })
      expect(f.frameInnerW === f.laidW, `${name}: the frame laid out at ${f.laidW}px, scale ${f.scale}, ${f.device}`, { inner: f.frameInnerW, laid: f.laidW })
      console.log(`        editor ${f.editorW}, panel ${f.side?.w ?? "-"}, stage ${f.card?.w}x${f.card?.h}, page laid out ${f.laidW} at ${f.scale} (${f.device})`)
      await shot(p, `layout-${name}`)
      expect(errors.length === 0, `${name}: no errors`, errors.slice(0, 2))
      await p.close()
    }
    /* Round 26 at the same sizes, for the record (its numbers, from its probe): 1440 scale 0.51, 1280 scale 0.399, 820 drawer. */
  }

  /* ── RESIZE ─────────────────────────────────────────────────────────── */
  if (want("RESIZE")) {
    console.log("\nRESIZE: the panel's edge dragged")
    for (const name of ["1440", "1280", "1024", "zoom150"]) {
      const { vp, cpu } = SIZES[name]
      const { p, cdp, errors } = await open("/app/community/salajanywood/page", vp, { cpu })
      await p.evaluate(() => document.querySelector(".orders-pane")?.scrollTo(0, document.querySelector("[data-community-header]")?.offsetHeight ?? 0))
      await sleep(400)
      const before = await facts(p)
      const h = await p.$eval("[data-page-resize] > div", (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
      await p.mouse.move(h.x, h.y)
      await p.mouse.down()
      await startFrames(p)
      let live = false
      const path = []
      /* Out 200px (the panel wider, to its 560 at most), back 100: the panel ends 100px wider than it began. */
      for (let i = 1; i <= 40; i++) path.push(h.x - (i * 200) / 40)
      for (let i = 1; i <= 40; i++) path.push(h.x - 200 + (i * 100) / 40)
      const drag = async () => {
        for (const x of path) {
          await p.mouse.move(x, h.y)
          if (!live) live = await p.evaluate(() => document.querySelector("[data-preview-pane]")?.hasAttribute("data-preview-live"))
          await sleep(12)
        }
      }
      if (name === "1280") await screencast(cdp, drag, "resize-1280", { width: 420 })
      else if (process.env.PROFILE && name === "1440") {
        await p.tracing.start({ path: join(shots, "trace-1440.json"), categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] })
        await drag()
        await p.tracing.stop()
      } else await drag()
      const during = await p.evaluate(() => ({ width: document.querySelector("[data-preview-pane]")?.getAttribute("data-preview-width"), inner: document.querySelector("iframe[data-page-preview]")?.contentWindow?.innerWidth }))
      await p.mouse.up()
      const timing = await stopFrames(p)
      await sleep(400)
      const after = await facts(p)
      console.log(`        ${name}: ${timing.frames} frames in ${timing.ms}ms = ${timing.fps} fps, p50 ${timing.p50}ms, p95 ${timing.p95}ms, slowest ${timing.max}ms, ${timing.over33} over 33ms, ${timing.loaf} long animation frames (longest ${timing.loafMax}ms)`)
      expect(timing.fps >= 50 && timing.over33 <= 2, `${name}: the drag holds the frame rate`, { fps: timing.fps, over33: timing.over33, p95: timing.p95 })
      expect(live, `${name}: while dragged the page is only scaled (data-preview-live)`)
      const most = Number(await p.$eval("[data-page-resize]", (e) => e.getAttribute("aria-valuemax")))
      expect(after.side.w !== before.side.w && Math.abs(after.side.w - Math.min(most, before.side.w + 100)) <= 4, `${name}: the panel follows the edge (${before.side.w} to ${after.side.w}, at most ${most})`, { before: before.side.w, after: after.side.w, most })
      expect(after.frameInnerW === after.laidW && !(await p.evaluate(() => document.querySelector("[data-preview-pane]")?.hasAttribute("data-preview-live"))), `${name}: once still the page is laid out again (${after.laidW} at ${after.scale})`, { during, after: { laid: after.laidW, inner: after.frameInnerW } })
      /* The keyboard moves it too. */
      await p.focus("[data-page-resize]")
      await p.keyboard.press("ArrowRight")
      await p.keyboard.press("ArrowRight")
      await sleep(250)
      const keyed = await facts(p)
      expect(keyed.side.w === after.side.w - 32 || keyed.side.w === 300, `${name}: the arrows move it 16px a press`, { after: after.side.w, keyed: keyed.side.w })
      const kept = await p.evaluate(() => localStorage.getItem("sl:page-editor:panel-width"))
      await p.reload({ waitUntil: "load" })
      await sleep(900)
      const again = await facts(p)
      expect(Number(kept) === keyed.side.w && again.side.w === keyed.side.w, `${name}: the width is kept on a reload (${kept})`, { kept, again: again.side.w })
      if (name === "1280") await shot(p, "resize-1280-after")
      expect(errors.length === 0, `${name}: no errors`, errors.slice(0, 2))
      await p.close()
    }
  }

  /* ── WINDOW ─────────────────────────────────────────────────────────── */
  if (want("WINDOW")) {
    console.log("\nWINDOW: the window resized")
    const { p, errors } = await open("/app/community/salajanywood/page", SIZES["1440"].vp)
    await startFrames(p)
    const widths = []
    for (let i = 0; i <= 24; i++) widths.push(Math.round(1440 - (340 * i) / 24))
    for (let i = 1; i <= 24; i++) widths.push(Math.round(1100 + (340 * i) / 24))
    for (const w of widths) {
      await p.setViewport({ width: w, height: 900, deviceScaleFactor: 1 })
      await sleep(16)
    }
    const timing = await stopFrames(p)
    await sleep(400)
    const f = await facts(p)
    console.log(`        ${timing.frames} frames in ${timing.ms}ms = ${timing.fps} fps, p50 ${timing.p50}ms, p95 ${timing.p95}ms, slowest ${timing.max}ms, ${timing.over33} over 33ms, ${timing.loaf} long animation frames (longest ${timing.loafMax}ms)`)
    expect(timing.loafMax < 120, "resizing the window never holds a frame for long", timing)
    expect(f.frameInnerW === f.laidW, "once still the page is laid out at the new width", { laid: f.laidW, inner: f.frameInnerW })
    expect(errors.length === 0, "no errors", errors.slice(0, 2))
    await p.close()
  }

  /* ── DRAWER ─────────────────────────────────────────────────────────── */
  if (want("DRAWER")) {
    for (const name of ["390", "820"]) {
      console.log(`\nDRAWER ${name}`)
      const { vp, cpu } = SIZES[name]
      const { p, cdp, errors } = await open("/app/community/salajanywood/page", vp, { cpu })
      const state = () => p.evaluate(() => { const d = document.querySelector("[data-page-drawer]"); const s = document.querySelector("[data-page-sheet]"); return { detent: d?.getAttribute("data-detent"), top: Math.round(s.getBoundingClientRect().top), vh: innerHeight } })
      const grip = async () => p.$eval("[data-page-drawer-head]", (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 } })
      const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
      /* A finger: down, moves 16ms apart, up. */
      const swipe = async (from, dy, steps, hold = 0) => {
        await touch("touchStart", from.x, from.y)
        for (let i = 1; i <= steps; i++) {
          await touch("touchMove", from.x, from.y + (dy * i) / steps)
          /* A finger lifts right after its last move; a pause before it is a finger that stopped (no flick). */
          if (i < steps) await sleep(16)
        }
        if (hold) await sleep(hold)
        await touch("touchEnd", 0, 0)
        await sleep(700)
      }
      const s0 = await state()
      await shot(p, `drawer-${name}-peek`)
      await startFrames(p)
      let g = await grip()
      await swipe(g, -(s0.vh * 0.35), 18, 120)
      const s1 = await state()
      expect(s1.detent === "half", `a slow pull up rests at half (top ${s0.top} to ${s1.top})`, s1)
      await shot(p, `drawer-${name}-half`)
      g = await grip()
      await swipe(g, -220, 8)
      const s2 = await state()
      expect(s2.detent === "full", `a quick pull up from half goes to nearly all (top ${s2.top})`, s2)
      await shot(p, `drawer-${name}-full`)
      g = await grip()
      await swipe(g, 420, 6)
      const s3 = await state()
      expect(s3.detent === "peek", "a flick down takes it to the foot", s3)
      const timing = await stopFrames(p)
      console.log(`        the three drags: ${timing.frames} frames in ${timing.ms}ms = ${timing.fps} fps, p95 ${timing.p95}ms, slowest ${timing.max}ms, ${timing.over33} over 33ms, ${timing.loaf} long animation frames (longest ${timing.loafMax}ms)`)
      /* Main thread frames over three gestures: each ends in one render of the editor (the glide itself is the compositor's). */
      expect(timing.fps >= 50 && timing.p95 <= 34, "the drawer moves at the frame rate", timing)
      /* The same pull up and flick down again, filmed, for the frame sheet (the filming costs frames of its own). */
      g = await grip()
      const n = await screencast(cdp, async () => {
        await swipe(g, -(s0.vh * 0.35), 14, 80)
        g = await grip()
        await swipe(g, s0.vh * 0.4, 5)
      }, `drawer-${name}`, { cols: 4, width: name === "390" ? 260 : 300 })
      console.log(`        frame sheet from ${n} screencast frames`)
      await p.tap("[data-page-drawer-handle]")
      await sleep(700)
      const s4 = await state()
      expect(s4.detent === "half", "a tap on the grip steps it from the foot to half", s4)
      await p.tap("[data-page-drawer-handle]")
      await sleep(700)
      await p.tap("[data-page-drawer-handle]")
      await sleep(700)
      await p.evaluate(() => document.querySelector("[data-page-open-sheet]")?.click())
      await sleep(700)
      /* A part pressed on the page: the drawer up at its group, the part above the drawer. */
      await p.evaluate(() => { const b = document.querySelector("[data-page-drawer]"); if (b?.getAttribute("data-detent") !== "peek") document.querySelector("[data-page-open-sheet]").click() })
      await sleep(700)
      const fr = await frameOf(p)
      const pt = await fr.evaluate(() => { const el = document.querySelector("[data-page-block=description]"); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 20 } })
      await sleep(300)
      const fb = await p.evaluate(() => { const f = document.querySelector("iframe[data-page-preview]"); const b = f.getBoundingClientRect(); return { x: b.left, y: b.top, s: b.width / f.offsetWidth } })
      await p.touchscreen.tap(fb.x + pt.x * fb.s, fb.y + pt.y * fb.s)
      await sleep(1400)
      const picked = await p.evaluate(() => {
        const d = document.querySelector("[data-page-drawer]")
        const s = document.querySelector("[data-page-sheet]").getBoundingClientRect()
        const f = document.querySelector("iframe[data-page-preview]")
        const fb = f.getBoundingClientRect()
        const sc = fb.width / f.offsetWidth
        const el = f.contentDocument.querySelector("[data-page-block=description]").getBoundingClientRect()
        const open = document.querySelector("[data-page-group=about]")?.hasAttribute("data-open")
        return { detent: d.getAttribute("data-detent"), open, partTop: Math.round(fb.top + el.top * sc), drawerTop: Math.round(s.top), cardTop: Math.round(document.querySelector("[data-preview-pane]").getBoundingClientRect().top) }
      })
      expect(picked.detent === "half" && picked.open && picked.partTop >= picked.cardTop - 2 && picked.partTop < picked.drawerTop - 20, "a part pressed raises the drawer at its group and shows the part above it", picked)
      await shot(p, `drawer-${name}-picked`)
      expect(errors.length === 0, "no errors", errors.slice(0, 2))
      await p.close()
    }
  }

  /* ── OUTLINES ───────────────────────────────────────────────────────── */
  if (want("OUTLINES")) {
    console.log("\nOUTLINES")
    for (const [name, vp, device] of [["1440x2", { width: 1440, height: 900, deviceScaleFactor: 2 }, "desktop"], ["1440x2-phone", { width: 1440, height: 900, deviceScaleFactor: 2 }, "phone"], ["1024", { width: 1024, height: 768, deviceScaleFactor: 1 }, "desktop"]]) {
      const { p, errors } = await open("/app/community/salajanywood/page", vp)
      await p.evaluate(() => document.querySelector(".orders-pane")?.scrollTo(0, document.querySelector("[data-community-header]")?.offsetHeight ?? 0))
      if (device === "phone") await p.click("[data-page-device-option=phone]")
      await sleep(700)
      const fr = await frameOf(p)
      for (const block of ["name", "tagline", "join", "gallery"]) {
        const pt = await fr.evaluate((block) => {
          const el = [...document.querySelectorAll(`[data-page-block=${block}]`)].filter((e) => e.getClientRects().length).sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0]
          if (!el) return null
          const r0 = el.getBoundingClientRect()
          if (r0.top < 60 || r0.bottom > innerHeight - 40) scrollTo(0, Math.max(0, scrollY + r0.top - 200))
          const r = el.getBoundingClientRect()
          return { x: r.left + Math.min(20, r.width / 3), y: r.top + Math.min(10, r.height / 3) }
        }, block)
        if (!pt) continue
        await sleep(300)
        const fb = await p.evaluate(() => { const f = document.querySelector("iframe[data-page-preview]"); const b = f.getBoundingClientRect(); return { x: b.left, y: b.top, s: b.width / f.offsetWidth } })
        await p.mouse.move(fb.x + pt.x * fb.s, fb.y + pt.y * fb.s)
        await sleep(350)
        const m = await fr.evaluate((dpr) => {
          const o = document.querySelector("[data-hotspot][data-hotspot-state=hover]")
          if (!o) return null
          const block = o.getAttribute("data-hotspot")
          const els = [...document.querySelectorAll(`[data-page-block=${block}]`)]
          const ob = o.getBoundingClientRect()
          const cs = getComputedStyle(o)
          const lw = Number(o.getAttribute("data-line")) + Number(o.getAttribute("data-gap"))
          const inner = { left: ob.left + lw, top: ob.top + lw, right: ob.right - lw, bottom: ob.bottom - lw }
          /* The copy it outlines: the one whose box its inside matches best. */
          const fit = els.map((e) => { const r = e.getBoundingClientRect(); return { r, err: Math.max(Math.abs(r.left - inner.left), Math.abs(r.top - inner.top), Math.abs(r.right - inner.right), Math.abs(r.bottom - inner.bottom)) } }).sort((a, b) => a.err - b.err)[0]
          const f = window.frameElement
          const scale = f.getBoundingClientRect().width / f.offsetWidth
          const tab = document.querySelector("[data-edit-chip]:not([data-edit-badge])")
          return { block, errScreen: Math.round(fit.err * scale * dpr * 100) / 100, lineDevicePx: Math.round(Number(o.getAttribute("data-line")) * scale * dpr * 100) / 100, radiusScreen: Math.round(parseFloat(cs.borderTopRightRadius) * scale * 10) / 10, partRadius: Math.round(parseFloat(getComputedStyle(els[0]).borderTopRightRadius) * scale * 10) / 10, tab: tab ? tab.textContent : null, h: Math.round(ob.height * scale), drawnAt: Number(document.querySelector("[data-preview-hotspots]")?.getAttribute("data-scale")), scale: Math.round(scale * 1000) / 1000 }
        }, vp.deviceScaleFactor)
        expect(!!m && m.errScreen <= 1.01 && Math.abs(m.lineDevicePx - vp.deviceScaleFactor) < 0.02 && m.radiusScreen <= Math.max(2.5, m.partRadius + 2) && !!m.tab, `${name} ${block}: the outline is the part's own box within a device pixel, a line of one screen pixel, its own corners, its name on the tab`, m)
      }
      /* The part being edited: two device pixels. */
      await p.evaluate(() => document.querySelector("[data-page-group-button=about]")?.click())
      await sleep(500)
      const sel = await fr.evaluate((dpr) => { const o = document.querySelector("[data-hotspot-state=selected]"); if (!o) return null; const f = window.frameElement; const s = f.getBoundingClientRect().width / f.offsetWidth; return Math.round(Number(o.getAttribute("data-line")) * s * dpr * 100) / 100 }, vp.deviceScaleFactor)
      expect(sel === 2 * vp.deviceScaleFactor || sel === 2 * vp.deviceScaleFactor - 0 || (sel >= 1.99 * vp.deviceScaleFactor && sel <= 2.01 * vp.deviceScaleFactor), `${name}: the part being edited has a two pixel line`, sel)
      await shot(p, `outline-${name}-page`)
      const r = await p.evaluate(() => { const f = document.querySelector("iframe[data-page-preview]"); const fb = f.getBoundingClientRect(); const s = fb.width / f.offsetWidth; const o = f.contentDocument.querySelector("[data-hotspot-state=selected]")?.getBoundingClientRect(); return o ? { x: Math.max(0, fb.left + o.left * s - 24), y: Math.max(0, fb.top + o.top * s - 24), width: Math.min(innerWidth - 1, o.width * s + 48), height: Math.min(300, o.height * s + 48) } : null })
      if (r) await shot(p, `outline-${name}-selected`, r)
      expect(errors.length === 0, `${name}: no errors`, errors.slice(0, 2))
      await p.close()
    }
    /* Touch: square badges. */
    const { p } = await open("/app/community/salajanywood/page", SIZES["390"].vp, { cpu: 1 })
    const fr = await frameOf(p)
    const badges = await fr.evaluate(() => [...document.querySelectorAll("[data-edit-badge]")].map((b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), radius: getComputedStyle(b).borderTopLeftRadius } }))
    expect(badges.length > 2 && badges.every((b) => b.w === b.h && parseFloat(b.radius) < b.w / 3), "touch: a square pencil per part, never a disc or a pill", badges.slice(0, 3))
    await shot(p, "outline-390-badges")
    await p.close()
  }

  /* ── LEGAL ──────────────────────────────────────────────────────────── */
  if (want("LEGAL")) {
    console.log("\nLEGAL")
    const { p, errors } = await open("/app/community/salajanywood/page?legal=1", SIZES["1440"].vp)
    const fr = await frameOf(p)
    const links = await fr.evaluate(() => [...document.querySelectorAll("[data-community-legal] a")].map((a) => ({ href: a.getAttribute("href"), own: a.hasAttribute("data-legal-own"), rel: a.getAttribute("rel") })))
    expect(links.length === 2 && links[0].href === "https://salajanywood.com/privacy" && links[1].href === "https://salajanywood.com/terms" && links.every((l) => l.own && /nofollow/.test(l.rel)), "the page links the creator's own Privacy and Terms", links)
    await p.click("[data-page-group-button=links]")
    await sleep(300)
    await p.$eval("[data-legal-input=terms]", (e) => e.scrollIntoView({ block: "center" }))
    await p.click("[data-legal-input=terms]", { count: 3 })
    await p.keyboard.press("Backspace")
    await sleep(200)
    const back = await fr.evaluate(() => document.querySelector('[data-legal-link="terms"]')?.getAttribute("href"))
    expect(back === "https://storelib.com/legal/terms", "an empty field puts Storelib's terms back on the page", back)
    await p.keyboard.type("javascript:alert(1)")
    await sleep(200)
    const bad = await p.$eval("[data-legal-problem=terms]", (e) => e.textContent).catch(() => null)
    expect(!!bad, "an address that is not a web page is refused under the field", bad)
    await shot(p, "legal-panel")
    const { p: p2 } = await open("/app/community/salajanywood/page", SIZES["1440"].vp)
    const fr2 = await frameOf(p2)
    const plain = await fr2.evaluate(() => [...document.querySelectorAll("[data-community-legal] a")].map((a) => a.getAttribute("href")))
    expect(plain.join() === "https://storelib.com/legal/privacy,https://storelib.com/legal/terms", "without them, Storelib's stay", plain)
    expect(errors.length === 0, "no errors", errors.slice(0, 2))
    await p.close()
    await p2.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} FAILED` : `\nall ok   (pictures in ${shots})`)
process.exit(broken ? 1 : 0)
