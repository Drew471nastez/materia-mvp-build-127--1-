"use client"

/*
  A DOTTED GLOBE ON ONE CANVAS.

  About 2,600 land dots (one per 2 degree cell, fewer toward the poles so
  they sit evenly on the sphere) from the bitmap in platform-globe-land.ts,
  turned slowly, with visitor pulses rising from a few dozen places. Each
  frame: rotate the points, keep the near half, and fill them as three
  batched paths by depth (three fill calls, no per-dot state changes). The
  shaded sphere behind is painted once per size into an offscreen canvas.

  It draws only while `running` (the section on screen, the tab visible).
  Under reduced motion it draws one still frame. Device pixels are capped at
  1.5x (dots this small look the same at 2x and cost 78% more to upload each
  frame), so a 4K screen pays the same as a laptop.
*/

import { useEffect, useRef, useState } from "react"
import { PLATFORM_LAND_B64, PLATFORM_LAND_H, PLATFORM_LAND_W } from "./platform-globe-land"

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
    pulses: Array<{ s: number; t0: number }>
    nextPulse: number
    bg: HTMLCanvasElement | null
    size: number
    dpr: number
  }>({ pts: null, angle: -1.2, pulses: [], nextPulse: 0, bg: null, size: 0, dpr: 1 })
  const onPulseRef = useRef(onPulse)
  onPulseRef.current = onPulse

  /* Size: one ResizeObserver; the backdrop is repainted only when the size changes. */
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const st = state.current
    st.pts ??= landPoints()
    const fit = () => {
      const size = Math.round(canvas.getBoundingClientRect().width)
      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      if (!size || (size === st.size && dpr === st.dpr)) return
      st.size = size
      st.dpr = dpr
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      const bg = document.createElement("canvas")
      bg.width = canvas.width
      bg.height = canvas.height
      const g = bg.getContext("2d")
      if (g) {
        const W = bg.width
        const R = W * 0.44
        const halo = g.createRadialGradient(W / 2, W / 2, R * 0.9, W / 2, W / 2, R * 1.22)
        halo.addColorStop(0, "rgba(139,92,246,0.28)")
        halo.addColorStop(1, "rgba(139,92,246,0)")
        g.fillStyle = halo
        g.fillRect(0, 0, W, W)
        const body = g.createRadialGradient(W * 0.4, W * 0.36, R * 0.1, W / 2, W / 2, R)
        body.addColorStop(0, "#1d1830")
        body.addColorStop(0.7, "#100e19")
        body.addColorStop(1, "#08070c")
        g.fillStyle = body
        g.beginPath()
        g.arc(W / 2, W / 2, R, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = "rgba(196,181,253,0.18)"
        g.lineWidth = Math.max(1, W * 0.0015)
        g.stroke()
      }
      st.bg = bg
      draw(performance.now())
    }
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null
    ro?.observe(canvas)
    fit()
    return () => ro?.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const draw = (now: number) => {
    const canvas = ref.current
    const st = state.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx || !st.pts || !st.bg) return
    const W = canvas.width
    const R = W * 0.44
    const cx = W / 2
    const cy = W / 2
    ctx.clearRect(0, 0, W, W)
    ctx.drawImage(st.bg, 0, 0)
    const ca = Math.cos(st.angle)
    const sa = Math.sin(st.angle)
    const tilt = 0.32
    const ct = Math.cos(tilt)
    const sinT = Math.sin(tilt)
    const pts = st.pts
    const dot = Math.max(1, W * 0.0042)
    const paths = [new Path2D(), new Path2D(), new Path2D()]
    for (let i = 0; i < pts.length; i += 3) {
      const x = pts[i]
      const y = pts[i + 1]
      const z = pts[i + 2]
      const x1 = x * ca + z * sa
      const z1 = -x * sa + z * ca
      const y2 = y * ct - z1 * sinT
      const z2 = y * sinT + z1 * ct
      if (z2 <= 0.02) continue
      const b = z2 > 0.62 ? 2 : z2 > 0.3 ? 1 : 0
      const r = dot * (0.55 + 0.45 * z2)
      paths[b].rect(cx + x1 * R - r / 2, cy - y2 * R - r / 2, r, r)
    }
    ctx.fillStyle = "rgba(226,220,255,0.22)"
    ctx.fill(paths[0])
    ctx.fillStyle = "rgba(226,220,255,0.48)"
    ctx.fill(paths[1])
    ctx.fillStyle = "rgba(236,232,255,0.82)"
    ctx.fill(paths[2])

    /* Pulses: a bright core and a ring that widens and fades over 2.2s. */
    const life = 2200
    st.pulses = st.pulses.filter((p) => now - p.t0 < life)
    for (const p of st.pulses) {
      const [x, y, z] = toXYZ(PLATFORM_GLOBE_SPOTS[p.s])
      const x1 = x * ca + z * sa
      const z1 = -x * sa + z * ca
      const y2 = y * ct - z1 * sinT
      const z2 = y * sinT + z1 * ct
      if (z2 <= 0.05) continue
      const k = (now - p.t0) / life
      const px = cx + x1 * R
      const py = cy - y2 * R
      ctx.globalAlpha = (1 - k) * Math.min(1, z2 * 1.6)
      ctx.strokeStyle = "#a78bfa"
      ctx.lineWidth = W * 0.0028
      ctx.beginPath()
      ctx.arc(px, py, W * (0.006 + 0.045 * k), 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = "#ede9fe"
      ctx.beginPath()
      ctx.arc(px, py, W * 0.0055, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
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
    if (reduced) {
      const now = performance.now()
      st.pulses = [3, 9, 13, 21, 25].map((s, i) => ({ s, t0: now - 300 - i * 120 }))
      draw(now)
      return
    }
    if (!running || !inView) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now
      st.angle += dt * 0.00011
      if (now >= st.nextPulse) {
        /* Prefer a spot on the near side, so most pulses are seen. */
        let s = Math.floor(Math.random() * PLATFORM_GLOBE_SPOTS.length)
        for (let tries = 0; tries < 6; tries++) {
          const [x, , z] = toXYZ(PLATFORM_GLOBE_SPOTS[s])
          if (-x * Math.sin(st.angle) + z * Math.cos(st.angle) > 0.25) break
          s = Math.floor(Math.random() * PLATFORM_GLOBE_SPOTS.length)
        }
        st.pulses.push({ s, t0: now })
        st.nextPulse = now + 380 + Math.random() * 520
        onPulseRef.current?.(s)
      }
      draw(now)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, reduced, inView])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
