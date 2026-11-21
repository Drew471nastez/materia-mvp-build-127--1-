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
 * the page scrolled, 0. Drawing the fields on the page's own thread instead
 * cost far too much (a throttled phone in Chromium: frames over 25ms from
 * about 22% to about 60%).
 *
 * Now:
 *   - while the page scrolls the fields' loop waits (engine.scroll), and it
 *     starts again SCROLL_REST_MS after the last scroll event: one passive
 *     listener for the page (dot-field-driver.ts), a number written per
 *     event and one timer; a tile that comes near meanwhile still gets its
 *     one still frame, so none is blank;
 *   - a tile's canvas is always a whole tile (DOT_FIELD_TILE tall, the box
 *     clips its foot) and is given a size only when that size changes: a
 *     flick no longer reallocates every tile of a field as it settles;
 *   - a tile is cleared whole, so a field that gets shorter leaves no dots;
 *   - the worker's code is rebuilt from the engine (scripts/build-globe-worker.mjs).
 */
import { readFileSync } from "node:fs"
import { createDotEngine, DOT_FIELD_TILE, type TileCanvas } from "@/components/marketing/home/dot-field-engine"
import { SCROLL_REST_MS } from "@/components/marketing/home/dot-field-driver"
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

console.log("\nThe engine: no loop while the page scrolls, a still frame for a tile that comes near")
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
  check("a tile that comes near while the page scrolls is drawn once", b.clears.length === 1 && cb === null, b.clears.length)
  check("and the loop still waits", cb === null)
  engine.scroll(false)
  check("the page standing still starts the loop again", cb !== null)
  step(16)
  check("both tiles move again", a.clears.length > drawnA && b.clears.length > 1)
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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
