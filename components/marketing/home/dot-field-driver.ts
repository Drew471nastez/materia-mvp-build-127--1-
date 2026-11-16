/*
  WHAT DRIVES THE DOT FIELDS (landing round 6). One engine for every field on
  the page (dot-field-engine.ts): a Web Worker holding the tiles' canvases
  where the browser can hand one over, or the same engine on the page's own
  thread where it cannot (no Worker, no OffscreenCanvas, no
  transferControlToOffscreen). The worker's code ships inside the chunk, as a
  string (dot-field-worker-source.ts, written by scripts/build-globe-worker.mjs),
  started from a blob: URL, as the globes' are.

  A worker without requestAnimationFrame (Safari's) is stepped by the
  display's frames sent from here, only while it asks for them ("frames"),
  not by a timer that drifts against the display.
*/

import { DOT_FIELD_WORKER_SOURCE } from "./dot-field-worker-source"
import { createDotEngine, type DotEngine, type FieldKind, type TileCanvas } from "./dot-field-engine"

export type DotDriver = {
  /** True when the fields are drawn in a worker. */
  worker: boolean
  field: (id: number, kind: FieldKind, gap: number, fine: boolean, reduced: boolean) => void
  remove: (id: number) => void
  /** A tile's canvas: handed over to the worker (it can never be drawn on from here again), or drawn on here. */
  tile: (id: number, n: number, canvas: HTMLCanvasElement) => void
  dropTile: (id: number, n: number) => void
  tileOn: (id: number, n: number, on: boolean) => void
  size: (id: number, w: number, h: number, dpr: number) => void
  place: (id: number, x: number, y: number) => void
  aim: (id: number, x: number, y: number, on: boolean) => void
  cover: (id: number, on: boolean) => void
  hide: (on: boolean) => void
  stop: () => void
}

type Listener = (id: number, n: number) => void

function startWorker(onDrawn: Listener): DotDriver | null {
  if (typeof Worker !== "function" || typeof OffscreenCanvas !== "function" || typeof HTMLCanvasElement === "undefined" || typeof HTMLCanvasElement.prototype.transferControlToOffscreen !== "function") return null
  let worker: Worker
  try {
    const url = URL.createObjectURL(new Blob([DOT_FIELD_WORKER_SOURCE], { type: "text/javascript" }))
    worker = new Worker(url)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    worker.postMessage({ type: "ticker" })
  } catch {
    return null
  }
  const w = worker
  /* The display's frames for a worker without requestAnimationFrame of its own: sent only while it asks (it is moving). */
  let ticking = false
  let looping = false
  const frame = (t: number) => {
    if (!ticking) {
      looping = false
      return
    }
    /* The frame's own time, on the shared clock (the worker's performance.now() starts later than the page's). */
    w.postMessage({ type: "frame", t: performance.timeOrigin + t })
    requestAnimationFrame(frame)
  }
  w.onmessage = (e: MessageEvent<{ type: "drawn"; id: number; n: number } | { type: "frames"; on: boolean }>) => {
    if (e.data.type === "frames") {
      ticking = e.data.on
      if (ticking && !looping) {
        looping = true
        requestAnimationFrame(frame)
      }
    } else onDrawn(e.data.id, e.data.n)
  }
  return {
    worker: true,
    field: (id, kind, gap, fine, reduced) => w.postMessage({ type: "field", id, kind, gap, fine, reduced }),
    remove: (id) => w.postMessage({ type: "remove", id }),
    tile: (id, n, canvas) => {
      const off = canvas.transferControlToOffscreen()
      w.postMessage({ type: "tile", id, n, canvas: off }, [off])
    },
    dropTile: (id, n) => w.postMessage({ type: "dropTile", id, n }),
    tileOn: (id, n, on) => w.postMessage({ type: "tileOn", id, n, on }),
    size: (id, width, height, dpr) => w.postMessage({ type: "size", id, w: width, h: height, dpr }),
    place: (id, x, y) => w.postMessage({ type: "place", id, x, y }),
    aim: (id, x, y, on) => w.postMessage({ type: "aim", id, x, y, on }),
    cover: (id, on) => w.postMessage({ type: "cover", id, on }),
    hide: (on) => w.postMessage({ type: "hide", on }),
    stop: () => {
      ticking = false
      w.terminate()
    },
  }
}

function startLocal(onDrawn: Listener): DotDriver {
  const engine: DotEngine = createDotEngine({
    raf: (cb) => requestAnimationFrame(cb),
    caf: (id) => cancelAnimationFrame(id),
    now: () => performance.now(),
    onDrawn,
  })
  return {
    worker: false,
    field: (id, kind, gap, fine, reduced) => engine.field(id, kind, gap, fine, reduced),
    remove: (id) => engine.remove(id),
    tile: (id, n, canvas) => engine.tile(id, n, canvas as unknown as TileCanvas),
    dropTile: (id, n) => engine.dropTile(id, n),
    tileOn: (id, n, on) => engine.tileOn(id, n, on),
    size: (id, w, h, dpr) => engine.size(id, w, h, dpr),
    place: (id, x, y) => engine.place(id, x, y),
    aim: (id, x, y, on) => engine.aim(id, x, y, on),
    cover: (id, on) => engine.cover(id, on),
    hide: (on) => engine.hide(on),
    stop: () => engine.stop(),
  }
}

/* One driver for the whole page, shared by every field, started with the first and stopped a moment after the last (a remount in between keeps it). */
let shared: { driver: DotDriver; users: number; drawn: Set<Listener>; off: () => void } | null = null
let releasing: ReturnType<typeof setTimeout> | null = null

export function acquireDotDriver(onDrawn: Listener): { driver: DotDriver; release: () => void } {
  if (releasing) {
    clearTimeout(releasing)
    releasing = null
  }
  if (!shared) {
    const drawn = new Set<Listener>()
    const notify: Listener = (id, n) => drawn.forEach((l) => l(id, n))
    const driver = startWorker(notify) ?? startLocal(notify)
    const onVisibility = () => driver.hide(document.visibilityState === "hidden")
    document.addEventListener("visibilitychange", onVisibility)
    onVisibility()
    shared = {
      driver,
      users: 0,
      drawn,
      off: () => {
        document.removeEventListener("visibilitychange", onVisibility)
        driver.stop()
      },
    }
  }
  const s = shared
  s.users++
  s.drawn.add(onDrawn)
  return {
    driver: s.driver,
    release: () => {
      s.drawn.delete(onDrawn)
      s.users--
      if (s.users > 0) return
      releasing = setTimeout(() => {
        releasing = null
        if (shared === s && s.users === 0) {
          s.off()
          shared = null
        }
      }, 2000)
    },
  }
}
