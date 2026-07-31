"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MobileListingCard } from "./mobile-listing-card"
import { IosSpinner } from "./ios-spinner"

// Touch-driven vertical pager tuned for a buttery, gliding TikTok-style swipe.
//
// Two things make it truly smooth:
//  1) NATIVE touch listeners (addEventListener, passive) — lower latency than
//     React synthetic events, and the drag transform is written straight to the
//     DOM every frame (no React render during the gesture).
//  2) The windowing / active re-render is DEFERRED until the glide has settled,
//     so the glide animation runs with ZERO main-thread React work — the newly
//     adjacent card only mounts its overlay AFTER the motion, never mid-glide.
// Only ~5 listings are windowed; the current/adjacent render full chrome, the
// rest are photo-only, so mounting stays cheap.

const DIST_TRIGGER = 54 // px drag distance that flips the page
const VEL_TRIGGER = 0.25 // px/ms flick velocity that flips the page
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

  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const spinnerRef = useRef<HTMLDivElement>(null)

  const start = useRef({ y: 0, x: 0, axis: null as null | "v" | "h" })
  const dragRef = useRef(0)
  const velRef = useRef(0)
  const lastTRef = useRef(0)
  const draggingRef = useRef(false)
  const indexRef = useRef(0) // live target that drives the transform
  const committedRef = useRef(0) // last index reflected in React state
  const refreshingRef = useRef(false)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const h = height || 0
  const hRef = useRef(h)
  hRef.current = h
  const lastRef = useRef(0)
  lastRef.current = products.length - 1

  useEffect(() => {
    indexRef.current = index
    committedRef.current = index
  }, [index])
  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, products.length - 1)))
  }, [products.length])

  // Write the transform straight to the DOM (called on every touchmove).
  const paint = useCallback((drag: number) => {
    const el = trackRef.current
    if (el) {
      const offset = -(indexRef.current * hRef.current) + drag + (refreshingRef.current ? 58 : 0)
      el.style.transform = `translate3d(0, ${offset}px, 0)`
    }
    const sp = spinnerRef.current
    if (sp) {
      sp.style.opacity = String(
        refreshingRef.current ? 1 : Math.min(1, Math.max(0, indexRef.current === 0 ? drag : 0) / 64),
      )
    }
  }, [])

  const commit = useCallback(() => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current)
      commitTimer.current = null
    }
    if (committedRef.current !== indexRef.current) setIndex(indexRef.current)
  }, [])

  // Native touch listeners — attached once, driven entirely by refs.
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
      if (tr) tr.style.transition = "none"
      if (commitTimer.current) {
        clearTimeout(commitTimer.current)
        commitTimer.current = null
      }
    }

    const onMove = (e: TouchEvent) => {
      if (refreshingRef.current || !draggingRef.current) return
      const t = e.touches[0]
      const dy = t.clientY - start.current.y
      const dx = t.clientX - start.current.x
      if (start.current.axis === null) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
          start.current.axis = "h" // horizontal → belongs to the photo gallery
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
      dragRef.current = 0
      start.current.axis = null
      const tr = trackRef.current
      if (tr) tr.style.transition = GLIDE

      // Pull-to-refresh from the very top.
      if (indexRef.current === 0 && d > REFRESH_TRIGGER) {
        setRefreshing(true)
        refreshingRef.current = true
        paint(0)
        void onRefresh().finally(() => {
          setRefreshing(false)
          refreshingRef.current = false
          indexRef.current = 0
          committedRef.current = 0
          setIndex(0)
          paint(0)
        })
        return
      }

      let ni = indexRef.current
      const goNext = (d < -DIST_TRIGGER || v < -VEL_TRIGGER) && indexRef.current < lastRef.current
      const goPrev = (d > DIST_TRIGGER || v > VEL_TRIGGER) && indexRef.current > 0
      if (goNext) ni = indexRef.current + 1
      else if (goPrev) ni = indexRef.current - 1
      indexRef.current = ni
      paint(0) // glide to the settled slot — transform only, zero React

      // Defer the windowing/active re-render until the glide is done, so the
      // motion has no React work. Commit immediately only if we're near the
      // render-window edge (fast multi-swipes) to avoid a blank slot.
      if (Math.abs(ni - committedRef.current) >= 2) {
        commit()
      } else if (ni !== committedRef.current) {
        commitTimer.current = setTimeout(commit, 780)
      }
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
  }, [paint, commit, onRefresh])

  // Re-settle the transform after a commit or a height change (no visible jump —
  // the imperative transform is already at the target).
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    el.style.transition = "none"
    paint(0)
    const r = requestAnimationFrame(() => {
      if (el) el.style.transition = GLIDE
    })
    return () => cancelAnimationFrame(r)
  }, [index, h, paint])

  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current)
    },
    [],
  )

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden">
      {/* iOS refresh spinner — behind the stack, revealed as it slides down */}
      <div ref={spinnerRef} className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center pt-3" style={{ opacity: 0 }}>
        <IosSpinner size={26} />
      </div>

      {/* Transform is set imperatively only (never in JSX) so a stray React render
          can't reset it mid-glide. */}
      <div ref={trackRef} className="absolute inset-0 z-10 will-change-transform" style={{ transition: GLIDE }}>
        {products.map((p, i) =>
          Math.abs(i - index) > 2 ? null : (
            <div key={p.id} className="absolute inset-x-0" style={{ top: i * h, height: h || undefined }}>
              <MobileListingCard
                product={p}
                priority={Math.abs(i - index) <= 1}
                near={Math.abs(i - index) <= 1}
                active={i === index}
              />
            </div>
          ),
        )}
      </div>
    </div>
  )
}
