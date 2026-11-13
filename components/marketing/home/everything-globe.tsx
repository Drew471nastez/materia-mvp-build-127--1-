"use client"

/*
  THE "SELL TO FANS ANYWHERE" GLOBE (home section 3, card 3).

  A dotted Earth on one canvas, drawn from the same 2 degree land bitmap the
  analytics globe uses (platform-globe-land.ts), with the cities orders come
  from lit up. Every couple of seconds an order arcs from the creator's studio
  (Brooklyn) to a buyer on the near side, the buyer's city rings, and a pill
  with the city and what they paid (in a currency Storelib's checkout
  charges in) rides on it.

  It is the visitor's to play with: drag it (mouse, pen or a sideways swipe;
  an up and down swipe still scrolls the page) and it turns under the finger,
  keeps the throw's momentum when let go and eases back into its slow spin;
  under a mouse it leans toward the pointer.

  Cost (wave 13 perf): the turning and drawing is the engine in
  everything-globe-draw.ts, run in a worker that owns the canvas where the
  browser can hand one over (everything-globe-worker.ts, shipped as a string
  built by scripts/build-globe-worker.mjs), so the page's own thread does
  nothing per frame: it only passes the pointer on and moves the order pill
  (transform only) when the worker says where, every 100ms with a glide of
  as long, every frame while the globe is being turned. Elsewhere the same
  engine runs here. It draws only while the section is on screen, the tab
  is visible and the globe itself is in view. Under reduced motion it stands
  still (one frame), and redraws only while dragged.
*/

import { useEffect, useRef } from "react"
import { PLATFORM_LAND_B64, PLATFORM_LAND_H, PLATFORM_LAND_W } from "./platform-globe-land"
import { createGlobeEngine, type GlobeEngine, type GlobePill, type GlobePointer, type V3 } from "./everything-globe-draw"
import { EVERYTHING_GLOBE_WORKER_SOURCE } from "./everything-globe-worker-source"

type Order = { city: string; cc: string; lat: number; lng: number; price: string }

/** Where orders come from, and what each paid, in a currency checkout charges in (lib/payments/fees/currency-rules) or in dollars. */
export const EVERYTHING_GLOBE_ORDERS: Order[] = [
  { city: "Lisbon", cc: "PT", lat: 38.72, lng: -9.14, price: "€24.00" },
  { city: "Toronto", cc: "CA", lat: 43.65, lng: -79.38, price: "CA$44.00" },
  { city: "London", cc: "GB", lat: 51.5, lng: -0.12, price: "£26.00" },
  { city: "Tokyo", cc: "JP", lat: 35.68, lng: 139.69, price: "¥3,600" },
  { city: "Los Angeles", cc: "US", lat: 34.05, lng: -118.24, price: "$32.00" },
  { city: "Berlin", cc: "DE", lat: 52.52, lng: 13.4, price: "€119.00" },
  { city: "Sydney", cc: "AU", lat: -33.87, lng: 151.21, price: "A$189.00" },
  { city: "São Paulo", cc: "BR", lat: -23.55, lng: -46.63, price: "$24.00" },
  { city: "Bucharest", cc: "RO", lat: 44.43, lng: 26.1, price: "115 RON" },
  { city: "Chicago", cc: "US", lat: 41.88, lng: -87.63, price: "$129.00" },
  { city: "Paris", cc: "FR", lat: 48.86, lng: 2.35, price: "€32.00" },
  { city: "Singapore", cc: "SG", lat: 1.35, lng: 103.82, price: "$24.00" },
  { city: "Vancouver", cc: "CA", lat: 49.28, lng: -123.12, price: "CA$32.00" },
  { city: "Mexico City", cc: "MX", lat: 19.43, lng: -99.13, price: "$32.00" },
  { city: "Amsterdam", cc: "NL", lat: 52.37, lng: 4.9, price: "€24.00" },
  { city: "Cape Town", cc: "ZA", lat: -33.92, lng: 18.42, price: "$24.00" },
  { city: "Melbourne", cc: "AU", lat: -37.81, lng: 144.96, price: "A$36.00" },
  { city: "Seoul", cc: "KR", lat: 37.57, lng: 126.98, price: "$24.00" },
  { city: "Dublin", cc: "IE", lat: 53.35, lng: -6.26, price: "€24.00" },
  { city: "Austin", cc: "US", lat: 30.27, lng: -97.74, price: "$32.00" },
]

/** The creator's studio, where every arc starts. */
const HOME: [number, number] = [40.68, -73.94]

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
    const col = Math.min(PLATFORM_LAND_W - 1, Math.max(0, Math.floor((((lng + 180) % 360) + 360) % 360 / 2)))
    const k = row * PLATFORM_LAND_W + col
    return (bits[k >> 3] >> (k & 7)) & 1
  }
  const out: number[] = []
  /* A dot every 1.2 degrees of latitude, spaced evenly along each row; Antarctica left off. */
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

/** What drives the globe: a worker holding the canvas, or the engine on this thread. */
type Driver = {
  size: (w: number, h: number, dpr: number) => void
  run: (on: boolean) => void
  reduced: (on: boolean) => void
  pointer: (e: GlobePointer) => void
  lean: (x: number, y: number) => void
  stop: () => void
}

