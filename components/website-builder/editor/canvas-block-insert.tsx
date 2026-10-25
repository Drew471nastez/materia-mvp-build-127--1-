"use client"

/**
 * ===========================================================================
 *  ADD A BLOCK HERE, IN THE CANVAS (round 12)
 * ===========================================================================
 * The owner, over a product's blocks stacked in the canvas: "when I hover in
 * between, there should also be the + icon appearing like it does in between
 * sections, that when I click it opens the library with the blocks of that
 * section so I can add blocks from there."
 *
 * The same strip as between two sections (CanvasInsertStrip in the editor
 * page): a grey line grows out from the middle and the near-black button
 * turns in from a quarter turn, `opacity`, `scale` and `rotate` over 200ms.
 * It is not in the section's flow, so the section lays out exactly as on the
 * website: it is fixed over the line, positioned by measuring the blocks
 * (lib/website-builder/block-gaps.ts), and shown only where the section takes
 * another block at that level (the editor says which: its schema's blocks,
 * `max_blocks`, the depth). A press opens the block library for that place,
 * or adds the one kind of block it takes.
 *
 * A mouse only: a finger has no hover to find it with, and a tap on a block
 * selects it. Moving from one place to the next moves the strip, it does not
 * blink: the place under the pointer holds a few pixels further than it
 * takes to find (gapAt `keep`), and the strip itself is part of the place.
 * The button is a real button: Tab reaches it while it shows, Enter and
 * Space press it, Escape puts it away, and it stays while it has the focus.
 * The sidebar's tree has the same line between two block rows for a
 * keyboard that never hovers.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { Plus } from "lucide-react"

import { blockGaps, gapAt, sameGap, type BlockBox, type BlockGap } from "@/lib/website-builder/block-gaps"
import { tt } from "@/lib/i18n/text"

export interface CanvasBlockPlace {
  sectionId: string
  parent: string[]
  before: string
  after: string
}

/** A section's own line belongs to Add section: a block place is never this close to the section's edge. */
const SECTION_EDGE = 10
const FADE_MS = 200

interface Shown {
  sectionId: string
  gap: BlockGap
}

/** Every block of a section as a box, with the blocks it sits in. */
function boxesOf(section: Element): BlockBox[] {
  const out: BlockBox[] = []
  section.querySelectorAll("[data-block-id]").forEach((el) => {
    const id = el.getAttribute("data-block-id")
    if (!id) return
    const parent: string[] = []
    for (let up = el.parentElement?.closest("[data-block-id]") ?? null; up && section.contains(up); up = up.parentElement?.closest("[data-block-id]") ?? null) {
      const pid = up.getAttribute("data-block-id")
      if (pid) parent.unshift(pid)
    }
    const r = el.getBoundingClientRect()
    out.push({ id, parent, top: r.top, bottom: r.bottom, left: r.left, right: r.right })
  })
  return out
}

