"use client"

/*
  THE "SELL ANYWHERE" GLOBE (home section 3, card 3).

  A dotted Earth on one canvas: one dot per 1.15 degrees, evenly spaced over
  the sphere, kept where Natural Earth's 1:50m land outline says there is
  land (everything-globe-land.ts, written by
  scripts/build-everything-globe-land.mjs). The cities orders come from are
  lit up. Every couple of seconds an order shoots from the creator's studio
  (Brooklyn) to a buyer on the near side along the great circle between
  them, lands with a pulse, and a pill with the city and what they paid (in
  a currency Storelib's checkout charges in) rides on the city.

  It is the visitor's to play with: drag it (mouse, pen or a sideways swipe;
  an up and down swipe still scrolls the page) and it turns under the finger,
  keeps the throw's momentum when let go and eases back into its slow spin;
  under a mouse it leans toward the pointer.

  Cost: the turning and drawing is the engine in everything-globe-draw.ts,
  run in a worker that owns the canvas where the browser can hand one over
  (everything-globe-worker.ts, shipped as a string built by
  scripts/build-globe-worker.mjs), timed by the display's own frames, so it
  is as smooth at 144Hz as at 60. The page's own thread only passes the
  pointer on and moves the order pill: a few times a second the worker says
  where the city is and where it will be a moment later, and the pill glides
  there in one compositor animation (round 4: told every frame, the page
  restyled and committed itself every frame, and dragging lagged). The pill
  steps aside while the globe is dragged or coasting from a throw.
  Elsewhere the same engine runs here. It draws only while the section is on
  screen, the tab is visible and the globe itself is in view. Under reduced
  motion it stands still (one frame), and redraws only while dragged.
*/

import { useEffect, useRef } from "react"
import { EVERYTHING_LAND_B64, EVERYTHING_LAND_COUNT, EVERYTHING_LAND_NORTH, EVERYTHING_LAND_SOUTH, EVERYTHING_LAND_STEP } from "./everything-globe-land"
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
/** Every land dot as a unit vector (x east, y up, z toward longitude 0), read once from the bitmask; the same row walk as scripts/build-everything-globe-land.mjs. */
export function everythingLandPoints(): Float32Array {
  if (landCache) return landCache
  const bin = atob(EVERYTHING_LAND_B64)
  const out = new Float32Array(EVERYTHING_LAND_COUNT * 3)
  const step = EVERYTHING_LAND_STEP
  const rows = Math.floor((EVERYTHING_LAND_NORTH - EVERYTHING_LAND_SOUTH) / step) + 1
  let k = 0
  let n = 0
  for (let r = 0; r < rows; r++) {
    const lat = EVERYTHING_LAND_NORTH - r * step
    const count = Math.max(1, Math.round((360 * Math.cos(lat * DEG)) / step))
    const cl = Math.cos(lat * DEG)
    const sl = Math.sin(lat * DEG)
    for (let i = 0; i < count; i++, k++) {
      if (!((bin.charCodeAt(k >> 3) >> (k & 7)) & 1)) continue
      const lam = (-180 + ((i + (r % 2) * 0.5) * 360) / count) * DEG
      out[n++] = cl * Math.sin(lam)
      out[n++] = sl
      out[n++] = cl * Math.cos(lam)
    }
  }
  landCache = n === out.length ? out : out.subarray(0, n)
  return landCache
}

