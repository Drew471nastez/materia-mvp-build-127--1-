"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MobileListingCard } from "./mobile-listing-card"
import { IosSpinner } from "./ios-spinner"

// Touch-driven vertical pager tuned for a buttery, gliding TikTok-style swipe.
//
// The smoothness comes from splitting "what the user sees" from "what mounts":
//   • index       — updates IMMEDIATELY on release. Drives the active card's
//                   image preloading, so the next listing is ready the instant
//                   you land (no lag).
//   • windowIndex — the render window; DEFERRED until the glide settles, so new
//                   cards never mount mid-glide (that mount was the frame-drop).
//
// Every card inside the window renders COMPLETE — photo and overlay together.
// Gating the overlay to the adjacent cards used to mean that two fast swipes in
// a row (a touchstart cancels the pending window commit) landed you on a card
// whose overlay hadn't mounted yet: you saw the photo slide in and then the
// caption pop in on top of it. Cards are now only ever mounted whole, off-screen.
//
// Native passive touch listeners + an imperative-only transform mean the glide
// itself does ZERO React work per frame — pure GPU.

const RADIUS = 2 // cards mounted either side of the window centre
const DIST_TRIGGER = 54 // px drag distance that flips the page
const VEL_TRIGGER = 0.25 // px/ms flick velocity that flips the page
const REFRESH_TRIGGER = 80 // px pull-down at the top that refreshes
const GLIDE = "transform 0.72s cubic-bezier(0.19, 1, 0.22, 1)" // long, glassy settle

/** Current translateY of an element, mid-transition included. */
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
  const [index, setIndex] = useState(0) // active / preload index (immediate)
  const [windowIndex, setWindowIndex] = useState(0) // render window (deferred)
  const [refreshing, setRefreshing] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const spinnerRef = useRef<HTMLDivElement>(null)

  const start = useRef({ y: 0, x: 0, axis: null as null | "v" | "h" })
  const dragRef = useRef(0)
  const velRef = useRef(0)
  const lastTRef = useRef(0)
  const draggingRef = useRef(false)
  // Residual offset when a drag begins mid-glide: the distance between where the
  // track visually IS and where the settled index says it should be. Without it,
  // killing the transition to follow the finger snapped the track straight to its
  // target — the jolt you feel grabbing the screen during a fast swipe.
  const carryRef = useRef(0)
  const indexRef = useRef(0)
  const windowRef = useRef(0)
  const refreshingRef = useRef(false)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const h = height || 0
  const hRef = useRef(h)
  hRef.current = h
  const lastRef = useRef(0)
  lastRef.current = products.length - 1

  useEffect(() => {
    indexRef.current = index
  }, [index])
  useEffect(() => {
    windowRef.current = windowIndex
  }, [windowIndex])
  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])
  useEffect(() => {
    const clamp = (i: number) => Math.min(i, Math.max(0, products.length - 1))
    setIndex(clamp)
    setWindowIndex(clamp)
  }, [products.length])

  const paint = useCallback((drag: number) => {
    const el = trackRef.current
    if (el) {
      const offset =
        -(indexRef.current * hRef.current) + drag + carryRef.current + (refreshingRef.current ? 58 : 0)
      el.style.transform = `translate3d(0, ${offset}px, 0)`
    }
    const sp = spinnerRef.current
    if (sp) {
      sp.style.opacity = String(
        refreshingRef.current ? 1 : Math.min(1, Math.max(0, indexRef.current === 0 ? drag : 0) / 64),
      )
    }
  }, [])

  const commitWindow = useCallback(() => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current)
      commitTimer.current = null
    }
    if (windowRef.current !== indexRef.current) setWindowIndex(indexRef.current)
  }, [])

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
        // Pick the track up exactly where it is right now. Reading the live
        // transform BEFORE dropping the transition is what stops a mid-glide
        // grab from teleporting to the settled slot.
        const y = currentY(tr)
        carryRef.current = Number.isNaN(y)
          ? 0
          : y - (-(indexRef.current * hRef.current) + (refreshingRef.current ? 58 : 0))
        tr.style.transition = "none"
        paint(0)
      }
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
      dragRef.current = 0
      start.current.axis = null
      const tr = trackRef.current
      if (tr) tr.style.transition = GLIDE

      if (indexRef.current === 0 && d > REFRESH_TRIGGER) {
        setRefreshing(true)
        refreshingRef.current = true
        carryRef.current = 0
        paint(0)
        void onRefresh().finally(() => {
          setRefreshing(false)
          refreshingRef.current = false
          indexRef.current = 0
          windowRef.current = 0
          setIndex(0)
          setWindowIndex(0)
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
      carryRef.current = 0 // release the residual; CSS eases from here to the slot
      paint(0) // glide to the settled slot — transform only, zero React

      // Preload advances immediately (cheap: no mount, just prop changes).
      setIndex(ni)
      // The render window (the mounts) waits for the glide to finish. Commit
      // early only when the target has actually fallen OUTSIDE the window, i.e.
      // it isn't mounted yet — `>= RADIUS` used to force a mount mid-glide even
      // though the card was already there, dropping frames for nothing.
      if (Math.abs(ni - windowRef.current) > RADIUS) {
        commitWindow()
      } else if (ni !== windowRef.current) {
        commitTimer.current = setTimeout(commitWindow, 720)
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
  }, [paint, commitWindow, onRefresh])

  // Re-settle the transform ONLY on a height change (never on index — that would
  // snap the transition off mid-glide). The imperative transform is authoritative.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    el.style.transition = "none"
    paint(0)
    const r = requestAnimationFrame(() => {
      if (el) el.style.transition = GLIDE
    })
    return () => cancelAnimationFrame(r)
  }, [h, paint])

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
          Math.abs(i - windowIndex) > RADIUS ? null : (
            <div key={p.id} className="absolute inset-x-0" style={{ top: i * h, height: h || undefined }}>
              {/* No overlay gating: a mounted card is always a COMPLETE card, so
                  its caption can never appear after its photo. Every card in the
                  window also fetches eagerly, so the photo is decoded long before
                  you swipe to it — nothing has to "arrive" as you land. */}
              <MobileListingCard
                product={p}
                priority={Math.abs(i - index) <= 1}
                active={i === index}
              />
            </div>
          ),
        )}
      </div>
    </div>
  )
}
