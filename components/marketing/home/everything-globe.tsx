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

  Cost: one canvas, device pixels capped at 1.5x, a few thousand dots filled
  as three batched paths by depth, the shaded sphere painted once per size.
  The loop runs only while the section is on screen, the tab is visible and
  the globe itself is in view; the pill is moved with transform only. Under
  reduced motion it stands still (one frame), and redraws only while dragged.
*/

import { useEffect, useRef } from "react"
import { PLATFORM_LAND_B64, PLATFORM_LAND_H, PLATFORM_LAND_W } from "./platform-globe-land"

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
const AUTO_SPIN = 0.00013 /* radians per ms */
const BASE_PITCH = 0.42
const ORDER_EVERY = 2300
const ARC_MS = 1500
const TAIL_LAG = 520
const RING_MS = 1300

type V3 = [number, number, number]
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

type Arc = { pts: Float32Array; t0: number; order: number; landed?: boolean }
type Ring = { order: number; t0: number }

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** 48 points along the great circle from a to b, lifted off the surface toward the middle. */
function arcPoints(a: V3, b: V3): Float32Array {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const w = Math.acos(dot)
  const s = Math.sin(w) || 1
  const lift = 0.1 + 0.38 * (w / Math.PI)
  const N = 48
  const out = new Float32Array((N + 1) * 3)
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const ka = Math.sin((1 - t) * w) / s
    const kb = Math.sin(t * w) / s
    const h = 1 + lift * Math.sin(Math.PI * t)
    out[i * 3] = (ka * a[0] + kb * b[0]) * h
    out[i * 3 + 1] = (ka * a[1] + kb * b[1]) * h
    out[i * 3 + 2] = (ka * a[2] + kb * b[2]) * h
  }
  return out
}

