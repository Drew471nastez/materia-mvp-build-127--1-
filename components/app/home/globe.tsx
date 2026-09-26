"use client"

/**
 * ===========================================================================
 *  THE GLOBE IN HOME'S BANNER
 * ===========================================================================
 * A dotted Earth that turns on its own, that a finger or a mouse can grab and
 * spin, and over which sales fly between cities as arcs: somebody somewhere
 * buying from somebody somewhere else, which is what a store on Storelib is.
 * Tap it and a sale lands where you tapped.
 *
 * DRAWN BY THE GRAPHICS CARD (globe-gl.ts), or with the 2D canvas where
 * WebGL would run on the processor (globe-2d.ts); what both draw is
 * globe-scene.ts. The ball itself looks the same however it is turned, so
 * it is painted once per size into a still canvas; each frame draws only
 * the dots, the pins and the arcs over it. A frame on the page's thread is
 * one matrix and a few dozen points in arrays made once: nothing is
 * allocated per frame, and React renders this once and never again (the
 * angles, the speed and the drag live in the effect, not in state).
 *
 * IT ONLY RUNS WHEN IT CAN BE SEEN. Off screen (IntersectionObserver) or
 * on a hidden tab (visibilitychange) no frame is asked for at all. While
 * the page is scrolling the globe rests and picks up again from the same
 * angle a moment after the scroll stops, one frame's step on, so nothing
 * jumps. Letting it turn under a finger scrolling Home doubled how long
 * each touchmove waited (scripts/check-home-scroll.mjs, run both ways):
 * the page's scroll comes first.
 *
 * ONE TURN THAT NEVER STARTS OVER. The angle is advanced by the time that
 * passed, so a frame late or a tab shown again carries on from where it was
 * (the step after a pause is one frame's, never the pause's). Home mounting
 * the banner again (back to /app, a remount above it) picks up the same
 * globe: the canvases, their WebGL context and the angle are kept for a
 * while after it unmounts and handed to the next one, so nothing compiles
 * again and the ball does not jump back to where it first started.
 *
 * THE DRAG. Only the ball itself is grabbable: a round grip over it. A
 * finger turns it sideways; an up or down swipe that starts on it scrolls
 * the page (`touch-action: pan-y`). It was `none`, so on a phone, where the
 * ball fills half the banner, a scroll that happened to start on it did not
 * move the page at all: the page seemed to catch and stutter at the banner
 * ("laggy, glitching, then normal again further down"). A mouse still tips
 * it up and down. Grabbing stops it under the finger the way a real
 * globe stops under a hand; let go and it keeps the speed it was thrown at,
 * then eases back to its own slow turn, and its tilt drifts back to rest.
 * Held still before letting go, it was put down, not thrown.
 *
 * With reduced motion it does not turn on its own, no sales fly and the
 * cities do not pulse; it still turns when dragged.
 */
import { useEffect, useRef } from "react"
import { create2dRenderer } from "./globe-2d"
import { createGlRenderer, type GlobeRenderer } from "./globe-gl"
import {
  CITIES, DOT_RADIUS, GLOBE_RADIUS, MAX_DPR, buildOverlay, makeArcs, makeOverlay, makeRipples, rotation,
  type Arc, type OverlayInput,
} from "./globe-scene"

const TAU = Math.PI * 2
/** One turn in forty two seconds. */
const BASE_SPEED = TAU / 42000
/** The fastest a flick can spin it, in radians a millisecond (about a turn every third of a second). */
const MAX_SPEED = 0.02
/** How long a flick takes to ease back to the base speed. */
const SETTLE_MS = 1100
/** Tipped towards the viewer so the northern half, where most sales are, faces the screen. */
const REST_TILT = 0.34
const TILT_MIN = -0.5
const TILT_MAX = 1.1
/** A tilt thrown up or down glides this long, and drifts back to rest over this. */
const TILT_GLIDE_MS = 220
const TILT_RETURN_MS = 1200
const MAX_TILT_SPEED = 0.01
/** A drag's speed is averaged over about this long, so one jittery event does not decide a throw. */
const VELOCITY_MS = 45
/** Held still this long before letting go: put down, not thrown. */
const HELD_MS = 80
/** A page scroll this long ago is over, and the globe turns again. */
const SCROLL_REST_MS = 140
/** The grip is a little wider than the ball, so its edge is easy to catch. */
const GRIP = GLOBE_RADIUS * 1.06
/** How long a globe that left the page is kept for the next mount before its context is let go. */
const KEEP_MS = 60000

