/**
 * Landing round 6 (performance): the three dot fields (the purple sheet's and the closing call's DotField, How it
 * works' HowField) are drawn by one engine in a Web Worker on OffscreenCanvases, and cost the page's thread nothing.
 *
 *   - One engine (dot-field-engine.ts, no DOM), one config object per look, every number as it was.
 *   - The worker's string is up to date; the page starts it from a blob URL, with the Safari ticker.
 *   - The main thread path stays as the fallback (no Worker / OffscreenCanvas / transferControlToOffscreen).
 *   - The page only observes (visibility, size once per change), posts the mouse at most once a frame, never reads
 *     layout in a frame; a covered sheet stops the field; a tall box is cut into tiles, only near ones are drawn.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import {
  DOT_FIELD_CONFIGS,
  DOT_FIELD_MAX_DPR,
  DOT_FIELD_TILE,
  DOT_FIELD_TONES,
  HOW_FIELD,
  createDotEngine,
  dotFieldTiles,
  howFieldFade,
  type TileCanvas,
} from "@/components/marketing/home/dot-field-engine"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")
const DIR = "components/marketing/home"
const engineSrc = code(`${DIR}/dot-field-engine.ts`)
const mountSrc = code(`${DIR}/dot-field-mount.ts`)
const driverSrc = code(`${DIR}/dot-field-driver.ts`)
const workerSrc = code(`${DIR}/dot-field-worker.ts`)
const dotSrc = code(`${DIR}/dot-field.tsx`)
const howSrc = code(`${DIR}/how-it-works.tsx`)

console.log("\n── One engine, one config each, the old numbers ──")
{
  const { dark, purple, how } = DOT_FIELD_CONFIGS
  check("dark: rest 0.34, lit 0.68, r 0.8, ride 0, trough 0.45, 32 levels, radius 180, follow 0.075, part 6", dark.rest === 0.34 && dark.lit === 0.68 && dark.r === 0.8 && dark.ride === 0 && dark.trough === 0.45 && dark.levels === 32 && dark.radius === 180 && dark.follow === 0.075 && dark.part === 6)
  check("purple: rest 0.17, lit 0.4, r 0.95, ride 0.5, trough 0.3", purple.rest === 0.17 && purple.lit === 0.4 && purple.r === 0.95 && purple.ride === 0.5 && purple.trough === 0.3 && purple.rgb === "255,255,255")
  check("the flow's waves and the light's paths as they were", dark.rate[0] === 0.00038 && dark.rate[1] === 0.00016 && dark.rideX === 0.8 && dark.rideY === 1.4 && dark.pathX.join() === "0.5,0.32,0.00011" && dark.pathY.join() === "0.42,0.26,0.000083,1.3")
  check("the wander: 0.6 on the closing call, 0.45 / 0.55 on the purple; it follows within 40px of the box", dark.alone.join() === "0.6,0.6" && purple.alone.join() === "0.45,0.55" && dark.within === 40 && purple.within === 40)
  check("how: gap 20, 1.5 dpr, ink 24,24,27 at 0.15, violet 124,58,237 at 0.6, radius 170, part 5, 20 levels, follow 0.08", HOW_FIELD.gap === 20 && how.maxDpr === 1.5 && how.rgb === "24,24,27" && how.rest === 0.15 && how.rgbLit === "124,58,237" && how.lit === 0.6 && how.radius === 170 && how.part === 5 && how.levels === 20 && how.follow === 0.08)
  check("how: its own waves, ride, path and radii, 30 frames a second without a mouse", how.rate.join() === "0.0004,0.00017" && how.rideX === 1.2 && how.rideY === 1.8 && how.trough === 0.3 && how.pathX.join() === "0.5,0.34,0.00013" && how.pathY.join() === "0.36,0.2,0.000097,1.3" && how.r === 0.9 && how.rLit === 1.15 && how.alone.join() === "0.55,0.55" && how.within === null && how.frameMs.join() === "12,30")
  check("the dark and purple tones are the exported ones; the dpr cap is 2", DOT_FIELD_CONFIGS.dark.rest === DOT_FIELD_TONES.dark.rest && DOT_FIELD_MAX_DPR === 2 && dark.maxDpr === 2)
  const f = (x: number, y: number) => howFieldFade(x, y, 1440, 640)
  check("how's per-dot fade: full at the top middle, none at the bottom, soft at the sides", f(720, 40) > 0.9 && f(720, 640) === 0 && f(0, 40) < f(720, 40) * 0.5)
}

console.log("\n── The tiles ──")
{
  const t = dotFieldTiles(1265)
  check("a 1265px box is two tiles, 640 and 625", t.length === 2 && t[0].height === 640 && t[1].top === 640 && t[1].height === 625)
  check("a 603px box and How's 640px are one tile", dotFieldTiles(603).length === 1 && dotFieldTiles(640).length === 1)
  check("a tile is a multiple of 4 px (a whole number of device pixels at 1, 1.25, 1.5, 2)", DOT_FIELD_TILE % 4 === 0)
}

console.log("\n── The engine runs, with no DOM ──")
{
  type Fill = { style: string; arcs: number }
  const mk = () => {
    const fills: Fill[] = []
    let style = ""
    let arcs = 0
    const ctx = {
      setTransform: () => {},
      clearRect: () => {},
      beginPath: () => {
        arcs = 0
      },
      moveTo: () => {},
      arc: () => {
        arcs++
      },
      fill: () => fills.push({ style, arcs }),
      set fillStyle(v: string) {
        style = v
      },
      get fillStyle() {
        return style
      },
    }
    const canvas: TileCanvas = { width: 0, height: 0, getContext: () => ctx }
    return { canvas, fills }
  }
  let now = 0
  let cb: ((t: number) => void) | null = null
  const drawn: string[] = []
  const engine = createDotEngine({
    raf: (c) => {
      cb = c
      return 1
    },
    caf: () => {
      cb = null
    },
    now: () => now,
    onDrawn: (id, n) => drawn.push(`${id}:${n}`),
  })
  const step = (ms: number) => {
    now += ms
    const c = cb
    cb = null
    c?.(now)
  }
  const a = mk()
  const b = mk()
  engine.field(1, "purple", 22, true, false)
  engine.tile(1, 0, a.canvas)
  engine.tile(1, 1, b.canvas)
  engine.size(1, 1440, 1265, 2)
  check("the canvases are sized: width x dpr, each tile's height x dpr", a.canvas.width === 2880 && a.canvas.height === 1280 && b.canvas.width === 2880 && b.canvas.height === 1250)
  check("nothing is drawn, and no loop, while no tile is near", a.fills.length === 0 && b.fills.length === 0 && cb === null)
  engine.tileOn(1, 0, true)
  check("a tile coming near starts the loop, and its first frame is drawn", cb !== null && a.fills.length === 0)
  step(16.7)
  check("the near tile is drawn and reported, the far one is not", a.fills.length > 0 && b.fills.length === 0 && drawn.includes("1:0"))
  const first = a.fills.length
  step(16.7)
  check("the loop draws the near tile each frame and not the far one", a.fills.length > first && b.fills.length === 0)
  engine.hide(true)
  check("a hidden tab stops the loop", cb === null)
  engine.hide(false)
  check("and it starts again", cb !== null)
  engine.cover(1, true)
  check("a sheet that covers the field stops the loop", cb === null)
  engine.cover(1, false)
  engine.tileOn(1, 0, false)
  check("no tile near: no loop", cb === null)
  engine.stop()

  /* The light follows the mouse: dots near it are brighter than the same dots with the mouse away. */
  const c1 = mk()
  const e2 = createDotEngine({ raf: (c) => ((cb = c), 1), caf: () => (cb = null), now: () => now, onDrawn: () => {} })
  e2.field(2, "dark", 18, true, false)
  e2.tile(2, 0, c1.canvas)
  e2.size(2, 600, 400, 1)
  e2.place(2, 0, 0)
  e2.aim(2, 300, 200, true)
  e2.tileOn(2, 0, true)
  for (let i = 0; i < 120; i++) step(16.7)
  const top = (fills: Fill[]) => Math.max(...fills.map((f) => Number(f.style.split(",")[3].replace(")", ""))))
  const lastFrame = c1.fills.slice(-40)
  check("with the mouse over the field the light reaches the lit alpha", top(lastFrame) > 0.6, top(lastFrame))
  e2.aim(2, 0, 0, false)
  for (let i = 0; i < 400; i++) step(16.7)
  const away = c1.fills.slice(-40)
  check("the light eases out when the mouse leaves (on its own path at 0.6 of its strength)", top(away) < 0.68 + 1e-9)
  e2.stop()

  /* How it works: two passes, ink and a violet light. */
  const c2 = mk()
  const e3 = createDotEngine({ raf: (c) => ((cb = c), 1), caf: () => (cb = null), now: () => now, onDrawn: () => {} })
  e3.field(3, "how", 20, true, false)
  e3.tile(3, 0, c2.canvas)
  e3.size(3, 1440, 640, 2)
  e3.tileOn(3, 0, true)
  for (let i = 0; i < 60; i++) step(33)
  check("how: the canvas is drawn at 1.5 device pixels at most", c2.canvas.width === 2160)
  check("how: ink fills and violet fills both appear", c2.fills.some((f) => f.style.startsWith("rgba(24,24,27")) && c2.fills.some((f) => f.style.startsWith("rgba(124,58,237")))
  e3.stop()

  /* Reduced motion: one still frame, never a loop. */
  const c3 = mk()
  const e4 = createDotEngine({ raf: (c) => ((cb = c), 1), caf: () => (cb = null), now: () => now, onDrawn: () => {} })
  cb = null
  e4.field(4, "dark", 18, true, true)
  e4.tile(4, 0, c3.canvas)
  e4.size(4, 600, 400, 1)
  e4.tileOn(4, 0, true)
  check("reduced motion: one still frame and no loop", c3.fills.length > 0 && cb === null)
  e4.stop()
}