export function EverythingGlobe({ live, reduced }: { live: boolean; reduced: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pillsRef = useRef<HTMLDivElement>(null)
  /* The props reach the loop through refs, so the effect, its listeners and its state are set up once. */
  const ctl = useRef<null | ((p: { live: boolean; reduced: boolean }) => void)>(null)
  const liveRef = useRef(live)
  const reducedRef = useRef(reduced)
  liveRef.current = live
  reducedRef.current = reduced

  useEffect(() => {
    const box = wrap.current
    const canvas = canvasRef.current
    const pills = pillsRef.current
    const ctx = canvas?.getContext("2d")
    if (!box || !canvas || !ctx || !pills) return
    const pts = landPoints()
    const cities = EVERYTHING_GLOBE_ORDERS.map((o) => toV(o.lat, o.lng))
    const home = toV(HOME[0], HOME[1])

    const st = {
      w: 0,
      h: 0,
      dpr: 1,
      R: 0,
      cx: 0,
      cy: 0,
      yaw: 1.05,
      pitch: BASE_PITCH,
      vyaw: AUTO_SPIN,
      leanX: 0,
      leanY: 0,
      targetLeanX: 0,
      targetLeanY: 0,
      drag: null as null | { id: number; x: number; y: number; t: number },
      arcs: [] as Arc[],
      rings: [] as Ring[],
      next: 0,
      order: 0,
      pill: -1,
      pillShown: false,
      pillHalf: 0,
      bg: null as HTMLCanvasElement | null,
      glow: null as HTMLCanvasElement | null,
      frame: 0,
      last: 0,
      running: false,
      visible: true,
      live: false,
      reduced: false,
    }

    /* The shaded sphere and its soft halo, and the glow sprite city lights are stamped with: painted once per size. */
    const paintStatic = () => {
      const W = canvas.width
      const H = canvas.height
      const R = st.R * st.dpr
      const cx = st.cx * st.dpr
      const cy = st.cy * st.dpr
      const bg = document.createElement("canvas")
      bg.width = W
      bg.height = H
      const g = bg.getContext("2d")
      if (g) {
        const halo = g.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.16)
        halo.addColorStop(0, "rgba(167,139,250,0.20)")
        halo.addColorStop(1, "rgba(167,139,250,0)")
        g.fillStyle = halo
        g.fillRect(0, 0, W, H)
        const body = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R)
        body.addColorStop(0, "#2a2a31")
        body.addColorStop(0.55, "#141418")
        body.addColorStop(1, "#070709")
        g.fillStyle = body
        g.beginPath()
        g.arc(cx, cy, R, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = "rgba(255,255,255,0.10)"
        g.lineWidth = Math.max(1, st.dpr)
        g.stroke()
      }
      st.bg = bg
      const s = Math.round(28 * st.dpr)
      const glow = document.createElement("canvas")
      glow.width = s
      glow.height = s
      const gg = glow.getContext("2d")
      if (gg) {
        const r = gg.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
        r.addColorStop(0, "rgba(255,255,255,1)")
        r.addColorStop(0.14, "rgba(255,255,255,0.95)")
        r.addColorStop(0.3, "rgba(237,233,254,0.35)")
        r.addColorStop(1, "rgba(237,233,254,0)")
        gg.fillStyle = r
        gg.fillRect(0, 0, s, s)
      }
      st.glow = glow
    }

    const fit = () => {
      const rect = box.getBoundingClientRect()
      const w = Math.round(rect.width)
      const h = Math.round(rect.height)
      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      if (!w || !h || (w === st.w && h === st.h && dpr === st.dpr)) return
      st.w = w
      st.h = h
      st.dpr = dpr
      st.R = Math.min(w * 0.45, h * 0.57)
      st.cx = w / 2
      st.cy = h * 0.53
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      paintStatic()
      draw(performance.now())
    }

    /* Rotation of a unit vector into view space: yaw about the axis, then pitch toward the viewer. */
    let cY = 1
    let sY = 0
    let cP = 1
    let sP = 0
    const setRot = () => {
      const yaw = st.yaw + st.leanX
      const pitch = st.pitch + st.leanY
      cY = Math.cos(yaw)
      sY = Math.sin(yaw)
      cP = Math.cos(pitch)
      sP = Math.sin(pitch)
    }
    const out: V3 = [0, 0, 0]
    const rot = (x: number, y: number, z: number) => {
      const x1 = x * cY + z * sY
      const z1 = -x * sY + z * cY
      out[0] = x1
      out[1] = y * cP - z1 * sP
      out[2] = y * sP + z1 * cP
      return out
    }
    const hidden = (x: number, y: number, z: number) => z < 0 && x * x + y * y < 1

    const draw = (now: number) => {
      if (!st.bg || !st.glow) return
      setRot()
      const d = st.dpr
      const R = st.R * d
      const cx = st.cx * d
      const cy = st.cy * d
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(st.bg, 0, 0)

      /* Land: three batched paths by depth. */
      const dot = Math.max(1, R * 0.0085)
      const far = new Path2D()
      const mid = new Path2D()
      const near = new Path2D()
      for (let i = 0; i < pts.length; i += 3) {
        const p = rot(pts[i], pts[i + 1], pts[i + 2])
        const z = p[2]
        if (z <= 0.04) continue
        const r = dot * (0.5 + 0.5 * z)
        const px = cx + p[0] * R - r / 2
        const py = cy - p[1] * R - r / 2
        ;(z > 0.6 ? near : z > 0.28 ? mid : far).rect(px, py, r, r)
      }
      ctx.fillStyle = "rgba(255,255,255,0.20)"
      ctx.fill(far)
      ctx.fillStyle = "rgba(255,255,255,0.44)"
      ctx.fill(mid)
      ctx.fillStyle = "rgba(255,255,255,0.72)"
      ctx.fill(near)

      /* City lights. */
      const gs = st.glow.width
      for (let i = 0; i <= cities.length; i++) {
        const c = i < cities.length ? cities[i] : home
        const p = rot(c[0], c[1], c[2])
        if (p[2] <= 0.05) continue
        ctx.globalAlpha = Math.min(1, p[2] * 1.8) * (i === cities.length ? 1 : 0.85)
        const size = gs * (i === cities.length ? 1.25 : 0.8)
        ctx.drawImage(st.glow, cx + p[0] * R - size / 2, cy - p[1] * R - size / 2, size, size)
      }
      ctx.globalAlpha = 1

      /* Order arcs: a comet from the studio to the buyer. */
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      const N = 48
      st.arcs = st.arcs.filter((a) => now - a.t0 < ARC_MS + TAIL_LAG + 80)
      for (const a of st.arcs) {
        const head = ease(Math.min(1, (now - a.t0) / ARC_MS))
        const tail = ease(Math.max(0, Math.min(1, (now - a.t0 - TAIL_LAG) / ARC_MS)))
        const i0 = Math.floor(tail * N)
        const i1 = Math.ceil(head * N)
        if (i1 <= i0) continue
        ctx.beginPath()
        let pen = false
        let hx = 0
        let hy = 0
        let hv = false
        for (let i = i0; i <= i1; i++) {
          const p = rot(a.pts[i * 3], a.pts[i * 3 + 1], a.pts[i * 3 + 2])
          const x = cx + p[0] * R
          const y = cy - p[1] * R
          if (hidden(p[0], p[1], p[2])) {
            pen = false
            hv = false
            continue
          }
          if (pen) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
          pen = true
          hx = x
          hy = y
          hv = true
        }
        /* A soft glow under a bright line. */
        ctx.strokeStyle = "rgba(167,139,250,0.22)"
        ctx.lineWidth = 6 * d
        ctx.stroke()
        ctx.strokeStyle = "rgba(221,214,254,0.95)"
        ctx.lineWidth = Math.max(1.4, 1.8 * d)
        ctx.stroke()
        if (hv && head < 1) {
          ctx.fillStyle = "#fff"
          ctx.beginPath()
          ctx.arc(hx, hy, 3 * d, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      /* The buyer's city rings as the order lands. */
      st.rings = st.rings.filter((r) => now - r.t0 < RING_MS)
      for (const r of st.rings) {
        const c = cities[r.order]
        const p = rot(c[0], c[1], c[2])
        if (p[2] <= 0.05) continue
        const k = (now - r.t0) / RING_MS
        ctx.globalAlpha = (1 - k) * Math.min(1, p[2] * 1.6)
        ctx.strokeStyle = "#c4b5fd"
        ctx.lineWidth = 1.5 * d
        ctx.beginPath()
        ctx.arc(cx + p[0] * R, cy - p[1] * R, (3 + 22 * ease(k)) * d, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      /* The pill rides on the latest buyer's city, and steps aside when it turns away. */
      if (st.pill >= 0) {
        const c = cities[st.pill]
        const p = rot(c[0], c[1], c[2])
        const show = p[2] > 0.12
        const el = pills.children[st.pill] as HTMLElement | undefined
        if (el) {
          /* Kept inside the card: its half width is measured once, when it is first shown. */
          if (!st.pillHalf) st.pillHalf = ((el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0) / 2
          const x = Math.max(16 + st.pillHalf, Math.min(st.w - 16 - st.pillHalf, st.cx + p[0] * st.R))
          const y = Math.max(52, st.cy - p[1] * st.R)
          el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`
          if (show !== st.pillShown) {
            st.pillShown = show
            el.toggleAttribute("data-on", show)
          }
        }
      }
      if (!canvas.hasAttribute("data-drawn")) canvas.setAttribute("data-drawn", "")
    }

    const showPill = (i: number) => {
      if (st.pill === i) return
      const prev = pills.children[st.pill] as HTMLElement | undefined
      prev?.removeAttribute("data-on")
      st.pill = i
      st.pillShown = false
      st.pillHalf = 0
    }

    /* The next order: the next buyer in the list whose city faces the viewer. */
    const launch = (now: number) => {
      setRot()
      for (let tries = 0; tries < cities.length; tries++) {
        const i = st.order
        st.order = (st.order + 1) % cities.length
        const c = cities[i]
        if (rot(c[0], c[1], c[2])[2] > 0.3) {
          st.arcs.push({ pts: arcPoints(home, c), t0: now, order: i })
          return
        }
      }
    }

    const tick = (now: number) => {
      st.frame = 0
      const dt = Math.min(48, now - st.last)
      st.last = now
      if (!st.drag) {
        st.vyaw += (AUTO_SPIN - st.vyaw) * (1 - Math.exp(-dt / 900))
        st.yaw += st.vyaw * dt
        st.pitch += (BASE_PITCH - st.pitch) * (1 - Math.exp(-dt / 1100))
      }
      const kl = 1 - Math.exp(-dt / 260)
      st.leanX += (st.targetLeanX - st.leanX) * kl
      st.leanY += (st.targetLeanY - st.leanY) * kl
      if (!st.reduced) {
        if (now >= st.next) {
          launch(now)
          st.next = now + ORDER_EVERY
        }
        for (const a of st.arcs) {
          if (!a.landed && now - a.t0 >= ARC_MS) {
            a.landed = true
            st.rings.push({ order: a.order, t0: now })
            showPill(a.order)
          }
        }
      }
      draw(now)
      if (st.running) st.frame = requestAnimationFrame(tick)
    }

    const start = () => {
      if (st.frame) return
      st.last = performance.now()
      st.frame = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (st.frame) cancelAnimationFrame(st.frame)
      st.frame = 0
    }
    const sync = () => {
      const want = st.visible && st.live && !st.reduced
      const interacting = !!st.drag || Math.abs(st.leanX - st.targetLeanX) + Math.abs(st.leanY - st.targetLeanY) > 0.002
      st.running = want || interacting
      if (st.running) start()
      else stop()
    }

    /* Pointer: drag to turn (with momentum), lean toward a hovering mouse. */
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      st.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }
      st.vyaw = 0
      box.setAttribute("data-dragging", "")
      try {
        box.setPointerCapture(e.pointerId)
      } catch {}
      sync()
    }
    const onMove = (e: PointerEvent) => {
      const dr = st.drag
      if (dr && e.pointerId === dr.id) {
        const dx = e.clientX - dr.x
        const dy = e.clientY - dr.y
        const dt = Math.max(1, e.timeStamp - dr.t)
        const k = 1 / Math.max(80, st.R)
        st.yaw += dx * k
        st.pitch = Math.max(-0.3, Math.min(1.05, st.pitch + dy * k))
        /* Velocity, smoothed so one jittery event does not decide the throw. */
        st.vyaw = st.vyaw * 0.6 + ((dx * k) / dt) * 0.4
        dr.x = e.clientX
        dr.y = e.clientY
        dr.t = e.timeStamp
        if (st.reduced && !st.frame) draw(performance.now())
        return
      }
      if (e.pointerType !== "mouse" || st.reduced) return
      const rect = box.getBoundingClientRect()
      st.targetLeanX = ((e.clientX - rect.left) / rect.width - 0.5) * 0.28
      st.targetLeanY = ((e.clientY - rect.top) / rect.height - 0.5) * 0.22
      sync()
    }
    const onUp = (e: PointerEvent) => {
      if (!st.drag || e.pointerId !== st.drag.id) return
      /* A throw that ended with a pause keeps no momentum. */
      if (e.timeStamp - st.drag.t > 90) st.vyaw = 0
      st.vyaw = Math.max(-0.006, Math.min(0.006, st.vyaw))
      st.drag = null
      box.removeAttribute("data-dragging")
      sync()
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      st.targetLeanX = 0
      st.targetLeanY = 0
      sync()
    }

    box.addEventListener("pointerdown", onDown)
    box.addEventListener("pointermove", onMove)
    box.addEventListener("pointerup", onUp)
    box.addEventListener("pointercancel", onUp)
    box.addEventListener("pointerleave", onLeave)

    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null
    ro?.observe(box)
    fit()

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

    ctl.current = (next) => {
      st.live = next.live
      st.reduced = next.reduced
      if (st.reduced && st.pill < 0) {
        showPill(0)
        st.yaw = -0.35
      }
      sync()
      if (!st.running) draw(performance.now())
    }
    ctl.current({ live: liveRef.current, reduced: reducedRef.current })

    return () => {
      stop()
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
