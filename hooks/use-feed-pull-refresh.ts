"use client"

import { useCallback, useEffect, useRef } from "react"

// Imperative, iOS-grade pull-to-refresh for the grid feed.
//
// Three bugs this exists to kill:
//
// 1. "Sometimes it doesn't work after switching grid ↔ TikTok."
//    The old hook attached its listeners once. Switching views unmounts the
//    grid's scroll container, so the listeners stayed bound to a dead element.
//    Here the binding is re-verified after EVERY render (cheap identity check),
//    so it always follows the live node — no matter why it remounted.
//
// 2. "It blocks mid / doesn't follow the finger."
//    WebKit hands a touch gesture to the compositor the moment the first
//    touchmove goes unprevented; every later preventDefault() is ignored, so the
//    native rubber-band fought our transform and the pull stuttered. So the
//    gesture is ARMED at touchstart (only when already at the top) and
//    preventDefault() fires on the very first real move — the browser never
//    takes it over.
//
// 3. "It's not smooth at all."
//    The old hook pushed pullDistance through React state, re-rendering the
//    whole feed ~120x/s. Nothing here touches React during a gesture: the
//    transform, opacity and spinner are written straight to the DOM, so a pull
//    is one composited layer moving.

const SPRING = "transform 0.62s cubic-bezier(0.16, 1, 0.3, 1)"
const SPIN_TWEEN = "opacity 0.32s ease, transform 0.62s cubic-bezier(0.16, 1, 0.3, 1)"
const TRIGGER = 66 // travel past which a release refreshes
const MAX = 130 // asymptotic travel ceiling
const HOLD = 58 // travel the content rests at while refreshing
const MIN_SPIN = 650 // ms the spinner is guaranteed to show, so it never flashes
// The indicator rides `offsetTop - SPIN_LIFT` below the content's top edge. With
// a header above it (the category bar) that parks it behind the header; with no
// header it parks it above the frame, where the feed area's overflow clips it.
// Either way it is invisible at rest and slides into the band the pull opens.
// Mirrors the initial inline transform on the spinner node in mobile-feed.tsx.
const SPIN_LIFT = 40

/** iOS rubber-band: starts near 1:1, resists progressively, asymptotes at MAX. */
function resist(dy: number) {
  return MAX * (1 - Math.exp(-dy / (MAX * 1.35)))
}

