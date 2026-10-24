"use client"

import { useEffect, useRef, useState } from "react"

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

  const paint = () => {
    const t = thumb.current
    if (!t) return
    const g = geometry.current
    if (!g) {
      if (t.style.display !== "none") t.style.display = "none"
      return
    }
    t.style.display = "block"
    t.style.top = `${g.top}px`
    t.style.height = `${g.height}px`
    t.style.opacity = shown.current || draggingNow.current ? "1" : "0"
  }
  const paintRef = useRef(paint)
  paintRef.current = paint

  useEffect(() => {
    const el = document.getElementById(targetId)
    if (!el) return
    scroller.current = el

    const measure = () => {
      frame.current = 0
      const { scrollHeight, clientHeight, scrollTop } = el
      const track = clientHeight - INSET_END * 2
      if (scrollHeight <= clientHeight + 1 || track <= MIN_THUMB) {
        geometry.current = null
        paintRef.current()
        return
      }
      const height = Math.max(MIN_THUMB, Math.round((clientHeight / scrollHeight) * track))
      const range = scrollHeight - clientHeight
      const top = INSET_END + Math.round((scrollTop / range) * (track - height))
      geometry.current = { top, height, track }
      paintRef.current()
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
      schedule()
      /* The editor's size switch holding the page under the eye moves the scroll; nobody scrolled (lib/website-builder/canvas-switch.ts, holdView). */
      if (el.hasAttribute("data-wb-switching")) return
      /* Nor does a window being resized, whose reflow moves it too. */
      if (performance.now() - resizedAt < 250) return
      reveal()
    }
    let resizedAt = -Infinity
    const onResize = () => { resizedAt = performance.now() }
    window.addEventListener("resize", onResize)
    measure()
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
        grab.current = { startY: e.clientY, startTop: geometry.current?.top ?? 0 }
        setDragging(true)
      }}
      className="absolute z-20 rounded-full bg-[rgba(100,116,139,0.45)] transition-[opacity,background-color] duration-200 ease-out hover:bg-[rgba(71,85,105,0.65)]"
      style={{
        display: "none",
        opacity: 0,
        right: INSET_SIDE,
        width: dragging ? 8 : 6,
        cursor: "default",
        touchAction: "none",
        willChange: "opacity",
      }}
    />
  )
}
