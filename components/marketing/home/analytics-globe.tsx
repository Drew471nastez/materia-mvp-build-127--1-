"use client"

/*
  THE ANALYTICS GLOBE (home section 11): a dark dotted Earth with visits
  arcing in to one creator from the places they come from.

  It reuses, read only, the globe engine of section 3
  (everything-globe-draw.ts) and its worker (shipped as a string,
  everything-globe-worker-source.ts), with this section's own places: the
  same drawing, nothing new to load. Where the browser can hand the canvas
  to a worker, the page's own thread does nothing per frame. It runs only
  while the section is live (on screen, the tab visible) and the globe is in
  view; under reduced motion it stands still. No pointer handling: here it
  is a picture, not a toy.

  LANDING ROUND 9, THE OWNER: "more smooth and clean and doesn't cause lag".
  Everything here is done through what this file hands the engine:
  - the land goes as its bitmask, so the engine lays the dots out for the
    size the ball is drawn at (a phone's small ball draws about half the
    dots, a little larger, instead of every one of 7,000);
  - a phone asks for 1.25 device pixels per CSS pixel, not 1.5;
  - the globe stops the moment its own box leaves the screen (no margin),
    and while the page is being flung (faster than FAST_SCROLL px a
    millisecond), starting again once the scroll has been calm for
    RESUME_MS. One passive scroll listener, attached only while the globe
    is on screen, that asks for scrollY and a clock to be read after the
    next frame (landing round 12) and nothing else;
  - the driver is told to run or stop only when that changes.

  One worker per canvas, kept across a development remount (a canvas can be
  handed to a worker only once), the way platform-globe.tsx keeps its own.
*/

import { useEffect, useRef } from "react"
import { EVERYTHING_LAND_B64, EVERYTHING_LAND_NORTH, EVERYTHING_LAND_SOUTH, EVERYTHING_LAND_STEP } from "./everything-globe-land"
import { createGlobeEngine, type GlobeLand, type V3 } from "./everything-globe-draw"
import { EVERYTHING_GLOBE_WORKER_SOURCE } from "./everything-globe-worker-source"

/** Where the creator works from (Oslo, landing round 4: Nora Vik is a colorist there), where every arc lands. */
const HOME: [number, number] = [59.91, 10.75]
/**
 * Where visits come from: lat, lng. Her top places lead, in the order the
 * card lists them (the United States, the United Kingdom, Germany), then
 * the rest of her 31 countries' busiest.
 */
export const ANALYTICS_GLOBE_PLACES: Array<[number, number]> = [
  [40.71, -74.0],
  [34.05, -118.24],
  [41.88, -87.63],
  [51.5, -0.12],
  [53.48, -2.24],
  [52.52, 13.4],
  [48.14, 11.58],
  [48.86, 2.35],
  [52.37, 4.9],
  [43.65, -79.38],
  [-23.55, -46.63],
  [-33.87, 151.21],
]

const DEG = Math.PI / 180
const toV = (lat: number, lng: number): V3 => {
  const phi = lat * DEG
  const lam = lng * DEG
  return [Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)]
}

/** The land as its bitmask: the engine lays the dots out for the size it draws at (fewer, larger dots on a small ball). */
const LAND: GlobeLand = { b64: EVERYTHING_LAND_B64, step: EVERYTHING_LAND_STEP, north: EVERYTHING_LAND_NORTH, south: EVERYTHING_LAND_SOUTH }
/** No points are made here: the engine has the bitmask. */
const NO_POINTS = new Float32Array(0)

/** Device pixels per CSS pixel asked of the engine: less on a phone, where the ball is small and the screen dense. */
export const ANALYTICS_GLOBE_DPR = { phone: 1.25, wide: 1.5 } as const
/** A page moving faster than this (CSS px per ms) is being flung: the globe waits. */
export const FAST_SCROLL = 1.1
/** How long the scroll must be calm before the globe turns again. */
export const RESUME_MS = 180

type Driver = { size: (w: number, h: number, dpr: number) => void; run: (on: boolean) => void; reduced: (on: boolean) => void; stop: () => void }

/** A canvas handed to a worker stays with it: kept here so a development remount reuses it. */
const held = new WeakMap<HTMLCanvasElement, { driver: Driver; users: number }>()

