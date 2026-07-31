"use client"

import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { MobileListingCard } from "./mobile-listing-card"
import { IosSpinner } from "./ios-spinner"
import { useFeedPullRefresh } from "@/hooks/use-feed-pull-refresh"

// Vertical pager for the TikTok-style feed — driven by the OS, not by us.
//
// Every earlier version moved the feed itself: touch listeners measured the drag,
// wrote a transform each frame, and eased to the next slot on release. That is a
// main-thread animation however carefully it's written, so ANY main-thread work
// lands as a dropped frame — a React render, an image decode, a GC pause. In a
// feed of full-screen photos those happen constantly, which is why tuning the
// easing, the layer count and the mount scheduling never fixed the feel.
//
// The scroll is a plain native scroll container with CSS scroll snapping. The
// gesture, the momentum and the snap run on the compositor, where the main thread
// cannot stall them: if React is busy the scroll still moves at full frame rate
// and the content simply paints a moment later.
//
// JS does bookkeeping only: read scrollTop for the current card, window the
// mounts around it. Every snap point exists at all times as a fixed-height slot,
// so the scroll geometry is constant and mounting can't shift snap points under
// the gesture.

const RADIUS = 2 // cards mounted either side of the current one
const SETTLE = 0.045 // how far a photo is zoomed when its card is a screen away

/** True when the browser can run the photo settle off the scroll timeline. */
function hasScrollTimeline() {
  try {
    return typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()")
  } catch {
    return false
  }
}

// Memoised so a change of index re-renders the handful of slots that actually
// changed rather than reconciling every listing in the feed. All the slots have
// to exist — they are the snap points — but they don't all have to be rebuilt.
const ReelSlot = memo(function ReelSlot({
  product,
  h,
  mounted,
  active,
  near,
  priority,
}: {
  product: any
  h: number
  mounted: boolean
  active: boolean
  near: boolean
  priority: boolean
}) {
  return (
    <div
      style={{
        height: h || undefined,
        scrollSnapAlign: "start",
        // One card per swipe however hard you flick — the browser isn't allowed
        // to fly past a snap point.
        scrollSnapStop: "always",
      }}
    >
      {mounted ? (
        <MobileListingCard product={product} priority={priority} active={active} near={near} />
      ) : null}
    </div>
  )
})

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

  // Only drive the settle from JS where the browser can't do it from the scroll
  // timeline itself. Where it can, this stays false and the whole effect is
  // compositor-side (see `.reel-photo` in globals.css).
  const driveSettle = useRef(false)
  useEffect(() => {
    driveSettle.current = !hasScrollTimeline()
  }, [])

  // Last scale written per element, so a frame that wouldn't change anything
  // doesn't touch the DOM at all. Style writes invalidate, and this runs on every
  // scroll frame — most of which land on the same rounded value.
  const painted = useRef(new WeakMap<HTMLElement, number>())

  /** Zoom each nearby photo by how far its card is from resting. */
  const paintSettle = useCallback((el: HTMLElement, top: number, step: number) => {
    const centre = Math.round(top / step)
    for (let i = centre - 1; i <= centre + 1; i++) {
      const slot = el.children[i] as HTMLElement | undefined
      const photo = slot?.querySelector<HTMLElement>(".reel-photo")
      if (!photo) continue
      const away = Math.min(1, Math.abs(top - i * step) / step)
      const scale = Math.round((1 + away * SETTLE) * 1e4) / 1e4
      if (painted.current.get(photo) === scale) continue
      painted.current.set(photo, scale)
      photo.style.transform = `scale(${scale})`
    }
  }, [])

  // Which card is current, read straight off the native scroll position. The
  // listener is passive and coalesced to one read per frame, so it can never slow
  // the scroll — at worst it reports a frame late.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let queued = false
    const read = () => {
      queued = false
      const step = hRef.current
      if (!step) return
      const top = el.scrollTop
      if (driveSettle.current) paintSettle(el, top, step)
      const i = Math.max(0, Math.min(products.length - 1, Math.round(top / step)))
      if (i !== indexRef.current) {
        indexRef.current = i
        // Non-urgent: this only drives windowing and the active flag, and the
        // window is two screens deep either side. Letting React interrupt it
        // keeps the main thread free for image decode during the scroll instead
        // of committing a render in the middle of it.
        startTransition(() => setIndex(i))
      }
    }
    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(read)
    }
    read() // seed the resting state
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [products.length, paintSettle])

  // Newly mounted photos have no transform until the next scroll frame; set them
  // as they appear so nothing is briefly at the wrong zoom.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !driveSettle.current || !hRef.current) return
    paintSettle(el, el.scrollTop, hRef.current)
  }, [index, paintSettle])

  // ---- Trackpad / mouse wheel ----
  // A wheel over CSS scroll-snap is abrupt: each notch jumps and the snap yanks
  // it into place, which is nothing like the finger it was tuned for. So on a
  // wheel we take over and animate one listing per gesture. A short lock after
  // each move means a trackpad's flurry of small deltas is a single, smooth
  // listing change rather than a scramble through five of them.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let lockedUntil = 0

    const onWheel = (e: WheelEvent) => {
      const step = hRef.current
      if (!step) return
      // Pulling down at the very top belongs to pull-to-refresh, not to us.
      if (el.scrollTop <= 0 && e.deltaY < 0) return
      if (Math.abs(e.deltaY) < 2) return
      // Always prevent, even while locked: letting the native scroll through
      // mid-animation is what would make it stutter.
      e.preventDefault()
      const now = performance.now()
      if (now < lockedUntil) return
      const last = Math.max(0, products.length - 1)
      const next = Math.max(0, Math.min(last, indexRef.current + (e.deltaY > 0 ? 1 : -1)))
      if (next === indexRef.current) return
      lockedUntil = now + 520
      el.scrollTo({ top: next * step, behavior: "smooth" })
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
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
          {products.map((p, i) => (
            <ReelSlot
              key={p.id}
              product={p}
              h={h}
              mounted={Math.abs(i - index) <= RADIUS}
              active={i === index}
              near={Math.abs(i - index) <= 1}
              priority={i === 0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
