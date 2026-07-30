"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MobileListingCard } from "./mobile-listing-card"
import { IosSpinner } from "./ios-spinner"
import { useLocale } from "@/components/locale-provider"

// Touch-driven vertical pager — one swipe always moves exactly one listing.
// Native scroll-snap can't guarantee this on iOS WebKit (momentum drifts past a
// page, and it rests mid-way), so we drive the transform ourselves: no native
// scroll = no drift, and the spring easing makes it feel TikTok-smooth.

const SWIPE_TRIGGER = 56 // px past which the page flips
const REFRESH_TRIGGER = 74 // px pull-down at the top that triggers refresh
const SPRING = "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)"

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
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const start = useRef({ y: 0, x: 0, axis: null as null | "v" | "h" })

  const last = products.length - 1
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, last)))
  }, [last])

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return
      const tch = e.touches[0]
      start.current = { y: tch.clientY, x: tch.clientX, axis: null }
      setDragging(true)
    },
    [refreshing],
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return
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
      // Rubber-band resistance at the ends (and for the pull-to-refresh zone).
      if (index === 0 && d > 0) d = d * 0.5
      if (index >= last && d < 0) d = d * 0.35
      setDrag(d)
    },
    [index, last, refreshing],
  )

  const onTouchEnd = useCallback(async () => {
    if (refreshing) return
    setDragging(false)
    const d = drag
    start.current.axis = null
    setDrag(0)

    if (index === 0 && d > REFRESH_TRIGGER) {
      setRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setIndex(0)
      }
      return
    }
    if (d < -SWIPE_TRIGGER && index < last) setIndex(index + 1)
    else if (d > SWIPE_TRIGGER && index > 0) setIndex(index - 1)
  }, [drag, index, last, onRefresh, refreshing])

  const h = height || 0
  const offset = -(index * h) + drag + (refreshing ? 58 : 0)
  const pullOpacity = refreshing ? 1 : Math.min(1, Math.max(0, index === 0 ? drag : 0) / 60)

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* iOS refresh spinner — behind the stack, revealed as it slides down */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 flex justify-center pt-3" style={{ opacity: pullOpacity }}>
        <IosSpinner size={26} />
      </div>

      <div
        className="relative z-10 will-change-transform"
        style={{ transform: `translateY(${offset}px)`, transition: dragging ? "none" : SPRING }}
      >
        {products.map((p, i) => (
          <div key={p.id} className="w-full px-2" style={{ height: h || undefined }}>
            <MobileListingCard
              product={p}
              priority={Math.abs(i - index) <= 1}
              reason={i % 4 === 0 ? t("mfeed.picked_for_you") : i % 4 === 2 ? t("mfeed.based_on_searches") : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
