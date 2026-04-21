"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const PEEK_HEIGHT = 72
const OPEN_HEIGHT_FRAC = 0.5
const VELOCITY_THRESHOLD = 0.4
const FLICK_MIN_DISTANCE = 8
const SNAP_DURATION_MS = 360
const SNAP_EASING = "cubic-bezier(0.32, 0.72, 0, 1)"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  className?: string
  peekHeight?: number
  openHeightFraction?: number
}

export function MobileEditorSheet({
  open,
  onOpenChange,
  children,
  className,
  peekHeight = PEEK_HEIGHT,
  openHeightFraction = OPEN_HEIGHT_FRAC,
}: Props) {
  const sheetRef = React.useRef<HTMLDivElement>(null)
  const overlayRef = React.useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = React.useState(false)
  const [openHeight, setOpenHeight] = React.useState(0)

  React.useEffect(() => {
    setMounted(true)
    const update = () => {
      setOpenHeight(Math.round(window.innerHeight * openHeightFraction))
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [openHeightFraction])

  const closedY = Math.max(openHeight - peekHeight, 0)
  const openRef = React.useRef(open)
  openRef.current = open
  const closedYRef = React.useRef(closedY)
  closedYRef.current = closedY
  const onOpenChangeRef = React.useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  const drag = React.useRef({
    startY: 0,
    startTime: 0,
    lastY: 0,
    lastTime: 0,
    active: false,
    openAtStart: false,
    currentY: 0,
  })

  const applyTransform = (y: number) => {
    const sheet = sheetRef.current
    const overlay = overlayRef.current
    const cY = closedYRef.current
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

  // Sync position whenever `open` changes from the outside (tabs, menu, overlay click).
  React.useEffect(() => {
    if (drag.current.active) return
    setTransition(true)
    const target = open ? 0 : closedY
    drag.current.currentY = target
    applyTransform(target)
    const overlay = overlayRef.current
    if (overlay) {
      overlay.style.pointerEvents = open ? "auto" : "none"
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closedY])

  const startDrag = (clientY: number) => {
    drag.current.startY = clientY
    drag.current.lastY = clientY
    drag.current.startTime = performance.now()
    drag.current.lastTime = drag.current.startTime
    drag.current.active = true
    drag.current.openAtStart = openRef.current
    setTransition(false)
    const overlay = overlayRef.current
    if (overlay) overlay.style.pointerEvents = "none"
  }

  const moveDrag = (clientY: number) => {
    if (!drag.current.active) return
    const delta = clientY - drag.current.startY
    const base = drag.current.openAtStart ? 0 : closedYRef.current
    let nextY = base + delta
    const cY = closedYRef.current
    if (nextY < 0) nextY = nextY / 3
    if (nextY > cY) nextY = cY + (nextY - cY) / 3
    drag.current.lastY = clientY
    drag.current.lastTime = performance.now()
    drag.current.currentY = nextY
    const clamped = Math.max(0, Math.min(nextY, cY))
    applyTransform(clamped)
  }

  const endDrag = () => {
    if (!drag.current.active) return
    drag.current.active = false

    const elapsed = Math.max(drag.current.lastTime - drag.current.startTime, 1)
    const totalDelta = drag.current.lastY - drag.current.startY
    const velocity = totalDelta / elapsed
    const cY = closedYRef.current
    const currentClamped = Math.max(0, Math.min(drag.current.currentY, cY))

    let nextOpen: boolean
    if (Math.abs(velocity) > VELOCITY_THRESHOLD && Math.abs(totalDelta) > FLICK_MIN_DISTANCE) {
      nextOpen = velocity < 0
    } else {
      nextOpen = currentClamped < cY / 2
    }

    const targetY = nextOpen ? 0 : cY
    setTransition(true)
    drag.current.currentY = targetY
    applyTransform(targetY)

    const overlay = overlayRef.current
    if (overlay) overlay.style.pointerEvents = nextOpen ? "auto" : "none"

    onOpenChangeRef.current(nextOpen)
  }

  // Global mouse listeners while dragging (captures mouseup outside the handle).
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

  const initialY = open ? 0 : closedY

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
          "fixed left-0 right-0 bottom-0 z-50 flex flex-col bg-background rounded-t-[20px] shadow-[0_-12px_40px_-12px_rgba(17,24,39,0.22)] overflow-hidden",
          className,
        )}
        style={{
          height: `${openHeight}px`,
          transform: `translateY(${initialY}px)`,
          transition: `transform ${SNAP_DURATION_MS}ms ${SNAP_EASING}`,
          willChange: "transform",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          className="flex justify-center pt-2.5 pb-1.5 shrink-0 bg-background cursor-grab active:cursor-grabbing select-none"
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
          <div className="h-1 w-10 rounded-full bg-neutral-300" />
        </div>
        {children}
      </div>
    </>
  )
}