export function useFeedPullRefresh({
  scrollRef,
  contentRef,
  spinnerRef,
  onRefresh,
  enabled,
  offsetTop = 0,
}: {
  scrollRef: React.RefObject<HTMLElement | null>
  contentRef: React.RefObject<HTMLElement | null>
  spinnerRef: React.RefObject<HTMLElement | null>
  onRefresh: () => Promise<void>
  enabled: boolean
  /** Height of any header overlaying the top of the scroller (the category bar). */
  offsetTop?: number
}) {
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  // Read through a ref, not the closure. The touch handlers are only re-bound
  // when the scroll ELEMENT changes, so a handler installed while the category
  // bar was showing kept using its 58px offset after switching to Saved or
  // Following — where there is no bar. The spinner then sat 58px lower than the
  // gap being opened, i.e. on top of the listings. That's the overlap.
  const offsetRef = useRef(offsetTop)
  offsetRef.current = offsetTop

  const attached = useRef<HTMLElement | null>(null)
  const detach = useRef<(() => void) | null>(null)
  const spinBars = useRef<HTMLElement | null>(null)
  const busy = useRef(false)

  const bars = useCallback(() => {
    if (!spinBars.current) spinBars.current = spinnerRef.current?.querySelector<HTMLElement>(".ios-spin") ?? null
    return spinBars.current
  }, [spinnerRef])

  // Single write point for a frame of the gesture.
  const paint = useCallback(
    (dist: number, spinning: boolean) => {
      const gap = spinning ? HOLD : dist
      const c = contentRef.current
      if (c) c.style.transform = `translate3d(0, ${gap}px, 0)`
      const s = spinnerRef.current
      if (s) {
        // Track the content's top edge so the indicator is always in the clean
        // white band the pull opens up — never behind the bar, never on the grid.
        const y = gap + offsetRef.current - SPIN_LIFT
        const p = Math.min(1, dist / TRIGGER)
        // Fades in as it clears the bar and reads fully solid right as the pull
        // crosses the trigger — so "it's armed" is legible without a label.
        s.style.opacity = String(spinning ? 1 : Math.min(1, Math.max(0, (dist - 24) / 42)))
        s.style.transform = spinning
          ? `translate3d(0, ${y}px, 0) scale(1) rotate(0deg)`
          : // Winds up as you pull — the indicator visibly "charges", then hands
            // over to the real spin on release. Straight out of UIRefreshControl.
            `translate3d(0, ${y}px, 0) scale(${0.55 + p * 0.45}) rotate(${p * 150}deg)`
      }
      const b = bars()
      if (b) b.style.animationPlayState = spinning ? "running" : "paused"
    },
    [contentRef, spinnerRef, bars],
  )

  useEffect(() => {
    // No dep array on purpose: this re-verifies after every render that we're
    // still bound to the live scroll node. Remounts (grid <-> reels, tab churn,
    // route refresh) can't leave us listening to a detached element.
    const target = enabled ? scrollRef.current : null
    if (target === attached.current) return

    detach.current?.()
    detach.current = null
    attached.current = target
    spinBars.current = null

    // Leaving the grid — drop any inline styling so the next mount starts clean.
    if (!target) {
      const c = contentRef.current
      if (c) {
        c.style.transition = ""
        c.style.transform = "translate3d(0, 0, 0)"
        c.style.willChange = ""
      }
      const s = spinnerRef.current
      if (s) {
        s.style.transition = ""
        s.style.opacity = "0"
      }
      busy.current = false
      return
    }

    const el = target
    const g = { y0: 0, x0: 0, dist: 0, armed: false, pulling: false }

    // Resting state: hidden, wound back, bars parked. Keeping the CSS spin
    // paused until a refresh actually starts means the indicator only ever
    // animates when it means something.
    paint(0, false)

    const tween = (on: boolean) => {
      const c = contentRef.current
      if (c) c.style.transition = on ? SPRING : "none"
      const s = spinnerRef.current
      if (s) s.style.transition = on ? SPIN_TWEEN : "none"
    }

    const layer = (on: boolean) => {
      const c = contentRef.current
      // Promote only for the duration of the gesture — a permanent will-change
      // on a long grid keeps a large layer alive and costs scroll performance.
      if (c) c.style.willChange = on ? "transform" : ""
    }

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1) return
      const t = e.touches[0]
      g.y0 = t.clientY
      g.x0 = t.clientX
      g.dist = 0
      g.pulling = false
      // Arm only if we're already at the top. Deciding here (not mid-gesture) is
      // what makes preventDefault() on the first move actually stick in WebKit.
      g.armed = el.scrollTop <= 0
    }

    const onMove = (e: TouchEvent) => {
      if (!g.armed || busy.current) return
      const t = e.touches[0]
      const dy = t.clientY - g.y0
      const dx = t.clientX - g.x0

      if (!g.pulling) {
        // Horizontal intent (category rail, card gallery) — never our gesture.
        if (Math.abs(dx) > Math.abs(dy)) {
          g.armed = false
          return
        }
        // Scrolling down instead — hand the gesture back to the browser for good,
        // so it can't half-engage later in the same drag.
        if (dy <= 0) {
          g.armed = false
          return
        }
        if (dy < 3) return // jitter, but still ours
        g.pulling = true
        g.y0 = t.clientY // start travel from here → no jump on engage
        tween(false)
        layer(true)
      }

      /**
       * THE FINGER CAME BACK UP. Give the gesture back.
       *
       * Everything above only runs while `!g.pulling`, so once the pull had
       * engaged there was no way out of it: every remaining move in that drag
       * called preventDefault() and clamped the distance at zero. Pull down a
       * centimetre, change your mind, flick up — and the feed does not move for
       * the rest of that swipe. It reads as the scroll randomly not working,
       * and it is random, because it turns on whether the first few pixels of
       * your thumb happened to go down before they went up.
       *
       * Three pixels is all it takes to arm, which at the top of a feed is
       * ordinary thumb jitter rather than an intention.
       *
       * So: back at or above where the pull began, this is a scroll. Spring the
       * content home, unarm for the rest of the drag, and stop preventing —
       * whether WebKit can still resume the native scroll within this same
       * sequence or not, the screen is no longer held down and the NEXT swipe
       * is guaranteed clean, which is the part that was failing.
       */
      if (t.clientY - g.y0 <= 0) {
        g.pulling = false
        g.armed = false
        g.dist = 0
        tween(true)
        paint(0, false)
        layer(false)
        return
      }

      e.preventDefault() // owns the gesture from the first real move onward
      g.dist = resist(Math.max(0, t.clientY - g.y0))
      paint(g.dist, false)
    }

    /** Shared by both input paths: decide, then either refresh or glide home. */
    const release = (dist: number) => {
      tween(true)

      if (dist < TRIGGER) {
        paint(0, false) // didn't reach it — glide home
        layer(false)
        return
      }

      busy.current = true
      paint(0, true) // spring up to the hold and start spinning
      const started = performance.now()
      const settle = () => {
        busy.current = false
        tween(true)
        paint(0, false)
        layer(false)
      }
      void onRefreshRef.current()
        .catch(() => {})
        .finally(() => {
          // Guarantee the spinner stays legible even when the refresh returns
          // instantly — a one-frame flash reads as "it didn't do anything".
          const left = MIN_SPIN - (performance.now() - started)
          if (left > 0) window.setTimeout(settle, left)
          else settle()
        })
    }

    const onEnd = () => {
      if (!g.pulling) {
        g.armed = false
        return
      }
      const dist = g.dist
      g.pulling = false
      g.armed = false
      g.dist = 0
      release(dist)
    }

    // ---- Trackpad / mouse wheel ----
    // The same gesture for anyone without a touchscreen: keep scrolling up once
    // you're already at the top and the feed pulls down exactly as it does under
    // a finger. A wheel has no "finger lifted" event, so the release is a short
    // idle timeout — long enough not to cut a trackpad's momentum in half.
    let wheelRaw = 0
    let wheelIdle: ReturnType<typeof setTimeout> | null = null

    const endWheel = () => {
      if (wheelIdle) {
        clearTimeout(wheelIdle)
        wheelIdle = null
      }
      if (wheelRaw <= 0) return
      const dist = resist(wheelRaw)
      wheelRaw = 0
      release(dist)
    }

    const onWheel = (e: WheelEvent) => {
      if (busy.current) return
      // Only once we're at the top and the gesture is upward — otherwise this is
      // an ordinary scroll and must be left completely alone.
      if (el.scrollTop > 0 || e.deltaY >= 0) {
        if (wheelRaw > 0) endWheel()
        return
      }
      e.preventDefault()
      if (wheelRaw === 0) {
        tween(false)
        layer(true)
      }
      wheelRaw += -e.deltaY
      paint(resist(wheelRaw), false)
      if (wheelIdle) clearTimeout(wheelIdle)
      wheelIdle = setTimeout(endWheel, 140)
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd, { passive: true })
    el.addEventListener("touchcancel", onEnd, { passive: true })
    el.addEventListener("wheel", onWheel, { passive: false })
    detach.current = () => {
      if (wheelIdle) clearTimeout(wheelIdle)
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
      el.removeEventListener("wheel", onWheel)
    }
  })

  useEffect(
    () => () => {
      detach.current?.()
      detach.current = null
      // Clearing this matters: without it a remount (StrictMode's double-invoke,
      // or a parent swapping the subtree) would see the stale node still marked
      // as attached and skip re-binding — the exact silent-death this hook is
      // meant to prevent.
      attached.current = null
    },
    [],
  )
}
