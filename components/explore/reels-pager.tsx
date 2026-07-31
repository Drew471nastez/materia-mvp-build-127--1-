"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { MobileListingCard } from "./mobile-listing-card"
import { IosSpinner } from "./ios-spinner"
import { useFeedPullRefresh } from "@/hooks/use-feed-pull-refresh"

// Vertical pager for the TikTok-style feed — driven by the OS, not by us.
//
// Every previous version of this moved the feed itself: touch listeners measured
// the drag, wrote a transform each frame, and eased to the next slot on release.
// That is a main-thread animation however carefully it's written, so ANY main
// thread work lands as a dropped frame — a React render, an image decode, a GC
// pause. All of those happen constantly in a feed of full-screen photos, which
// is why this kept feeling laggy no matter how the easing, the layer count or
// the mount scheduling were tuned. It was the wrong thing to tune.
//
// So the scroll is now a plain native scroll container with CSS scroll snapping.
// The gesture, the momentum and the snap all run on the compositor, where the
// main thread cannot stall them: if React is busy the scroll still moves at full
// frame rate and the content simply paints a moment later. This is also what the
// real apps do — there is no bespoke physics in TikTok's feed either.
//
// What's left for JS is bookkeeping only: read scrollTop to learn which card is
// current, and window the mounts around it. Every snap point exists at all times
// as a fixed-height slot, so the scroll geometry never shifts when cards mount
// or unmount — windowing can't disturb the gesture.

const RADIUS = 2 // cards mounted either side of the current one

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
  const indexRef = useRef(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const shiftRef = useRef<HTMLDivElement>(null)
  const spinnerRef = useRef<HTMLDivElement>(null)

  const h = height || 0
  const hRef = useRef(h)
  hRef.current = h

  // Which card is current, read straight off the native scroll position. The
  // listener is passive and coalesced to one read per frame, so it can never
  // slow the scroll down — at worst it reports a frame late.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let queued = false
    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        queued = false
        const step = hRef.current
        if (!step) return
        const i = Math.max(0, Math.min(products.length - 1, Math.round(el.scrollTop / step)))
        if (i !== indexRef.current) {
          indexRef.current = i
          setIndex(i)
        }
      })
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [products.length])

  // Keep the current card aligned when the viewport height changes (rotation,
  // browser chrome collapsing). Snapping alone would land on the nearest slot.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !h) return
    el.scrollTop = indexRef.current * h
  }, [h])

  // Refreshing returns you to the top of the new feed.
  const refresh = useCallback(async () => {
    await onRefresh()
    const el = scrollRef.current
    if (el) el.scrollTop = 0
    indexRef.current = 0
    setIndex(0)
  }, [onRefresh])

  // Same pull-to-refresh as the grid. The transform goes on a screen-sized
  // wrapper AROUND the scroller rather than on its content: the content is as
  // tall as the whole feed, and promoting that for the gesture would hand the
  // compositor an enormous texture for no reason.
  useFeedPullRefresh({
    scrollRef,
    contentRef: shiftRef,
    spinnerRef,
    onRefresh: refresh,
    enabled: true,
  })

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={spinnerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
        style={{ opacity: 0, transform: "translate3d(0, -40px, 0) scale(0.55)" }}
      >
        <IosSpinner size={26} color="rgba(255,255,255,0.92)" />
      </div>

      <div ref={shiftRef} className="h-full w-full">
        <div
          ref={scrollRef}
          className="h-full w-full overflow-y-scroll scrollbar-hide"
          style={{
            scrollSnapType: "y mandatory",
            // `none`, not `contain`: pull-to-refresh renders the overscroll
            // itself, and the native bounce would fight it.
            overscrollBehaviorY: "none",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
          }}
        >
          {/* Every slot is always present at a fixed height, so the scroll
              geometry is constant and mounting or unmounting cards inside them
              can't shift the snap points under the gesture. */}
          {products.map((p, i) => (
            <div
              key={p.id}
              style={{
                height: h || undefined,
                scrollSnapAlign: "start",
                // One card per swipe however hard you flick — the browser isn't
                // allowed to fly past a snap point.
                scrollSnapStop: "always",
              }}
            >
              {Math.abs(i - index) <= RADIUS ? (
                <MobileListingCard
                  product={p}
                  priority={i === 0}
                  active={i === index}
                  near={Math.abs(i - index) <= 1}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
