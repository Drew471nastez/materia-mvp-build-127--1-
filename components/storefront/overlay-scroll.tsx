"use client"

/**
 * ===========================================================================
 *  A SCROLLBAR THAT IS THERE WHEN IT IS NEEDED
 * ===========================================================================
 * The editor drawer's body scrolled with the platform's bar. `wb-slim-scroll`
 * was meant to slim it, but a browser that understands `scrollbar-width`
 * ignores every `::-webkit-scrollbar` rule beside it, so what Chrome drew was
 * its own thin bar with arrow buttons and a track: a second border down the
 * side of the form, and the heaviest thing in the drawer.
 *
 * This hides the platform's bar and draws a 6px rounded thumb over the
 * content instead, the way macOS and iOS do. It shows while the list moves,
 * while the pointer is over it and while it is being dragged, and fades away
 * otherwise. It takes no width, so the form's right edge is the same with or
 * without it.
 *
 * NOTHING HERE RENDERS WHILE SCROLLING. The thumb is one element whose
 * `transform` and `opacity` are written straight to the node, once a frame at
 * most; React draws the scroller once and never hears about a scroll.
 *
 * The thumb can be grabbed and dragged with a mouse. A finger never meets it:
 * on a touch screen the platform's own overlay indicator is already this, so
 * the native bar is left alone there and the thumb is not drawn.
 */

import * as React from "react"

import { cn } from "@/lib/utils"

/** How long the thumb stays after the list stops moving. */
const LINGER_MS = 900
/** A thumb shorter than this is hard to see and harder to grab. */
const MIN_THUMB = 32

/**
 * ===========================================================================
 *  THE THUMB ALONE, FOR A SCROLLER SOMEBODY ELSE DRAWS
 * ===========================================================================
 * `OverlayScroll` below is a scroller with its thumb. A list that already
 * owns its scroller (the builder's page menu, the link picker) takes the
 * thumb on its own: give the scroller `cp-overlay-scroll`, put this beside
 * it inside a `relative` box, and pass the scroller's ref. The thumb listens
 * to that element, takes no width, and shows while it moves or the pointer
 * is over the box they share.
 *
 * `tone="dark"` is a light thumb, for the dark menus.
 */
export function OverlayRail({
  scrollerRef,
  tone = "light",
  className,
}: {
  scrollerRef: React.RefObject<HTMLElement | null>
  tone?: "light" | "dark"
  className?: string
}) {
  const railRef = React.useRef<HTMLDivElement>(null)
  const thumbRef = React.useRef<HTMLDivElement>(null)
  const frame = React.useRef<number | null>(null)
  const hideTimer = React.useRef<number | null>(null)
  const geometry = React.useRef({ thumb: 0, travel: 0, range: 0 })
  const hovering = React.useRef(false)
  const dragging = React.useRef<{ y: number; top: number } | null>(null)

  const paint = React.useCallback(() => {
    frame.current = null
    const el = scrollerRef.current
    const rail = railRef.current
    const thumb = thumbRef.current
    if (!el || !rail || !thumb) return
    const view = el.clientHeight
    const full = el.scrollHeight
    const range = full - view
    if (range <= 1 || view <= 0) {
      rail.style.display = "none"
      geometry.current = { thumb: 0, travel: 0, range: 0 }
      return
    }
    rail.style.display = ""
    const railH = rail.clientHeight || view
    const h = Math.max(MIN_THUMB, Math.round((view / full) * railH))
    const travel = railH - h
    geometry.current = { thumb: h, travel, range }
    if (thumb.style.height !== `${h}px`) thumb.style.height = `${h}px`
    const y = travel * Math.min(1, Math.max(0, el.scrollTop / range))
    thumb.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`
  }, [scrollerRef])

  const schedule = React.useCallback(() => {
    if (frame.current == null) frame.current = requestAnimationFrame(paint)
  }, [paint])

  const show = React.useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    rail.dataset.visible = "true"
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null
      if (hovering.current || dragging.current) return
      if (railRef.current) railRef.current.dataset.visible = "false"
    }, LINGER_MS)
  }, [])

  React.useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    /* The box the scroller and this rail share: the pointer over either is "over the list". */
    const box = railRef.current?.parentElement ?? el
    const onScroll = () => { schedule(); show() }
    const onEnter = (e: PointerEvent) => { if (e.pointerType === "mouse") { hovering.current = true; schedule(); show() } }
    const onLeave = () => { hovering.current = false; show() }
    el.addEventListener("scroll", onScroll, { passive: true })
    box.addEventListener("pointerenter", onEnter)
    box.addEventListener("pointerleave", onLeave)
    /* The list grows and shrinks (a group opens, a search narrows it): the thumb follows. */
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null
    ro?.observe(el)
    for (const child of Array.from(el.children)) ro?.observe(child)
    const mo = typeof MutationObserver === "function" ? new MutationObserver(() => {
      for (const child of Array.from(el.children)) ro?.observe(child)
      schedule()
    }) : null
    mo?.observe(el, { childList: true })
    schedule()
    return () => {
      el.removeEventListener("scroll", onScroll)
      box.removeEventListener("pointerenter", onEnter)
      box.removeEventListener("pointerleave", onLeave)
      ro?.disconnect()
      mo?.disconnect()
      if (frame.current != null) cancelAnimationFrame(frame.current)
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current)
    }
  }, [scrollerRef, schedule, show])

  const onThumbDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const el = scrollerRef.current
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* moves still arrive */ }
    dragging.current = { y: e.clientY, top: el.scrollTop }
    railRef.current?.setAttribute("data-dragging", "true")
    show()
  }
  const onThumbMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragging.current
    const el = scrollerRef.current
    const { travel, range } = geometry.current
    if (!d || !el || travel <= 0) return
    el.scrollTop = d.top + ((e.clientY - d.y) / travel) * range
  }
  const onThumbUp = () => {
    if (!dragging.current) return
    dragging.current = null
    railRef.current?.removeAttribute("data-dragging")
    show()
  }

  return (
    <div ref={railRef} aria-hidden data-visible="false" data-tone={tone} className={cn("cp-overlay-rail", className)}>
      <div
        ref={thumbRef}
        className="cp-overlay-thumb"
        /* A press on the thumb is a drag, never a click on whatever is under it, nor a blur of the field a picker belongs to. */
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={onThumbDown}
        onPointerMove={onThumbMove}
        onPointerUp={onThumbUp}
        onPointerCancel={onThumbUp}
        onLostPointerCapture={onThumbUp}
      />
    </div>
  )
}

export function OverlayScroll({
  className,
  children,
  scrollerProps,
}: {
  /** Classes for the scrolling element itself (padding, spacing). */
  className?: string
  children: React.ReactNode
  scrollerProps?: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>
}) {
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        {...scrollerProps}
        className={cn("cp-overlay-scroll isolate min-h-0 flex-1 overflow-y-auto", className)}
      >
        {/* One child, so its size is what the thumb follows. */}
        <div className="space-y-5">{children}</div>
      </div>
      <OverlayRail scrollerRef={scrollerRef} />
    </div>
  )
}
