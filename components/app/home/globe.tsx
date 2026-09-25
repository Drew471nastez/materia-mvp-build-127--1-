"use client"

/**
 * ===========================================================================
 *  THE GLOBE IN THE PRO PLAN BANNER
 * ===========================================================================
 * A dotted Earth in the banner's right corner that turns on its own, and that
 * a mouse or a finger can grab and spin, the way Shopify's does. Sales fly
 * between cities as arcs, which is what a store on Storelib is: somebody
 * somewhere buying from somebody somewhere else.
 *
 * ONE CANVAS, ONE DRAW A FRAME, NOTHING ELSE. Every frame is the dots turned
 * by two angles and dropped onto the canvas in six batches (one per shade),
 * about 1,500 circles and six fills: well under a millisecond, so it keeps
 * up with whatever the screen refreshes at, 60, 120 or more. React renders
 * the canvas once and never again; the angles, the speed and the drag live
 * in this effect, not in state, so turning the globe re-renders nothing.
 *
 * IT STOPS WHEN NOBODY CAN SEE IT. Scrolled away or on a hidden tab, the
 * frame loop is not scheduled at all (IntersectionObserver and
 * visibilitychange), so Home costs nothing while the globe is off screen.
 *
 * THE DRAG. Grabbing it stops it under the pointer, the way a real globe
 * stops under a hand, and a point on the surface follows the pointer across.
 * Let go and it keeps the speed it was thrown at, then settles back to its
 * own slow turn over a second or so: a harder flick, a faster spin. A
 * mouse can also tip it up and down. A finger only turns it sideways,
 * because `touch-action: pan-y` leaves an up or down swipe to the page, so
 * the globe never traps a scroll on a phone.
 *
 * With reduced motion it does not turn on its own and no arcs fly, but it
 * still turns when dragged.
 */
import { useEffect, useRef } from "react"
import { landDots, toSphere } from "./globe-land"

let LAND: Float32Array | null = null
const land = () => (LAND ??= landDots())

/** Where the sales fly between. Bucharest is where Storelib is made. */
const CITIES: [number, number][] = [
  [44.43, 26.1], [40.71, -74.0], [51.5, -0.12], [48.85, 2.35], [52.52, 13.4],
  [59.33, 18.07], [41.9, 12.5], [40.42, -3.7], [34.05, -118.24], [37.77, -122.42],
  [43.65, -79.38], [19.43, -99.13], [-23.55, -46.63], [-34.6, -58.38], [6.52, 3.37],
  [-26.2, 28.04], [30.04, 31.24], [25.2, 55.27], [19.07, 72.88], [1.35, 103.82],
  [35.68, 139.69], [37.57, 126.98], [-33.87, 151.2], [22.32, 114.17],
]

const TAU = Math.PI * 2
/** One turn in forty seconds. */
const BASE_SPEED = TAU / 40000
/** The fastest a flick can spin it, in radians a millisecond (about a turn every quarter second). */
const MAX_SPEED = 0.025
/** How long a flick takes to settle back to the base speed. */
const SETTLE_MS = 1000
/** Tipped towards the viewer so the northern half, where most sales are, faces the screen. */
const REST_TILT = 0.36
const SHADES = 6

type Arc = { from: [number, number, number]; to: [number, number, number]; lift: number; born: number; life: number; landed: boolean }
type Ripple = { at: [number, number, number]; born: number }