export function CanvasBlockInserter({
  rootId,
  enabled,
  levels,
  onInsert,
}: {
  /** The canvas's scroller (#wb-preview-root). */
  rootId: string
  /** Inspector on, nothing over the canvas: the strip is a control only then. */
  enabled: boolean
  /** By section id, the levels that take another block ("" for the section's own, a block path inside it). */
  levels: Record<string, string[]>
  onInsert: (place: CanvasBlockPlace, anchor: HTMLElement) => void
}) {
  const [shown, setShown] = React.useState<Shown | null>(null)
  const [on, setOn] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const shownRef = React.useRef<Shown | null>(null)
  shownRef.current = shown
  const levelsRef = React.useRef(levels)
  levelsRef.current = levels
  const stripRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const focusedRef = React.useRef(false)
  const fadeRef = React.useRef(0)
  /* Whether the strip is on, or on its way out (`on` as last asked, read without waiting for a render). */
  const onRef = React.useRef(false)

  React.useEffect(() => setMounted(true), [])

  const show = React.useCallback((next: Shown | null) => {
    if (!next && focusedRef.current) return
    const was = shownRef.current
    /* The same place, still on (not fading out): nothing to draw again. */
    if (next && was && onRef.current && was.sectionId === next.sectionId && sameGap(was.gap, next.gap) && Math.abs(was.gap.y - next.gap.y) < 0.5 && Math.abs(was.gap.left - next.gap.left) < 0.5 && Math.abs(was.gap.width - next.gap.width) < 0.5) return
    window.clearTimeout(fadeRef.current)
    if (next) {
      onRef.current = true
      shownRef.current = next
      setShown(next)
      /* Drawn at rest first, then on, so the line and the button grow in rather than appear. */
      requestAnimationFrame(() => {
        if (onRef.current) setOn(true)
      })
      return
    }
    if (!was) return
    onRef.current = false
    setOn(false)
    fadeRef.current = window.setTimeout(() => {
      shownRef.current = null
      setShown(null)
    }, FADE_MS)
  }, [])

  React.useEffect(() => {
    if (!enabled) {
      focusedRef.current = false
      show(null)
      return
    }
    let at: { x: number; y: number; target: EventTarget | null } | null = null
    let frame = 0
    const place = () => {
      frame = 0
      if (!at) return show(null)
      const root = document.getElementById(rootId)
      if (!root) return show(null)
      const view = root.getBoundingClientRect()
      const { x, y } = at
      if (x < view.left || x > view.right || y < view.top || y > view.bottom) return show(null)
      /* Over the strip itself: the place it shows is still the place. */
      const onStrip = !!stripRef.current && at.target instanceof Node && stripRef.current.contains(at.target)
      const current = shownRef.current
      let section: Element | null = null
      if (onStrip && current) section = document.getElementById(`wb-section-${current.sectionId}`)
      else if (at.target instanceof Element && root.contains(at.target)) section = at.target.closest("[data-section-key]")
      const sectionId = section?.getAttribute("data-section-key") ?? null
      const wanted = sectionId ? levelsRef.current[sectionId] : undefined
      if (!section || !sectionId || !wanted?.length) return show(null)
      const box = section.getBoundingClientRect()
      if (y < box.top + SECTION_EDGE || y > box.bottom - SECTION_EDGE) return show(null)
      /* The same block drawn twice in a row (a phone copy and a computer copy) has no place between it and itself. */
      const gaps = blockGaps(boxesOf(section)).filter((g) => g.before !== g.after && wanted.includes(g.parent.join("/")))
      const keep = current && current.sectionId === sectionId ? current.gap : null
      const gap = gapAt(gaps, x, y, 8, keep)
      /* A place scrolled under the canvas's top edge (a sticky header there) is not one anybody can see. */
      if (!gap || gap.y < view.top + 6 || gap.y > view.bottom - 6) return show(null)
      show({ sectionId, gap })
    }
    const ask = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      /* A drag (a button held) is not looking for a place to add. */
      if (e.buttons !== 0) {
        at = null
        return ask()
      }
      at = { x: e.clientX, y: e.clientY, target: e.target }
      ask()
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      if (!e.relatedTarget) {
        at = null
        ask()
      }
    }
    /*
      NOT WHILE THE CANVAS SCROLLS (round 14). Every scroll event read the
      element under the pointer (a layout of the page) and every frame
      measured each block of the section: the strip goes while the canvas
      moves and is found again 150ms after it stops, where the pointer is.
    */
    let settle = 0
    const onScroll = () => {
      if (!at) return
      if (frame) { cancelAnimationFrame(frame); frame = 0 }
      show(null)
      window.clearTimeout(settle)
      settle = window.setTimeout(() => {
        if (!at) return
        /* After a scroll the element under the pointer is a different one: asked again where the pointer is. */
        at = { ...at, target: document.elementFromPoint(at.x, at.y) }
        ask()
      }, 150)
    }
    document.addEventListener("pointermove", onMove, { passive: true, capture: true })
    document.addEventListener("pointerout", onLeave, { passive: true, capture: true })
    document.addEventListener("scroll", onScroll, { passive: true, capture: true })
    return () => {
      document.removeEventListener("pointermove", onMove, { capture: true })
      document.removeEventListener("pointerout", onLeave, { capture: true })
      document.removeEventListener("scroll", onScroll, { capture: true })
      if (frame) cancelAnimationFrame(frame)
      window.clearTimeout(settle)
    }
  }, [enabled, rootId, show])

  React.useEffect(() => () => window.clearTimeout(fadeRef.current), [])

  if (!mounted || !shown) return null
  const press = () => {
    const s = shownRef.current
    const anchor = buttonRef.current
    if (!s || !anchor) return
    onInsert({ sectionId: s.sectionId, parent: s.gap.parent, before: s.gap.before, after: s.gap.after }, anchor)
    focusedRef.current = false
    show(null)
  }
  const { gap } = shown
  return createPortal(
    <div
      ref={stripRef}
      data-wb-block-insert=""
      data-on={on ? "" : undefined}
      /* The band is the place: a press anywhere on the line adds there, as between two sections. Only while it shows. */
      className={`fixed z-40 flex h-3 cursor-pointer select-none items-center justify-center ${on ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{ left: gap.left, top: gap.y - 6, width: gap.width }}
      onClick={(e) => {
        e.stopPropagation()
        press()
      }}
    >
      {/* Grey and near-black, as between two sections: findable, not loud. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 h-[2px] origin-center bg-[#d4d7dd] transition-[opacity,scale] duration-200 ease-out motion-reduce:transition-none ${on ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"}`}
      />
      <button
        ref={buttonRef}
        type="button"
        aria-label={tt("Add a block here")}
        data-wb-block-insert-button=""
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={() => {
          focusedRef.current = false
        }}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return
          e.preventDefault()
          focusedRef.current = false
          buttonRef.current?.blur()
          show(null)
        }}
        onClick={(e) => {
          e.stopPropagation()
          press()
        }}
        className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#1a1a2e] text-white shadow-[0_2px_10px_-4px_rgba(15,23,42,0.7)] outline-none transition-[opacity,rotate,scale] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-2 motion-reduce:transition-none ${on ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-75 opacity-0"}`}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
      </button>
    </div>,
    document.body,
  )
}

/**
 * THE PICKER'S PLACE FOR A STRIP IN THE IMPORTED THEME'S FRAME. The block
 * library opens level with the row it was opened from and gives the focus
 * back to it; a press inside the frame has no element in the editor's page,
 * so it is given one, a box over the strip that takes no pointer.
 */
let frameAnchor: HTMLElement | null = null
export function canvasAnchorAt(box: { top: number; left: number; width: number; height: number }): HTMLElement {
  if (!frameAnchor || !frameAnchor.isConnected) {
    frameAnchor = document.createElement("div")
    frameAnchor.setAttribute("data-wb-block-insert-anchor", "")
    frameAnchor.tabIndex = -1
    frameAnchor.style.cssText = "position:fixed;pointer-events:none;opacity:0;outline:none"
    document.body.appendChild(frameAnchor)
  }
  frameAnchor.style.top = `${box.top}px`
  frameAnchor.style.left = `${box.left}px`
  frameAnchor.style.width = `${Math.max(1, box.width)}px`
  frameAnchor.style.height = `${Math.max(1, box.height)}px`
  return frameAnchor
}
