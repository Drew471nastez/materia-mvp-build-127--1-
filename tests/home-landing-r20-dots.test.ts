/**
 * LANDING ROUND 20, DOTS (the owner: the whole storelib.com on a phone with
 * no glitches, stutters or lag)
 *
 * The worst glitch measured was the page itself going down. In the Safari
 * engine (Playwright WebKit 26.6 at 390x844), flicking down the home page and
 * back up brought the page's web process down in 3 runs of 8. Turning
 * features off one at a time (10 runs each): without the dot fields' worker
 * 0 (twice); with the globes' workers off instead, 2 and 3; without the
 * fields' masks, 3; without their fade, 3; without content-visibility, 3; with
 * every tile kept drawing, 10 of 10; and with the fields' loop paused while
 * the page scrolled, drawing nothing, 0. Drawing the fields on the page's own thread instead
 * cost far too much in Chromium (a throttled phone: frames over 25ms from
 * about 22% to about 60%). Pausing the loop while the page scrolled and
 * adding no tile then brought WebKit to 3 crashes in 16, not none; with the
 * canvases handed over and never drawn on, 0 in 12. So it is the worker
 * drawing at all.
 *
 * Now:
 *   - WebKit (every browser on an iPhone, the iOS app's web view; read from
 *     GestureEvent, an interface only WebKit has, never the user agent;
 *     page-thread-canvas.ts) draws the fields on the page's own thread (at
 *     60 a second as before: at 30 the wandering light stepped, round 8), and
 *     the three globes too (with the
 *     dot fields alone moved, 1 in 16 still went down, by a globe); other
 *     engines keep the workers;
 *   - while the page scrolls the fields' loop waits (engine.scroll), and it
 *     starts again SCROLL_REST_MS after the last scroll event: one passive
 *     listener for the page (dot-field-driver.ts), a number written per
 *     event and one timer; nothing is drawn while the page moves, not even a
 *     still frame (that alone still crashed 2 runs in 7), so a tile first
 *     seen mid flick fades in when the page stands still, as every tile's
 *     first frame does;
 *   - a box that changes size while the page scrolls is measured again when
 *     it stands still, and a new tile's canvas is given its final size before
 *     it is handed over: no tile is added, handed over or sized in the worker
 *     while the page moves (with the loop paused alone, still 1 run in 12);
 *   - a tile's canvas is always a whole tile (DOT_FIELD_TILE tall, the box
 *     clips its foot) and is given a size only when that size changes: a
 *     flick no longer reallocates every tile of a field as it settles;
 *   - a tile is cleared whole, so a field that gets shorter leaves no dots;
 *   - the worker's code is rebuilt from the engine (scripts/build-globe-worker.mjs).
 */
import { readFileSync } from "node:fs"
import { createDotEngine, DOT_FIELD_TILE, type TileCanvas } from "@/components/marketing/home/dot-field-engine"
import { DOTS_ON_PAGE_THREAD, SCROLL_REST_MS } from "@/components/marketing/home/dot-field-driver"
import { DOT_FIELD_CSS } from "@/components/marketing/home/dot-field"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

/* A canvas that counts every size it is given, and a context that takes any call. */
function fakeCanvas() {
  let w = 300
  let h = 150
  const sets: string[] = []
  const clears: number[][] = []
  const ctx: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
    get: (t, k) => (k === "clearRect" ? (...a: number[]) => clears.push(a) : k in t ? t[k as string] : () => undefined),
    set: (t, k, v) => ((t[k as string] = v), true),
  })
  const canvas = {
    get width() { return w },
    set width(v: number) { sets.push(`w${v}`); w = v },
    get height() { return h },
    set height(v: number) { sets.push(`h${v}`); h = v },
    getContext: () => ctx,
  }
  return { canvas: canvas as TileCanvas, sets, clears }
}

console.log("\nThe engine: a change of a field's height resizes no canvas")
{
  const engine = createDotEngine({ raf: () => 0, caf: () => undefined, now: () => 0, onDrawn: () => undefined })
  engine.field(1, "purple", 22, false, true, false)
  const a = fakeCanvas()
  const b = fakeCanvas()
  engine.size(1, 390, 1100, 3)
  engine.tile(1, 0, a.canvas)
  engine.tile(1, 1, b.canvas)
  engine.size(1, 390, 1100, 3)
  const dpr = Math.min(3, 2)
  check("each tile is a whole tile tall at the field's pixel ratio", a.canvas.height === Math.round(DOT_FIELD_TILE * dpr) && b.canvas.height === Math.round(DOT_FIELD_TILE * dpr), [a.canvas.height, b.canvas.height, dpr])
  check("the last tile too, though only part of it is the field's", b.canvas.height === a.canvas.height)
  const before = [a.sets.length, b.sets.length]
  engine.size(1, 390, 1100, 3)
  engine.size(1, 390, 1180, 3)
  engine.size(1, 390, 1020, 3)
  engine.size(1, 390, 1100, 3)
  check("the same size again and three new heights: no canvas given a size", a.sets.length === before[0] && b.sets.length === before[1], { a: a.sets, b: b.sets })
  engine.size(1, 412, 1100, 3)
  check("a new width is given once, to the width only", a.sets.slice(before[0]).join() === `w${Math.round(412 * dpr)}` && b.sets.slice(before[1]).join() === `w${Math.round(412 * dpr)}`, { a: a.sets, b: b.sets })
}

