/**
 * LANDING ROUND 20, DOTS (the owner: the whole storelib.com on a phone with
 * no glitches, stutters or lag)
 *
 * The worst glitch measured was the page itself going down. In the Safari
 * engine (Playwright WebKit 26.6 at 390x844), flicking down the home page and
 * back up brought the page's web process down in 3 runs of 8. Turning
 * features off one at a time: without the dot fields' worker, 0 of 10; with
 * the globes' workers off instead, still 2 and 3 of 10; with each canvas
 * sized only once, 0 of 10. The dot fields (the purple sheet, How it works,
 * the closing call) are cut into 640px canvases handed to a worker, and every
 * change of a box's height (a section mounting or settling, at almost every
 * fast flick) set every tile's width and height again, the same numbers
 * included, which reallocates a canvas the worker is drawing in.
 *
 * Now:
 *   - a tile's canvas is always a whole tile (DOT_FIELD_TILE tall, the box
 *     clips its foot) and is given a size only when that size changes, so a
 *     change of height never resizes a canvas (dot-field-engine.ts, fit);
 *   - a tile is cleared whole, so a field that gets shorter leaves no dots;
 *   - the page makes each tile a whole tile tall (dot-field-mount.ts) and
 *     both boxes clip (.dotf, .cmh-field);
 *   - the worker's code is rebuilt from the engine (scripts/build-globe-worker.mjs).
 */
import { readFileSync } from "node:fs"
import { createDotEngine, DOT_FIELD_TILE, type TileCanvas } from "@/components/marketing/home/dot-field-engine"
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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
