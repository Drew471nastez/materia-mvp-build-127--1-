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
 *
 * And where the browser can, not even that while it scrolls (round 44): a
 * transform written every scrolled frame was the whole editor layerized
 * again each frame, about 680ms of a sidebar wheel at a sixth of the speed
 * (scripts/check-editor-perf.mjs PART=smooth TRACE=sidebar). The scroller
 * the thumb is on publishes its scroll (`scroll-timeline`), and the thumb's
 * travel between its two ends is a scroll-driven animation the compositor
 * runs. The ends are written when a gesture starts or the scroller changes.
 */
import * as React from "react"
import { holdHoverWhileWheeling, WHEEL_LIST_HOLD_ATTRIBUTE } from "@/lib/website-builder/wheel-hold"

const LINGER_MS = 900
/* How long after the pointer leaves the panel the bar starts to fade. */
const OUT_MS = 120
const MIN_THUMB = 28
/**
 * The thumb's width, and its gap from the panel's right edge. It was 4px
 * (6 under the pointer), which the owner found "too slim"; 7 is easy to see
 * and to grab and still quieter than the platform's own bar. One width at
 * rest and under the pointer: a thumb that widens moves its left edge.
 */
export const THUMB_PX = 7
const THUMB_INSET = 2
const SELECTOR = ".wb-slim-scroll"
/* The name the scroller under the thumb publishes its scroll as (globals.css, wb-slim-thumb). */
const TIMELINE = "--wb-slim-scroll"
/* A scroll this long after the last one starts a gesture: the thumb's ends are read again then. */
const GESTURE_GAP_MS = 200

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
    /* Driven by the scroll itself where the browser can: the scroller publishing it, and when the thumb was last placed for it. */
    const driven = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("animation-timeline", TIMELINE) && CSS.supports("timeline-scope", TIMELINE)
    let publishing: HTMLElement | null = null
    let placedFor: HTMLElement | null = null
    let lastScroll = 0
    if (driven) {
      html.style.setProperty("timeline-scope", TIMELINE)
      thumb.setAttribute("data-scroll-driven", "")
    }

    const place = () => {
      frame = 0
      const el = current
      if (!el) return
      placedFor = el
      const room = el.scrollHeight - el.clientHeight
      if (room <= 1) {
        thumb.style.opacity = "0"
        return
      }
      const box = el.getBoundingClientRect()
      const h = Math.max(MIN_THUMB, (el.clientHeight / el.scrollHeight) * box.height)
      const y = box.top + (el.scrollTop / room) * (box.height - h)
      thumb.style.height = `${h}px`
      thumb.style.transform = `translate3d(${box.right - THUMB_PX - THUMB_INSET}px, ${y}px, 0)`
      if (driven) {
        if (publishing !== el) {
          publishing?.style.removeProperty("scroll-timeline")
          el.style.setProperty("scroll-timeline", `${TIMELINE} block`)
          publishing = el
        }
        thumb.style.setProperty("--slim-x", `${box.right - THUMB_PX - THUMB_INSET}px`)
        thumb.style.setProperty("--slim-from", `${box.top}px`)
        thumb.style.setProperty("--slim-to", `${box.top + box.height - h}px`)
      }
      thumb.style.opacity = "1"
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    /*
      Round AK: the bar stays while the pointer is in its panel and glides
      out when the pointer leaves, instead of fading after a fixed linger
      with the pointer still there (the owner: "appear very smooth when I
      hover the sidebar, and smooth out when I hover out").
    */
    let inside = false
    const fadeLater = (ms: number) => {
      window.clearTimeout(hide)
      hide = window.setTimeout(() => {
        if (!drag && !inside && !thumb.matches(":hover")) thumb.style.opacity = "0"
      }, ms)
    }
    const show = (el: HTMLElement) => {
      current = el
      schedule()
      window.clearTimeout(hide)
      if (!inside) fadeLater(LINGER_MS)
    }

    const onScroll = (e: Event) => {
      const el = e.target instanceof HTMLElement ? e.target : null
      if (!el?.matches(SELECTOR)) return
      const now = performance.now()
      const going = driven && el === placedFor && now - lastScroll < GESTURE_GAP_MS
      lastScroll = now
      /* Mid gesture on the scroller it was placed for, the scroll moves the thumb: nothing is read or written. */
      if (going) {
        window.clearTimeout(hide)
        if (!inside) fadeLater(LINGER_MS)
        return
      }
      show(el)
    }
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      const target = e.target as Element | null
      if (target === thumb) return
      const el = target?.closest?.(SELECTOR) as HTMLElement | null
      if (el) {
        inside = true
        show(el)
      } else if (inside) {
        inside = false
        fadeLater(OUT_MS)
      }
    }
    const onLeaveWindow = (e: PointerEvent) => {
      if (e.relatedTarget) return
      inside = false
      fadeLater(OUT_MS)
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

    /* A list being wheeled takes no pointer until it rests (wheel-hold.ts). Not the section library's: that one is its own. */
    const letGo = holdHoverWhileWheeling(`${SELECTOR}:not([data-library-scroll])`, { attribute: WHEEL_LIST_HOLD_ATTRIBUTE })
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    document.addEventListener("pointerover", onOver, { passive: true })
    document.addEventListener("pointerout", onLeaveWindow, { passive: true })
    window.addEventListener("resize", schedule)
    thumb.addEventListener("pointerdown", onDown)
    thumb.addEventListener("pointermove", onMove)
    thumb.addEventListener("pointerup", onUp)
    thumb.addEventListener("pointercancel", onUp)
    return () => {
      letGo()
      html.classList.remove("slim-rail")
      if (driven) {
        html.style.removeProperty("timeline-scope")
        publishing?.style.removeProperty("scroll-timeline")
        thumb.removeAttribute("data-scroll-driven")
      }
      document.removeEventListener("scroll", onScroll, { capture: true })
      document.removeEventListener("pointerover", onOver)
      document.removeEventListener("pointerout", onLeaveWindow)
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
      className="pointer-events-auto fixed left-0 top-0 z-[60] cursor-default rounded-full bg-[rgba(100,116,139,0.30)] opacity-0 transition-[opacity,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[rgba(71,85,105,0.5)] data-[dragging]:bg-[rgba(71,85,105,0.58)] motion-reduce:transition-none"
      style={{ width: THUMB_PX, transform: "translate3d(-20px, 0, 0)" }}
    />
  )
}
