"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * THE PART OF THE PREVIEW YOU CAN ACTUALLY SEE. The preview root sits inside
 * the canvas's own scroller (and, on a phone frame, a clipped device), so its
 * box runs past what is on screen. Every ancestor that clips is intersected in
 * turn, and the window last, which is the rectangle nothing may be drawn
 * outside of: not the toolbar above it, not the sidebar beside it.
 */
function visibleArea(root: HTMLElement): DOMRect {
  let top = -Infinity
  let left = -Infinity
  let right = Infinity
  let bottom = Infinity
  for (let el: HTMLElement | null = root; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el)
    const clips = el === root || /(auto|scroll|hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)
    if (!clips) continue
    const r = el.getBoundingClientRect()
    top = Math.max(top, r.top)
    left = Math.max(left, r.left)
    right = Math.min(right, r.right)
    bottom = Math.min(bottom, r.bottom)
  }
  top = Math.max(top, 0)
  left = Math.max(left, 0)
  right = Math.min(right, window.innerWidth)
  bottom = Math.min(bottom, window.innerHeight)
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
}

/** `a` cut to `b`, or null when nothing of it is left. */
function clip(a: DOMRect, b: DOMRect): DOMRect | null {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const right = Math.min(a.right, b.right)
  const bottom = Math.min(a.bottom, b.bottom)
  return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : null
}

/**
 * ===========================================================================
 *  WHAT A CLICK HERE WOULD OPEN
 * ===========================================================================
 * Shopify's editor marks what is under the pointer before anybody clicks: a
 * thin outline round the heading or the block, and the section's name on a
 * chip at the section's top left. The section's own hover ring is drawn by
 * SectionWrapper; this adds the two things it cannot know: which one element
 * is the target (the nearest `data-sl-setting` or `data-block-id`, the same
 * marks the click reads), and what the section is called.
 *
 * One outline and one chip for the whole canvas, positioned `fixed` from the
 * element's own box and portalled into the body, so nothing in a section's
 * markup or stacking can clip them. Pointer only: on a phone there is no
 * hover, and a tap goes straight to the field.
 */
export function CanvasHover({ enabled, nameOf }: { enabled: boolean; nameOf: (sectionId: string) => string }) {
  const [box, setBox] = useState<{ el: DOMRect | null; section: DOMRect; area: DOMRect; name: string } | null>(null)
  const nameRef = useRef(nameOf)
  nameRef.current = nameOf
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!enabled) {
      setBox(null)
      return
    }
    /* A mouse's own moves only (pointerType below): a finger has no hover, and its tap goes straight to the field. */
    let frame = 0
    let last: Element | null = null
    const measure = () => {
      frame = 0
      const target = last
      const root = document.getElementById("wb-preview-root")
      if (!target || !root || !root.contains(target)) {
        setBox(null)
        return
      }
      const sectionEl = target.closest<HTMLElement>('[id^="wb-section-"]')
      if (!sectionEl) {
        setBox(null)
        return
      }
      const id = sectionEl.id.slice("wb-section-".length)
      const hit = target.closest<HTMLElement>("[data-sl-setting], [data-block-id]")
      const inside = hit && sectionEl.contains(hit) ? hit : null
      /*
       * NOTHING IS DRAWN OUTSIDE THE PREVIEW. The outline was the element's
       * whole box, so a tall one (a grid of product cards scrolled half out
       * of view) drew its outline up over the editor's toolbar, and the chip
       * sat wherever the section's corner was, on screen or not. Both are
       * cut to the part of the preview that is visible now.
       */
      const area = visibleArea(root)
      const section = clip(sectionEl.getBoundingClientRect(), area)
      if (!section) {
        setBox(null)
        return
      }
      /* Two pixels out from the element, as before, and then cut to the preview. */
      const raw = inside ? inside.getBoundingClientRect() : null
      const el = raw ? clip(new DOMRect(raw.left - 2, raw.top - 2, raw.width + 4, raw.height + 4), area) : null
      setBox({ el, section, area, name: nameRef.current(id) })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      last = e.target as Element | null
      schedule()
    }
    const onLeave = () => {
      last = null
      schedule()
    }
    const root = document.getElementById("wb-preview-root")
    document.addEventListener("pointermove", onMove, { passive: true })
    root?.addEventListener("pointerleave", onLeave)
    /* A scroll moves the page under a still pointer: measured again where it is. */
    document.addEventListener("scroll", schedule, { capture: true, passive: true })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("pointermove", onMove)
      root?.removeEventListener("pointerleave", onLeave)
      document.removeEventListener("scroll", schedule, { capture: true })
    }
  }, [enabled])

  if (!mounted || !box) return null
  return createPortal(
    <>
      {box.el && box.el.width > 0 && box.el.height > 0 && (
        <span
          aria-hidden
          className="wb-hover-outline"
          data-wb-hover-outline=""
          style={{ left: box.el.left, top: box.el.top, width: box.el.width, height: box.el.height }}
        />
      )}
      {box.section.height > 24 && (
        <span
          aria-hidden
          className="wb-hover-chip"
          data-wb-hover-chip=""
          style={{ left: box.section.left + 8, top: box.section.top + 8, maxWidth: Math.max(0, Math.min(220, box.area.right - box.section.left - 16)) }}
        >
          {box.name}
        </span>
      )}
    </>,
    document.body,
  )
}
