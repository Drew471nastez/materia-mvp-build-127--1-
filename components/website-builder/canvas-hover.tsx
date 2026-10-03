"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

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
  const [box, setBox] = useState<{ el: DOMRect | null; section: DOMRect; name: string } | null>(null)
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
      const view = root.getBoundingClientRect()
      const s = sectionEl.getBoundingClientRect()
      /* The chip stays on screen while the top of a tall section is scrolled away. */
      const section = new DOMRect(s.left, Math.max(s.top, view.top), s.width, Math.max(0, s.bottom - Math.max(s.top, view.top)))
      setBox({ el: inside ? inside.getBoundingClientRect() : null, section, name: nameRef.current(id) })
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
          style={{ left: box.el.left - 2, top: box.el.top - 2, width: box.el.width + 4, height: box.el.height + 4 }}
        />
      )}
      {box.section.height > 24 && (
        <span aria-hidden className="wb-hover-chip" data-wb-hover-chip="" style={{ left: box.section.left + 8, top: box.section.top + 8 }}>
          {box.name}
        </span>
      )}
    </>,
    document.body,
  )
}
