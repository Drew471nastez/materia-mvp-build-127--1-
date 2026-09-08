"use client"

/**
 * ===========================================================================
 *  THE MOBILE SHEET, WITH DETENTS
 * ===========================================================================
 * It had two positions: a peek at the bottom and half the screen. That is
 * enough for a list of sections and not enough for anything you have to READ
 * or TYPE into — a settings panel with twenty fields, or a conversation with
 * a text box at the bottom of it. There was no way to get more room, so the
 * answer for the AI panel had been to not offer it on a phone at all.
 *
 * Now it snaps between a set of DETENTS, the way an iOS sheet does: peek,
 * half, full. Dragging moves between neighbours; a flick carries you one
 * further in the direction you flicked.
 *
 * ---------------------------------------------------------------------------
 *  THE KEYBOARD IS THE HARD PART
 * ---------------------------------------------------------------------------
 * `window.innerHeight` does not change when the on-screen keyboard opens on
 * iOS — the page is simply scrolled under it — so a sheet positioned against
 * it puts its text box behind the keyboard and there is nothing the person can
 * do about it. `visualViewport` is the only API that reports what is actually
 * visible, and its `height` plus `offsetTop` are what a sheet has to be
 * measured against.
 *
 * Falls back to `window.innerHeight` where it is missing, which costs nothing
 * on a browser that has no on-screen keyboard anyway.
 */

import * as React from "react"
import { cn } from "@/lib/utils"

const PEEK_HEIGHT = 72
const VELOCITY_THRESHOLD = 0.4
const FLICK_MIN_DISTANCE = 8
const SNAP_DURATION_MS = 360
const SNAP_EASING = "cubic-bezier(0.32, 0.72, 0, 1)"

/**
 * How far up the screen each stop sits, as a fraction of what is visible.
 * The largest is the sheet's actual height; the others are it, pushed down.
 */
export type Detent = number

const DEFAULT_DETENTS: Detent[] = [0.5, 0.92]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  className?: string
  peekHeight?: number
  /** Stops above the peek, smallest first. The last one is the full height. */
  detents?: Detent[]
  /**
   * Open straight to the tallest stop. For a panel whose whole point is room —
   * a conversation — starting at half and making somebody drag is a step that
   * only ever has one answer.
   */
  openFull?: boolean
}