const handedOver = new WeakSet<HTMLCanvasElement>()

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
  const pts = everythingLandPoints()
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
      handedOver.add(canvas)
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
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext("2d")
  } catch {
    /* A canvas already handed to a worker: no globe rather than a broken page. */
  }
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
    const first = canvasRef.current
    const pills = pillsRef.current
    if (!box || !first || !pills) return
    let canvas: HTMLCanvasElement = first
    /* A canvas handed to a worker can never be drawn on again, from here or another worker: on a second mount (Strict Mode, a remount) it is swapped for a fresh one. */
    if (handedOver.has(canvas)) {
      const fresh = document.createElement("canvas")
      fresh.className = canvas.className
      canvas.replaceWith(fresh)
      canvas = fresh
    }
    const st = { w: 0, h: 0, pill: -1, pw: 0, shift: 0, visible: true, shown: true, live: false, reduced: false, dragging: -1 }

    /*
      The pill: its anchor (the stem) sits exactly on the city, moved by transform only. The globe says where the city
      is a few times a second, with where it will be a moment later, and the pill glides there in one compositor
      animation (round 4: a style change here on every frame cost a commit of the whole page each frame, and the drag
      lagged behind it). Its body is nudged sideways, also by transform, only when it would leave the card.
    */
    let glide: Animation | null = null
    const onPill = (p: GlobePill) => {
      const el = pills.children[p.i] as HTMLElement | undefined
      if (!el) return
      if (p.i !== st.pill) {
        const old = pills.children[st.pill] as HTMLElement | undefined
        old?.removeAttribute("data-on")
        glide?.cancel()
        glide = null
        st.pill = p.i
        st.pw = 0
        st.shift = 0
        ;(el.firstElementChild as HTMLElement | null)?.style.removeProperty("transform")
      }
      const body = el.firstElementChild as HTMLElement | null
      /* The body's width, read once per pill as it is first shown. */
      if (!st.pw && p.on) st.pw = (body?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0
      const half = st.pw / 2
      const lo = 12 + half
      const hi = st.w - 12 - half
      const mid = (p.x + p.x2) / 2
      const shift = Math.round((mid < lo ? lo - mid : mid > hi ? hi - mid : 0) * 2) / 2
      if (shift !== st.shift && body) {
        st.shift = shift
        body.style.transform = shift ? `translate(${shift}px,0)` : ""
      }
      const from = `translate(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px)`
      const prev = glide
      if (p.on && p.d > 0 && typeof el.animate === "function") {
        el.style.transform = from
        glide = el.animate([{ transform: from }, { transform: `translate(${p.x2.toFixed(2)}px,${p.y2.toFixed(2)}px)` }], { duration: p.d, easing: "linear", fill: "forwards" })
      } else {
        glide = null
        el.style.transform = from
      }
      prev?.cancel()
      if (el.hasAttribute("data-on") !== p.on) el.toggleAttribute("data-on", p.on)
    }
    const driver = startDriver(canvas, onPill, () => {
      if (!canvas.hasAttribute("data-drawn")) canvas.setAttribute("data-drawn", "")
    })
    if (!driver) return

    const sync = () => driver.run(st.visible && st.shown && st.live && !st.reduced)
    const onVisibility = () => {
      st.shown = document.visibilityState !== "hidden"
      sync()
    }
    document.addEventListener("visibilitychange", onVisibility)
    st.shown = document.visibilityState !== "hidden"

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
    /*
      The move path reads no layout: a drag passes the pointer straight to the globe (Chromium already hands pointermove
      over once per frame), and the lean uses the card's box as read once when the mouse comes in, dropped again when
      the page scrolls or the card is resized.
    */
    let rect: DOMRect | null = null
    const onMove = (e: PointerEvent) => {
      if (st.dragging === e.pointerId) {
        driver.pointer({ kind: "move", x: e.clientX, y: e.clientY, t: e.timeStamp })
        return
      }
      if (e.pointerType !== "mouse" || st.reduced) return
      if (!rect) {
        rect = box.getBoundingClientRect()
        window.addEventListener("scroll", forget, { passive: true, once: true })
      }
      driver.lean((e.clientX - rect.left) / rect.width - 0.5, (e.clientY - rect.top) / rect.height - 0.5)
    }
    const onUp = (e: PointerEvent) => {
      if (st.dragging !== e.pointerId) return
      st.dragging = -1
      box.removeAttribute("data-dragging")
      driver.pointer({ kind: "up", x: e.clientX, y: e.clientY, t: e.timeStamp })
    }
    const onLeave = (e: PointerEvent) => {
      forget()
      if (e.pointerType !== "mouse") return
      driver.lean(0, 0)
    }
    function forget() {
      rect = null
      window.removeEventListener("scroll", forget)
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
            forget()
            driver.size(w, h, Math.min(2, window.devicePixelRatio || 1))
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
      document.removeEventListener("visibilitychange", onVisibility)
      ro?.disconnect()
      io?.disconnect()
      box.removeEventListener("pointerdown", onDown)
      box.removeEventListener("pointermove", onMove)
      box.removeEventListener("pointerup", onUp)
      box.removeEventListener("pointercancel", onUp)
      box.removeEventListener("pointerleave", onLeave)
      window.removeEventListener("scroll", forget)
      glide?.cancel()
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
            <span className="ev-globe-pill-shift">
              <span className="ev-globe-pill-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ev-globe-flag" src={`/flags/${o.cc}.svg`} alt="" width={16} height={12} loading="lazy" decoding="async" />
              <span className="ev-globe-city">New order, {o.city}</span>
                <span className="ev-globe-price">{o.price}</span>
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
