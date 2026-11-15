/**
 * Landing round 6, the globe in "Sell anywhere in the world"
 * (components/marketing/home/everything-globe.tsx, everything-globe-draw.ts, everything-globe-worker.ts).
 *
 * The owner: "The whole globe thing in 'Sell anywhere in the world' is very laggy. Make sure it doesn't cause lag on
 * drag and movement. And the new order notifications should show where the laser landed, where the rocket landed."
 *
 *   - The land is one path and one fill a frame, projected in one loop with the back of the ball culled early; the
 *     rim fade is a picture stamped over it, not six depth buckets sorted every frame.
 *   - A drag and a throw's coast draw every display frame; the idle spin stays at about 60 a second.
 *   - A worker without its own requestAnimationFrame (Safari) is sent the display's frames by the page while it moves,
 *     instead of stepping on a 16ms timer that drifts against the screen.
 *   - The notification is told once per landing where the city is and where the spin takes it; the page sets it just
 *     above the point (below near the top), inside the card, with a caret at the city, by transform only, and one
 *     compositor animation carries it along. It leaves early when the city turns away, leaves the card or is dragged off.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createGlobeEngine, type GlobePill, type V3 } from "@/components/marketing/home/everything-globe-draw"
import { placeNotice, clampNotice, EVERYTHING_GLOBE_ORDERS } from "@/components/marketing/home/everything-globe"

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
const globe = code("components/marketing/home/everything-globe.tsx")
const draw = code("components/marketing/home/everything-globe-draw.ts")
const worker = code("components/marketing/home/everything-globe-worker.ts")

/* A fake 2D context that records what is drawn. */
type Call = { op: string; args: unknown[]; fill?: unknown }
function recorder() {
  const calls: Call[] = []
  const state: Record<string, unknown> = {}
  const ctx = new Proxy(state, {
    get: (_t, k: string) => {
      if (k in state) return state[k]
      return (...args: unknown[]) => {
        calls.push({ op: k, args, fill: state.fillStyle })
        return { addColorStop() {} }
      }
    },
    set: (_t, k: string, v) => {
      state[k] = v
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

function makeEngine(cities: V3[], pts: Float32Array, home: V3 = [0, 0.2, 0.98]) {
  const rec = recorder()
  const canvas = { width: 0, height: 0, getContext: () => rec.ctx } as unknown as HTMLCanvasElement
  let rafCb: ((t: number) => void) | null = null
  const pills: (GlobePill & { at: number })[] = []
  let t = 0
  const engine = createGlobeEngine(
    {
      canvas,
      ctx: rec.ctx,
      makeCanvas: () => ({ width: 1, height: 1, getContext: () => recorder().ctx }) as unknown as HTMLCanvasElement,
      raf: (cb) => {
        rafCb = cb
        return 1
      },
      caf: () => {
        rafCb = null
      },
      onPill: (p) => pills.push({ ...p, at: t }),
      onDrawn: () => {},
    },
    pts,
    cities,
    home,
  )
  const step = (n: number, dt: number) => {
    for (let i = 0; i < n && rafCb; i++) {
      t += dt
      const cb: (t: number) => void = rafCb
      rafCb = null
      cb(t)
    }
  }
  return { engine, calls: rec.calls, pills, step, now: () => t, running: () => !!rafCb }
}

console.log("\n── The land: one path, one fill ──")
{
  /* A few hundred dots all over the sphere. */
  const n = 600
  const pts = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(1 - y * y)
    const a = i * 2.399963
    pts[i * 3] = r * Math.sin(a)
    pts[i * 3 + 1] = y
    pts[i * 3 + 2] = r * Math.cos(a)
  }
  const g = makeEngine([[0, 0, 1]], pts)
  g.engine.size(400, 300, 1)
  g.calls.length = 0
  g.engine.reduced(true)
  const rects = g.calls.filter((c) => c.op === "rect").length
  const landFills = g.calls.filter((c) => c.op === "fill" && /^rgba\(236,233,255,/.test(String(c.fill))).length
  /* The same rotation as the engine at rest (yaw 0.4, pitch 0.42): the dots facing the viewer. */
  const cY = Math.cos(0.4), sY = Math.sin(0.4), cP = Math.cos(0.42), sP = Math.sin(0.42)
  let facing = 0
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2]
    if (y * sP + (z * cY - x * sY) * cP > 0.04) facing++
  }
  check("every dot facing the viewer is one rect, the back of the ball none", rects === facing && facing > n * 0.4 && facing < n * 0.6, { rects, facing })
  check("all of them in one fill", landFills === 1, landFills)
  const fade = g.calls.findIndex((c) => c.op === "drawImage" && g.calls.indexOf(c) > g.calls.findIndex((d) => d.op === "fill"))
  check("the rim fade is one picture stamped right after the land", fade > 0)
  check("no depth buckets, sorting pass or per dot scratch arrays", !/DEPTH_BUCKETS|bucketCount|new Int32Array\(nPts\)/.test(draw) && /const LAND_STEPS = \[0\.07, 0\.16, 0\.28, 0\.42, 0\.58, LAND_ALPHA\]/.test(read("components/marketing/home/everything-globe-draw.ts")))
  check("the depth is worked out before the rest of the rotation, so the back is skipped early", /const depth = y \* ps \+ z1 \* pc\s*if \(depth <= 0\.04\) continue/.test(draw))
  check("fewer stroke calls for each shot's tail", /const TRAIL_CHUNKS = 8/.test(draw))
}

console.log("\n── Frames: every display frame, a drag keeps up with the screen ──")
{
  /* The round 6 find: a drawn frame used to be followed by a frame that only reset the time base, so it drew every other frame. */
  const s = makeEngine([[0, 0, 1]], new Float32Array([0, 0, 1]))
  s.engine.size(400, 300, 1)
  s.engine.reduced(false)
  s.engine.run(true)
  s.step(2, 16.67)
  const sc = s.calls.filter((c) => c.op === "clearRect").length
  s.step(60, 16.67)
  const at60 = s.calls.filter((c) => c.op === "clearRect").length - sc
  check("on a 60Hz display the idle spin draws every frame (it drew every other one before)", at60 >= 59, at60)
  check("the tick asks for its own next frame", /if \(\(st\.want && !st\.reduced\) \|\| interacting\(\)\) st\.frame = host\.raf\(tick\)\s*sync\(\)/.test(draw))

  const g = makeEngine([[0, 0, 1]], new Float32Array([0, 0, 1]))
  g.engine.size(400, 300, 1)
  g.engine.reduced(false)
  g.engine.run(true)
  g.step(2, 8.33)
  const clears = () => g.calls.filter((c) => c.op === "clearRect").length
  let c0 = clears()
  g.step(120, 8.33)
  const idle = clears() - c0
  check("the idle spin at 120Hz draws about 60 frames a second", idle >= 55 && idle <= 65, idle)
  g.engine.pointer({ kind: "down", x: 100, y: 100, t: g.now() })
  c0 = clears()
  for (let i = 0; i < 60; i++) {
    g.engine.pointer({ kind: "move", x: 100 + i * 3, y: 100, t: g.now() })
    g.step(1, 8.33)
  }
  const drag = clears() - c0
  check("a drag at 120Hz draws every frame", drag >= 58, drag)
  g.engine.pointer({ kind: "up", x: 280, y: 100, t: g.now() })
  c0 = clears()
  g.step(30, 8.33)
  check("the coast after a throw draws every frame too", clears() - c0 >= 28, clears() - c0)
}

console.log("\n── The notification: where the shot landed ──")
{
  /* Cities around the middle of the view at rest (yaw 0.4, pitch 0.42), so each launch finds one facing the viewer. */
  const toV = (lat: number, lng: number): V3 => [Math.cos(lat) * Math.sin(lng), Math.sin(lat), Math.cos(lat) * Math.cos(lng)]
  const cities: V3[] = [toV(0.45, -0.45), toV(0.3, -0.6), toV(0.6, -0.3)]
  const g = makeEngine(cities, new Float32Array([0, 0, 1]))
  g.engine.size(400, 300, 1)
  g.engine.reduced(false)
  g.engine.run(true)
  g.step(500, 16.67)
  const ons = g.pills.filter((p) => p.on)
  check("each landing says where its city is on the card, once", ons.length >= 3 && ons.every((p) => typeof p.x0 === "number" && typeof p.y0 === "number" && typeof p.x1 === "number" && p.ms === 2100), ons.slice(0, 2))
  check("inside the card", ons.every((p) => p.x0! >= 0 && p.x0! <= 400 && p.y0! >= 0 && p.y0! <= 300))
  check("the spin carries it a little to the side over its two seconds", ons.every((p) => Math.abs(p.x1! - p.x0!) > 1 && Math.abs(p.x1! - p.x0!) < 80), ons.map((p) => p.x1! - p.x0!))
  const offs = g.pills.filter((p) => !p.on)
  check("each leaves about two seconds later when nothing moves it off its line", ons.slice(0, -1).every((p) => offs.some((o) => o.i === p.i && o.at > p.at && o.at - p.at >= 2000 && o.at - p.at <= 2200)), g.pills.slice(0, 6))
  check("never more than one message per landing: on with where, then off", g.pills.length <= ons.length * 2)

  /* Dragging the ball away takes the notification away early. */
  const h = makeEngine(cities, new Float32Array([0, 0, 1]))
  h.engine.size(400, 300, 1)
  h.engine.reduced(false)
  h.engine.run(true)
  for (let i = 0; i < 400 && !h.pills.some((p) => p.on); i++) h.step(1, 16.67)
  const on = h.pills.find((p) => p.on)!
  h.engine.pointer({ kind: "down", x: 200, y: 150, t: h.now() })
  for (let i = 0; i < 12; i++) {
    h.engine.pointer({ kind: "move", x: 200 + i * 12, y: 150, t: h.now() })
    h.step(1, 16.67)
  }
  const off = h.pills.find((p) => !p.on && p.i === on.i && p.at > on.at)
  check("a drag that takes the city off its line takes the notification away early", !!off && off.at - on.at < 600, { on, off })

  /* Off screen it leaves (it would not be on its city when the globe comes back). */
  const k = makeEngine(cities, new Float32Array([0, 0, 1]))
  k.engine.size(400, 300, 1)
  k.engine.reduced(false)
  k.engine.run(true)
  for (let i = 0; i < 400 && !k.pills.some((p) => p.on); i++) k.step(1, 16.67)
  k.engine.run(false)
  check("paused off screen, the notification leaves", k.pills.at(-1)?.on === false && !k.running())

  /* Under reduced motion one still notification on its city, placed again on a resize. */
  const r = makeEngine(cities, new Float32Array([0, 0, 1]))
  r.engine.reduced(true)
  r.engine.size(400, 300, 1)
  const still = r.pills.filter((p) => p.on).at(-1)
  check("under reduced motion one still notification, placed on its city once the size is known", !!still && still.ms === 0 && still.x0 === still.x1 && still.x0! > 0 && still.x0! < 400, r.pills)
  check("the engine checks the city against the line every frame and leaves early when it turns away or leaves the card", /if \(st\.pillOn && \(now >= st\.pillOff \|\| !pillHolds\(\)\)\) hidePill\(\)/.test(draw) && /if \(rz < PILL_MIN_FACE\) return false/.test(draw) && /if \(cityX < 0 \|\| cityY < 0 \|\| cityX > st\.w \|\| cityY > st\.h\) return false/.test(draw))
}

console.log("\n── Placing it on the card ──")
{
  const W = 343
  const H = 335
  const w = 190
  const h = 30
  const mid = placeNotice(170, 150, w, h, W, H)
  check("centred just above the point, its caret on the point", !mid.below && mid.y + h < 150 && 150 - (mid.y + h) <= 14 && Math.abs(mid.x + mid.caret - 170) <= 1, mid)
  const top = placeNotice(170, 20, w, h, W, H)
  check("below the point when there is no room above", top.below && top.y > 20 && top.y - 20 <= 14, top)
  const edge = placeNotice(330, 150, w, h, W, H)
  check("kept inside the card at an edge, the caret still pointing at the city", edge.x + w <= W - 8 && edge.x >= 8 && Math.abs(edge.x + edge.caret - 330) <= 14 && edge.caret <= w - 14, edge)
  const c = clampNotice(-50, 400, w, h, W, H)
  check("the end of its glide is kept inside the card too", c.x === 8 && c.y === H - h - 8, c)
  check("readable on a phone: the longest notification fits a 343px card", (() => {
    const longest = Math.max(...EVERYTHING_GLOBE_ORDERS.map((o) => `New order, ${o.city} ${o.price}`.length))
    return longest * 7.2 + 50 < W - 16
  })())
}

console.log("\n── The page: transform only, once per landing ──")
{
  const onPill = globe.slice(globe.indexOf("const onPill"), globe.indexOf("const driver = startDriver"))
  check("placed by a transform on its pin, never left or top", /pin\.style\.transform = `translate\(\$\{at\.x\}px,\$\{at\.y\}px\)`/.test(onPill) && !/style\.(left|top) =/.test(globe))
  check("carried along by one compositor animation, linear, from where it landed to where the spin takes it", (onPill.match(/pin\.animate\(/g) || []).length === 1 && /easing: "linear", fill: "forwards"/.test(onPill) && /moving\[p\.i\]\?\.cancel\(\)/.test(onPill))
  check("its size is read once per notification (and again only after a resize or the fonts), never per frame", /if \(!sizes\[p\.i \* 2\]\) \{/.test(onPill) && /if \(w !== st\.w \|\| h !== st\.h\) sizes\.fill\(0\)/.test(globe) && !/getBoundingClientRect/.test(onPill))
  check("no React state: the props reach the driver through refs", !/useState/.test(globe))
  check("the caret and placement styles live with the globe, transform only", /\.ev-globe-pin\{position:absolute;left:0;top:0;width:max-content;pointer-events:none\}/.test(read("components/marketing/home/everything-globe.tsx")) && /<span className="ev-globe-caret" \/>/.test(globe))
  check("the move path still reads no layout", (() => {
    const move = globe.slice(globe.indexOf("const onMove"), globe.indexOf("const onUp"))
    return (move.match(/getBoundingClientRect/g) || []).length === 1 && !/offset(Width|Height)/.test(move)
  })())
}

console.log("\n── Safari: the display's frames, not a timer ──")
{
  check("the page says it can send frames", /worker\.postMessage\(\{ type: "ticker" \}\)/.test(globe))
  check("the page sends one frame message per display frame, with the frame's own time, only while the worker asks", /w\.postMessage\(\{ type: "frame", t: performance\.timeOrigin \+ t \}\)\s*requestAnimationFrame\(frame\)/.test(globe) && /m\.t - performance\.timeOrigin/.test(worker) && /if \(!ticking\) \{\s*looping = false\s*return/.test(globe))
  check("the worker uses its own requestAnimationFrame first, the page's frames next, a timer only when neither", /if \(nativeRaf\) return scope\.requestAnimationFrame!\(cb\)\s*if \(ticker\) \{/.test(worker) && /return setTimeout\(\(\) => cb\(performance\.now\(\)\), 16\)/.test(worker))
  check("it stops asking when the globe stops", /if \(!waiting\) ask\(false\)/.test(worker) && /waiting = null\s*ask\(false\)/.test(worker))
}

console.log("\n── The worker's string ──")
{
  const build = await import(pathToFileURL(join(root, "scripts/build-globe-worker.mjs")).href)
  check("is up to date (node scripts/build-globe-worker.mjs)", read("components/marketing/home/everything-globe-worker-source.ts") === build.everythingGlobeWorkerModule(await build.everythingGlobeWorkerSource()))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
