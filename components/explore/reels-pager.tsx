"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MobileListingCard } from "./mobile-listing-card"
import { IosSpinner } from "./ios-spinner"
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh"

// Native vertical pager — one full-screen listing per snap point.
//
// We deliberately use the browser's OWN scroll engine (CSS scroll-snap +
// momentum) rather than a hand-rolled transform pager: it runs entirely on the
// compositor, so the swipe has the exact buttery, inertia-driven feel of
// TikTok / Reels / Shorts, with zero main-thread work per frame.
//   - scroll-snap-type: y mandatory  → always rests exactly on a listing
//   - scroll-snap-stop: always       → one swipe = one listing (no skipping)
//   - overscroll-behavior: contain   → no page bounce bleeding through
// Only the ~5 listings around the current index mount their heavy media; the
// rest keep their full-height slot (so scroll geometry is exact) but stay empty.

export function ReelsPager({
  products,
  height,
  onRefresh,
}: {
  products: any[]
  height: number
  onRefresh: () => Promise<void>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const [index, setIndex] = useState(0)

  const h = height || 0
  const last = products.length - 1

  const { pullDistance, phase } = usePullToRefresh(scrollRef, onRefresh, { threshold: 70, maxPull: 110 })
  const pullOffset = phase === "refreshing" ? 56 : pullDistance

  // Track the current listing from the scroll position (rAF-throttled).
  const onScroll = useCallback(() => {
    if (rafRef.current || !h) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const el = scrollRef.current
      if (!el) return
      const i = Math.max(0, Math.min(last, Math.round(el.scrollTop / h)))
      setIndex((prev) => (prev === i ? prev : i))
    })
  }, [h, last])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="relative h-full w-full overflow-y-scroll scrollbar-hide"
      style={{
        scrollSnapType: "y mandatory",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
        scrollbarWidth: "none",
      }}
    >
      {/* Pull-to-refresh spinner (revealed as the stack slides down) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center pt-3"
        style={{ opacity: phase === "refreshing" ? 1 : Math.min(1, pullDistance / 60) }}
      >
        <IosSpinner size={26} />
      </div>

      <div
        style={{
          transform: pullOffset ? `translate3d(0, ${pullOffset}px, 0)` : undefined,
          transition: phase === "pulling" || phase === "ready" ? "none" : "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
          willChange: pullOffset ? "transform" : undefined,
        }}
      >
        {products.map((p, i) => (
          <div
            key={p.id}
            className="w-full"
            style={{ height: h || undefined, scrollSnapAlign: "start", scrollSnapStop: "always" }}
          >
            {Math.abs(i - index) <= 2 ? (
              <MobileListingCard product={p} priority={Math.abs(i - index) <= 1} active={i === index} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
