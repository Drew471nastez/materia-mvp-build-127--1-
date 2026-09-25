/**
 * ===========================================================================
 *  WHAT THE GLOBE COSTS A FRAME, OLD AND NEW
 * ===========================================================================
 * "Make the globe better and optimized for performance so it doesn't lag
 * things and is smoother on interaction."
 *
 * The globe alone on a page, at the size it is drawn in the banner on a
 * 390 phone (3x screen) and at 1440 (2x), the processor slowed four times,
 * turning by itself for four seconds and then dragged for one. Three
 * versions:
 *
 *   old   the 2D canvas globe this replaced (from git, BASE below)
 *   gl    the new one, drawn with WebGL (components/app/home/globe-gl.ts)
 *   2d    the new one on a device without WebGL (globe-2d.ts)
 *
 * For each: the canvas's pixels, the page's own time per frame (the frame
 * callbacks, from a trace), the bytes allocated per frame (V8's sampling
 * heap profiler, over the same frames), what else repainted, how long a
 * drag's pointer events and frames took, and at mount the longest task
 * after the page's own script has loaded (the globe starting) and the time
 * to the first frame drawn. The graphics process's time is
 * printed too: here it is SwiftShader, the processor standing in for a
 * graphics card, so it is where WebGL pays in this harness and not on a
 * phone.
 *
 *   node scripts/check-home-globe.mjs
 *   BASE=<commit> node scripts/check-home-globe.mjs
 *   CANVAS=gpu ONLY=old,2d node scripts/check-home-globe.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BASE = process.env.BASE ?? "96949910"
const CPU = Number(process.env.CPU ?? 4)
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ─── The three pages ─────────────────────────────────────────────────── */
const dir = join(root, `.home-globe-${process.pid}-probe`)
mkdirSync(join(dir, "old"), { recursive: true })
let oldSource = ""
try {
  oldSource = execFileSync("git", ["show", `${BASE}:components/app/home/globe.tsx`], { cwd: root, encoding: "utf8" })
  writeFileSync(join(dir, "old/globe.tsx"), oldSource)
  writeFileSync(join(dir, "old/globe-land.ts"), execFileSync("git", ["show", `${BASE}:components/app/home/globe-land.ts`], { cwd: root, encoding: "utf8" }))
} catch {
  rmSync(dir, { recursive: true, force: true })
  fail(`Could not read the old globe from ${BASE}.`)
}
const entry = (from) => `import { createRoot } from "react-dom/client"
import { createElement } from "react"
import { BannerGlobe } from ${JSON.stringify(from)}
const size = Number(new URLSearchParams(location.search).get("size") || 200)
const box = document.getElementById("box")
box.style.width = size + "px"
box.style.height = size + "px"
createRoot(box).render(createElement(BannerGlobe, { className: "globe" }))
window.__ran = true
`
const bundles = {}
for (const [name, from] of [["old", join(dir, "old/globe.tsx")], ["new", join(root, "components/app/home/globe.tsx")]]) {
  writeFileSync(join(dir, `${name}-entry.tsx`), entry(from))
  execFileSync("pnpm", ["exec", "esbuild", join(dir, `${name}-entry.tsx`), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic",
    "--log-level=error", `--outfile=${join(dir, `${name}.js`)}`, '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  bundles[name] = readFileSync(join(dir, `${name}.js`), "utf8")
}
rmSync(dir, { recursive: true, force: true })
const page = (name) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;height:100%;background:#eceef2}#stage{display:flex;align-items:center;justify-content:center;height:100%}
#box{position:relative}.globe{position:absolute;inset:0;width:100%;height:100%}
</style></head><body><div id="stage"><div id="box"></div></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${bundles[name]}</script></body></html>`
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page(req.url.startsWith("/old") ? "old" : "new"))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/* ─── Measuring one ───────────────────────────────────────────────────── */
const CASES = [
  /* Sizes are the ones the banner draws at: old h-[190px] under sm and 250 above; new 168 at a 390 phone's banner and 292 at 1440's. */
  { variant: "old", view: "390", width: 390, height: 844, dpr: 3, mobile: true, size: 190 },
  { variant: "gl", view: "390", width: 390, height: 844, dpr: 3, mobile: true, size: 168 },
  { variant: "2d", view: "390", width: 390, height: 844, dpr: 3, mobile: true, size: 168 },
  { variant: "old", view: "1440", width: 1440, height: 900, dpr: 2, mobile: false, size: 250 },
  { variant: "gl", view: "1440", width: 1440, height: 900, dpr: 2, mobile: false, size: 292 },
  { variant: "2d", view: "1440", width: 1440, height: 900, dpr: 2, mobile: false, size: 292 },
]
const only = process.env.ONLY ? process.env.ONLY.split(",") : null
/*
  2D CANVASES ARE DRAWN IN SOFTWARE HERE, in the page's own process, by
  default. This browser has no graphics card: an "accelerated" 2D canvas
  goes to SwiftShader, the processor pretending to be one, which saturates
  on any 2D globe (old or new) at a few frames a second and then measures
  only the waiting. In software the page's thread does the drawing and the
  numbers are the work itself, which is what a device without a usable
  graphics card does too. WebGL still goes to SwiftShader.
  CANVAS=gpu measures the accelerated path anyway.
*/
const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-proxy-server", ...(process.env.CANVAS === "gpu" ? [] : ["--disable-accelerated-2d-canvas"])],
})
const results = []
try {
  for (const c of CASES) {
    if (only && !only.includes(c.variant)) continue
    const tab = await browser.newPage()
    await tab.setViewport({ width: c.width, height: c.height, deviceScaleFactor: c.dpr, isMobile: c.mobile, hasTouch: c.mobile })
    if (c.variant === "2d") await tab.evaluateOnNewDocument(() => {
      const get = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, attrs) { return /webgl/.test(type) ? null : get.call(this, type, attrs) }
    })
    if (c.variant === "gl") await tab.evaluateOnNewDocument(() => {
      /* This browser's WebGL is SwiftShader; the globe would still take it, but say so plainly rather than rely on it. */
      const get = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, attrs) { return get.call(this, type, type === "webgl" && attrs ? { ...attrs, failIfMajorPerformanceCaveat: false } : attrs) }
    })
    const cdp = await tab.createCDPSession()
    /* MOUNT: the longest task while the globe starts, and how long until its first frame is drawn. */
    await tab.evaluateOnNewDocument(() => {
      window.__firstTick = 0
      const raf = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (cb) => raf((t) => {
        if ((cb.name === "tick") && !window.__firstTick) window.__firstTick = performance.now()
        cb(t)
      })
    })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
    const mountPath = join(mkdtempSync(join(tmpdir(), "globe-mount-")), "t.json")
    await tab.tracing.start({ path: mountPath, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "toplevel"] })
    await tab.goto(`${base}/${c.variant === "old" ? "old" : "new"}?size=${c.size}`)
    await tab.waitForSelector("[data-home-globe]", { timeout: 15000 })
    await sleep(2500)
    await tab.tracing.stop()
    const firstFrame = await tab.evaluate(() => window.__firstTick)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const mountTrace = JSON.parse(readFileSync(mountPath, "utf8")).traceEvents
    rmSync(mountPath, { force: true })
    const mountNames = new Map()
    for (const e of mountTrace) if (e.ph === "M" && e.name === "thread_name") mountNames.set(`${e.pid}:${e.tid}`, e.args.name)
    const mains = [...mountNames.entries()].filter(([, n]) => n === "CrRendererMain").map(([k]) => k)
    const mountTasks = mountTrace.filter((e) => mains.includes(`${e.pid}:${e.tid}`) && e.name === "RunTask" && e.ph === "X")
    /* The page's own renderer: the one whose main thread did the most. */
    const byThread = new Map()
    for (const t of mountTasks) byThread.set(`${t.pid}:${t.tid}`, (byThread.get(`${t.pid}:${t.tid}`) ?? 0) + t.dur)
    const pageMain = [...byThread.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    /* Not the task that parses the page and evaluates its bundle: that is this harness loading React, the same for every version. */
    const loading = mountTrace.filter((e) => `${e.pid}:${e.tid}` === pageMain && (e.name === "ParseHTML" || e.name === "EvaluateScript"))
    const pageTasks = mountTasks.filter((t) => `${t.pid}:${t.tid}` === pageMain && !loading.some((e) => e.ts >= t.ts && e.ts <= t.ts + t.dur))
    const longestMount = Math.max(0, ...pageTasks.map((t) => t.dur)) / 1000
    /* What the longest one was made of: evaluating the page's script, React's first render, the globe's start. */
    const top = pageTasks.sort((a, b) => b.dur - a.dur)[0]
    const mountContents = top
      ? [...mountTrace.filter((e) => `${e.pid}:${e.tid}` === pageMain && e.ph === "X" && e.ts >= top.ts && e.ts + e.dur <= top.ts + top.dur && e.dur > 3000 && !/RunTask|ThreadControllerImpl/.test(e.name))
          .reduce((m, e) => { const k = e.name === "FunctionCall" ? `FunctionCall ${e.args?.data?.functionName || "?"}` : e.name; m.set(k, Math.max(m.get(k) ?? 0, e.dur)); return m }, new Map())]
          .sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)}ms`).join(", ")
      : ""
    if (process.env.MOUNT_DETAIL) console.log(`  ${c.view} ${c.variant} mount's longest task: ${mountContents}`)
    await sleep(1200)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
    await sleep(600)
    const canvas = await tab.evaluate(() => {
      const el = document.querySelector("[data-home-globe]")
      const box = el.closest("[data-home-globe-box]")
      return { w: el.width, h: el.height, renderer: box?.dataset.renderer ?? "2d (old)" }
    })

    /* Idle: four seconds of turning, traced, with the heap sampled. */
    const tracePath = join(mkdtempSync(join(tmpdir(), "globe-")), "t.json")
    await cdp.send("HeapProfiler.enable")
    await cdp.send("HeapProfiler.collectGarbage")
    await cdp.send("HeapProfiler.startSampling", { samplingInterval: 256 })
    await tab.tracing.start({ path: tracePath, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "blink.user_timing", "toplevel", "gpu"] })
    await tab.evaluate(() => performance.mark("idle:start"))
    await sleep(4000)
    await tab.evaluate(() => performance.mark("idle:end"))
    const { profile } = await cdp.send("HeapProfiler.stopSampling")

    /* A drag: across the globe and back, a pointer move every 16ms for a second. */
    const box = await tab.evaluate(() => { const b = document.querySelector("[data-home-globe]").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width } })
    await tab.evaluate(() => performance.mark("drag:start"))
    if (c.mobile) {
      const t = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 8, radiusY: 8, force: 1 }] })
      await t("touchStart", box.x - box.w * 0.2, box.y)
      for (let i = 1; i <= 60; i++) {
        const t0 = Date.now()
        await t("touchMove", box.x - box.w * 0.2 + Math.sin((i / 60) * Math.PI) * box.w * 0.35, box.y + Math.sin((i / 30) * Math.PI) * box.w * 0.1)
        const wait = 16 - (Date.now() - t0)
        if (wait > 0) await sleep(wait)
      }
      await t("touchEnd")
    } else {
      await tab.mouse.move(box.x - box.w * 0.2, box.y)
      await tab.mouse.down()
      for (let i = 1; i <= 60; i++) {
        const t0 = Date.now()
        await tab.mouse.move(box.x - box.w * 0.2 + Math.sin((i / 60) * Math.PI) * box.w * 0.35, box.y + Math.sin((i / 30) * Math.PI) * box.w * 0.1)
        const wait = 16 - (Date.now() - t0)
        if (wait > 0) await sleep(wait)
      }
      await tab.mouse.up()
    }
    await tab.evaluate(() => performance.mark("drag:end"))
    await sleep(300)
    await tab.tracing.stop()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await tab.close()

    const trace = JSON.parse(readFileSync(tracePath, "utf8"))
    rmSync(tracePath, { force: true })
    const ev = trace.traceEvents || trace
    const names = new Map()
    for (const e of ev) if (e.ph === "M" && e.name === "thread_name") names.set(`${e.pid}:${e.tid}`, e.args.name)
    const mark = (n) => ev.find((e) => e.name === n && e.cat?.includes("blink.user_timing"))
    const pid = mark("idle:start")?.pid
    const main = [...names.entries()].find(([k, n]) => n === "CrRendererMain" && k.startsWith(`${pid}:`))?.[0]
    const gpu = [...names.entries()].filter(([, n]) => n === "CrGpuMain").map(([k]) => k)
    const window = (a, b) => {
      const s = mark(a)?.ts
      const e = mark(b)?.ts
      const onMain = ev.filter((x) => `${x.pid}:${x.tid}` === main && x.ts >= s && x.ts <= e && x.ph === "X")
      const raf = onMain.filter((x) => x.name === "FireAnimationFrame").map((x) => x.dur / 1000)
      const input = onMain.filter((x) => x.name === "EventDispatch" && /pointermove|touchmove|mousemove/.test(x.args?.data?.type ?? "")).map((x) => x.dur / 1000)
      const busy = onMain.filter((x) => x.name === "RunTask").reduce((n, x) => n + x.dur, 0) / (e - s)
      const paints = onMain.filter((x) => x.name === "Paint").length
      const gpuBusy = ev.filter((x) => gpu.includes(`${x.pid}:${x.tid}`) && x.ph === "X" && x.name === "RunTask" && x.ts >= s && x.ts <= e).reduce((n, x) => n + x.dur, 0) / (e - s)
      const sorted = [...raf].sort((p, q) => p - q)
      return {
        frames: raf.length,
        msPerFrame: raf.length ? raf.reduce((p, q) => p + q, 0) / raf.length : 0,
        p95: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0,
        max: sorted.length ? sorted[sorted.length - 1] : 0,
        inputMs: input.length ? input.reduce((p, q) => p + q, 0) / input.length : 0,
        mainBusy: busy,
        gpuBusy,
        paints,
      }
    }
    const idle = window("idle:start", "idle:end")
    const drag = window("drag:start", "drag:end")

    /* Bytes allocated by the page's script over the idle frames. */
    let bytes = 0
    const walk = (node) => {
      if (node.callFrame.url && !/^(node:|extensions::)/.test(node.callFrame.url)) bytes += node.selfSize
      for (const child of node.children || []) walk(child)
    }
    walk(profile.head)
    results.push({ ...c, canvas, idle, drag, bytesPerFrame: idle.frames ? bytes / idle.frames : 0, longestMount, firstFrame })
  }
} finally {
  await browser.close()
  server.close()
}

