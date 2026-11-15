"use client"

import { useCallback, useEffect, useRef } from "react"

/*
  THE DOT FIELD BEHIND THE SHOWCASE, LANDING ROUND 9. The owner: "the section
  should also have some very, very extremely almost invisible simple patterns
  going around, tracking the mouse in real time, without causing lag."

  Two things, on one grid (gap px, a dot at 1px, 1px of every cell):

  - The still dots, everywhere on the section's dark ground: one repeating
    CSS background (.build-showcase::before, build-showcase.tsx), 5% white.
    No script, on every screen.
  - Under a mouse, the dots within `radius` of it lit a little (to `peak` at
    the centre, falling off to nothing): one small canvas, `radius` * 2 square,
    moved with the mouse by a transform and redrawn only in a frame the mouse
    moved or the light is still catching up with it. A mouse at rest costs
    nothing, off screen nothing is drawn, a touch screen never sizes the
    canvas at all, and reduced motion leaves the still dots alone.

  Per frame: one transform and about 150 small rectangles on a canvas of at
  most 760 device px a side (the device's pixel ratio, capped at maxDpr). The
  section's place on the page is read when the mouse enters it and when it
  resizes, never while the mouse moves.
*/
export const SHOWCASE_FIELD = {
  /** px between dots. The stylesheet's background-size is the same number. */
  gap: 28,
  /** px from the mouse to where the light ends. */
  radius: 190,
  /** The brightest a dot gets (alpha of white), at the mouse. */
  peak: 0.2,
  /** How much of the way to the mouse the light goes each frame. */
  follow: 0.24,
  /** How fast it comes up and goes out, a share a frame. */
  fade: 0.14,
  maxDpr: 2,
} as const

export function useShowcaseField() {
  const cleanup = useRef<(() => void) | null>(null)

  const attach = useCallback((el: HTMLDivElement | null) => {
    cleanup.current?.()
    cleanup.current = null
    const section = el?.closest<HTMLElement>("[data-build-showcase]")
    const canvas = el?.querySelector("canvas")
    if (!el || !section || !canvas) return
    /* A mouse or a trackpad only; a touch screen has the still dots and nothing to track. */
    const hover = matchMedia("(hover: hover) and (pointer: fine)")
    const reduce = matchMedia("(prefers-reduced-motion: reduce)")
    const ctx = canvas.getContext("2d")
    if (!ctx || !hover.matches) return

    const f = SHOWCASE_FIELD
    const size = f.radius * 2
    const dpr = Math.min(window.devicePixelRatio || 1, f.maxDpr)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)

    /* The section's corner on the page; the mouse's place and the light's, in the section; how lit, 0 to 1. */
    let ox = 0
    let oy = 0
    let tx = 0
    let ty = 0
    let cx = 0
    let cy = 0
    let lit = 0
    let want = 0
    let frame = 0
    let visible = typeof IntersectionObserver !== "function"

    const place = () => {
      const r = section.getBoundingClientRect()
      ox = r.left + window.scrollX
      oy = r.top + window.scrollY
    }
    const draw = () => {
      const left = Math.round(cx - f.radius)
      const top = Math.round(cy - f.radius)
      canvas.style.transform = `translate3d(${left}px,${top}px,0)`
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (lit <= 0.004) return
      ctx.fillStyle = "#fff"
      for (let gx = Math.ceil((left - 1) / f.gap) * f.gap + 1; gx < left + size; gx += f.gap) {
        for (let gy = Math.ceil((top - 1) / f.gap) * f.gap + 1; gy < top + size; gy += f.gap) {
          const d = Math.hypot(gx - cx, gy - cy) / f.radius
          if (d >= 1) continue
          const near = (1 - d) * (1 - d)
          ctx.globalAlpha = f.peak * lit * near
          const s = (1.2 + near * 0.9) * dpr
          ctx.fillRect((gx - left) * dpr - s / 2, (gy - top) * dpr - s / 2, s, s)
        }
      }
    }
    const tick = () => {
      frame = 0
      cx += (tx - cx) * f.follow
      cy += (ty - cy) * f.follow
      lit += (want - lit) * f.fade
      const settled = Math.abs(tx - cx) < 0.3 && Math.abs(ty - cy) < 0.3 && Math.abs(want - lit) < 0.01
      if (settled) {
        cx = tx
        cy = ty
        lit = want
      }
      draw()
      if (!settled && visible) frame = requestAnimationFrame(tick)
    }
    const kick = () => {
      if (!frame && visible && !reduce.matches) frame = requestAnimationFrame(tick)
    }
    const onEnter = () => place()
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      tx = e.pageX - ox
      ty = e.pageY - oy
      /* Coming in, the light starts where the mouse is, not where it last was. */
      if (lit <= 0.004 && want === 0) {
        cx = tx
        cy = ty
      }
      want = 1
      kick()
    }
    const onLeave = () => {
      want = 0
      kick()
    }
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            if (visible) return
            /* Off screen: no frames, and the light is out when the section comes back. */
            cancelAnimationFrame(frame)
            frame = 0
            want = 0
            lit = 0
            ctx.clearRect(0, 0, canvas.width, canvas.height)
          })
        : null
    io?.observe(section)
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null
    ro?.observe(section)
    section.addEventListener("pointerenter", onEnter)
    section.addEventListener("pointermove", onMove, { passive: true })
    section.addEventListener("pointerleave", onLeave)

    cleanup.current = () => {
      cancelAnimationFrame(frame)
      io?.disconnect()
      ro?.disconnect()
      section.removeEventListener("pointerenter", onEnter)
      section.removeEventListener("pointermove", onMove)
      section.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  useEffect(() => () => cleanup.current?.(), [])

  return attach
}