function startDriver(canvas: HTMLCanvasElement): Driver | null {
  const pts = NO_POINTS
  const land = LAND
  const cities = ANALYTICS_GLOBE_PLACES.map(([lat, lng]) => toV(lat, lng))
  const home = toV(HOME[0], HOME[1])
  if (typeof Worker === "function" && typeof OffscreenCanvas === "function" && typeof canvas.transferControlToOffscreen === "function") {
    let worker: Worker | null = null
    try {
      const url = URL.createObjectURL(new Blob([EVERYTHING_GLOBE_WORKER_SOURCE], { type: "text/javascript" }))
      worker = new Worker(url)
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      const off = canvas.transferControlToOffscreen()
      worker.postMessage({ type: "init", canvas: off, pts, cities, home, land }, [off])
    } catch {
      worker?.terminate()
      worker = null
    }
    if (worker) {
      const w = worker
      return {
        size: (width, height, dpr) => w.postMessage({ type: "size", w: width, h: height, dpr }),
        run: (on) => w.postMessage({ type: "run", on }),
        reduced: (on) => w.postMessage({ type: "reduced", on }),
        stop: () => w.terminate(),
      }
    }
  }
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext("2d")
  } catch {
    ctx = null
  }
  if (!ctx) return null
  const engine = createGlobeEngine(
    {
      canvas,
      ctx,
      makeCanvas: (w, h) => {
        const c = document.createElement("canvas")
        c.width = w
        c.height = h
        return c
      },
      raf: (cb) => requestAnimationFrame(cb),
      caf: (id) => cancelAnimationFrame(id),
      onPill: () => {},
      onDrawn: () => {},
    },
    pts,
    cities,
    home,
    land,
  )
  return { size: engine.size, run: engine.run, reduced: engine.reduced, stop: engine.stop }
}

export function AnalyticsGlobe({ live, reduced, className = "" }: { live: boolean; reduced: boolean; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctl = useRef<null | ((p: { live: boolean; reduced: boolean }) => void)>(null)
  const liveRef = useRef(live)
  const reducedRef = useRef(reduced)
  liveRef.current = live
  reducedRef.current = reduced

  useEffect(() => {
    const box = boxRef.current
    const canvas = canvasRef.current
    if (!box || !canvas) return
    let entry = held.get(canvas)
    if (!entry) {
      const driver = startDriver(canvas)
      if (!driver) return
      entry = { driver, users: 0 }
      held.set(canvas, entry)
    }
    entry.users++
    const { driver } = entry
    const st = { visible: true, live: false, reduced: false, fast: false }
    /* The driver hears about it only when the answer changes. */
    let running = false
    const sync = () => {
      const on = st.visible && st.live && !st.reduced && !st.fast
      if (on === running) return
      running = on
      driver.run(on)
    }
    const phone = typeof matchMedia === "function" && matchMedia("(max-width: 639px), (pointer: coarse)").matches
    const dprCap = phone ? ANALYTICS_GLOBE_DPR.phone : ANALYTICS_GLOBE_DPR.wide

    /*
      A flung page: the globe waits until the scroll has been calm for RESUME_MS. Listened to only while the globe is on screen.
      Landing round 12 (perf): scrollY is read after the frame, not in the scroll event, the way landing-story.tsx reads it.
      A read in the event lays the page out ahead of the frame's own layout, so the page was laid out twice a frame here.
    */
    let lastY = 0
    let lastT = 0
    let calm = 0
    let listening = false
    let asked = false
    const onScroll = () => {
      if (asked) return
      asked = true
      requestAnimationFrame(() => window.setTimeout(measure, 0))
    }
    const measure = () => {
      asked = false
      if (!listening) return
      const t = performance.now()
      const y = window.scrollY
      const dt = t - lastT
      const fast = lastT > 0 && dt > 0 && dt < 120 && Math.abs(y - lastY) / dt > FAST_SCROLL
      lastT = t
      lastY = y
      if (!fast) return
      window.clearTimeout(calm)
      calm = window.setTimeout(() => {
        st.fast = false
        sync()
      }, RESUME_MS)
      if (!st.fast) {
        st.fast = true
        sync()
      }
    }
    const listen = (on: boolean) => {
      if (on === listening) return
      listening = on
      if (on) {
        lastT = 0
        window.addEventListener("scroll", onScroll, { passive: true })
      } else {
        window.removeEventListener("scroll", onScroll)
        window.clearTimeout(calm)
        st.fast = false
      }
    }

    /* Size from the ResizeObserver's own entry: nothing is measured by hand. */
    const ro =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(([e]) => {
            const w = Math.round(e.contentRect.width)
            const h = Math.round(e.contentRect.height)
            if (w && h) driver.size(w, h, Math.min(dprCap, window.devicePixelRatio || 1))
          })
        : null
    ro?.observe(box)
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([e]) => {
              st.visible = e.isIntersecting
              listen(st.visible)
              sync()
            },
            { rootMargin: "0px" },
          )
        : null
    io?.observe(box)

    let wasReduced: boolean | null = null
    ctl.current = (next) => {
      st.live = next.live
      st.reduced = next.reduced
      if (wasReduced !== next.reduced) {
        wasReduced = next.reduced
        driver.reduced(next.reduced)
      }
      sync()
    }
    ctl.current({ live: liveRef.current, reduced: reducedRef.current })

    const mine = entry
    return () => {
      ro?.disconnect()
      io?.disconnect()
      ctl.current = null
      listen(false)
      driver.run(false)
      mine.users--
      setTimeout(() => {
        if (mine.users > 0) return
        mine.driver.stop()
        held.delete(canvas)
      }, 0)
    }
  }, [])

  useEffect(() => {
    ctl.current?.({ live, reduced })
  }, [live, reduced])

  return (
    <div ref={boxRef} className={className} aria-hidden="true">
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  )
}
