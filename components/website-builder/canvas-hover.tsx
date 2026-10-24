"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { tt } from "@/lib/i18n/text"

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
 * THE AI PANEL STAYS ON TOP. Storelib AI's panel floats over the canvas
 * (theme-chat.tsx, data-ask-dock), in the canvas pane's own stacking, while
 * the outline and the chip are on the body above everything: a heading
 * under the open panel drew its blue outline straight across the chat. The
 * panel's box is cut out of the outline, and a chip that would sit on the
 * panel is not drawn.
 */
/*
  THE PANEL, NOT THE BOX IT SITS IN. `[data-ask-dock]` is a layer the size of
  the whole canvas (it takes no pointer; the pill and the conversation are
  placed inside it), so measuring it cut the entire outline away and kept
  every chip off the page: hover drew nothing at all. What covers the page is
  the open conversation and the pill.
*/
const PANELS = '[data-ask-dock][data-state="open"] [data-ask-card], [data-ask-dock]:not([data-state="hidden"]) [data-ask-pill]'
function panelBoxes(): DOMRect[] {
  return Array.from(document.querySelectorAll<HTMLElement>(PANELS), (el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
}

/** A clip-path for `box` with every panel that crosses it cut out, or undefined when none does. */
function holesFor(box: DOMRect, panels: DOMRect[]): string | undefined {
  const holes = panels.map((p) => clip(p, box)).filter((r): r is DOMRect => !!r)
  if (!holes.length) return undefined
  /* The outline's ring is drawn just outside its box (a 2px spread): the clip reaches 3px past it so the ring is kept. */
  const o = 3
  const outer = `M${-o} ${-o}H${box.width + o}V${box.height + o}H${-o}Z`
  const cut = holes.map((h) => `M${h.left - box.left} ${h.top - box.top}H${h.right - box.left}V${h.bottom - box.top}H${h.left - box.left}Z`).join("")
  return `path(evenodd, "${outer}${cut}")`
}

function overlaps(a: DOMRect, panels: DOMRect[]): boolean {
  return panels.some((p) => !!clip(a, p))
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
/*
  NO REACT RENDER WHILE THE POINTER MOVES (round 36). The marks were state,
  so every frame the pointer moved over the canvas was a commit of this
  component (30 moves, 30 commits: scripts/check-editor-select.mjs). They
  are written straight onto the two spans now, once a frame at most, and
  not at all while the pointer stays on the same element and nothing
  scrolled.
*/
const HIDDEN = { display: "none" } as const
type Marks = { el: DOMRect | null; section: DOMRect; area: DOMRect; name: string; panels: DOMRect[] } | null

const px = (n: number) => `${Math.round(n * 100) / 100}px`
function draw(outlineEl: HTMLElement | null, chipEl: HTMLElement | null, box: Marks) {
  if (outlineEl) {
    const outline = box?.el && box.el.width > 0 && box.el.height > 0 ? box.el : null
    if (!outline) outlineEl.style.cssText = "display:none"
    else {
      const holes = holesFor(outline, box!.panels)
      outlineEl.style.cssText = `left:${px(outline.left)};top:${px(outline.top)};width:${px(outline.width)};height:${px(outline.height)}${holes ? `;clip-path:${holes}` : ""}`
    }
  }
  if (chipEl) {
    const chip = box && box.section.height > 24 && !overlaps(new DOMRect(box.section.left + 8, box.section.top + 8, 220, 24), box.panels) ? box : null
    if (!chip) chipEl.style.cssText = "display:none"
    else {
      chipEl.style.cssText = `left:${px(chip.section.left + 8)};top:${px(chip.section.top + 8)};max-width:${px(Math.max(0, Math.min(220, chip.area.right - chip.section.left - 16)))}`
      if (chipEl.textContent !== chip.name) chipEl.textContent = chip.name
    }
  }
}

export function CanvasHover({ enabled, nameOf }: { enabled: boolean; nameOf: (sectionId: string) => string }) {
  const nameRef = useRef(nameOf)
  nameRef.current = nameOf
  const outlineRef = useRef<HTMLSpanElement | null>(null)
  const chipRef = useRef<HTMLSpanElement | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const setBox = (box: Marks) => draw(outlineRef.current, chipRef.current, box)
    if (!enabled) {
      setBox(null)
      return
    }
    /* A mouse's own moves only (pointerType below): a finger has no hover, and its tap goes straight to the field. */
    let frame = 0
    let last: Element | null = null
    /* What the marks were last drawn for: the same element, with nothing scrolled, is drawn already. */
    let drawnFor: Element | null = null
    let moved = true
    const measure = () => {
      frame = 0
      const target = last
      if (target === drawnFor && !moved) return
      drawnFor = target
      moved = false
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
      setBox({ el, section, area, name: nameRef.current(id), panels: panelBoxes() })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      last = e.target as Element | null
      if (last === drawnFor && !moved) return
      schedule()
    }
    const onLeave = () => {
      last = null
      schedule()
    }
    /* A scroll moves the page under a still pointer: measured again where it is. */
    const onScroll = () => {
      moved = true
      schedule()
    }
    const root = document.getElementById("wb-preview-root")
    document.addEventListener("pointermove", onMove, { passive: true })
    root?.addEventListener("pointerleave", onLeave)
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("pointermove", onMove)
      root?.removeEventListener("pointerleave", onLeave)
      document.removeEventListener("scroll", onScroll, { capture: true })
      setBox(null)
    }
  }, [enabled])

  /*
    THE TWO MARKS ARE ALWAYS IN THE PAGE, SHOWN OR HIDDEN. They were put in
    and taken out as the pointer moved, and an element put into or taken out
    of the document is checked against every :has() whose subject is <html>
    (app/globals.css has several): Chromium's own trace showed each one
    restyling all of the editor, 1,360 elements, 70 to 240ms a time, several
    times a second while the pointer crossed the canvas. Hidden with
    `display: none` they cost a restyle of themselves alone.
  */
  if (!mounted) return null
  return createPortal(
    <>
      <span ref={outlineRef} aria-hidden className="wb-hover-outline" data-wb-hover-outline="" style={HIDDEN} />
      <span ref={chipRef} aria-hidden className="wb-hover-chip" data-wb-hover-chip="" style={HIDDEN} />
    </>,
    document.body,
  )
}