function startDriver(canvas: HTMLCanvasElement, onPill: (p: GlobePill) => void, onDrawn: () => void): Driver | null {
  const pts = landPoints()
  const cities = EVERYTHING_GLOBE_ORDERS.map((o) => toV(o.lat, o.lng))
  const home = toV(HOME[0], HOME[1])
  if (typeof Worker === "function" && typeof OffscreenCanvas === "function" && typeof canvas.transferControlToOffscreen === "function") {
    let worker: Worker | null = null
    try {
      /* The worker's code ships inside this chunk (scripts/build-globe-worker.mjs): no file to fetch. */
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
      w.onmessage = (e: MessageEvent<{ type: "pill"; p: GlobePill } | { type: "drawn" }>) => {
        if (e.data.type === "pill") onPill(e.data.p)
        else onDrawn()
      }
      return {
        size: (width, height, dpr) => w.postMessage({ type: "size", w: width, h: height, dpr }),
        run: (on) => w.postMessage({ type: "run", on }),
        reduced: (on) => w.postMessage({ type: "reduced", on }),
        pointer: (e) => w.postMessage({ type: "pointer", e }),
        lean: (x, y) => w.postMessage({ type: "lean", x, y }),
        stop: () => w.terminate(),
      }
    }
  }
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  const engine: GlobeEngine = createGlobeEngine(
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
      onPill,
      onDrawn,
    },
    pts,
    cities,
    home,
  )
  return engine
}

export function EverythingGlobe({ live, reduced }: { live: boolean; reduced: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pillsRef = useRef<HTMLDivElement>(null)
  /* The props reach the driver through refs, so the effect, its listeners and its state are set up once. */
  const ctl = useRef<null | ((p: { live: boolean; reduced: boolean }) => void)>(null)
  const liveRef = useRef(live)
  const reducedRef = useRef(reduced)
  liveRef.current = live
  reducedRef.current = reduced

  useEffect(() => {
    const box = wrap.current
    const canvas = canvasRef.current
    const pills = pillsRef.current
    if (!box || !canvas || !pills) return
    const st = { w: 0, h: 0, pill: -1, half: 0, visible: true, live: false, reduced: false, dragging: -1 }

    /* The pill: kept inside the card (its half width measured once, when it is first shown), moved by transform only. */
    const onPill = (p: GlobePill) => {
      const el = pills.children[p.i] as HTMLElement | undefined
      if (!el) return
      let first = false
      if (p.i !== st.pill) {
        const prev = pills.children[st.pill] as HTMLElement | undefined
        prev?.removeAttribute("data-on")
        prev?.removeAttribute("data-glide")
        st.pill = p.i
        st.half = 0
        first = true
      }
      if (!st.half) st.half = ((el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0) / 2
      const x = Math.max(16 + st.half, Math.min(st.w - 16 - st.half, p.x))
      const y = Math.max(52, p.y)
      /* Between interactions the place comes every GLOBE_PILL_EVERY_MS and the pill glides there; a first placement or a drag puts it there at once. */
      el.toggleAttribute("data-glide", !first && !p.now)
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`
      el.toggleAttribute("data-on", p.on)
    }
    const driver = startDriver(canvas, onPill, () => {
      if (!canvas.hasAttribute("data-drawn")) canvas.setAttribute("data-drawn", "")
    })
    if (!driver) return

    const sync = () => driver.run(st.visible && st.live && !st.reduced)

    /* Pointer: drag to turn (with momentum), lean toward a hovering mouse. */
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      st.dragging = e.pointerId
      box.setAttribute("data-dragging", "")
      try {
        box.setPointerCapture(e.pointerId)
      } catch {}
      driver.pointer({ kind: "down", x: e.clientX, y: e.clientY, t: e.timeStamp })
    }
    const onMove = (e: PointerEvent) => {
      if (st.dragging === e.pointerId) {
        driver.pointer({ kind: "move", x: e.clientX, y: e.clientY, t: e.timeStamp })
        return
      }
      if (e.pointerType !== "mouse" || st.reduced) return
      const rect = box.getBoundingClientRect()
      driver.lean((e.clientX - rect.left) / rect.width - 0.5, (e.clientY - rect.top) / rect.height - 0.5)
    }
    const onUp = (e: PointerEvent) => {
      if (st.dragging !== e.pointerId) return
      st.dragging = -1
      box.removeAttribute("data-dragging")
      driver.pointer({ kind: "up", x: e.clientX, y: e.clientY, t: e.timeStamp })
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      driver.lean(0, 0)
    }

    box.addEventListener("pointerdown", onDown)
    box.addEventListener("pointermove", onMove)
    box.addEventListener("pointerup", onUp)
    box.addEventListener("pointercancel", onUp)
    box.addEventListener("pointerleave", onLeave)

    /* Size: read from the ResizeObserver's own entry, after layout, never by measuring at mount (a forced layout of the page). */
    const ro =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(([entry]) => {
            const w = Math.round(entry.contentRect.width)
            const h = Math.round(entry.contentRect.height)
            if (!w || !h) return
            st.w = w
            st.h = h
            driver.size(w, h, Math.min(1.5, window.devicePixelRatio || 1))
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

    return () => {
      driver.stop()
      ro?.disconnect()
      io?.disconnect()
      box.removeEventListener("pointerdown", onDown)
      box.removeEventListener("pointermove", onMove)
      box.removeEventListener("pointerup", onUp)
      box.removeEventListener("pointercancel", onUp)
      box.removeEventListener("pointerleave", onLeave)
      ctl.current = null
    }
  }, [])

  useEffect(() => {
    ctl.current?.({ live, reduced })
  }, [live, reduced])

  return (
    <div ref={wrap} className="ev-globe" aria-hidden="true">
      <canvas ref={canvasRef} className="ev-globe-canvas" />
      <div ref={pillsRef} className="ev-globe-pills">
        {EVERYTHING_GLOBE_ORDERS.map((o) => (
          <div key={o.city} className="ev-globe-pill">
            <span className="ev-globe-pill-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ev-globe-flag" src={`/flags/${o.cc}.svg`} alt="" width={16} height={12} loading="lazy" decoding="async" />
              <span className="ev-globe-city">New order, {o.city}</span>
              <span className="ev-globe-price">{o.price}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
