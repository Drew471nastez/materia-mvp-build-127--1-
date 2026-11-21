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
import { canvasOnPageThread } from "./page-thread-canvas"
import { createDotEngine, type DotEngine, type FieldKind, type TileCanvas } from "./dot-field-engine"

export type DotDriver = {
  /** True when the fields are drawn in a worker. */
  worker: boolean
  field: (id: number, kind: FieldKind, gap: number, fine: boolean, reduced: boolean, scatter?: boolean) => void
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
  /** The page is being scrolled (landing round 20): the fields' loop waits. */
  scroll: (on: boolean) => void
  stop: () => void
}

type Listener = (id: number, n: number) => void

/* Landing round 20: WebKit draws the fields on the page's own thread (page-thread-canvas.ts says why); elsewhere the worker stays, since on the page's thread the fields cost a throttled phone in Chromium far more. */
export const DOTS_ON_PAGE_THREAD = canvasOnPageThread

function startWorker(onDrawn: Listener): DotDriver | null {
  if (DOTS_ON_PAGE_THREAD()) return null
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
    field: (id, kind, gap, fine, reduced, scatter) => w.postMessage({ type: "field", id, kind, gap, fine, reduced, scatter: !!scatter }),
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
    scroll: (on) => w.postMessage({ type: "scroll", on }),
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
    field: (id, kind, gap, fine, reduced, scatter) => engine.field(id, kind, gap, fine, reduced, scatter),
    remove: (id) => engine.remove(id),
    tile: (id, n, canvas) => engine.tile(id, n, canvas as unknown as TileCanvas),
    dropTile: (id, n) => engine.dropTile(id, n),
    tileOn: (id, n, on) => engine.tileOn(id, n, on),
    size: (id, w, h, dpr) => engine.size(id, w, h, dpr),
    place: (id, x, y) => engine.place(id, x, y),
    aim: (id, x, y, on) => engine.aim(id, x, y, on),
    cover: (id, on) => engine.cover(id, on),
    hide: (on) => engine.hide(on),
    scroll: (on) => engine.scroll(on),
    stop: () => engine.stop(),
  }
}

/** How long the page stands still before the fields move again (landing round 20). */
export const SCROLL_REST_MS = 150

/* One driver for the whole page, shared by every field, started with the first and stopped a moment after the last (a remount in between keeps it). */
let shared: { driver: DotDriver; users: number; drawn: Set<Listener>; moving: () => boolean; still: Set<() => void>; off: () => void } | null = null
let releasing: ReturnType<typeof setTimeout> | null = null

export function acquireDotDriver(onDrawn: Listener): {
  driver: DotDriver
  release: () => void
  /** Whether the page is being scrolled (landing round 20). */
  moving: () => boolean
  /** Runs `run` once the page stands still again (at once if it does). */
  whenStill: (run: () => void) => void
} {
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
    /*
      Landing round 20: while the page scrolls the fields' loop waits, and it
      starts again SCROLL_REST_MS after the last scroll event. One passive
      listener for every field; it only notes the time, and one timer checks
      it, so a flick costs no more than a number written per event.
    */
    let moving = false
    const still = new Set<() => void>()
    let lastScroll = 0
    let rest: ReturnType<typeof setTimeout> | null = null
    const settleScroll = () => {
      rest = null
      const quiet = performance.now() - lastScroll
      if (quiet < SCROLL_REST_MS) {
        rest = setTimeout(settleScroll, SCROLL_REST_MS - quiet)
        return
      }
      moving = false
      driver.scroll(false)
      /* What waited for the page to stand still (a field's resize, dot-field-mount.ts). */
      const due = [...still]
      still.clear()
      for (const run of due) run()
    }
    const onScroll = () => {
      lastScroll = performance.now()
      if (!moving) {
        moving = true
        driver.scroll(true)
      }
      if (!rest) rest = setTimeout(settleScroll, SCROLL_REST_MS)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    shared = {
      driver,
      users: 0,
      drawn,
      moving: () => moving,
      still,
      off: () => {
        document.removeEventListener("visibilitychange", onVisibility)
        window.removeEventListener("scroll", onScroll)
        if (rest) clearTimeout(rest)
        driver.stop()
      },
    }
  }
  const s = shared
  s.users++
  s.drawn.add(onDrawn)
  return {
    driver: s.driver,
    moving: s.moving,
    whenStill: (run) => {
      if (s.moving()) s.still.add(run)
      else run()
    },
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