console.log("\n── The worker, its string, the fallback ──")
{
  const build = await import(pathToFileURL(join(root, "scripts/build-globe-worker.mjs")).href)
  check("the worker's string is up to date (node scripts/build-globe-worker.mjs)", read(`${DIR}/dot-field-worker-source.ts`) === build.dotFieldWorkerModule(await build.dotFieldWorkerSource()))
  check("the engine has no DOM in it", !/\b(document|window|navigator|HTMLCanvasElement|getBoundingClientRect|addEventListener)\b/.test(engineSrc) && !/\bdocument\b|\bwindow\b/.test(workerSrc))
  check("the page starts the worker from a blob: URL and hands each canvas over", /new Blob\(\[DOT_FIELD_WORKER_SOURCE\]/.test(driverSrc) && /new Worker\(url\)/.test(driverSrc) && /transferControlToOffscreen\(\)/.test(driverSrc))
  check("Safari: a worker without requestAnimationFrame is sent the display's frames while it asks, not a timer", /worker\.postMessage\(\{ type: "ticker" \}\)/.test(driverSrc) && /type: "frame", t: performance\.timeOrigin \+ t/.test(driverSrc) && /if \(nativeRaf\) return scope\.requestAnimationFrame!\(cb\)\s*if \(ticker\) \{/.test(workerSrc) && /if \(!waiting\) ask\(false\)/.test(workerSrc))
  check("the main thread path is the fallback where Worker, OffscreenCanvas or transferControlToOffscreen is missing", /typeof Worker !== "function" \|\| typeof OffscreenCanvas !== "function"/.test(driverSrc) && /transferControlToOffscreen !== "function"\) return null/.test(driverSrc) && /startWorker\(notify\) \?\? startLocal\(notify\)/.test(driverSrc) && /createDotEngine\(\{\s*raf: \(cb\) => requestAnimationFrame\(cb\)/.test(driverSrc))
  check("canvases are made fresh by the page (a canvas handed to a worker can never be drawn on again), never by React", /document\.createElement\("canvas"\)/.test(mountSrc) && !/<canvas/.test(dotSrc) && !/<canvas/.test(howSrc))
}

console.log("\n── The page only observes and posts ──")
{
  check("visibility: an IntersectionObserver per tile (a little early) and visibilitychange for the page", /new IntersectionObserver/.test(mountSrc) && /rootMargin/.test(mountSrc) && /visibilitychange/.test(driverSrc))
  check("size: a ResizeObserver, one message per change", /new ResizeObserver\(resize\)/.test(mountSrc) && /\(nw === w && nh === h\)/.test(mountSrc))
  check("the mouse only, posted at most once per animation frame", /pointerType !== "mouse"/.test(mountSrc) && /if \(!queued\) queued = requestAnimationFrame\(flush\)/.test(mountSrc) && /driver\.aim\(id, sx, sy, true\)/.test(mountSrc))
  const reads = (mountSrc.match(/getBoundingClientRect/g) ?? []).length
  const flushBody = mountSrc.slice(mountSrc.indexOf("const flush"), mountSrc.indexOf("const onMove"))
  check("the box's place is read on resize, on a tile coming near and when the mouse first comes in, never in the flush", reads === 1 && !/place\(\)|getBoundingClientRect/.test(flushBody) && /const place = \(\) =>/.test(mountSrc))
  check("no layout read, no scroll listener and no React state in either field", !/scroll"/.test(mountSrc) && !/useState/.test(dotSrc) && !/useState/.test(howSrc.slice(howSrc.indexOf("function HowField"), howSrc.indexOf("function useDomainCut"))))
  check("a covered sheet pauses the field: it reads data-sheet-covered and listens for the sheet-cover event", /closest\("\[data-sheet-covered\]"\)/.test(mountSrc) && /addEventListener\("sheet-cover"/.test(mountSrc))
  check("reduced motion and a fine pointer are honoured", /prefers-reduced-motion: reduce/.test(mountSrc) && /if \(fine && !reduced\)/.test(mountSrc))
  check("DotField keeps its props and passes its tone and gap; HowField follows the section's mouse", /gap = 18,\s*fade = "edges",\s*tone = "dark",/.test(dotSrc) && /mountDotField\(box, \{ kind: tone, gap, pointer: "window" \}\)/.test(dotSrc) && /mountDotField\(box, \{ kind: "how", gap: HOW_FIELD\.gap, pointer: section \}\)/.test(howSrc))
  const reg = read("scripts/run-push-tests.mjs")
  check("registered", /"tests\/home-landing-dotworker6\.test\.ts"/.test(reg))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
