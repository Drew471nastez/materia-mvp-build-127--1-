/*
  THE PAGE'S SIDE OF A DOT FIELD (landing round 6). Everything the page does
  for a field, in one place, for DotField and HowField alike:

    tiles    the box's picture is cut into canvases of DOT_FIELD_TILE px, made
             here (not by React: a canvas handed to a worker can never be drawn
             on again, so a remount simply makes new ones).
    seen     an IntersectionObserver for each tile (a little before it is on
             screen), and visibilitychange for the whole page (the driver).
    size     a ResizeObserver, once per change; the box's place on the page is
             read then and when a tile comes near, never in a loop.
    pointer  a mouse only, sent at most once a frame, in page coordinates.
    covered  a sheet over the field stops it: the page marks a covered block
             with data-sheet-covered and says so with a "sheet-cover" event
             (bubbling, detail.covered) on it.

  No layout is read in a frame, and nothing is React state.
*/

import { acquireDotDriver } from "./dot-field-driver"
import { DOT_FIELD_CONFIGS, DOT_FIELD_TILE, DOT_FIELD_TILE_MARGIN, dotFieldTiles, type FieldKind } from "./dot-field-engine"

let nextId = 1

export type FieldMountOptions = {
  kind: FieldKind
  gap: number
  /** Scattered dots (seeded Poisson disc) in place of the even grid. */
  scatter?: boolean
  /** Where the mouse is followed: the window (the field's light follows it anywhere on the page, within a margin of the box) or an element (the section the field heads). */
  pointer: "window" | HTMLElement
}

/** Starts a field in `box`; returns what stops it. */
export function mountDotField(box: HTMLElement, o: FieldMountOptions): () => void {
  const mm = typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : null
  const reduced = !!mm?.("(prefers-reduced-motion: reduce)").matches
  const fine = !!mm?.("(hover: hover) and (pointer: fine)").matches
  const id = nextId++
  const tiles: { canvas: HTMLCanvasElement; io: IntersectionObserver | null }[] = []
  const onDrawn = (fid: number, n: number) => {
    if (fid !== id) return
    tiles[n]?.canvas.setAttribute("data-drawn", "")
    box.setAttribute("data-drawn", "")
  }
  const { driver, release, moving, whenStill } = acquireDotDriver(onDrawn)
  driver.field(id, o.kind, o.gap, fine, reduced, o.scatter)

  let w = 0
  let h = 0
  let stopped = false
  const place = () => {
    const r = box.getBoundingClientRect()
    driver.place(id, r.left + window.scrollX, r.top + window.scrollY)
  }

  const addTile = (n: number) => {
    const canvas = document.createElement("canvas")
    canvas.style.top = `${n * DOT_FIELD_TILE}px`
    canvas.style.height = `${DOT_FIELD_TILE}px`
    /*
      Landing round 20: the canvas is given its final size here, before it is
      handed over, with the engine's own sums (dot-field-engine.ts, fit), so
      the worker never resizes a canvas it holds unless the box's width
      changes. In the Safari engine, tiles added and sized in the worker as a
      box grew mid flick brought the page down.
    */
    const dpr = Math.min(DOT_FIELD_CONFIGS[o.kind].maxDpr, window.devicePixelRatio || 1)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(DOT_FIELD_TILE * dpr)
    box.appendChild(canvas)
    const entry: { canvas: HTMLCanvasElement; io: IntersectionObserver | null } = { canvas, io: null }
    tiles[n] = entry
    driver.tile(id, n, canvas)
    if (typeof IntersectionObserver === "function") {
      entry.io = new IntersectionObserver(
        (list) => {
          const e = list[list.length - 1]
          if (e.isIntersecting) place()
          driver.tileOn(id, n, e.isIntersecting)
        },
        { rootMargin: `${DOT_FIELD_TILE_MARGIN}px 0px` },
      )
      entry.io.observe(canvas)
    } else driver.tileOn(id, n, true)
  }
  /* Landing round 20: a box that changes size while the page scrolls (a section mounting or settling inside it) is measured again once the page stands still: no tile is added, handed over or sized while the page moves. */
  let waiting = false
  const resize = () => {
    if (moving()) {
      if (!waiting) {
        waiting = true
        whenStill(() => {
          waiting = false
          if (!stopped) resize()
        })
      }
      return
    }
    const nw = box.clientWidth
    const nh = box.clientHeight
    if (!nw || !nh || (nw === w && nh === h)) return
    w = nw
    h = nh
    const want = dotFieldTiles(h)
    while (tiles.length > want.length) {
      const t = tiles.pop()!
      t.io?.disconnect()
      driver.dropTile(id, tiles.length)
      t.canvas.remove()
    }
    /* Landing round 20: every tile is a whole tile tall, whatever the box's height (the box clips its foot), so a change of height never resizes a canvas the worker is drawing in (dot-field-engine.ts, fit). */
    for (let n = 0; n < want.length; n++) if (!tiles[n]) addTile(n)
    driver.size(id, w, h, window.devicePixelRatio || 1)
    place()
  }
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null
  ro?.observe(box)
  resize()

  /* A sheet over the field: the held block is marked, and says when that changes. */
  const covered = (el: Element | null) => !!el?.closest("[data-sheet-covered]")
  driver.cover(id, covered(box))
  const onCover = (e: Event) => {
    if (e.target instanceof Element && e.target.contains(box)) driver.cover(id, covered(box))
  }
  document.addEventListener("sheet-cover", onCover)

  /* The mouse, at most once a frame; its light is gone when it leaves. */
  const target: Window | HTMLElement = o.pointer === "window" ? window : o.pointer
  let aiming = false
  let sx = 0
  let sy = 0
  let queued = 0
  const flush = () => {
    queued = 0
    driver.aim(id, sx, sy, true)
  }
  const onMove = (e: Event) => {
    const p = e as PointerEvent
    if (p.pointerType !== "mouse") return
    if (!aiming) {
      aiming = true
      place()
    }
    sx = p.clientX + window.scrollX
    sy = p.clientY + window.scrollY
    if (!queued) queued = requestAnimationFrame(flush)
  }
  const onLeave = () => {
    aiming = false
    if (queued) cancelAnimationFrame(queued)
    queued = 0
    driver.aim(id, 0, 0, false)
  }
  const leaver: EventTarget = o.pointer === "window" ? document.documentElement : o.pointer
  if (fine && !reduced) {
    target.addEventListener("pointermove", onMove, { passive: true })
    leaver.addEventListener("pointerleave", onLeave)
  }

  return () => {
    stopped = true
    if (queued) cancelAnimationFrame(queued)
    ro?.disconnect()
    for (const t of tiles) t.io?.disconnect()
    document.removeEventListener("sheet-cover", onCover)
    target.removeEventListener("pointermove", onMove)
    leaver.removeEventListener("pointerleave", onLeave)
    driver.remove(id)
    for (const t of tiles) t.canvas.remove()
    release()
  }
}
