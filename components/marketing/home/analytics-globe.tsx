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

  One worker per canvas, kept across a development remount (a canvas can be
  handed to a worker only once), the way platform-globe.tsx keeps its own.
*/

import { useEffect, useRef } from "react"
import { PLATFORM_LAND_B64, PLATFORM_LAND_H, PLATFORM_LAND_W } from "./platform-globe-land"
import { createGlobeEngine, type V3 } from "./everything-globe-draw"
import { EVERYTHING_GLOBE_WORKER_SOURCE } from "./everything-globe-worker-source"

/** Where the creator works from (Lisbon), where every arc lands. */
const HOME: [number, number] = [38.72, -9.14]
/** Where visits come from: lat, lng. */
export const ANALYTICS_GLOBE_PLACES: Array<[number, number]> = [
  [40.71, -74.0],
  [51.5, -0.12],
  [52.52, 13.4],
  [43.65, -79.38],
  [48.86, 2.35],
  [-23.55, -46.63],
  [40.42, -3.7],
  [52.37, 4.9],
  [41.88, -87.63],
  [53.35, -6.26],
  [59.33, 18.07],
  [34.05, -118.24],
]

const DEG = Math.PI / 180
const toV = (lat: number, lng: number): V3 => {
  const phi = lat * DEG
  const lam = lng * DEG
  return [Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)]
}

let landCache: Float32Array | null = null
function landPoints(): Float32Array {
  if (landCache) return landCache
  const bin = atob(PLATFORM_LAND_B64)
  const bits = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i)
  const isLand = (lat: number, lng: number) => {
    const row = Math.min(PLATFORM_LAND_H - 1, Math.max(0, Math.floor((90 - lat) / 2)))
    const col = Math.min(PLATFORM_LAND_W - 1, Math.max(0, Math.floor(((((lng + 180) % 360) + 360) % 360) / 2)))
    const k = row * PLATFORM_LAND_W + col
    return (bits[k >> 3] >> (k & 7)) & 1
  }
  const out: number[] = []
  for (let lat = 80; lat >= -56; lat -= 1.2) {
    const n = Math.max(1, Math.round(300 * Math.cos(lat * DEG)))
    const shift = Math.round(lat / 1.2) % 2 ? 0.5 : 0
    for (let j = 0; j < n; j++) {
      const lng = -180 + (j + shift) * (360 / n)
      if (!isLand(lat, lng)) continue
      out.push(...toV(lat, lng))
    }
  }
  landCache = new Float32Array(out)
  return landCache
}

type Driver = { size: (w: number, h: number, dpr: number) => void; run: (on: boolean) => void; reduced: (on: boolean) => void; stop: () => void }

/** A canvas handed to a worker stays with it: kept here so a development remount reuses it. */
const held = new WeakMap<HTMLCanvasElement, { driver: Driver; users: number }>()

function startDriver(canvas: HTMLCanvasElement): Driver | null {
  const pts = landPoints()
  const cities = ANALYTICS_GLOBE_PLACES.map(([lat, lng]) => toV(lat, lng))
  const home = toV(HOME[0], HOME[1])
  if (typeof Worker === "function" && typeof OffscreenCanvas === "function" && typeof canvas.transferControlToOffscreen === "function") {
    let worker: Worker | null = null
    try {
      const url = URL.createObjectURL(new Blob([EVERYTHING_GLOBE_WORKER_SOURCE], { type: "text/javascript" }))
      worker = new Worker(url)
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      const off = canvas.transferControlToOffscreen()
      worker.postMessage({ type: "init", canvas: off, pts, cities, home }, [off])
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
    const st = { visible: true, live: false, reduced: false }
    const sync = () => driver.run(st.visible && st.live && !st.reduced)

    /* Size from the ResizeObserver's own entry: nothing is measured by hand. */
    const ro =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(([e]) => {
            const w = Math.round(e.contentRect.width)
            const h = Math.round(e.contentRect.height)
            if (w && h) driver.size(w, h, Math.min(1.5, window.devicePixelRatio || 1))
          })
        : null
    ro?.observe(box)
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([e]) => {
              st.visible = e.isIntersecting
              sync()
            },
            { rootMargin: "60px 0px" },
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
