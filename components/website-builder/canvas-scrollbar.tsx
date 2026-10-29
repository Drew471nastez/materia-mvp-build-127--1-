"use client"

import { useEffect, useRef, useState } from "react"
import { noteCanvasScroll, thumbFor } from "@/lib/website-builder/scroll-rest"
import { holdHoverWhileWheeling } from "@/lib/website-builder/wheel-hold"

/**
 * ===========================================================================
 *  A SCROLLBAR DRAWN OVER THE CARD, NOT LAID OUT IN IT
 * ===========================================================================
 * The preview card is `rounded-2xl` and its native scrollbar was not. A
 * classic bar takes a column of the card's width, paints it in the card's
 * own white beside whatever colour the site is, and runs it square through
 * both right-hand corners; an overlay bar keeps the column but still cuts
 * the corners. Styling it swaps one for the other. Hiding it is the only
 * thing that removes the column.
 *
 * So the native bar is hidden (`.wb-canvas-hidebar`) and this draws one: a
 * thumb positioned over the scroller's right edge, six pixels in from it and
 * eight short of either end, so it never touches an arc. Nothing about the
 * layout inside the card changes, and the site underneath shows through the
 * track because there is no track.
 *
 * It behaves like the platform's: appears on scroll and on hover, fades a
 * second after either stops, and can be grabbed and dragged. Sized from the
 * scroller's own numbers on every scroll and resize, one read per frame.
 */

const INSET_END = 8
const INSET_SIDE = 6
const MIN_THUMB = 28
const HIDE_AFTER_MS = 900

/*
  NO REACT RENDER PER SCROLLED FRAME (round 36). The thumb's place and its
  showing were state, so every frame the canvas scrolled was a commit: 60
  of them for one section brought into view from the sidebar, and each one
  put off the settings panel being drawn in the background behind it
  (scripts/check-editor-select.mjs). The thumb is written straight onto its
  element now; only a grab, which changes its width, renders.
*/
type Geometry = { top: number; height: number; track: number }

/* The name the canvas's scroll is published under for its thumb (globals.css, wb-canvas-thumb). */
const TIMELINE = "--wb-canvas-timeline"
/** Whether this browser can drive the thumb from the scroll itself: a scroll-driven animation, and a timeline seen outside the scroller. */
export function scrollDrivenThumb(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("animation-timeline", TIMELINE) && CSS.supports("timeline-scope", TIMELINE)
}

