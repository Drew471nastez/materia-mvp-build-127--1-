"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { MobileListingCard } from "./mobile-listing-card"
import { IosSpinner } from "./ios-spinner"

// Touch-driven vertical pager for the TikTok-style feed.
//
// Everything here is REBASED around the current card. Card `i` is laid out at
// `(i - index) * h`, so the settled transform is always 0 and the track's layer
// is only ever RADIUS screens tall.
//
// That rebasing is the whole point. Laying cards out at their absolute offset
// (`i * h`) meant that by listing 40 the track was a ~32,000px-tall composited
// layer being translated by -32,000px. iOS tiles layers like that and degrades
// as they grow, which is why the scroll got progressively worse the further you
// went and eventually fell apart — and why it recovered if you came back up.
// Rebased, listing 400 costs exactly what listing 4 costs.
//
// The render window follows `index` IMMEDIATELY. It used to be deferred until
// the glide settled, with the pending commit cancelled on touchstart — so
// swiping quickly (which is just how you browse) starved it indefinitely, the
// window fell behind, and eventually a card you were landing on hadn't been
// mounted at all. It then mounted mid-glide, in view: the photo arrived and the
// caption snapped in on top of it. Following the index means every card you can
// reach is already mounted, whole, well before you get there.
//
// Native passive listeners + an imperative transform mean the glide itself does
// zero React work per frame.

const RADIUS = 3 // cards mounted either side of the current one
const DIST_TRIGGER = 54 // px drag distance that flips the page
const VEL_TRIGGER = 0.25 // px/ms flick velocity that flips the page
const REFRESH_TRIGGER = 80 // px pull-down at the top that refreshes
const REFRESH_HOLD = 58 // px the track holds at while refreshing
// Quart-out, not expo-out: expo dumps most of the travel in the first ~150ms and
// then crawls, which is what read as "snappy, then floaty". This decelerates
// evenly the whole way — the motion you can actually follow with your eye.
const GLIDE = "transform 0.56s cubic-bezier(0.25, 1, 0.5, 1)"

/** Live translateY of an element, mid-transition included. */
function currentY(el: HTMLElement): number {
  try {
    return new DOMMatrixReadOnly(getComputedStyle(el).transform).m42
  } catch {
    return NaN
  }
}

