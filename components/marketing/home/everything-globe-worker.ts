/*
  THE "SELL ANYWHERE" GLOBE, DRAWN OFF THE PAGE'S THREAD
  (wave 13 perf; everything-globe.tsx starts it). The page hands its canvas
  over (transferControlToOffscreen) and this worker turns and draws it with
  the engine in everything-globe-draw.ts. Drawn on the page's own thread, a
  few thousand dots a frame and handing each frame to the compositor cost
  the page a third of every second at 4x CPU while the card was on screen.

  Messages in: init (the canvas, the land points, the cities, the studio),
  size (CSS pixels and device pixel ratio), run (on screen and allowed to
  move), reduced, pointer (a drag's down, move and up), lean (toward the
  mouse), ticker and frame (below). Out: pill (which order landed, where,
  and when its notification leaves), drawn (after the first frame) and
  frames (below).

  LANDING ROUND 6 (the owner: "very laggy" on an iPhone). A worker without
  its own requestAnimationFrame (Safari's) used to step itself with a 16ms
  timer, which drifts against the display's frames: every so often a frame
  showed two steps or none, which reads as stutter, worst while dragging.
  Now, where the page has said it can (ticker), the worker asks the page for
  the display's frames while it is moving (frames on / off) and steps once
  per frame it is sent. The timer stays only for a page that never said so.
*/

import { createGlobeEngine, type GlobeEngine, type GlobePointer, type V3 } from "./everything-globe-draw"

type In =
  | { type: "init"; canvas: OffscreenCanvas; pts: Float32Array; cities: V3[]; home: V3 }
  | { type: "size"; w: number; h: number; dpr: number }
  | { type: "run"; on: boolean }
  | { type: "reduced"; on: boolean }
  | { type: "pointer"; e: GlobePointer }
  | { type: "lean"; x: number; y: number }
  | { type: "ticker" }
  | { type: "frame"; t?: number }

const scope = self as unknown as {
  postMessage: (m: unknown) => void
  onmessage: ((e: MessageEvent<In>) => void) | null
  requestAnimationFrame?: (cb: (t: number) => void) => number
  cancelAnimationFrame?: (id: number) => void
}

let engine: GlobeEngine | null = null

/* Frames from the page, for a worker without requestAnimationFrame: the one callback waiting, and whether the page is sending. */
const nativeRaf = typeof scope.requestAnimationFrame === "function"
let ticker = false
let waiting: ((t: number) => void) | null = null
let asked = false
const ask = (on: boolean) => {
  if (asked === on) return
  asked = on
  scope.postMessage({ type: "frames", on })
}

const raf = (cb: (t: number) => void): number => {
  if (nativeRaf) return scope.requestAnimationFrame!(cb)
  if (ticker) {
    waiting = cb
    ask(true)
    return 1
  }
  return setTimeout(() => cb(performance.now()), 16) as unknown as number
}
const caf = (id: number) => {
  if (nativeRaf) return scope.cancelAnimationFrame?.(id)
  if (ticker) {
    waiting = null
    ask(false)
    return
  }
  clearTimeout(id)
}

scope.onmessage = (e) => {
  const m = e.data
  if (m.type === "ticker") {
    ticker = !nativeRaf
    return
  }
  if (m.type === "frame") {
    const cb = waiting
    waiting = null
    /* The display frame's own time from the page (steady, unlike when this message happens to arrive), on this worker's clock. */
    if (cb) cb(typeof m.t === "number" ? m.t - performance.timeOrigin : performance.now())
    /* Nothing asked for the next frame: the globe has stopped, so the page can stop sending. */
    if (!waiting) ask(false)
    return
  }
  if (m.type === "init") {
    const ctx = m.canvas.getContext("2d")
    if (!ctx) return
    engine = createGlobeEngine(
      {
        canvas: m.canvas,
        ctx,
        makeCanvas: (w, h) => new OffscreenCanvas(w, h),
        raf,
        caf,
        onPill: (p) => scope.postMessage({ type: "pill", p }),
        onDrawn: () => scope.postMessage({ type: "drawn" }),
      },
      m.pts,
      m.cities,
      m.home,
    )
    return
  }
  if (!engine) return
  if (m.type === "size") engine.size(m.w, m.h, m.dpr)
  else if (m.type === "run") engine.run(m.on)
  else if (m.type === "reduced") engine.reduced(m.on)
  else if (m.type === "pointer") engine.pointer(m.e)
  else if (m.type === "lean") engine.lean(m.x, m.y)
}
