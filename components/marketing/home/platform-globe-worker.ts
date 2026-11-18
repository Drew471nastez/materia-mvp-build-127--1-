/*
  THE GLOBE, DRAWN OFF THE PAGE'S THREAD (platform-globe.tsx starts it).
  The page hands its canvas over (transferControlToOffscreen) and this
  worker turns and draws it, frame by frame, with the same drawing as the
  page would (platform-globe-draw.ts). Each new frame of a canvas drawn on
  the page's own thread had to be handed to the compositor by that thread:
  5 to 7 ms of every frame at 4x CPU while the globe was on screen, which,
  with a scroll's own work, missed frames. Drawn here, the page's thread
  does nothing for it.

  Messages in: init (the canvas, the land points, the spots), size (CSS
  pixels and device pixel ratio), run (true or false), still (draw the one
  frame reduced motion shows). Out: pulse (the spot, for the page's toasts)
  and drawn (after the first frame).
*/

import { drawGlobe, paintGlobeBackdrop, stepGlobe, stillPulses, type GlobePulse, type GlobeSpots } from "./platform-globe-draw"

type In =
  | { type: "init"; canvas: OffscreenCanvas; pts: Float32Array; spots: GlobeSpots; angle: number }
  | { type: "size"; size: number; dpr: number }
  | { type: "run"; running: boolean }
  | { type: "still" }

const scope = self as unknown as {
  postMessage: (m: unknown) => void
  onmessage: ((e: MessageEvent<In>) => void) | null
  requestAnimationFrame?: (cb: (t: number) => void) => number
  cancelAnimationFrame?: (id: number) => void
}

let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let bg: OffscreenCanvas | null = null
let pts: Float32Array | null = null
let spots: GlobeSpots = []
const st: { angle: number; pulses: GlobePulse[]; nextPulse: number } = { angle: -1.2, pulses: [], nextPulse: 0 }
let running = false
let drawn = false
let frame = 0
let last = 0

const raf = (cb: (t: number) => void) => (scope.requestAnimationFrame ? scope.requestAnimationFrame(cb) : (setTimeout(() => cb(performance.now()), 16) as unknown as number))
const caf = (id: number) => (scope.cancelAnimationFrame ? scope.cancelAnimationFrame(id) : clearTimeout(id))

function draw(now: number) {
  if (!canvas || !ctx || !bg || !pts) return
  st.pulses = drawGlobe(ctx, canvas.width, bg, pts, st.angle, st.pulses, spots, now)
  if (!drawn) {
    drawn = true
    scope.postMessage({ type: "drawn" })
  }
}

function tick(now: number) {
  frame = 0
  const dt = Math.min(64, now - last)
  last = now
  const s = stepGlobe(st, spots, now, dt)
  if (s !== null) scope.postMessage({ type: "pulse", s })
  draw(now)
  if (running) frame = raf(tick)
}

scope.onmessage = (e) => {
  const m = e.data
  if (m.type === "init") {
    canvas = m.canvas
    ctx = canvas.getContext("2d")
    pts = m.pts
    spots = m.spots
    st.angle = m.angle
  } else if (m.type === "size") {
    if (!canvas) return
    canvas.width = Math.round(m.size * m.dpr)
    canvas.height = Math.round(m.size * m.dpr)
    bg = new OffscreenCanvas(canvas.width, canvas.height)
    const g = bg.getContext("2d")
    if (g) paintGlobeBackdrop(g, bg.width)
    draw(performance.now())
  } else if (m.type === "run") {
    running = m.running
    if (running && !frame) {
      last = performance.now()
      frame = raf(tick)
    } else if (!running && frame) {
      caf(frame)
      frame = 0
    }
  } else if (m.type === "still") {
    const now = performance.now()
    st.pulses = stillPulses(now)
    draw(now)
  }
}