export function BannerGlobe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const dots = land()
    const count = dots.length / 3
    const cities = CITIES.map(([lat, lon]) => toSphere(lat, lon))
    /* Where each dot lands this frame, sorted into shades, reused every frame. */
    const px = new Float32Array(count)
    const py = new Float32Array(count)
    const shadeOf = new Uint8Array(count)

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)")
    let w = 0
    let h = 0
    let dpr = 1
    let R = 0
    let cx = 0
    let cy = 0
    let backdrop: HTMLCanvasElement | null = null

    /* Longitude 10°E faces the viewer first: Europe and Africa, with the Americas turning in from the left. */
    let yaw = (-10 * Math.PI) / 180
    let tilt = REST_TILT
    let speed = reduce.matches ? 0 : BASE_SPEED

    let dragging = false
    let pointerId = -1
    let lastX = 0
    let lastY = 0
    let lastT = 0
    let lastMoveT = 0
    let isMouse = false

    const arcs: Arc[] = []
    const ripples: Ripple[] = []
    let nextArc = 0

    let frame = 0
    let last = 0
    let onScreen = false

    /** The sphere, its light and its halo: the same every frame, so drawn once per size. */
    const paintBackdrop = () => {
      backdrop = document.createElement("canvas")
      backdrop.width = Math.max(1, Math.round(w * dpr))
      backdrop.height = Math.max(1, Math.round(h * dpr))
      const b = backdrop.getContext("2d")
      if (!b) return
      b.scale(dpr, dpr)
      const halo = b.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.16)
      halo.addColorStop(0, "rgba(167,139,250,0.34)")
      halo.addColorStop(0.35, "rgba(139,92,246,0.14)")
      halo.addColorStop(1, "rgba(139,92,246,0)")
      b.fillStyle = halo
      b.beginPath()
      b.arc(cx, cy, R * 1.16, 0, TAU)
      b.fill()
      const body = b.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.05, cx, cy, R)
      body.addColorStop(0, "rgba(58,46,96,0.92)")
      body.addColorStop(0.55, "rgba(24,20,44,0.94)")
      body.addColorStop(1, "rgba(10,9,20,0.96)")
      b.fillStyle = body
      b.beginPath()
      b.arc(cx, cy, R, 0, TAU)
      b.fill()
      b.strokeStyle = "rgba(196,181,253,0.28)"
      b.lineWidth = 1
      b.beginPath()
      b.arc(cx, cy, R - 0.5, 0, TAU)
      b.stroke()
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      R = (Math.min(w, h) / 2) * 0.84
      cx = w / 2
      cy = h / 2
      paintBackdrop()
      draw(performance.now())
    }

    /** A point on (or above) the sphere, turned to where it is this frame. */
    const turn = (x: number, y: number, z: number, cyaw: number, syaw: number, ct: number, st: number) => {
      const x1 = x * cyaw + z * syaw
      const z1 = z * cyaw - x * syaw
      return [x1, y * ct - z1 * st, y * st + z1 * ct] as const
    }

    const draw = (now: number) => {
      if (!w || !h) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (backdrop) ctx.drawImage(backdrop, 0, 0, w, h)

      const cyaw = Math.cos(yaw)
      const syaw = Math.sin(yaw)
      const ct = Math.cos(tilt)
      const st = Math.sin(tilt)

      /* Dots: the half facing the screen, shaded by how squarely each faces it. */
      let n = 0
      for (let i = 0; i < count; i++) {
        const x = dots[i * 3]
        const y = dots[i * 3 + 1]
        const z = dots[i * 3 + 2]
        const x1 = x * cyaw + z * syaw
        const z1 = z * cyaw - x * syaw
        const zz = y * st + z1 * ct
        if (zz <= 0.02) continue
        px[n] = cx + x1 * R
        py[n] = cy - (y * ct - z1 * st) * R
        shadeOf[n] = Math.min(SHADES - 1, Math.floor(Math.sqrt(zz) * SHADES))
        n++
      }
      const base = Math.max(0.75, R * 0.0118)
      for (let s = 0; s < SHADES; s++) {
        const depth = (s + 0.5) / SHADES
        const r = base * (0.6 + 0.4 * depth)
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          if (shadeOf[i] !== s) continue
          ctx.moveTo(px[i] + r, py[i])
          ctx.arc(px[i], py[i], r, 0, TAU)
        }
        ctx.fillStyle = `rgba(255,255,255,${(0.16 + 0.8 * depth * depth).toFixed(3)})`
        ctx.fill()
      }

      /* The cities, each with a slow pulse of its own. */
      for (let i = 0; i < cities.length; i++) {
        const [x, y, z] = cities[i]
        const [x1, y1, z1] = turn(x, y, z, cyaw, syaw, ct, st)
        if (z1 <= 0.05) continue
        const sx = cx + x1 * R
        const sy = cy - y1 * R
        const phase = ((now / 2600 + i * 0.37) % 1 + 1) % 1
        ctx.strokeStyle = `rgba(196,181,253,${(0.55 * (1 - phase) * z1).toFixed(3)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(sx, sy, base * (1.4 + phase * 4.5), 0, TAU)
        ctx.stroke()
        ctx.fillStyle = `rgba(221,214,254,${(0.35 + 0.65 * z1).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(sx, sy, base * 1.35, 0, TAU)
        ctx.fill()
      }

      /* Sales in flight: a curve from one city to another, drawn out and then let go. */
      for (let a = arcs.length - 1; a >= 0; a--) {
        const arc = arcs[a]
        const u = (now - arc.born) / arc.life
        if (u >= 1) {
          arcs.splice(a, 1)
          continue
        }
        const head = Math.min(1, u / 0.6)
        const tail = Math.max(0, (u - 0.35) / 0.65)
        const eased = (t: number) => 1 - Math.pow(1 - t, 3)
        const h0 = eased(tail)
        const h1 = eased(head)
        const [ax, ay, az] = arc.from
        const [bx, by, bz] = arc.to
        const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz))
        const omega = Math.acos(dot)
        const so = Math.sin(omega) || 1
        ctx.beginPath()
        let pen = false
        const steps = 28
        for (let k = 0; k <= steps; k++) {
          const t = h0 + ((h1 - h0) * k) / steps
          const fa = Math.sin((1 - t) * omega) / so
          const fb = Math.sin(t * omega) / so
          const lift = 1 + arc.lift * Math.sin(Math.PI * t)
          const [x1, y1, z1] = turn(
            (ax * fa + bx * fb) * lift,
            (ay * fa + by * fb) * lift,
            (az * fa + bz * fb) * lift,
            cyaw, syaw, ct, st,
          )
          /* Behind the globe only if it is both on the far side and inside its outline. */
          const hidden = z1 < 0 && x1 * x1 + y1 * y1 < 1
          if (hidden) {
            pen = false
            continue
          }
          const sx = cx + x1 * R
          const sy = cy - y1 * R
          if (pen) ctx.lineTo(sx, sy)
          else ctx.moveTo(sx, sy)
          pen = true
        }
        const fade = u > 0.8 ? (1 - u) / 0.2 : 1
        ctx.strokeStyle = `rgba(196,181,253,${(0.9 * fade).toFixed(3)})`
        ctx.lineWidth = Math.max(1, R * 0.011)
        ctx.lineCap = "round"
        ctx.stroke()
        if (head >= 1 && !arc.landed) {
          arc.landed = true
          ripples.push({ at: arc.to, born: now })
        }
      }

      /* Where a sale lands, a ring. */
      for (let r = ripples.length - 1; r >= 0; r--) {
        const rip = ripples[r]
        const u = (now - rip.born) / 900
        if (u >= 1) {
          ripples.splice(r, 1)
          continue
        }
        const [x1, y1, z1] = turn(rip.at[0], rip.at[1], rip.at[2], cyaw, syaw, ct, st)
        if (z1 <= 0.05) continue
        ctx.strokeStyle = `rgba(237,233,254,${(0.8 * (1 - u)).toFixed(3)})`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(cx + x1 * R, cy - y1 * R, base * (1.5 + u * 7), 0, TAU)
        ctx.stroke()
      }
    }

    /** A new sale between two cities that are both facing the screen, far enough apart to curve. */
    const launch = (now: number) => {
      if (arcs.length >= 3) return
      const cyaw = Math.cos(yaw)
      const syaw = Math.sin(yaw)
      const ct = Math.cos(tilt)
      const st = Math.sin(tilt)
      const facing = cities.filter(([x, y, z]) => turn(x, y, z, cyaw, syaw, ct, st)[2] > 0.25)
      if (facing.length < 2) return
      for (let tries = 0; tries < 8; tries++) {
        const from = facing[Math.floor(Math.random() * facing.length)]
        const to = facing[Math.floor(Math.random() * facing.length)]
        const angle = Math.acos(Math.max(-1, Math.min(1, from[0] * to[0] + from[1] * to[1] + from[2] * to[2])))
        if (angle < 0.35 || angle > 1.9) continue
        arcs.push({ from, to, lift: 0.08 + angle * 0.12, born: now, life: 1500 + angle * 700, landed: false })
        return
      }
    }

    const tick = (now: number) => {
      frame = 0
      const dt = last ? Math.min(50, now - last) : 16
      last = now
      if (!dragging) {
        const target = reduce.matches ? 0 : BASE_SPEED
        speed += (target - speed) * (1 - Math.exp(-dt / SETTLE_MS))
        yaw += speed * dt
        tilt += (REST_TILT - tilt) * (1 - Math.exp(-dt / 1400))
      }
      if (!reduce.matches && now >= nextArc) {
        launch(now)
        nextArc = now + 900 + Math.random() * 900
      }
      draw(now)
      /* With reduced motion it only runs while it is still moving from a drag. */
      const moving = dragging || Math.abs(speed) > 1e-5 || Math.abs(REST_TILT - tilt) > 1e-3 || arcs.length > 0 || ripples.length > 0
      if (onScreen && document.visibilityState === "visible" && (!reduce.matches || moving)) {
        frame = requestAnimationFrame(tick)
      }
    }

    const wake = () => {
      if (frame || !onScreen || document.visibilityState !== "visible") return
      last = 0
      frame = requestAnimationFrame(tick)
    }
    const sleep = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    }

    const local = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const onGlobe = (e: PointerEvent) => {
      const { x, y } = local(e)
      return Math.hypot(x - cx, y - cy) <= R * 1.04
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      if (!onGlobe(e)) return
      dragging = true
      isMouse = e.pointerType === "mouse"
      pointerId = e.pointerId
      lastX = e.clientX
      lastY = e.clientY
      lastT = e.timeStamp
      lastMoveT = e.timeStamp
      speed = 0
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* a pointer that is already gone: the drag simply ends on the next event */
      }
      canvas.style.cursor = "grabbing"
      if (isMouse) e.preventDefault()
      wake()
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) {
        if (e.pointerType === "mouse") canvas.style.cursor = onGlobe(e) ? "grab" : ""
        return
      }
      if (e.pointerId !== pointerId) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      const dt = Math.max(1, e.timeStamp - lastT)
      yaw += dx / R
      if (isMouse) tilt = Math.max(-0.25, Math.min(1.05, tilt + dy / R))
      /* The throw speed, smoothed over the last few moves so one jittery event does not decide it. */
      const sample = dx / R / dt
      speed = speed * 0.55 + sample * 0.45
      lastX = e.clientX
      lastY = e.clientY
      lastT = e.timeStamp
      lastMoveT = e.timeStamp
      wake()
    }
    const onUp = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return
      dragging = false
      pointerId = -1
      /* Held still before letting go: it was put down, not thrown. */
      if (e.type === "pointerup" && e.timeStamp - lastMoveT > 90) speed = 0
      speed = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed))
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      canvas.style.cursor = e.pointerType === "mouse" && onGlobe(e) ? "grab" : ""
      wake()
    }
    const onLeave = () => {
      if (!dragging) canvas.style.cursor = ""
    }
    /* A sideways drag on a phone is the globe's, not the page's pull to refresh. */
    const onTouchMove = (e: TouchEvent) => {
      if (dragging) e.stopPropagation()
    }

    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onUp)
    canvas.addEventListener("pointerleave", onLeave)
    canvas.addEventListener("touchmove", onTouchMove, { passive: true })

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) wake()
      else sleep()
    })
    io.observe(canvas)
    const onVisibility = () => (document.visibilityState === "visible" ? wake() : sleep())
    document.addEventListener("visibilitychange", onVisibility)
    const onMotion = () => {
      if (!reduce.matches) wake()
    }
    reduce.addEventListener?.("change", onMotion)
    resize()

    return () => {
      sleep()
      ro.disconnect()
      io.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      reduce.removeEventListener?.("change", onMotion)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      canvas.removeEventListener("pointerleave", onLeave)
      canvas.removeEventListener("touchmove", onTouchMove)
    }
  }, [])

  return <canvas ref={canvasRef} data-home-globe aria-hidden="true" className={className} style={{ touchAction: "pan-y" }} />
}