const f = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "-")
console.log(`\nThe globe alone, CPU slowed ${CPU}x, four seconds turning by itself and one second dragged`)
console.log(`old = ${BASE}'s 2D globe; gl and 2d = the new one's two renderers\n`)
console.log("  view  version  canvas px   frames  JS/frame avg  p95    max    bytes/frame  main busy  paints  drag: JS/frame  input/event  mount: longest globe task, first frame   (GPU process, software here)")
for (const r of results) {
  console.log(`  ${r.view.padEnd(5)} ${r.variant.padEnd(8)} ${`${r.canvas.w}x${r.canvas.h}`.padEnd(10)} ${String(r.idle.frames).padStart(6)}  ${f(r.idle.msPerFrame).padStart(8)}ms  ${f(r.idle.p95).padStart(5)}  ${f(r.idle.max).padStart(5)}  ${f(r.bytesPerFrame, 0).padStart(11)}  ${f(r.idle.mainBusy * 100, 1).padStart(7)}%  ${String(r.idle.paints).padStart(6)}  ${f(r.drag.msPerFrame).padStart(12)}ms  ${f(r.drag.inputMs).padStart(9)}ms  ${f(r.longestMount, 0).padStart(10)}ms, ${f(r.firstFrame, 0).padStart(5)}ms   (${f(r.idle.gpuBusy * 100, 1)}%)`)
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(results, null, 2))

