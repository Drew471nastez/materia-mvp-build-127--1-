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
  mouse). Out: pill (which order landed, and when its notification leaves) and drawn (after the
  first frame).
*/

import { createGlobeEngine, type GlobeEngine, type GlobePointer, type V3 } from "./everything-globe-draw"

type In =
  | { type: "init"; canvas: OffscreenCanvas; pts: Float32Array; cities: V3[]; home: V3 }
  | { type: "size"; w: number; h: number; dpr: number }
  | { type: "run"; on: boolean }
  | { type: "reduced"; on: boolean }
  | { type: "pointer"; e: GlobePointer }
  | { type: "lean"; x: number; y: number }

const scope = self as unknown as {
  postMessage: (m: unknown) => void
  onmessage: ((e: MessageEvent<In>) => void) | null
  requestAnimationFrame?: (cb: (t: number) => void) => number
  cancelAnimationFrame?: (id: number) => void
}

let engine: GlobeEngine | null = null

scope.onmessage = (e) => {
  const m = e.data
  if (m.type === "init") {
    const ctx = m.canvas.getContext("2d")
    if (!ctx) return
    engine = createGlobeEngine(
      {
        canvas: m.canvas,
        ctx,
        makeCanvas: (w, h) => new OffscreenCanvas(w, h),
        raf: (cb) => (scope.requestAnimationFrame ? scope.requestAnimationFrame(cb) : (setTimeout(() => cb(performance.now()), 16) as unknown as number)),
        caf: (id) => (scope.cancelAnimationFrame ? scope.cancelAnimationFrame(id) : clearTimeout(id)),
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