export function MobileEditorSheet({
  open,
  onOpenChange,
  children,
  className,
  peekHeight = PEEK_HEIGHT,
  detents = DEFAULT_DETENTS,
  openFull = false,
}: Props) {
  const sheetRef = React.useRef<HTMLDivElement>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = React.useState(false)
  /** What is actually visible, which is not the window once a keyboard is up. */
  const [viewport, setViewport] = React.useState(0)

  const stops = React.useMemo(() => [...detents].sort((a, b) => a - b), [detents])
  const tallest = stops[stops.length - 1] ?? 0.92

  React.useEffect(() => {
    setMounted(true)
    const vv = window.visualViewport
    const update = () => setViewport(Math.round(vv?.height ?? window.innerHeight))
    update()
    window.addEventListener("resize", update)
    vv?.addEventListener("resize", update)
    /**
     * `scroll` as well as `resize`: iOS reports the keyboard by scrolling the
     * visual viewport, not only by resizing it, and a sheet that ignored that
     * would sit correctly the first time and wrongly after any scroll.
     */
    vv?.addEventListener("scroll", update)
    return () => {
      window.removeEventListener("resize", update)
      vv?.removeEventListener("resize", update)
      vv?.removeEventListener("scroll", update)
    }
  }, [])

  const height = Math.round(viewport * tallest)

  /**
   * translateY for each stop, tallest first — and SORTED, which is the whole
   * correctness of the thing.
   *
   * A larger fraction is a smaller offset, so mapping the fractions in
   * ascending order produces offsets in DESCENDING order: [336, 0], and with
   * the peek appended, [336, 0, 664]. That array is not monotonic, and the
   * flick logic below moves by index on the assumption that it is — so "one
   * stop further down" from full would have gone to half's index and then
   * jumped to the peek. Sorting is what makes index order and screen order the
   * same thing.
   */
  const offsets = React.useMemo(() => {
    const list = stops
      .map((f) => Math.max(0, Math.round(height - viewport * f)))
      .sort((a, b) => a - b)
    // The peek is the closed position and is always the largest offset.
    return [...list, Math.max(height - peekHeight, 0)]
  }, [stops, height, viewport, peekHeight])

  const closedY = offsets[offsets.length - 1]
  const openY = openFull ? offsets[0] : (offsets[Math.max(0, offsets.length - 2)] ?? 0)

  const openRef = React.useRef(open)
  openRef.current = open
  const offsetsRef = React.useRef(offsets)
  offsetsRef.current = offsets
  const onOpenChangeRef = React.useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  const drag = React.useRef({
    startY: 0,
    startTime: 0,
    lastY: 0,
    lastTime: 0,
    active: false,
    baseY: 0,
    currentY: 0,
  })

  const applyTransform = (y: number) => {
    const sheet = sheetRef.current
    const overlay = overlayRef.current
    const cY = offsetsRef.current[offsetsRef.current.length - 1]
    if (sheet) sheet.style.transform = `translateY(${y}px)`
    if (overlay) {
      const opacity = cY > 0 ? Math.max(0, Math.min(1, 1 - y / cY)) : 0
      overlay.style.opacity = String(opacity)
    }
  }

  const setTransition = (on: boolean) => {
    const sheet = sheetRef.current
    const overlay = overlayRef.current
    const value = on ? `transform ${SNAP_DURATION_MS}ms ${SNAP_EASING}` : "none"
    const overlayValue = on ? `opacity ${SNAP_DURATION_MS}ms ${SNAP_EASING}` : "none"
    if (sheet) sheet.style.transition = value
    if (overlay) overlay.style.transition = overlayValue
  }

  // Sync whenever `open` changes from outside — a tab, a menu, the overlay.
  React.useEffect(() => {
    if (drag.current.active) return
    setTransition(true)
    const target = open ? openY : closedY
    drag.current.currentY = target
    applyTransform(target)
    const overlay = overlayRef.current
    if (overlay) overlay.style.pointerEvents = open ? "auto" : "none"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, openY, closedY])

  const startDrag = (clientY: number) => {
    drag.current.startY = clientY
    drag.current.lastY = clientY
    drag.current.startTime = performance.now()
    drag.current.lastTime = drag.current.startTime
    drag.current.active = true
    /**
     * Measured from where the sheet ACTUALLY IS, not from whether it is
     * "open". With more than two stops those are different questions: a sheet
     * dragged to full is open, and so is one sitting at half.
     */
    drag.current.baseY = drag.current.currentY
    setTransition(false)
    const overlay = overlayRef.current
    if (overlay) overlay.style.pointerEvents = "none"
  }

  const moveDrag = (clientY: number) => {
    if (!drag.current.active) return
    const list = offsetsRef.current
    const cY = list[list.length - 1]
    let nextY = drag.current.baseY + (clientY - drag.current.startY)
    // Rubber-banding past either end, so the sheet feels attached to a finger
    // rather than to a clamp.
    if (nextY < 0) nextY = nextY / 3
    if (nextY > cY) nextY = cY + (nextY - cY) / 3
    drag.current.lastY = clientY
    drag.current.lastTime = performance.now()
    drag.current.currentY = nextY
    applyTransform(Math.max(0, Math.min(nextY, cY)))
  }

  const endDrag = () => {
    if (!drag.current.active) return
    drag.current.active = false

    const list = offsetsRef.current
    const cY = list[list.length - 1]
    const elapsed = Math.max(drag.current.lastTime - drag.current.startTime, 1)
    const totalDelta = drag.current.lastY - drag.current.startY
    const velocity = totalDelta / elapsed
    const current = Math.max(0, Math.min(drag.current.currentY, cY))

    /**
     * Nearest stop, then one further if it was a flick.
     *
     * Nearest alone makes a fast short flick feel ignored — the finger has
     * barely moved, so the nearest stop is the one it started at. Carrying it
     * one further in the direction of the flick is what makes a sheet feel
     * like it has weight.
     */
    let index = 0
    let best = Number.POSITIVE_INFINITY
    for (let i = 0; i < list.length; i++) {
      const distance = Math.abs(list[i] - current)
      if (distance < best) {
        best = distance
        index = i
      }
    }
    if (Math.abs(velocity) > VELOCITY_THRESHOLD && Math.abs(totalDelta) > FLICK_MIN_DISTANCE) {
      index = velocity < 0 ? Math.max(0, index - 1) : Math.min(list.length - 1, index + 1)
    }

    const targetY = list[index]
    setTransition(true)
    drag.current.currentY = targetY
    applyTransform(targetY)

    const nowOpen = index < list.length - 1
    const overlay = overlayRef.current
    if (overlay) overlay.style.pointerEvents = nowOpen ? "auto" : "none"
    if (nowOpen !== openRef.current) onOpenChangeRef.current(nowOpen)
  }

  // Global mouse listeners, so a mouseup outside the handle still ends a drag.
  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (drag.current.active) moveDrag(e.clientY)
    }
    const onUp = () => {
      if (drag.current.active) endDrag()
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  if (!mounted) return null

  return (
    <>
      <div
        ref={overlayRef}
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-40 bg-black/30"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: `opacity ${SNAP_DURATION_MS}ms ${SNAP_EASING}`,
        }}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={open}
        className={cn(
          "fixed left-0 right-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-[20px] bg-background shadow-[0_-12px_40px_-12px_rgba(17,24,39,0.22)]",
          className,
        )}
        style={{
          height: `${height}px`,
          transform: `translateY(${open ? openY : closedY}px)`,
          transition: `transform ${SNAP_DURATION_MS}ms ${SNAP_EASING}`,
          willChange: "transform",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          className="flex shrink-0 cursor-grab select-none justify-center bg-background pb-1.5 pt-2.5 active:cursor-grabbing"
          style={{ touchAction: "none" }}
          onTouchStart={(e) => startDrag(e.touches[0].clientY)}
          onTouchMove={(e) => moveDrag(e.touches[0].clientY)}
          onTouchEnd={endDrag}
          onTouchCancel={endDrag}
          onMouseDown={(e) => {
            e.preventDefault()
            startDrag(e.clientY)
          }}
        >
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        {children}
      </div>
    </>
  )
}
