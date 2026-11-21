"use client"

/*
  A DOTTED GLOBE ON ONE CANVAS.

  About 2,600 land dots (one per 2 degree cell, fewer toward the poles so
  they sit evenly on the sphere) from the bitmap in platform-globe-land.ts,
  turned slowly, with visitor pulses rising from a few dozen places. Each
  frame: rotate the points, keep the near half, and fill them as three
  batched paths by depth (three fill calls, no per-dot state changes). The
  shaded sphere behind is painted once per size into an offscreen canvas.

  Where the browser can, the canvas is handed to a worker that turns and
  draws it (platform-globe-worker.ts, shipped as a string built by
  scripts/build-globe-worker.mjs), so the page's own thread does nothing
  per frame; elsewhere it is drawn here, with the same drawing
  (platform-globe-draw.ts).

  It draws only while `running` (the section on screen, the tab visible).
  Under reduced motion it draws one still frame. Device pixels are capped at
  1.5x (dots this small look the same at 2x and cost 78% more to upload each
  frame), so a 4K screen pays the same as a laptop.
*/

import { canvasOnPageThread } from "./page-thread-canvas"
import { useEffect, useRef, useState } from "react"
import { PLATFORM_LAND_B64, PLATFORM_LAND_H, PLATFORM_LAND_W } from "./platform-globe-land"
import { drawGlobe, paintGlobeBackdrop, stepGlobe, stillPulses, type GlobePulse } from "./platform-globe-draw"
import { GLOBE_WORKER_SOURCE } from "./platform-globe-worker-source"

/** Places visits pulse from: lat, lng. */
export const PLATFORM_GLOBE_SPOTS: Array<[number, number]> = [
  [40.7, -74.0], [34.05, -118.2], [41.9, -87.6], [43.65, -79.4], [49.3, -123.1], [19.4, -99.1],
  [-23.5, -46.6], [-34.6, -58.4], [4.7, -74.1], [51.5, -0.1], [53.35, -6.26], [48.86, 2.35],
  [52.52, 13.4], [38.7, -9.14], [40.4, -3.7], [41.9, 12.5], [52.37, 4.9], [59.3, 18.1],
  [52.2, 21.0], [6.5, 3.4], [-1.3, 36.8], [-33.9, 18.4], [25.2, 55.3], [19.1, 72.9],
  [1.35, 103.8], [35.7, 139.7], [37.6, 127.0], [-33.9, 151.2], [-37.8, 145.0], [-36.85, 174.8],
]

const DEG = Math.PI / 180

function landPoints(): Float32Array {
  const bin = atob(PLATFORM_LAND_B64)
  const bits = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i)
  const isLand = (lat: number, lng: number) => {
    const row = Math.min(PLATFORM_LAND_H - 1, Math.max(0, Math.floor((90 - lat) / 2)))
    const col = Math.min(PLATFORM_LAND_W - 1, Math.max(0, Math.floor((lng + 180) / 2)))
    const k = row * PLATFORM_LAND_W + col
    return (bits[k >> 3] >> (k & 7)) & 1
  }
  const out: number[] = []
  /* Rows every 1.8 degrees; Antarctica's ice is left off, it only clutters the bottom. */
  for (let lat = 82; lat >= -58; lat -= 1.8) {
    const n = Math.max(1, Math.round(200 * Math.cos(lat * DEG)))
    for (let j = 0; j < n; j++) {
      const lng = -180 + (j + (Math.abs(Math.round(lat / 1.8)) % 2 ? 0.5 : 0)) * (360 / n)
      if (!isLand(lat, lng)) continue
      const phi = lat * DEG
      const lam = lng * DEG
      out.push(Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam))
    }
  }
  return new Float32Array(out)
}

const toXYZ = ([lat, lng]: [number, number]) => {
  const phi = lat * DEG
  const lam = lng * DEG
  return [Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)] as const
}
const SPOTS_XYZ = PLATFORM_GLOBE_SPOTS.map(toXYZ)

/** Worker messages out: a pulse started (its spot), or the first frame is drawn. */
type FromWorker = { type: "pulse"; s: number } | { type: "drawn" }

