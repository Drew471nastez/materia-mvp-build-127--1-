"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MobileListingCard } from "./mobile-listing-card"
import { IosSpinner } from "./ios-spinner"
import { useLocale } from "@/components/locale-provider"

// Touch-driven vertical pager — one swipe always moves exactly one listing.
// The drag transform is written DIRECTLY to the DOM node during touchmove (no
// React state per move), so a full-screen image feed stays at full frame rate
// instead of re-rendering ~120×/second. React state only holds the settled
// index; the spring easing on release makes it feel TikTok-smooth.

const SWIPE_TRIGGER = 48 // px past which the page flips
const REFRESH_TRIGGER = 74 // px pull-down at the top that triggers refresh
// easeOutExpo — a fast, clean take-off that settles like glass into the next reel.
const SPRING = "transform 0.56s cubic-bezier(0.16, 1, 0.3, 1)"

export function ReelsPager({
  products,
  height,
  onRefresh,
}: {
  products: any[]
  height: number
  onRefresh: () => Promise<void>
}) {
  const { t } = useLocale()
  const [index, setIndex] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const trackRef = useRef<HTMLDivElement>(null)
  const spinnerRef = useRef<HTMLDivElement>(null)
  const start = useRef({ y: 0, x: 0, axis: null as null | "v" | "h" })
  const dragRef = useRef(0)
  const draggingRef = useRef(false)
  const indexRef = useRef(0)
  const refreshingRef = useRef(false)

  const h = height || 0
  const last = products.length - 1

  useEffect(() => {
    indexRef.current = index
  }, [index])
  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, last)))
  }, [last])

  // Write the transform straight to the DOM (called on every touchmove).
  const paint = useCallback(
    (drag: number) => {
      const el = trackRef.current
      if (el) {
        const offset = -(indexRef.current * h) + drag + (refreshingRef.current ? 58 : 0)
        el.style.transform = `translate3d(0, ${offset}px, 0)`
      }
      const sp = spinnerRef.current
      if (sp) {
        const o = refreshingRef.current
          ? 1
          : Math.min(1, Math.max(0, indexRef.current === 0 ? drag : 0) / 60)
        sp.style.opacity = String(o)
      }
    },
    [h],
  )

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshingRef.current) return
    const tch = e.touches[0]
    start.current = { y: tch.clientY, x: tch.clientX, axis: null }
    dragRef.current = 0
    draggingRef.current = true
    const el = trackRef.current
    if (el) el.style.transition = "none"
  }, [])

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (refreshingRef.current || !draggingRef.current) return
      const tch = e.touches[0]
      const dy = tch.clientY - start.current.y
      const dx = tch.clientX - start.current.x
      // Axis lock: a mostly-horizontal gesture belongs to the card's photo
      // gallery, so we bail and let it scroll natively.
      if (start.current.axis === null) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
          start.current.axis = "h"
          return
        }
        if (Math.abs(dy) > 6) start.current.axis = "v"
        else return
      }
      if (start.current.axis !== "v") return
      let d = dy
      // Rubber-band resistance at the ends (and the pull-to-refresh zone).
      if (indexRef.current === 0 && d > 0) d = d * 0.5
      if (indexRef.current >= last && d < 0) d = d * 0.35
      dragRef.current = d
      paint(d)
    },
    [last, paint],
  )

  const onTouchEnd = useCallback(async () => {
    if (refreshingRef.current || !draggingRef.current) return
    draggingRef.current = false
    const d = dragRef.current
    dragRef.current = 0
    start.current.axis = null

    const el = trackRef.current
    if (el) el.style.transition = SPRING

    // Pull-to-refresh from the very top.
    if (indexRef.current === 0 && d > REFRESH_TRIGGER) {
      setRefreshing(true)
      refreshingRef.current = true
      paint(0)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        refreshingRef.current = false
        setIndex(0)
        indexRef.current = 0
        paint(0)
      }
      return
    }

    let ni = indexRef.current
    if (d < -SWIPE_TRIGGER && indexRef.current < last) ni = indexRef.current + 1
    else if (d > SWIPE_TRIGGER && indexRef.current > 0) ni = indexRef.current - 1
    indexRef.current = ni
    setIndex(ni)
    paint(0) // spring from the drag position to the settled slot
  }, [last, onRefresh, paint])

  // Re-settle the transform when the height changes (e.g. rotation / measure).
  useEffect(() => {
    if (draggingRef.current) return
    const el = trackRef.current
    if (el) el.style.transition = "none"
    paint(0)
    // Restore the spring on the next frame so future moves animate.
    const r = requestAnimationFrame(() => {
      if (el) el.style.transition = SPRING
    })
    return () => cancelAnimationFrame(r)
  }, [h, paint])

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* iOS refresh spinner — behind the stack, revealed as it slides down */}
      <div ref={spinnerRef} className="pointer-events-none absolute inset-x-0 top-0 z-0 flex justify-center pt-3" style={{ opacity: 0 }}>
        <IosSpinner size={26} />
      </div>

      {/* Windowed: only the cards near the current index are mounted (each
          absolutely placed at its slot), so the DOM holds ~5 full-screen images
          instead of hundreds — the single biggest win for scroll smoothness. */}
      <div
        ref={trackRef}
        className="absolute inset-0 z-10 will-change-transform"
        style={{ transform: `translate3d(0, ${-(index * h) + (refreshing ? 58 : 0)}px, 0)`, transition: SPRING }}
      >
        {products.map((p, i) =>
          Math.abs(i - index) > 2 ? null : (
            <div key={p.id} className="absolute inset-x-0" style={{ top: i * h, height: h || undefined }}>
              <MobileListingCard product={p} priority={Math.abs(i - index) <= 1} active={i === index} />
            </div>
          ),
        )}
      </div>
    </div>
  )
}
