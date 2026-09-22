"use client"

import { useEffect, useLayoutEffect, useRef } from "react"

/**
 * ===========================================================================
 *  THE METRIC STRIP: IT FOLLOWS THE TAB YOU CHOSE, AND IT KEEPS YOUR SWIPE
 * ===========================================================================
 * Four tabs above each chart, in a row that scrolls sideways on a phone and
 * is a four column grid on a desktop. Two things were wrong with it.
 *
 * IT DID NOT FOLLOW. The fourth tab is off the edge, so tapping along the row
 * left the tab just chosen half out of sight and everything past it hidden
 * until you dragged the row yourself.
 *
 * AND THE DRAG SOMETIMES WENT TO THE PAGE. "Sometimes it doesn't work, it
 * thinks I want to scroll up or down." That is the browser arbitrating: with
 * both axes permitted it waits for movement, decides which scroller the
 * gesture belongs to, and on a row 72px tall inside a long page it decides
 * vertical on anything but a dead flat swipe. Once it has decided, the rest
 * of that gesture belongs to the page whatever your thumb then does.
 *
 * So the strip decides for itself, which is the same thing the chart does one
 * card below with SLOP_X and SLOP_Y. The cone is deliberately generous: a
 * swipe up to about 52 degrees off horizontal is a sideways one, because on
 * this row that is what it is meant to be. Anything steeper is handed
 * straight back and never touched again for the rest of the gesture, so
 * scrolling the page off the strip keeps working exactly as it did.
 */

/** How much of the next tab to bring into view: enough to read as "more that way". */
const PEEK_PX = 40

/**
 * How far a finger travels before the gesture is given to one scroller or the
 * other. Small, because the browser makes its own decision at around this
 * distance and the first `preventDefault` after that is already too late.
 */
const DECIDE_PX = 5

/**
 * The cone. `|dx| * 1.3 > |dy|` is everything within about 52 degrees of
 * horizontal. Wider than 45 on purpose — the complaint was sideways swipes
 * being read as vertical — but nowhere near wide enough to swallow the
 * downward swipe that is meant to scroll the page.
 */
const SIDEWAYS_BIAS = 1.3

/** A flick carries on afterwards, losing this much of its speed each frame. */
const GLIDE_DECAY = 0.94
/** And stops when it is moving less than this, which is under a pixel a frame. */
const GLIDE_STOP = 0.4

export function useTabStrip<T extends HTMLElement>(active: string, order: readonly string[]) {
  const ref = useRef<T>(null)
  const previous = useRef(active)
  const glide = useRef(0)

  /* ── it follows the tab you chose ──────────────────────────────────────── */
  useLayoutEffect(() => {
    const from = previous.current
    if (from === active) return
    previous.current = active

    const strip = ref.current
    if (!strip) return
    /* Nothing hidden, nothing to reveal: the desktop grid lands here too. */
    if (strip.scrollWidth <= strip.clientWidth + 1) return

    const tab = strip.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`)
    if (!tab) return

    const was = order.indexOf(from)
    const now = order.indexOf(active)
    if (was < 0 || now < 0 || was === now) return

    /* A flick still running would fight the reveal, and win at first. */
    cancelAnimationFrame(glide.current)

    /*
      offsetLeft is measured from the strip itself, which is `position:
      relative`, so it is already in the same coordinates as scrollLeft. Using
      bounding rectangles here would mean subtracting one scrolled box from
      another and carrying the sub-pixel error into the target.
    */
    const visibleLeft = strip.scrollLeft
    const visibleRight = visibleLeft + strip.clientWidth
    const tabLeft = tab.offsetLeft
    const tabRight = tabLeft + tab.offsetWidth

    let target = visibleLeft
    if (now > was) {
      /* Moving right: bring its right edge in, plus the next tab's edge. */
      const hidden = tabRight + PEEK_PX - visibleRight
      if (hidden > 0) target = visibleLeft + hidden
    } else {
      /* Moving left: the same, mirrored. */
      const hidden = visibleLeft - (tabLeft - PEEK_PX)
      if (hidden > 0) target = visibleLeft - hidden
    }

    target = Math.max(0, Math.min(target, strip.scrollWidth - strip.clientWidth))
    if (Math.abs(target - visibleLeft) < 1) return

    /*
      The browser's own smooth scroll, not a hand-rolled one. It is the only
      scroll here that nothing is competing with, a finger landing on the row
      interrupts it for free, and animating scrollLeft by hand for it would be
      main-thread work bought for nothing.
    */
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    strip.scrollTo({ left: target, behavior: calm ? "auto" : "smooth" })
  }, [active, order])

  /* ── and it keeps a sideways swipe ─────────────────────────────────────── */
  useEffect(() => {
    const strip = ref.current
    if (!strip) return

    let startX = 0
    let startY = 0
    let startScroll = 0
    let lastX = 0
    let lastAt = 0
    let speed = 0
    /** null while the gesture is still anyone's; then whose it is. */
    let owner: "strip" | "page" | null = null

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      cancelAnimationFrame(glide.current)
      const touch = e.touches[0]
      startX = lastX = touch.clientX
      startY = touch.clientY
      startScroll = strip.scrollLeft
      lastAt = e.timeStamp
      speed = 0
      owner = null
    }

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const touch = e.touches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY

      if (owner === null) {
        if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return
        owner = Math.abs(dx) * SIDEWAYS_BIAS > Math.abs(dy) ? "strip" : "page"
      }
      /*
        Handed back, and not asked about again. Once a gesture is the page's
        it stays the page's: a thumb that curls sideways halfway down a scroll
        must not snatch the row out from under it.
      */
      if (owner === "page") return

      /*
        Ours, so the page is told no. This is why the listener is not passive:
        a sideways swipe on this row scrolls this row and nothing else.
      */
      if (e.cancelable) e.preventDefault()

      const dt = e.timeStamp - lastAt
      if (dt > 0) speed = (touch.clientX - lastX) / dt
      lastX = touch.clientX
      lastAt = e.timeStamp
      strip.scrollLeft = startScroll - dx
    }

    const onEnd = () => {
      const mine = owner === "strip"
      owner = null
      if (!mine) return
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

      /*
        A flick carries on. Without it the row stops dead under your thumb,
        which is the one thing that makes a hand-driven scroller feel unlike
        every other scroller on the phone. Pixels per frame, from pixels per
        millisecond at sixty frames a second, and the sign flips because a
        finger moving right scrolls the content left.
      */
      let perFrame = -speed * 16
      const step = () => {
        if (Math.abs(perFrame) < GLIDE_STOP) return
        const before = strip.scrollLeft
        strip.scrollLeft = before + perFrame
        /* Ran out of row: stop rather than grind against the end. */
        if (strip.scrollLeft === before) return
        perFrame *= GLIDE_DECAY
        glide.current = requestAnimationFrame(step)
      }
      glide.current = requestAnimationFrame(step)
    }

    strip.addEventListener("touchstart", onStart, { passive: true })
    strip.addEventListener("touchmove", onMove, { passive: false })
    strip.addEventListener("touchend", onEnd, { passive: true })
    strip.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      cancelAnimationFrame(glide.current)
      strip.removeEventListener("touchstart", onStart)
      strip.removeEventListener("touchmove", onMove)
      strip.removeEventListener("touchend", onEnd)
      strip.removeEventListener("touchcancel", onEnd)
    }
  }, [])

  return ref
}
