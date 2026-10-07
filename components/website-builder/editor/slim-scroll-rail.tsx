"use client"

/**
 * ===========================================================================
 *  THE SIDEBAR'S SCROLLBAR TAKES NO WIDTH
 * ===========================================================================
 * Every scroller in the builder's panels is `.wb-slim-scroll`, which kept a
 * 6px column for its bar: the panel's content was 6px narrower whenever it
 * could scroll, and moved when it started to. On a pointer screen the
 * platform's bar is hidden (app/globals.css) and this draws one thin thumb
 * over the right edge of whichever panel scroller the pointer is in or that
 * is moving, the way macOS draws one: there while it scrolls or is hovered,
 * gone a moment after, and draggable. A touch screen keeps its own overlay
 * indicator, which already takes no width.
 *
 * One thumb for the whole editor, placed with `position: fixed` from the
 * scroller's box, written straight to the node once a frame at most.
 */
import * as React from "react"

const LINGER_MS = 900
const MIN_THUMB = 28
const SELECTOR = ".wb-slim-scroll"

export function SlimScrollRail() {
  const thumbRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) return
    const thumb = thumbRef.current
    if (!thumb) return
    /* Only where this thumb is drawn is the platform's bar hidden (app/globals.css html.slim-rail). */
    const html = document.documentElement
    html.classList.add("slim-rail")
    let current: HTMLElement | null = null
    let hide = 0
    let frame = 0
    let drag: { startY: number; startTop: number; ratio: number } | null = null

    const place = () => {
      frame = 0
      const el = current
      if (!el) return
      const room = el.scrollHeight - el.clientHeight
      if (room <= 1) {
        thumb.style.opacity = "0"
        return
      }
      const box = el.getBoundingClientRect()
      const h = Math.max(MIN_THUMB, (el.clientHeight / el.scrollHeight) * box.height)
      const y = box.top + (el.scrollTop / room) * (box.height - h)
      thumb.style.height = `${h}px`
      thumb.style.transform = `translate3d(${box.right - 7}px, ${y}px, 0)`
      thumb.style.opacity = "1"
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    const show = (el: HTMLElement) => {
      current = el
      schedule()
      window.clearTimeout(hide)
      hide = window.setTimeout(() => {
        if (!drag && !thumb.matches(":hover")) thumb.style.opacity = "0"
      }, LINGER_MS)
    }

    const onScroll = (e: Event) => {
      const el = e.target instanceof HTMLElement ? e.target : null
      if (el?.matches(SELECTOR)) show(el)
    }
    const onOver = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null
      if (el) show(el)
    }
    const onDown = (e: PointerEvent) => {
      if (!current) return
      e.preventDefault()
      const room = current.scrollHeight - current.clientHeight
      const box = current.getBoundingClientRect()
      const h = thumb.getBoundingClientRect().height
      drag = { startY: e.clientY, startTop: current.scrollTop, ratio: room / Math.max(1, box.height - h) }
      thumb.setPointerCapture(e.pointerId)
      thumb.setAttribute("data-dragging", "")
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || !current) return
      current.scrollTop = drag.startTop + (e.clientY - drag.startY) * drag.ratio
    }
    const onUp = () => {
      drag = null
      thumb.removeAttribute("data-dragging")
      if (current) show(current)
    }

    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    document.addEventListener("pointerover", onOver, { passive: true })
    window.addEventListener("resize", schedule)
    thumb.addEventListener("pointerdown", onDown)
    thumb.addEventListener("pointermove", onMove)
    thumb.addEventListener("pointerup", onUp)
    thumb.addEventListener("pointercancel", onUp)
    return () => {
      html.classList.remove("slim-rail")
      document.removeEventListener("scroll", onScroll, { capture: true })
      document.removeEventListener("pointerover", onOver)
      window.removeEventListener("resize", schedule)
      window.clearTimeout(hide)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div
      ref={thumbRef}
      aria-hidden
      data-slim-scroll-thumb=""
      className="pointer-events-auto fixed left-0 top-0 z-[60] w-[5px] cursor-default rounded-full bg-[rgba(100,116,139,0.45)] opacity-0 transition-[opacity,background-color,width] duration-200 hover:w-[6px] hover:bg-[rgba(71,85,105,0.65)] data-[dragging]:bg-[rgba(71,85,105,0.7)] motion-reduce:transition-none"
      style={{ transform: "translate3d(-20px, 0, 0)" }}
    />
  )
}