let bad = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`); if (!ok) bad++ }
console.log("")
for (const r of results.filter((x) => x.variant !== "old")) {
  const old = results.find((x) => x.variant === "old" && x.view === r.view)
  expect(r.canvas.renderer === (r.variant === "gl" ? "webgl" : "2d"), `${r.view} ${r.variant}: drawn by the ${r.variant === "gl" ? "WebGL" : "2D"} renderer`, r.canvas.renderer)
  expect(r.idle.frames > 60, `${r.view} ${r.variant}: it turns by itself`, `${r.idle.frames} frames`)
  expect(r.canvas.w <= r.size * 2 + 1, `${r.view} ${r.variant}: drawn at no more than 2x`, `${r.canvas.w}px for ${r.size}px`)
  if (old) expect(r.idle.msPerFrame < old.idle.msPerFrame, `${r.view} ${r.variant}: less of the page's time per frame than the old globe`, `${f(r.idle.msPerFrame)} vs ${f(old.idle.msPerFrame)}ms`)
  if (old) expect(r.idle.mainBusy < old.idle.mainBusy, `${r.view} ${r.variant}: the page's thread less busy than with the old globe`, `${f(r.idle.mainBusy * 100, 1)}% vs ${f(old.idle.mainBusy * 100, 1)}%`)
  if (r.variant === "gl") expect(r.bytesPerFrame < 64, `${r.view} gl: allocates next to nothing per frame`, `${f(r.bytesPerFrame, 0)} bytes`)
  if (old) expect(r.longestMount <= old.longestMount * 1.25 + 10, `${r.view} ${r.variant}: starting it holds the page no longer than the old globe did`, `${f(r.longestMount, 0)} vs ${f(old.longestMount, 0)}ms`)
}
console.log(bad ? `\n${bad} failed\n` : "\nall good\n")
process.exit(bad ? 1 : 0)
