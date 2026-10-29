"use client"

/**
 * A ROW THAT A MOUSE CAN DRAG, AS A FINGER CAN SWIPE IT (round 42).
 * The rules are lib/onepage/drag-scroll.ts; this is the hook.
 *
 *   MOUSE ONLY        a finger and a pen are left to the browser's own
 *                     scroll (momentum and snap, on the compositor), which
 *                     is already right; only pointerType "mouse" is taken.
 *   IN REAL TIME      while the button is down the row's scrollLeft is the
 *                     pointer's travel, written on every move; the snap is
 *                     off for that time (a mandatory snap pulls a row it is
 *                     not resting on back to a slide, which is the jump the
 *                     group carousel had).
 *   A SOFT LANDING    on release the row glides to the slide it would coast
 *                     to (restingPoint), then the snap is put back where it
 *                     already rests, so nothing moves when it returns.
 *   NOTHING ELSE      no text selected, no picture dragged out as a file,
 *                     and the click after a drag swallowed so a linked slide
 *                     does not open; a plain click still does.
 *
 * Native listeners on the row, nothing through React state, so a drag
 * renders nothing.
 */
import * as React from "react"
import { isDrag, restingPoint } from "@/lib/onepage/drag-scroll"

/** The row's slide starts: every child that snaps, measured from the row's own left edge. */
function snapPoints(row: HTMLElement): number[] {
  const left = row.getBoundingClientRect().left - row.scrollLeft
  const points: number[] = []
  row.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (el.parentElement !== row && el.parentElement?.parentElement !== row) return
    const align = getComputedStyle(el).scrollSnapAlign
    if (!align || align === "none") return
    points.push(Math.round(el.getBoundingClientRect().left - left - (parseFloat(getComputedStyle(row).scrollPaddingLeft) || 0)))
  })
  return points
}

export function useMouseDragScroll(ref: React.RefObject<HTMLElement | null>, enabled = true) {
  React.useEffect(() => {
    const row = ref.current
    if (!row || !enabled) return
    let id: number | null = null
    let x0 = 0
    let y0 = 0
    let left0 = 0
    let dragging = false
    let swallow = false
    let snap = ""
    let samples: { t: number; left: number }[] = []
    let settleTimer: number | null = null

    const restoreSnap = () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer)
      settleTimer = null
      row.style.scrollSnapType = snap
      row.style.scrollBehavior = ""
      delete row.dataset.dragging
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return
      if (row.scrollWidth <= row.clientWidth + 1) return
      if (settleTimer !== null) restoreSnap()
      id = e.pointerId
      x0 = e.clientX
      y0 = e.clientY
      left0 = row.scrollLeft
      dragging = false
      swallow = false
      samples = [{ t: e.timeStamp, left: left0 }]
    }

    const onMove = (e: PointerEvent) => {
      if (id === null || e.pointerId !== id) return
      const dx = e.clientX - x0
      if (!dragging) {
        if (!isDrag(dx, e.clientY - y0)) return
        dragging = true
        swallow = true
        snap = row.style.scrollSnapType
        row.style.scrollSnapType = "none"
        row.style.scrollBehavior = "auto"
        row.dataset.dragging = ""
        try {
          row.setPointerCapture(id)
        } catch {
          /* a pointer already gone */
        }
      }
      e.preventDefault()
      row.scrollLeft = left0 - dx
      samples.push({ t: e.timeStamp, left: row.scrollLeft })
      if (samples.length > 6) samples.shift()
    }

    const onUp = (e: PointerEvent) => {
      if (id === null || e.pointerId !== id) return
      id = null
      if (!dragging) return
      dragging = false
      try {
        row.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      /* The speed over the last ~80ms of the drag. */
      const last = samples[samples.length - 1]
      const first = samples.find((s) => last.t - s.t <= 80) ?? samples[0]
      const dt = last.t - first.t
      const velocity = dt > 0 ? (last.left - first.left) / dt : 0
      const maxLeft = row.scrollWidth - row.clientWidth
      const target = restingPoint(snapPoints(row), left0, row.scrollLeft, velocity, maxLeft)
      row.style.scrollBehavior = ""
      row.scrollTo({ left: target, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
      /* The snap comes back once the glide has landed (scrollend, or a ceiling where it is not fired). */
      const done = () => {
        row.removeEventListener("scrollend", done)
        restoreSnap()
      }
      row.addEventListener("scrollend", done, { once: true })
      settleTimer = window.setTimeout(done, 700)
    }

    /* The click a drag ends with goes nowhere; the next plain click is untouched. */
    const onClick = (e: MouseEvent) => {
      if (!swallow) return
      swallow = false
      e.preventDefault()
      e.stopPropagation()
    }
    /* A picture or a link is never dragged out of the row as a file. */
    const onDragStart = (e: DragEvent) => e.preventDefault()

    row.addEventListener("pointerdown", onDown)
    row.addEventListener("pointermove", onMove)
    row.addEventListener("pointerup", onUp)
    row.addEventListener("pointercancel", onUp)
    row.addEventListener("click", onClick, true)
    row.addEventListener("dragstart", onDragStart)
    return () => {
      row.removeEventListener("pointerdown", onDown)
      row.removeEventListener("pointermove", onMove)
      row.removeEventListener("pointerup", onUp)
      row.removeEventListener("pointercancel", onUp)
      row.removeEventListener("click", onClick, true)
      row.removeEventListener("dragstart", onDragStart)
      if (settleTimer !== null) window.clearTimeout(settleTimer)
    }
  }, [ref, enabled])
}