export function ReelsPager({
  products,
  height,
  onRefresh,
}: {
  products: any[]
  height: number
  onRefresh: () => Promise<void>
}) {
  const [index, setIndex] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const spinnerRef = useRef<HTMLDivElement>(null)

  const start = useRef({ y: 0, x: 0, axis: null as null | "v" | "h" })
  const dragRef = useRef(0)
  const velRef = useRef(0)
  const lastTRef = useRef(0)
  const draggingRef = useRef(false)
  const indexRef = useRef(0)
  const refreshingRef = useRef(false)
  // Residual offset when a drag begins mid-glide: how far the track visually is
  // from its settled slot. Without it, dropping the transition to follow the
  // finger snapped the track to its target — the jolt on fast repeat swipes.
  const carryRef = useRef(0)
  // Handed from the release to the layout effect so the rebase is invisible.
  const rebase = useRef<{ from: number; y: number } | null>(null)

  const h = height || 0
  const hRef = useRef(h)
  hRef.current = h
  const lastRef = useRef(0)
  lastRef.current = products.length - 1

  useEffect(() => {
    indexRef.current = index
  }, [index])
  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, products.length - 1)))
  }, [products.length])

  /** Settled transform for the current state — 0, or the refresh hold. */
  const resting = useCallback(() => (refreshingRef.current ? REFRESH_HOLD : 0), [])

  const paint = useCallback(
    (drag: number) => {
      const el = trackRef.current
      if (el) el.style.transform = `translate3d(0, ${resting() + drag + carryRef.current}px, 0)`
      const sp = spinnerRef.current
      if (sp) {
        sp.style.opacity = String(
          refreshingRef.current ? 1 : Math.min(1, Math.max(0, indexRef.current === 0 ? drag : 0) / 64),
        )
      }
    },
    [resting],
  )

  // Native passive touch listeners — driven entirely by refs.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return
      const t = e.touches[0]
      start.current = { y: t.clientY, x: t.clientX, axis: null }
      dragRef.current = 0
      velRef.current = 0
      lastTRef.current = e.timeStamp
      draggingRef.current = true
      const tr = trackRef.current
      if (tr) {
        // Pick the track up exactly where it is. Reading the live transform
        // BEFORE dropping the transition is what stops a mid-glide grab from
        // teleporting to the settled slot.
        const y = currentY(tr)
        carryRef.current = Number.isNaN(y) ? 0 : y - resting()
        tr.style.transition = "none"
        paint(0)
      }
    }

    const onMove = (e: TouchEvent) => {
      if (refreshingRef.current || !draggingRef.current) return
      const t = e.touches[0]
      const dy = t.clientY - start.current.y
      const dx = t.clientX - start.current.x
      if (start.current.axis === null) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
          start.current.axis = "h"
          return
        }
        if (Math.abs(dy) > 8) start.current.axis = "v"
        else return
      }
      if (start.current.axis !== "v") return
      let d = dy
      if (indexRef.current === 0 && d > 0) d = d * 0.5
      if (indexRef.current >= lastRef.current && d < 0) d = d * 0.35
      const now = e.timeStamp
      const dt = now - lastTRef.current
      if (dt > 0) velRef.current = (d - dragRef.current) / dt
      dragRef.current = d
      lastTRef.current = now
      paint(d)
    }

    const onEnd = () => {
      if (refreshingRef.current || !draggingRef.current) return
      draggingRef.current = false
      const d = dragRef.current
      const v = velRef.current
      const carry = carryRef.current
      dragRef.current = 0
      start.current.axis = null
      const tr = trackRef.current

      if (indexRef.current === 0 && d > REFRESH_TRIGGER) {
        setRefreshing(true)
        refreshingRef.current = true
        carryRef.current = 0
        if (tr) tr.style.transition = GLIDE
        paint(0)
        void onRefresh().finally(() => {
          refreshingRef.current = false
          setRefreshing(false)
          carryRef.current = 0
          const el2 = trackRef.current
          if (el2) {
            el2.style.transition = GLIDE
            el2.style.transform = "translate3d(0, 0, 0)"
          }
        })
        return
      }

      const goNext = (d < -DIST_TRIGGER || v < -VEL_TRIGGER) && indexRef.current < lastRef.current
      const goPrev = (d > DIST_TRIGGER || v > VEL_TRIGGER) && indexRef.current > 0
      const ni = goNext ? indexRef.current + 1 : goPrev ? indexRef.current - 1 : indexRef.current

      if (ni === indexRef.current) {
        // Stayed put — just ease back to the slot.
        carryRef.current = 0
        if (tr) tr.style.transition = GLIDE
        paint(0)
        return
      }

      // Page turn. The cards are about to be re-laid-out around `ni`, so hand
      // the layout effect where the track visually is; it re-anchors and glides
      // from there, so the rebase itself is never seen.
      rebase.current = { from: indexRef.current, y: d + carry }
      carryRef.current = 0
      indexRef.current = ni
      setIndex(ni)
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: true })
    el.addEventListener("touchend", onEnd, { passive: true })
    el.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
    }
  }, [paint, resting, onRefresh])

  // Re-anchor after every layout change. Runs before paint, so the frame the
  // cards move in is the same frame the transform compensates for it.
  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    const r = rebase.current
    rebase.current = null
    const rest = resting()

    if (!r) {
      // Height change / clamp — nothing is animating, just sit in the slot.
      el.style.transition = "none"
      el.style.transform = `translate3d(0, ${rest}px, 0)`
      const raf = requestAnimationFrame(() => {
        el.style.transition = GLIDE
      })
      return () => cancelAnimationFrame(raf)
    }

    // Card `r.from` was at 0 and appeared at `r.y`; it now sits at
    // `(r.from - index) * h`, so this offset leaves it exactly where the finger
    // left it. The forced reflow commits that before the glide is armed —
    // without it the browser coalesces both writes and animates from the wrong
    // place, which looks like a jump.
    el.style.transition = "none"
    el.style.transform = `translate3d(0, ${r.y + (index - r.from) * hRef.current}px, 0)`
    void el.offsetHeight
    el.style.transition = GLIDE
    el.style.transform = `translate3d(0, ${rest}px, 0)`
  }, [index, h, resting])

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden">
      {/* iOS refresh spinner — behind the stack, revealed as it slides down */}
      <div ref={spinnerRef} className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center pt-3" style={{ opacity: 0 }}>
        <IosSpinner size={26} />
      </div>

      {/* Transform is set imperatively only (never in JSX) so a stray React
          render can't reset it mid-glide. */}
      <div ref={trackRef} className="absolute inset-0 z-10 will-change-transform" style={{ transition: GLIDE }}>
        {products.map((p, i) =>
          Math.abs(i - index) > RADIUS ? null : (
            <div
              key={p.id}
              className="absolute inset-x-0 top-0"
              // Positioned by transform, not `top`: re-anchoring the window then
              // costs no layout, and the track's composited bounds stay pinned
              // around the current card instead of stretching from the top of the
              // list down to wherever you've scrolled to.
              style={{ transform: `translate3d(0, ${(i - index) * h}px, 0)`, height: h || undefined }}
            >
              {/* Every mounted card is a COMPLETE card — photo and overlay
                  together — and mounts a full RADIUS of screens before you can
                  reach it. Nothing can arrive late on a card you're looking at. */}
              <MobileListingCard product={p} priority={i === 0} active={i === index} />
            </div>
          ),
        )}
      </div>
    </div>
  )
}