/**
 * THE GLOBE BETWEEN MOUNTS: its canvases and renderer, and where it was
 * turned to and when. Module state, so a remount carries on the same turn.
 */
interface Kept {
  canvas: HTMLCanvasElement | null
  ball: HTMLCanvasElement | null
  renderer: GlobeRenderer | null
  timer: number
  /** Its context was lost while nobody held it: nothing in it can be trusted to draw. */
  dead: boolean
}
let kept: Kept | null = null
const pose = { yaw: (-10 * Math.PI) / 180, tilt: REST_TILT, at: 0 }

export function BannerGlobe({ className }: { className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const gripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = boxRef.current
    const grip = gripRef.current
    if (!box || !grip) return

    /*
      The canvases are made here, not by React: a canvas that has had a WebGL
      context cannot give a 2D one, so falling back means a new canvas. Two
      of them: the still ball, painted once per size, and over it the one
      drawn every frame (the dots, the pins, the arcs), clear everywhere else.
    */
    let canvas: HTMLCanvasElement | null = null
    let ball: HTMLCanvasElement | null = null
    let renderer: GlobeRenderer | null = null
    const layer = (attribute: string) => {
      const c = document.createElement("canvas")
      c.setAttribute(attribute, "")
      c.setAttribute("aria-hidden", "true")
      c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none"
      box.insertBefore(c, grip)
      return c
    }
    const attach = () => {
      box.dataset.renderer = renderer?.kind ?? "none"
      canvas?.addEventListener("webglcontextlost", onLost)
      canvas?.addEventListener("webglcontextrestored", onRestored)
    }
    /* The globe the last mount left, while it is still whole: moved into this box, context and all. */
    const reuse = () => {
      const k = kept
      kept = null
      if (!k) return false
      window.clearTimeout(k.timer)
      if (k.dead || !k.canvas || !k.ball || !k.renderer || k.renderer.failed()) {
        k.renderer?.dispose()
        return false
      }
      canvas = k.canvas
      ball = k.ball
      renderer = k.renderer
      box.insertBefore(ball, grip)
      box.insertBefore(canvas, grip)
      attach()
      return true
    }
    const mount = (allowGl: boolean) => {
      canvas?.remove()
      ball?.remove()
      ball = layer("data-home-globe-ball")
      canvas = layer("data-home-globe")
      renderer = allowGl ? createGlRenderer(canvas, ball) : null
      if (!renderer) {
        /* A failed WebGL start may still have taken the canvas: a fresh one for the 2D context. */
        if (allowGl) {
          canvas.remove()
          canvas = layer("data-home-globe")
        }
        renderer = create2dRenderer(canvas, ball)
      }
      attach()
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)")
    let reduced = reduce.matches

    const m = new Float32Array(9)
    const arcs = makeArcs()
    const ripples = makeRipples()
    const overlay = makeOverlay()
    const input: OverlayInput = { m, now: 0, arcs, ripples, pulse: !reduced, dot: DOT_RADIUS }
    /* Which cities face the viewer, reused by every launch. */
    const facing = new Int32Array(CITIES.length)

    let size = 0
    let dpr = 1
    /*
      Longitude 10°E faces the viewer first: Europe and Africa, with the
      Americas turning in from the left. A mount after that starts where the
      last one was, turned on by the time it was away.
    */
    let yaw = pose.yaw + (pose.at && !reduced ? Math.min(performance.now() - pose.at, 600000) * BASE_SPEED : 0)
    let tilt = pose.tilt
    let yawVel = reduced ? 0 : BASE_SPEED
    let tiltVel = 0

    let dragging = false
    /* A finger only turns it sideways: up and down is the page's scroll. */
    let byMouse = false
    let pointerId = -1
    let lastX = 0
    let lastY = 0
    let lastT = 0
    let moveT = 0
    let downX = 0
    let downY = 0
    let downT = 0
    let estYaw = 0
    let estTilt = 0

    let frame = 0
    let last = 0
    let clock = 0
    let nextArc = 0
    let onScreen = false
    let scrolling = false
    let scrollTimer = 0
    let lost = false

    const landed = (arc: Arc) => {
      for (let i = 0; i < ripples.length; i++) {
        const r = ripples[i]
        if (r.active) continue
        r.active = true
        r.at = arc.to
        r.born = clock
        return
      }
    }

    const paint = () => {
      if (!renderer || lost || !size) return
      rotation(yaw, tilt, m)
      input.now = clock
      input.pulse = !reduced
      buildOverlay(overlay, input, landed)
      renderer.draw(m, overlay)
    }

    const busy = () => {
      /* Still compiling: frames keep coming until the land can be drawn, reduced motion or not. */
      if (renderer?.pending()) return true
      if (dragging || Math.abs(tiltVel) > 1e-6 || Math.abs(REST_TILT - tilt) > 1e-3) return true
      if (Math.abs(yawVel - (reduced ? 0 : BASE_SPEED)) > 1e-6) return true
      for (let i = 0; i < arcs.length; i++) if (arcs[i].active) return true
      for (let i = 0; i < ripples.length; i++) if (ripples[i].active) return true
      return false
    }
    const canRun = () => onScreen && !lost && document.visibilityState === "visible" && (dragging || !scrolling)

    /** A sale between two cities facing the viewer, far enough apart to curve, or into `to` when a tap asks for one. */
    const launch = (now: number, to: number = -1) => {
      let slot: Arc | null = null
      for (let i = 0; i < arcs.length && !slot; i++) if (!arcs[i].active) slot = arcs[i]
      if (!slot) return
      let n = 0
      for (let i = 0; i < CITIES.length; i++) {
        const p = CITIES[i]
        if (m[2] * p[0] + m[5] * p[1] + m[8] * p[2] > 0.25) facing[n++] = i
      }
      if (n < 2) return
      for (let tries = 0; tries < 10; tries++) {
        const a = CITIES[facing[Math.floor(Math.random() * n)]]
        const b = CITIES[to >= 0 ? to : facing[Math.floor(Math.random() * n)]]
        const angle = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
        if (angle < 0.3 || angle > 1.9) continue
        slot.active = true
        slot.from = a
        slot.to = b
        slot.omega = angle
        slot.sinOmega = Math.sin(angle) || 1
        slot.lift = 0.05 + angle * 0.07
        slot.born = now
        slot.life = 1500 + angle * 650
        slot.landed = false
        return
      }
    }

    const tick = (now: number) => {
      frame = 0
      const dt = last ? Math.min(48, now - last) : 16
      last = now
      clock = now
      if (!dragging) {
        const target = reduced ? 0 : BASE_SPEED
        yawVel += (target - yawVel) * (1 - Math.exp(-dt / SETTLE_MS))
        yaw += yawVel * dt
        tiltVel *= Math.exp(-dt / TILT_GLIDE_MS)
        tilt += tiltVel * dt
        tilt += (REST_TILT - tilt) * (1 - Math.exp(-dt / TILT_RETURN_MS))
        if (tilt < TILT_MIN || tilt > TILT_MAX) {
          tilt = Math.max(TILT_MIN, Math.min(TILT_MAX, tilt))
          tiltVel = 0
        }
        if (Math.abs(yawVel - target) < 1e-7) yawVel = target
        if (Math.abs(REST_TILT - tilt) < 5e-4 && Math.abs(tiltVel) < 1e-6) {
          tilt = REST_TILT
          tiltVel = 0
        }
      }
      /* Wrapped by whole turns, which the sine and cosine cannot tell apart: no step at the wrap. */
      if (yaw > TAU || yaw < -TAU) yaw %= TAU
      if (!reduced && now >= nextArc) {
        launch(now)
        nextArc = now + 1100 + Math.random() * 1300
      }
      paint()
      /* The graphics card could not build the globe's programs: the 2D canvas takes over, as if WebGL had never been there. */
      if (renderer?.failed()) fallBack()
      if (canRun() && (!reduced || busy())) frame = requestAnimationFrame(tick)
    }

    const wake = () => {
      if (frame || !canRun()) return
      if (reduced && !busy()) return
      last = 0
      frame = requestAnimationFrame(tick)
    }
    const sleep = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
    }

    const resize = () => {
      const w = box.clientWidth
      const h = box.clientHeight
      const next = Math.min(w, h)
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      if (!next || !renderer || (next === size && ratio === dpr)) return
      size = next
      dpr = ratio
      renderer.resize(size, dpr)
      if (!clock) clock = performance.now()
      /* Not while the shaders compile: that would make this call wait for them. The frame loop draws it once they are done. */
      if (!renderer.pending()) paint()
    }

    /* ── The drag ─────────────────────────────────────────────────────── */

    const onDown = (e: PointerEvent) => {
      if (dragging || (e.pointerType === "mouse" && e.button !== 0)) return
      dragging = true
      byMouse = e.pointerType === "mouse"
      pointerId = e.pointerId
      lastX = downX = e.clientX
      lastY = downY = e.clientY
      lastT = downT = moveT = e.timeStamp
      yawVel = 0
      tiltVel = 0
      estYaw = 0
      estTilt = 0
      try {
        grip.setPointerCapture(e.pointerId)
      } catch {
        /* a pointer that is already gone: the drag ends on its next event */
      }
      grip.style.cursor = "grabbing"
      box.setAttribute("data-dragging", "")
      /* No text selection starting under a mouse drag. */
      if (e.pointerType === "mouse") e.preventDefault()
      scrolling = false
      wake()
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      if (dx === 0 && dy === 0) return
      const dt = Math.max(1, e.timeStamp - lastT)
      if (!size) return
      const r = size * GLOBE_RADIUS
      /* A point on the surface follows the finger across. */
      yaw += dx / r
      if (byMouse) tilt = Math.max(TILT_MIN, Math.min(TILT_MAX, tilt + dy / r))
      const k = 1 - Math.exp(-dt / VELOCITY_MS)
      estYaw += (dx / r / dt - estYaw) * k
      if (byMouse) estTilt += (dy / r / dt - estTilt) * k
      lastX = e.clientX
      lastY = e.clientY
      lastT = moveT = e.timeStamp
      wake()
    }
    const end = (e: PointerEvent, thrown: boolean) => {
      if (!dragging || e.pointerId !== pointerId) return
      dragging = false
      pointerId = -1
      const held = e.timeStamp - moveT > HELD_MS
      yawVel = thrown && !held ? Math.max(-MAX_SPEED, Math.min(MAX_SPEED, estYaw)) : 0
      tiltVel = thrown && !held ? Math.max(-MAX_TILT_SPEED, Math.min(MAX_TILT_SPEED, estTilt)) : 0
      /* A tap: a sale lands on the city nearest to it. */
      if (thrown && Math.hypot(e.clientX - downX, e.clientY - downY) < 6 && e.timeStamp - downT < 350) tapAt(e.clientX, e.clientY)
      try {
        grip.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      grip.style.cursor = ""
      box.removeAttribute("data-dragging")
      wake()
    }
    const onUp = (e: PointerEvent) => end(e, true)
    const onCancel = (e: PointerEvent) => end(e, false)

    const tapAt = (clientX: number, clientY: number) => {
      if (reduced) return
      const rect = box.getBoundingClientRect()
      const r = size * GLOBE_RADIUS
      const u = (clientX - rect.left - rect.width / 2) / r
      const v = -(clientY - rect.top - rect.height / 2) / r
      const d = u * u + v * v
      if (d > 1) return
      const w = Math.sqrt(1 - d)
      /* Back from the screen to the globe: the turn's transpose. */
      const x = m[0] * u + m[1] * v + m[2] * w
      const y = m[3] * u + m[4] * v + m[5] * w
      const z = m[6] * u + m[7] * v + m[8] * w
      let best = -1
      let bestDot = 0.9
      for (let i = 0; i < CITIES.length; i++) {
        const c = CITIES[i]
        const dot = c[0] * x + c[1] * y + c[2] * z
        if (dot > bestDot) {
          bestDot = dot
          best = i
        }
      }
      if (best >= 0) launch(clock || performance.now(), best)
      nextArc = (clock || performance.now()) + 1600
    }

    /* A sideways drag on the grip is the globe's: the page's pull to refresh never sees it. An up or down swipe is the page's. */
    const keep = (e: TouchEvent) => {
      if (dragging) e.stopPropagation()
    }
    grip.addEventListener("touchstart", keep, { passive: true })
    grip.addEventListener("touchmove", keep, { passive: true })

    /* ── When it runs ─────────────────────────────────────────────────── */

    const onScroll = (e: Event) => {
      if (dragging) return
      /* Only a scroll that moves the globe on the screen: a sideways strip elsewhere on the page is not that. */
      const t = e.target
      if (t !== document && !(t instanceof Node && t.contains(box))) return
      scrolling = true
      sleep()
      window.clearTimeout(scrollTimer)
      scrollTimer = window.setTimeout(() => {
        scrolling = false
        wake()
      }, SCROLL_REST_MS)
    }
    const onVisibility = () => (document.visibilityState === "visible" ? wake() : sleep())
    const onMotion = () => {
      reduced = reduce.matches
      wake()
    }
    function onLost(e: Event) {
      e.preventDefault()
      lost = true
      sleep()
    }
    function fallBack() {
      renderer?.dispose()
      lost = false
      mount(false)
      size = 0
      resize()
      wake()
    }
    function onRestored() {
      if (renderer?.restore()) {
        lost = false
        renderer.resize(size, dpr)
        wake()
        return
      }
      /* It came back unable to draw: the 2D canvas from here on. */
      fallBack()
    }

    /*
      STARTED AFTER THE PAGE HAS PAINTED, in a task of its own. Creating a
      WebGL context and starting its programs is tens of milliseconds on a
      slow phone; inside React's commit it was added to the task that puts
      Home on the screen. A frame, then a task: Home paints first, the globe
      a moment later.
    */
    let ro: ResizeObserver | null = null
    let io: IntersectionObserver | null = null
    let startTimer = 0
    const start = () => {
      if (!reuse()) mount(true)
      if (!renderer) return
      listen()
    }
    const firstFrame = requestAnimationFrame(() => {
      startTimer = window.setTimeout(start, 0)
    })

    const listen = () => {
    grip.addEventListener("pointerdown", onDown)
    grip.addEventListener("pointermove", onMove)
    grip.addEventListener("pointerup", onUp)
    grip.addEventListener("pointercancel", onCancel)
    grip.addEventListener("lostpointercapture", onCancel)
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    document.addEventListener("visibilitychange", onVisibility)
    reduce.addEventListener?.("change", onMotion)
    ro = new ResizeObserver(resize)
    ro.observe(box)
    window.addEventListener("resize", resize)
    io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) wake()
      else sleep()
    })
    io.observe(box)
    resize()
    warm()
    }

    /*
      THE FIRST FRAME IS DRAWN AHEAD. The first draw after the programs are
      built is the dear one (the driver finishes its work on first use): on a
      phone it landed as the globe scrolled into view, a 45ms frame in the
      middle of the swipe. So it is drawn once as soon as the programs are
      ready, while the page is idle, whether or not the globe is on screen.
    */
    let warmTimer = 0
    const idle = (fn: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
      if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 600 })
      else warmTimer = window.setTimeout(fn, 120)
    }
    /* A draw is also what asks whether the programs are ready (globe-gl settle), so it draws until they are. */
    const warm = () => {
      idle(() => {
        if (!renderer || lost || frame) return
        paint()
        if (renderer.pending()) warmTimer = window.setTimeout(warm, 80)
      })
    }

    return () => {
      cancelAnimationFrame(firstFrame)
      window.clearTimeout(startTimer)
      window.clearTimeout(warmTimer)
      sleep()
      window.clearTimeout(scrollTimer)
      ro?.disconnect()
      io?.disconnect()
      window.removeEventListener("resize", resize)
      document.removeEventListener("scroll", onScroll, { capture: true })
      document.removeEventListener("visibilitychange", onVisibility)
      reduce.removeEventListener?.("change", onMotion)
      grip.removeEventListener("pointerdown", onDown)
      grip.removeEventListener("pointermove", onMove)
      grip.removeEventListener("pointerup", onUp)
      grip.removeEventListener("pointercancel", onCancel)
      grip.removeEventListener("lostpointercapture", onCancel)
      grip.removeEventListener("touchstart", keep)
      grip.removeEventListener("touchmove", keep)
      canvas?.removeEventListener("webglcontextlost", onLost)
      canvas?.removeEventListener("webglcontextrestored", onRestored)
      pose.yaw = yaw % TAU
      pose.tilt = tilt
      pose.at = performance.now()
      canvas?.remove()
      ball?.remove()
      box.removeAttribute("data-renderer")
      /* Kept for the next mount while it can still draw; let go after a while so a page that never comes back holds no context. */
      if (renderer && !lost && !renderer.failed()) {
        kept?.renderer?.dispose()
        const k: Kept = { canvas, ball, renderer, timer: 0, dead: false }
        canvas?.addEventListener("webglcontextlost", () => (k.dead = true), { once: true })
        k.timer = window.setTimeout(() => {
          if (kept !== k) return
          kept = null
          k.renderer?.dispose()
        }, KEEP_MS)
        kept = k
      } else {
        renderer?.dispose()
      }
    }
  }, [])

  const inset = `${(0.5 - GRIP) * 100}%`
  return (
    <div ref={boxRef} data-home-globe-box="" className={className}>
      <div
        ref={gripRef}
        data-home-globe-grip=""
        aria-hidden="true"
        className="absolute cursor-grab rounded-full select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]"
        style={{ left: inset, top: inset, right: inset, bottom: inset, touchAction: "pan-y" }}
      />
    </div>
  )
}
