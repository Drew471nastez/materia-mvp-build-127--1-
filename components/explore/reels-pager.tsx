"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MobileListingCard } from "./mobile-listing-card"
import { IosSpinner } from "./ios-spinner"

// Touch-driven vertical pager with a long, gliding spring.
//
// Native scroll-snap gives the OS's quick snap (feels abrupt and can't be
// slowed). To get a slow, buttery GLIDE between listings we drive the transform
// ourselves: the finger moves it 1:1 (written straight to the DOM, no React per
// frame), and on release a long easeOutExpo spring carries it smoothly to the
// next reel. A quick flick flips via VELOCITY even on a short drag, exactly like
// TikTok. Only ~5 listings mount their media (windowed) so it never lags.

const DIST_TRIGGER = 56 // px drag distance that flips the page
const VEL_TRIGGER = 0.26 // px/ms flick velocity that flips the page
const REFRESH_TRIGGER = 80 // px pull-down at the top that refreshes
const GLIDE = "transform 0.72s cubic-bezier(0.19, 1, 0.22, 1)" // long, glassy settle

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

  const trackRef = useRef<HTMLDivElement>(null)
  const spinnerRef = useRef<HTMLDivElement>(null)
  const startRef = useRef({ y: 0, x: 0, axis: null as null | "v" | "h" })
  const dragRef = useRef(0)
  const velRef = useRef(0)
  const lastTRef = useRef(0)
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
        sp.style.opacity = String(
          refreshingRef.current ? 1 : Math.min(1, Math.max(0, indexRef.current === 0 ? drag : 0) / 64),
        )
      }
    },
    [h],
  )

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshingRef.current) return
    const t = e.touches[0]
    startRef.current = { y: t.clientY, x: t.clientX, axis: null }
    dragRef.current = 0
    velRef.current = 0
    lastTRef.current = e.timeStamp
    draggingRef.current = true
    const el = trackRef.current
    if (el) el.style.transition = "none"
  }, [])

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (refreshingRef.current || !draggingRef.current) return
      const t = e.touches[0]
      const dy = t.clientY - startRef.current.y
      const dx = t.clientX - startRef.current.x
      // Axis lock: a mostly-horizontal gesture belongs to the photo gallery.
      if (startRef.current.axis === null) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
          startRef.current.axis = "h"
          return
        }
        if (Math.abs(dy) > 8) startRef.current.axis = "v"
        else return
      }
      if (startRef.current.axis !== "v") return
      let d = dy
      // Rubber-band resistance at the ends / pull-to-refresh zone.
      if (indexRef.current === 0 && d > 0) d = d * 0.5
      if (indexRef.current >= last && d < 0) d = d * 0.35
      // Track instantaneous velocity for flick detection (timeStamp is monotonic).
      const now = e.timeStamp
      const dt = now - lastTRef.current
      if (dt > 0) velRef.current = (d - dragRef.current) / dt
      dragRef.current = d
      lastTRef.current = now
      paint(d)
    },
    [last, paint],
  )

  const onTouchEnd = useCallback(async () => {
    if (refreshingRef.current || !draggingRef.current) return
    draggingRef.current = false
    const d = dragRef.current
    const v = velRef.current
    dragRef.current = 0
    startRef.current.axis = null

    const el = trackRef.current
    if (el) el.style.transition = GLIDE

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

    // Flip on either a long-enough drag OR a quick flick (velocity).
    let ni = indexRef.current
    const goNext = (d < -DIST_TRIGGER || v < -VEL_TRIGGER) && indexRef.current < last
    const goPrev = (d > DIST_TRIGGER || v > VEL_TRIGGER) && indexRef.current > 0
    if (goNext) ni = indexRef.current + 1
    else if (goPrev) ni = indexRef.current - 1
    indexRef.current = ni
    setIndex(ni)
    paint(0) // glide from the drag position to the settled slot
  }, [last, onRefresh, paint])

  // Re-settle the transform when the height changes (measure / rotation).
  useEffect(() => {
    if (draggingRef.current) return
    const el = trackRef.current
    if (el) el.style.transition = "none"
    paint(0)
    const r = requestAnimationFrame(() => {
      if (el) el.style.transition = GLIDE
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
      <div ref={spinnerRef} className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center pt-3" style={{ opacity: 0 }}>
        <IosSpinner size={26} />
      </div>

      <div
        ref={trackRef}
        className="absolute inset-0 z-10 will-change-transform"
        style={{ transform: `translate3d(0, ${-(index * h) + (refreshing ? 58 : 0)}px, 0)`, transition: GLIDE }}
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
