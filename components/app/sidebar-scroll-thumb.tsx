"use client"

/**
 * ===========================================================================
 *  THE /app SIDEBAR'S SCROLLBAR: ONE SLIM THUMB OVER THE EDGE
 * ===========================================================================
 * The owner: "the scroll bar of the sidebar inside app, it's too big ... make
 * it more slim, more modern ... appears only when I'm hovering over the
 * sidebar and disappears very smooth when I hover out ... and not that long".
 *
 * The platform's bar is hidden on the nav (app/globals.css .sidebar-nav) and
 * this draws a 4px thumb over the nav's right edge instead, so it takes no
 * width: nothing moves when it shows, and the rows sit where they did when
 * the bar kept a column. It is
 *
 *   short      its length follows how much of the list is in view, but
 *              never more than THUMB_MAX, inside a track inset TRACK_INSET
 *              from the nav's top and bottom
 *   quiet      transparent at rest; the frame's :hover fades it in, leaving
 *              fades it out more slowly (CSS, opacity only), and a scroll
 *              from a wheel, a key or a finger shows it for a moment
 *   draggable  a 10px wide hit area around the 4px line
 *
 * Moved with `transform` from the nav's scroll position, written to the
 * node at most once a frame; nothing here renders React again.
 */
import * as React from "react"

/** Space kept above and below the thumb's travel, so it never runs into the nav's ends. */
export const TRACK_INSET = 8
export const THUMB_MIN = 28
/** The longest it gets, however little of the list is out of view. */
export const THUMB_MAX = 72
/** How long a scroll keeps it shown when the pointer is not over the sidebar. */
const SCROLL_SHOW_MS = 700

export function thumbGeometry(clientHeight: number, scrollHeight: number, scrollTop: number): { height: number; y: number } | null {
  const room = scrollHeight - clientHeight
  if (room <= 1 || clientHeight <= 0) return null
  const track = Math.max(0, clientHeight - TRACK_INSET * 2)
  const height = Math.round(Math.min(THUMB_MAX, Math.max(THUMB_MIN, (clientHeight / scrollHeight) * track)))
  const y = TRACK_INSET + (Math.min(room, Math.max(0, scrollTop)) / room) * Math.max(0, track - height)
  return { height, y }
}

export function SidebarScrollThumb({ target }: { target: React.RefObject<HTMLElement | null> }) {
  const thumbRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = target.current
    const thumb = thumbRef.current
    if (!el || !thumb) return
    let frame = 0
    let hide = 0
    let drag: { startY: number; startTop: number; ratio: number } | null = null

    const place = () => {
      frame = 0
      const g = thumbGeometry(el.clientHeight, el.scrollHeight, el.scrollTop)
      if (!g) {
        thumb.removeAttribute("data-scrollable")
        return
      }
      thumb.setAttribute("data-scrollable", "")
      thumb.style.height = `${g.height}px`
      thumb.style.transform = `translate3d(0, ${g.y.toFixed(2)}px, 0)`
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    const onScroll = () => {
      schedule()
      thumb.setAttribute("data-scrolling", "")
      window.clearTimeout(hide)
      hide = window.setTimeout(() => thumb.removeAttribute("data-scrolling"), SCROLL_SHOW_MS)
    }
    const onDown = (e: PointerEvent) => {
      const g = thumbGeometry(el.clientHeight, el.scrollHeight, el.scrollTop)
      if (!g) return
      e.preventDefault()
      const track = el.clientHeight - TRACK_INSET * 2
      drag = { startY: e.clientY, startTop: el.scrollTop, ratio: (el.scrollHeight - el.clientHeight) / Math.max(1, track - g.height) }
      thumb.setPointerCapture(e.pointerId)
      thumb.setAttribute("data-dragging", "")
    }
    const onMove = (e: PointerEvent) => {
      if (drag) el.scrollTop = drag.startTop + (e.clientY - drag.startY) * drag.ratio
    }
    const onUp = () => {
      drag = null
      thumb.removeAttribute("data-dragging")
    }

    /* The list grows and shrinks as a group opens: watch the nav and what is in it. */
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
    ro?.observe(el)
    for (const child of Array.from(el.children)) ro?.observe(child)
    el.addEventListener("scroll", onScroll, { passive: true })
    thumb.addEventListener("pointerdown", onDown)
    thumb.addEventListener("pointermove", onMove)
    thumb.addEventListener("pointerup", onUp)
    thumb.addEventListener("pointercancel", onUp)
    place()
    return () => {
      ro?.disconnect()
      el.removeEventListener("scroll", onScroll)
      thumb.removeEventListener("pointerdown", onDown)
      thumb.removeEventListener("pointermove", onMove)
      thumb.removeEventListener("pointerup", onUp)
      thumb.removeEventListener("pointercancel", onUp)
      window.clearTimeout(hide)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [target])

  return <div ref={thumbRef} aria-hidden data-nav-thumb="" />
}
