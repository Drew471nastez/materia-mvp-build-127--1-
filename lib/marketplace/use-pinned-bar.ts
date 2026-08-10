"use client"

import { useEffect, useRef, useState } from "react"

/**
 * ===========================================================================
 *  THE BAR THAT ARRIVES WHEN THE TITLE LEAVES
 * ===========================================================================
 *
 * Two screens need this and they need it to behave identically: a profile,
 * where scrolling takes the name and the controls away, and a listing, where
 * scrolling takes the photograph and the same three controls away. On both, the
 * moment the thing identifying the screen goes off the top, a bar carrying its
 * name and its controls comes down to stand in for it.
 *
 * It lives here rather than being written twice because the interesting part is
 * not the bar, it is WHEN it flips — and getting that wrong is invisible in
 * review and obvious in the hand.
 *
 * ---------------------------------------------------------------------------
 * NOT A SCROLL HANDLER
 * ---------------------------------------------------------------------------
 * A scroll listener runs on the main thread on every frame of every flick, on
 * screens that are already scrolling photographs, to compute a boolean that
 * changes twice a session. An IntersectionObserver on a zero-height sentinel
 * fires exactly on the crossings.
 *
 * ---------------------------------------------------------------------------
 * TWO OBSERVERS, AND THE SIGN OF THE MARGIN IS THE WHOLE THING
 * ---------------------------------------------------------------------------
 * With one observer and one line, the state flips the instant that line is
 * crossed — so anything leaving you sitting ON it (a slow drag, the tail of a
 * flick, an overscroll settling back) crosses it repeatedly, and each crossing
 * starts a 320ms slide that the next one reverses partway through. The judder is
 * not one animation played badly; it is several played over each other, none of
 * them finishing.
 *
 * So there are two lines with a dead band between them, and the margins are
 * POSITIVE. This is the part that is easy to get backwards and was:
 *
 *   negative rootMargin SHRINKS the root — it moves the observed line DOWN into
 *   the viewport. Written that way, the "show" observer fires its crossing at a
 *   sentinel top of about +56, and its own test asks for `top < 0`, which +56 is
 *   not. An observer only calls back on a crossing, so once that one has passed
 *   nothing fires again however far you scroll: the bar never appears at all.
 *
 *   positive GROWS the root upward, putting the line above the viewport top,
 *   which is where "the title has gone past" actually lives.
 *
 * SHOW_AT is the larger of the two, so the bar arrives only once the title is
 * properly gone, and leaves as soon as it is nearly back.
 */
const SHOW_AT = 56
const HIDE_AT = 8

export function usePinnedBar<T extends HTMLElement>() {
  const sentinel = useRef<T>(null)
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === "undefined") return

    const show = new IntersectionObserver(
      ([entry]) => {
        // Gone past, and well past. `boundingClientRect.top` is measured against
        // the real viewport rather than the grown root, so it is still the test
        // for direction: without it the bar also appears when the sentinel has
        // not been reached yet, which on a short page is most of the time.
        if (!entry.isIntersecting && entry.boundingClientRect.top < 0) setPinned(true)
      },
      { threshold: 0, rootMargin: `${SHOW_AT}px 0px 0px 0px` },
    )
    const hide = new IntersectionObserver(
      ([entry]) => {
        // Back in view near the top: the real title is about to be readable
        // again, so the stand-in should be gone before it is.
        if (entry.isIntersecting) setPinned(false)
      },
      { threshold: 0, rootMargin: `${HIDE_AT}px 0px 0px 0px` },
    )

    show.observe(el)
    hide.observe(el)
    return () => {
      show.disconnect()
      hide.disconnect()
    }
  }, [])

  return { sentinel, pinned }
}

/**
 * How much of the top of the screen a pinned bar is currently covering.
 *
 * Measured rather than stated, because its height is 52px plus whatever the
 * device's status-bar inset happens to be — a number only CSS knows. Zero when
 * no bar is up, which is the case where scrolling to y=0 is correct.
 */
export function pinnedOffset(): number {
  if (typeof document === "undefined") return 0
  const bar = document.querySelector<HTMLElement>('.profile-pinned[data-shown="true"]')
  return bar ? bar.getBoundingClientRect().height : 0
}
