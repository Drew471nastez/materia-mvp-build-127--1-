/*
  THE DOT FIELDS, DRAWN OFF THE PAGE'S THREAD (landing round 6; started by
  dot-field-driver.ts from the string scripts/build-globe-worker.mjs writes into
  dot-field-worker-source.ts). The page hands each tile's canvas over
  (transferControlToOffscreen) and this worker draws every field with the
  engine in dot-field-engine.ts.

  Messages in: field, remove, tile (a canvas), dropTile, tileOn, size, place,
  aim, cover, hide, ticker and frame. Out: drawn (a tile's first frame) and
  frames (below).

  A worker without its own requestAnimationFrame (Safari's) is stepped by the
  display's frames the page sends while a field is moving (frames on / off),
  once per frame, never by a timer that drifts against the display: the
  approach of everything-globe-worker.ts.
*/

import { createDotEngine, type FieldKind, type TileCanvas } from "./dot-field-engine"

type In =
  | { type: "field"; id: number; kind: FieldKind; gap: number; fine: boolean; reduced: boolean; scatter?: boolean }
  | { type: "remove"; id: number }
  | { type: "tile"; id: number; n: number; canvas: OffscreenCanvas }
  | { type: "dropTile"; id: number; n: number }
  | { type: "tileOn"; id: number; n: number; on: boolean }
  | { type: "size"; id: number; w: number; h: number; dpr: number }
  | { type: "place"; id: number; x: number; y: number }
  | { type: "aim"; id: number; x: number; y: number; on: boolean }
  | { type: "cover"; id: number; on: boolean }
  | { type: "hide"; on: boolean }
  | { type: "ticker" }
  | { type: "frame"; t?: number }

const scope = self as unknown as {
  postMessage: (m: unknown) => void
  onmessage: ((e: MessageEvent<In>) => void) | null
  requestAnimationFrame?: (cb: (t: number) => void) => number
  cancelAnimationFrame?: (id: number) => void
}

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

const engine = createDotEngine({
  raf,
  caf,
  now: () => performance.now(),
  onDrawn: (id, n) => scope.postMessage({ type: "drawn", id, n }),
})

scope.onmessage = (e) => {
  const m = e.data
  if (m.type === "ticker") ticker = !nativeRaf
  else if (m.type === "frame") {
    const cb = waiting
    waiting = null
    /* The display frame's own time from the page, on this worker's clock. */
    if (cb) cb(typeof m.t === "number" ? m.t - performance.timeOrigin : performance.now())
    /* Nothing asked for the next frame: the fields have stopped, so the page can stop sending. */
    if (!waiting) ask(false)
  } else if (m.type === "field") engine.field(m.id, m.kind, m.gap, m.fine, m.reduced, m.scatter)
  else if (m.type === "remove") engine.remove(m.id)
  else if (m.type === "tile") engine.tile(m.id, m.n, m.canvas as unknown as TileCanvas)
  else if (m.type === "dropTile") engine.dropTile(m.id, m.n)
  else if (m.type === "tileOn") engine.tileOn(m.id, m.n, m.on)
  else if (m.type === "size") engine.size(m.id, m.w, m.h, m.dpr)
  else if (m.type === "place") engine.place(m.id, m.x, m.y)
  else if (m.type === "aim") engine.aim(m.id, m.x, m.y, m.on)
  else if (m.type === "cover") engine.cover(m.id, m.on)
  else if (m.type === "hide") engine.hide(m.on)
}