export function CanvasScrollbar({ targetId }: { targetId: string }) {
  const [dragging, setDragging] = useState(false)
  const draggingNow = useRef(false)
  const thumb = useRef<HTMLDivElement | null>(null)
  const geometry = useRef<Geometry | null>(null)
  const shown = useRef(false)
  const hideTimer = useRef(0)
  const frame = useRef(0)
  const scroller = useRef<HTMLElement | null>(null)
  const grab = useRef<{ startY: number; startTop: number } | null>(null)
  /* The thumb moved by the canvas's own scroll (a scroll-driven animation), not by a write per frame. */
  const driven = useRef(false)

  const paint = () => {
    const t = thumb.current
    if (!t) return
    const g = geometry.current
    if (!g) {
      if (t.style.display !== "none") t.style.display = "none"
      return
    }
    /*
      NOTHING WRITTEN PER SCROLLED FRAME (round 44). A new `top` every frame
      was a repaint of the card, and any repaint is the whole page layerized
      again: at a quarter speed about 1s of a three second wheel
      (scripts/check-editor-perf.mjs PART=scroll, TRACE=scroll); a new
      transform every frame was still 600ms of it. Where the browser can,
      the canvas's scroll drives the thumb itself (a scroll-driven
      animation, run by the compositor): only its two ends are written, when
      the page changes size. Elsewhere it is moved by transform. Writes are
      skipped when nothing changed, so a still thumb costs nothing.
    */
    const show = "block"
    const tall = `${g.height}px`
    const seen = shown.current || draggingNow.current ? "1" : "0"
    if (t.style.display !== show) t.style.display = show
    if (driven.current) {
      const from = `${INSET_END}px`
      const to = `${INSET_END + Math.max(0, g.track - g.height)}px`
      if (t.style.getPropertyValue("--wb-thumb-from") !== from) t.style.setProperty("--wb-thumb-from", from)
      if (t.style.getPropertyValue("--wb-thumb-to") !== to) t.style.setProperty("--wb-thumb-to", to)
    } else {
      const move = `translate3d(0, ${g.top}px, 0)`
      if (t.style.transform !== move) t.style.transform = move
    }
    if (t.style.height !== tall) t.style.height = tall
    if (t.style.opacity !== seen) t.style.opacity = seen
  }
  const paintRef = useRef(paint)
  paintRef.current = paint

  useEffect(() => {
    const el = document.getElementById(targetId)
    if (!el) return
    scroller.current = el

    /* The page's size, read when it changes. A scroll does not read it again. */
    const size = { scrollHeight: 0, clientHeight: 0 }
    const readSize = () => {
      size.scrollHeight = el.scrollHeight
      size.clientHeight = el.clientHeight
    }
    const place = () => {
      frame.current = 0
      const thumbAt = thumbFor(el.scrollTop, size.scrollHeight, size.clientHeight, INSET_END, MIN_THUMB)
      if (!thumbAt) {
        geometry.current = null
        paintRef.current()
        return
      }
      geometry.current = { top: thumbAt.top, height: thumbAt.height, track: size.clientHeight - INSET_END * 2 }
      paintRef.current()
    }
    const measure = () => {
      readSize()
      place()
    }
    const schedule = () => {
      if (!frame.current) frame.current = requestAnimationFrame(measure)
    }
    const reveal = () => {
      if (!shown.current) {
        shown.current = true
        paintRef.current()
      }
      window.clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => {
        shown.current = false
        paintRef.current()
      }, HIDE_AFTER_MS)
    }
    const onScroll = () => {
      noteCanvasScroll()
      /* Driven by the scroll itself, the thumb needs nothing from a scrolled frame. */
      if (!driven.current && !frame.current) frame.current = requestAnimationFrame(place)
      /* The editor's size switch holding the page under the eye moves the scroll; nobody scrolled (lib/website-builder/canvas-switch.ts, holdView). */
      if (el.hasAttribute("data-wb-switching")) return
      /* Nor does a window being resized, whose reflow moves it too. */
      if (performance.now() - resizedAt < 250) return
      reveal()
    }
    let resizedAt = -Infinity
    const onResize = () => { resizedAt = performance.now() }
    window.addEventListener("resize", onResize)
    /* The scroll published to the thumb, through the box that holds both (they are siblings). */
    const host = thumb.current?.parentElement ?? null
    driven.current = !!host && host.contains(el) && scrollDrivenThumb()
    if (driven.current && host && thumb.current) {
      el.style.setProperty("scroll-timeline", `${TIMELINE} block`)
      host.style.setProperty("timeline-scope", TIMELINE)
      thumb.current.setAttribute("data-scroll-driven", "")
    }
    measure()
    /* The wheel's hover held while it moves (wheel-hold.ts): this bar is the computer's, and so is that. */
    const letGo = holdHoverWhileWheeling(el)
    el.addEventListener("scroll", onScroll, { passive: true })
    el.addEventListener("pointerenter", reveal)
    el.addEventListener("pointermove", reveal)
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    // The page inside grows and shrinks as sections are added; the scroller
    // itself does not resize when that happens, its content does.
    const content = el.firstElementChild
    if (content) ro.observe(content)
    return () => {
      letGo()
      if (driven.current) {
        el.style.removeProperty("scroll-timeline")
        host?.style.removeProperty("timeline-scope")
        thumb.current?.removeAttribute("data-scroll-driven")
        driven.current = false
      }
      el.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      el.removeEventListener("pointerenter", reveal)
      el.removeEventListener("pointermove", reveal)
      ro.disconnect()
      if (frame.current) cancelAnimationFrame(frame.current)
      window.clearTimeout(hideTimer.current)
    }
  }, [targetId])

  // A grab on the thumb scrolls the card by the thumb's own ratio.
  useEffect(() => {
    draggingNow.current = dragging
    paintRef.current()
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const el = scroller.current
      const g = grab.current
      const at = geometry.current
      if (!el || !g || !at) return
      const range = el.scrollHeight - el.clientHeight
      const travel = at.track - at.height
      if (travel <= 0) return
      const nextTop = g.startTop + (e.clientY - g.startY)
      el.scrollTop = ((nextTop - INSET_END) / travel) * range
    }
    const onUp = () => {
      grab.current = null
      setDragging(false)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [dragging])

  /* Always in the page, hidden until there is something to scroll: its place is written by `paint`, never by a render. */
  return (
    <div
      ref={(el) => {
        thumb.current = el
        if (el) paintRef.current()
      }}
      role="presentation"
      aria-hidden
      data-canvas-scrollbar=""
      onPointerDown={(e) => {
        e.preventDefault()
        /* Driven by the scroll, the thumb's place is not kept per frame: it is read once, here. */
        const el = scroller.current
        const at = driven.current && el ? thumbFor(el.scrollTop, el.scrollHeight, el.clientHeight, INSET_END, MIN_THUMB) : null
        grab.current = { startY: e.clientY, startTop: at?.top ?? geometry.current?.top ?? 0 }
        setDragging(true)
      }}
      className="absolute z-20 rounded-full bg-[rgba(100,116,139,0.45)] transition-[opacity,background-color] duration-200 ease-out hover:bg-[rgba(71,85,105,0.65)]"
      style={{
        display: "none",
        opacity: 0,
        top: 0,
        right: INSET_SIDE,
        width: dragging ? 8 : 6,
        cursor: "default",
        touchAction: "none",
        willChange: "transform, opacity",
      }}
    />
  )
}