console.log("\nThe engine: a tile is cleared whole")
{
  const SRC = code(read("components/marketing/home/dot-field-engine.ts"))
  check("clearRect covers the whole tile, not only the field's part of it", /ctx\.clearRect\(0, tile\.top, f\.w, DOT_FIELD_TILE\)/.test(SRC))
  check("a size is set only when it differs", /if \(tile\.canvas\.width !== cw\) tile\.canvas\.width = cw/.test(SRC) && /if \(tile\.canvas\.height !== ch\) tile\.canvas\.height = ch/.test(SRC))
  check("the canvas height is the tile's, never the field's stretch", /const ch = Math\.round\(DOT_FIELD_TILE \* f\.dpr\)/.test(SRC) && !/canvas\.height = Math\.round\(tile\.th/.test(SRC))
}

console.log("\nThe page: whole tiles in boxes that clip")
{
  const MOUNT = code(read("components/marketing/home/dot-field-mount.ts"))
  check("each tile's CSS height is a whole tile", /canvas\.style\.height = `\$\{DOT_FIELD_TILE\}px`/.test(MOUNT))
  check("a resize no longer sets a tile's height from the box", !/want\[n\]\.height/.test(MOUNT))
  check("the field's box clips (.dotf)", /\.dotf\{[^}]*overflow:clip/.test(DOT_FIELD_CSS))
  const HOW = read("components/marketing/home/how-it-works.tsx")
  check("How it works' box clips (.cmh-field)", /\.cmh-field\{[^}]*overflow:clip/.test(HOW))
}

console.log("\nThe worker runs the same engine")
{
  const WORKER = read("components/marketing/home/dot-field-worker-source.ts")
  check("the worker's code has the size guard", /\.width!==\w+&&\(\w+\.canvas\.width=\w+\)/.test(WORKER) || /width!==/.test(WORKER), WORKER.slice(0, 80))
}

console.log("\nThe engine: nothing drawn while the page scrolls, a tile that came near drawn when it stands still")
{
  let cb: ((t: number) => void) | null = null
  let now = 0
  const engine = createDotEngine({ raf: (c) => ((cb = c), 1), caf: () => { cb = null }, now: () => now, onDrawn: () => undefined })
  engine.field(1, "purple", 22, false, false, false)
  const a = fakeCanvas()
  const b = fakeCanvas()
  engine.tile(1, 0, a.canvas)
  engine.tile(1, 1, b.canvas)
  engine.size(1, 390, 1100, 2)
  engine.tileOn(1, 0, true)
  check("a tile near the screen starts the loop", cb !== null)
  const step = (ms: number) => { now += ms; const c = cb; cb = null; c?.(now) }
  step(16); step(16)
  const drawnA = a.clears.length
  check("the loop draws the tile", drawnA > 0)
  engine.scroll(true)
  check("scrolling stops the loop", cb === null)
  engine.tileOn(1, 1, true)
  check("a tile that comes near while the page scrolls is not drawn yet", b.clears.length === 0 && cb === null, b.clears.length)
  check("and the loop still waits", cb === null)
  engine.scroll(false)
  check("the page standing still starts the loop again", cb !== null)
  step(16)
  check("both tiles are drawn again", a.clears.length > drawnA && b.clears.length >= 1)
  engine.scroll(true)
  engine.hide(true)
  engine.scroll(false)
  check("a hidden tab stays without a loop when the scrolling stops", cb === null)
}

console.log("\nThe page: one passive scroll listener that pauses and resumes the fields")
{
  const DRIVER = code(read("components/marketing/home/dot-field-driver.ts"))
  check("SCROLL_REST_MS is about a tenth to a fifth of a second", SCROLL_REST_MS >= 100 && SCROLL_REST_MS <= 250, SCROLL_REST_MS)
  check("a passive scroll listener on the window, added with the shared driver", /window\.addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(DRIVER))
  check("and removed when the driver stops", /window\.removeEventListener\("scroll", onScroll\)/.test(DRIVER))
  check("a scroll event only notes the time; the pause is sent once per stretch", /lastScroll = performance\.now\(\)/.test(DRIVER) && /if \(!moving\) \{\s*moving = true\s*driver\.scroll\(true\)/.test(DRIVER))
  check("one timer re-arms itself until the page has been still SCROLL_REST_MS", /if \(!rest\) rest = setTimeout\(settleScroll, SCROLL_REST_MS\)/.test(DRIVER) && /rest = setTimeout\(settleScroll, SCROLL_REST_MS - quiet\)/.test(DRIVER))
  check("the worker and the page's own engine both take it", /scroll: \(on\) => w\.postMessage\(\{ type: "scroll", on \}\)/.test(DRIVER) && /scroll: \(on\) => engine\.scroll\(on\)/.test(DRIVER))
  const WORKER = read("components/marketing/home/dot-field-worker.ts")
  check("the worker passes it to the engine", /m\.type === "scroll"\) engine\.scroll\(m\.on\)/.test(WORKER))
  const SRC = read("components/marketing/home/dot-field-worker-source.ts")
  check("the built worker has it (scripts/build-globe-worker.mjs was run)", SRC.includes('\\"scroll\\"') || SRC.includes('"scroll"'))
}

console.log("\nThe page: no tile added, handed over or sized while the page moves")
{
  const MOUNT = code(read("components/marketing/home/dot-field-mount.ts"))
  check("a tile's canvas gets its final size before it is handed over, with the engine's sums", /const dpr = Math\.min\(DOT_FIELD_CONFIGS\[o\.kind\]\.maxDpr, window\.devicePixelRatio \|\| 1\)\s*canvas\.width = Math\.round\(w \* dpr\)\s*canvas\.height = Math\.round\(DOT_FIELD_TILE \* dpr\)/.test(MOUNT))
  check("and that before driver.tile", MOUNT.indexOf("canvas.height = Math.round(DOT_FIELD_TILE * dpr)") < MOUNT.indexOf("driver.tile(id, n, canvas)"))
  check("a resize while the page moves waits for it to stand still, once", /if \(moving\(\)\) \{\s*if \(!waiting\) \{\s*waiting = true\s*whenStill\(/.test(MOUNT))
  check("and not after the field is gone", /if \(!stopped\) resize\(\)/.test(MOUNT) && /stopped = true/.test(MOUNT))
  const DRIVER = code(read("components/marketing/home/dot-field-driver.ts"))
  check("the driver runs what waited when the page stands still", /const due = \[\.\.\.still\]\s*still\.clear\(\)\s*for \(const run of due\) run\(\)/.test(DRIVER))
  check("whenStill runs at once when the page is still", /if \(s\.moving\(\)\) s\.still\.add\(run\)\s*else run\(\)/.test(DRIVER))
}

console.log("\nWebKit draws the fields on the page's own thread")
{
  const DRIVER = code(read("components/marketing/home/dot-field-driver.ts"))
  check("the worker is not started where the engine is WebKit", /function startWorker\(onDrawn: Listener\): DotDriver \| null \{\s*if \(DOTS_ON_PAGE_THREAD\(\)\) return null/.test(DRIVER))
  check("WebKit is read by the shared rule (page-thread-canvas.ts), never the user agent", /DOTS_ON_PAGE_THREAD = canvasOnPageThread/.test(DRIVER) && !/userAgent|navigator\.vendor/.test(DRIVER))
  const g = globalThis as unknown as { window?: unknown; GestureEvent?: unknown }
  const hadWindow = "window" in g
  const before = g.window
  g.window = { GestureEvent: function GestureEvent() {} }
  const webkit = DOTS_ON_PAGE_THREAD()
  g.window = {}
  const other = DOTS_ON_PAGE_THREAD()
  if (hadWindow) g.window = before
  else delete g.window
  check("with GestureEvent: the page's thread; without: the worker", webkit === true && other === false)
}

console.log("\nThe globes: the same rule")
{
  for (const f of ["components/marketing/home/everything-globe.tsx", "components/marketing/home/analytics-globe.tsx", "components/marketing/home/platform-globe.tsx"]) {
    const SRC = code(read(f))
    check(`${f.split("/").pop()} hands its canvas to a worker only where canvasOnPageThread() is false`, /canvasOnPageThread\(\)/.test(SRC) && /from "\.\/page-thread-canvas"/.test(SRC))
  }
  const RULE = code(read("components/marketing/home/page-thread-canvas.ts"))
  check("one rule, read from GestureEvent, never the user agent", /GestureEvent/.test(RULE) && !/userAgent|navigator\.vendor/.test(RULE))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
