"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { releaseVelocity, SHOWCASE_MOTION, type Sample } from "@/lib/ui/rail-motion"

/*
  A MARQUEE YOU CAN TAKE HOLD OF (round 60). Left alone, the row drifts as it
  always has: a CSS animation, which the compositor runs without the main
  thread, and which the landing page pauses off screen. Pressed, it stops
  under the hand and follows it exactly; let go, it carries the release
  velocity and eases back to its own drift over about a second
  (velocity = drift + (release - drift) * e^(-t/τ)); then the CSS animation
  takes it back from exactly where it is, by a negative delay, so the
  handover is not a jump. JavaScript runs only for a gesture and the second
  after it.
*/
const EASE_BACK_MS = 360
const HAND_BACK_AFTER_MS = 1100

export function MarqueeRow({ children, direction, duration }: { children: ReactNode; direction: "left" | "right"; duration: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const anim = direction === "left" ? "marquee-left" : "marquee-right"

  useEffect(() => {
    const row = ref.current
    if (!row) return
    const still = matchMedia("(prefers-reduced-motion: reduce)")
    let span = 0
    let drift = 0
    let x = 0
    let raf = 0
    let press: { id: number; x0: number; y0: number; at: number; started: boolean; samples: Sample[] } | null = null
    let suppress = false

    const measure = () => {
      /* The row holds its items three times; one loop is a third of it. */
      span = row.scrollWidth / 3
      drift = ((direction === "left" ? -1 : 1) * span) / duration
    }
    const wrapX = (v: number) => {
      /* The CSS animation draws between -span and 0. */
      const r = ((v % span) + span) % span
      return r - span
    }
    /* Where the drift has the row now, read once at the press from its own transform. */
    const current = () => {
      const t = getComputedStyle(row).transform
      return t === "none" ? 0 : new DOMMatrix(t).m41
    }
    const draw = () => {
      row.style.transform = `translate3d(${wrapX(x)}px,0,0)`
    }
    const takeOver = () => {
      cancelAnimationFrame(raf)
      measure()
      x = current()
      row.style.animation = "none"
      draw()
    }
    const handBack = () => {
      cancelAnimationFrame(raf)
      /* The CSS drift, started at the point in its cycle where the row is now. */
      const shown = wrapX(x)
      const progress = direction === "left" ? -shown / span : 1 + shown / span
      row.style.transform = ""
      row.style.animation = `${anim} ${duration}s linear ${-progress * duration}s infinite`
    }
    const glide = (v0: number) => {
      if (still.matches) return handBack()
      const start = performance.now()
      const x0 = x
      const tau = EASE_BACK_MS / 1000
      const step = (now: number) => {
        const t = (now - start) / 1000
        x = x0 + drift * t + (v0 - drift) * tau * (1 - Math.exp(-t / tau))
        draw()
        if (now - start < HAND_BACK_AFTER_MS) raf = requestAnimationFrame(step)
        else handBack()
      }
      raf = requestAnimationFrame(step)
    }

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return
      press = { id: e.pointerId, x0: e.clientX, y0: e.clientY, at: 0, started: false, samples: [] }
      suppress = false
    }
    const move = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return
      const dx = e.clientX - press.x0
      if (!press.started) {
        if (Math.abs(dx) < SHOWCASE_MOTION.dragThreshold) return
        if (Math.abs(e.clientY - press.y0) > Math.abs(dx)) {
          press = null
          return
        }
        takeOver()
        press.started = true
        press.at = x - dx
        suppress = true
        row.setPointerCapture(press.id)
        row.dataset.dragging = ""
      }
      x = press.at + dx
      press.samples.push({ t: e.timeStamp, x })
      if (press.samples.length > 32) press.samples.shift()
      draw()
    }
    const up = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return
      const p = press
      press = null
      if (!p.started) return
      delete row.dataset.dragging
      const v = releaseVelocity(p.samples, e.timeStamp, SHOWCASE_MOTION.velocityWindowMs, SHOWCASE_MOTION.velocityStaleMs)
      glide(Math.max(-SHOWCASE_MOTION.maxFlickVelocity, Math.min(SHOWCASE_MOTION.maxFlickVelocity, v)))
    }
    const cancel = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return
      const started = press.started
      press = null
      delete row.dataset.dragging
      if (started) glide(drift)
    }
    const click = (e: MouseEvent) => {
      if (!suppress) return
      suppress = false
      e.preventDefault()
      e.stopPropagation()
    }
    row.addEventListener("pointerdown", down)
    row.addEventListener("pointermove", move)
    row.addEventListener("pointerup", up)
    row.addEventListener("pointercancel", cancel)
    row.addEventListener("click", click, true)
    return () => {
      cancelAnimationFrame(raf)
      row.removeEventListener("pointerdown", down)
      row.removeEventListener("pointermove", move)
      row.removeEventListener("pointerup", up)
      row.removeEventListener("pointercancel", cancel)
      row.removeEventListener("click", click, true)
    }
  }, [anim, direction, duration])

  return (
    <div className="overflow-hidden py-2">
      <div
        ref={ref}
        data-story-continuous=""
        data-marquee-row=""
        className="flex w-max cursor-grab gap-3 select-none touch-pan-y data-[dragging]:cursor-grabbing"
        style={{
          animation: `${anim} ${duration}s linear infinite`,
          willChange: "transform",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  )
}
