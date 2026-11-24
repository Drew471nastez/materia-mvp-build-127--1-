"use client"

import { useEffect, type RefObject } from "react"

/**
 * A ROW THAT SCROLLS SIDEWAYS FOLLOWS A MOUSE DRAG (r24, the owner: the
 * Integrations pills, "one row that scrolls smoothly, drag friendly"). A
 * finger and a trackpad already scroll it natively; a mouse has only the
 * wheel, which scrolls the page. Here a press and a drag of more than 5px
 * moves the row with the pointer, and letting go carries on at the speed it
 * left with, easing out over a few hundred ms, as a flick would.
 *
 * A press that did not move is a click as before. A press that dragged does
 * not choose the pill it started on: the click after it is swallowed once.
 * Written straight onto the element: nothing renders while it moves.
 */
export function useDragScroll<T extends HTMLElement>(ref: RefObject<T | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start: { x: number; left: number; id: number } | null = null
    let dragging = false
    let glide = 0
    const samples: { x: number; t: number }[] = []
    const still = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const stop = () => {
      cancelAnimationFrame(glide)
      glide = 0
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || el.scrollWidth <= el.clientWidth + 1) return
      stop()
      start = { x: e.clientX, left: el.scrollLeft, id: e.pointerId }
      dragging = false
      samples.length = 0
      samples.push({ x: e.clientX, t: e.timeStamp })
    }
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x
      if (!dragging) {
        if (Math.abs(dx) < 5) return
        dragging = true
        /* Only now: a capture taken on the press would retarget a plain click. */
        el.setPointerCapture?.(start.id)
        el.style.cursor = "grabbing"
        el.style.userSelect = "none"
      }
      el.scrollLeft = start.left - dx
      samples.push({ x: e.clientX, t: e.timeStamp })
      if (samples.length > 6) samples.shift()
    }
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const was = dragging
      start = null
      dragging = false
      el.style.cursor = ""
      el.style.userSelect = ""
      if (!was) return
      /* The click that ends a drag chooses nothing. */
      const swallow = (c: MouseEvent) => {
        c.preventDefault()
        c.stopPropagation()
      }
      el.addEventListener("click", swallow, { capture: true, once: true })
      window.setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 0)
      /* Carry on at the speed it left with, easing out. */
      const a = samples[0]
      const b = samples[samples.length - 1]
      const dt = b && a ? b.t - a.t : 0
      let v = dt > 0 && e.timeStamp - b.t < 80 ? -(b.x - a.x) / dt : 0 /* px per ms, in scroll direction */
      if (still() || Math.abs(v) < 0.05) return
      let last = performance.now()
      const step = (now: number) => {
        const ms = Math.min(32, now - last)
        last = now
        const before = el.scrollLeft
        el.scrollLeft += v * ms
        v *= Math.pow(0.994, ms)
        if (Math.abs(v) < 0.02 || el.scrollLeft === before) return stop()
        glide = requestAnimationFrame(step)
      }
      glide = requestAnimationFrame(step)
    }
    el.addEventListener("pointerdown", down)
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
    el.addEventListener("pointercancel", up)
    /* A wheel or a finger takes over from a glide still running. */
    el.addEventListener("wheel", stop, { passive: true })
    el.addEventListener("touchstart", stop, { passive: true })
    return () => {
      stop()
      el.removeEventListener("pointerdown", down)
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", up)
      el.removeEventListener("pointercancel", up)
      el.removeEventListener("wheel", stop)
      el.removeEventListener("touchstart", stop)
    }
  }, [ref])
}