/** The worker drawing a canvas, if this browser can hand a canvas to one. Kept per canvas: a canvas is handed over once. */
const workers = new WeakMap<HTMLCanvasElement, { worker: Worker; users: number; stop?: ReturnType<typeof setTimeout> }>()
function globeWorker(canvas: HTMLCanvasElement, pts: Float32Array, angle: number) {
  const held = workers.get(canvas)
  if (held) {
    clearTimeout(held.stop)
    held.users++
    return held
  }
  /* Landing round 20: not in WebKit, which draws the globe on the page's thread (page-thread-canvas.ts). */
  if (canvasOnPageThread() || typeof Worker !== "function" || typeof OffscreenCanvas !== "function" || typeof canvas.transferControlToOffscreen !== "function") return null
  let worker: Worker
  try {
    /* The worker's code ships inside this chunk (scripts/build-globe-worker.mjs): no file to fetch. */
    const url = URL.createObjectURL(new Blob([GLOBE_WORKER_SOURCE], { type: "text/javascript" }))
    worker = new Worker(url)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch {
    return null
  }
  try {
    const off = canvas.transferControlToOffscreen()
    worker.postMessage({ type: "init", canvas: off, pts, spots: SPOTS_XYZ, angle }, [off])
    const entry = { worker, users: 1 } as { worker: Worker; users: number; stop?: ReturnType<typeof setTimeout> }
    workers.set(canvas, entry)
    return entry
  } catch {
    worker.terminate()
    return null
  }
}

export function PlatformGlobe({
  running,
  reduced,
  className,
  onPulse,
}: {
  running: boolean
  reduced: boolean
  className?: string
  /** Told which spot pulsed (index into PLATFORM_GLOBE_SPOTS) when a pulse starts on the near side. */
  onPulse?: (spot: number) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const state = useRef<{
    pts: Float32Array | null
    angle: number
    pulses: GlobePulse[]
    nextPulse: number
    bg: HTMLCanvasElement | null
    size: number
    dpr: number
    worker: Worker | null
  }>({ pts: null, angle: -1.2, pulses: [], nextPulse: 0, bg: null, size: 0, dpr: 1, worker: null })
  const onPulseRef = useRef(onPulse)
  onPulseRef.current = onPulse

  /* Size: one ResizeObserver; the backdrop is repainted only when the size changes. */
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const st = state.current
    st.pts ??= landPoints()
    const held = globeWorker(canvas, st.pts, st.angle)
    if (held) {
      st.worker = held.worker
      held.worker.onmessage = (e: MessageEvent<FromWorker>) => {
        if (e.data.type === "pulse") onPulseRef.current?.(e.data.s)
        else if (e.data.type === "drawn" && !canvas.hasAttribute("data-drawn")) canvas.setAttribute("data-drawn", "")
      }
    }
    const fit = () => {
      const size = Math.round(canvas.getBoundingClientRect().width)
      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      if (!size || (size === st.size && dpr === st.dpr)) return
      st.size = size
      st.dpr = dpr
      if (st.worker) {
        st.worker.postMessage({ type: "size", size, dpr })
        return
      }
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      const bg = document.createElement("canvas")
      bg.width = canvas.width
      bg.height = canvas.height
      const g = bg.getContext("2d")
      if (g) paintGlobeBackdrop(g, bg.width)
      st.bg = bg
      draw(performance.now())
    }
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null
    ro?.observe(canvas)
    fit()
    return () => {
      ro?.disconnect()
      if (held) {
        /* Ended for good unless the same canvas comes straight back (a remount in development). */
        held.users--
        held.stop = setTimeout(() => {
          if (held.users > 0) return
          held.worker.terminate()
          workers.delete(canvas)
        }, 0)
        st.worker = null
        st.size = 0
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const draw = (now: number) => {
    const canvas = ref.current
    const st = state.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx || !st.pts || !st.bg) return
    st.pulses = drawGlobe(ctx, canvas.width, st.bg, st.pts, st.angle, st.pulses, SPOTS_XYZ, now)
    if (!canvas.hasAttribute("data-drawn")) canvas.setAttribute("data-drawn", "")
  }

  /* The section can be on screen while the globe is not (its cards below are): watch the canvas too. */
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || typeof IntersectionObserver !== "function") {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "40px 0px" })
    io.observe(canvas)
    return () => io.disconnect()
  }, [])

  /* The loop: only while running and the globe itself is on screen. */
  useEffect(() => {
    const st = state.current
    const worker = st.worker
    if (reduced) {
      if (worker) worker.postMessage({ type: "still" })
      else {
        st.pulses = stillPulses(performance.now())
        draw(performance.now())
      }
      return
    }
    if (!running || !inView) return
    if (worker) {
      worker.postMessage({ type: "run", running: true })
      return () => worker.postMessage({ type: "run", running: false })
    }
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now
      const s = stepGlobe(st, SPOTS_XYZ, now, dt)
      if (s !== null) onPulseRef.current?.(s)
      draw(now)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, reduced, inView])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
