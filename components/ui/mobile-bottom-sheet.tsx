"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface MobileBottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  title?: string
  /** Height as percentage of viewport (0-100). Default 60 */
  heightPercent?: number
  className?: string
  /** Whether to show the drag handle. Default true */
  showHandle?: boolean
  /** Whether to prevent any inner input focus on open. Default false */
  preventFocus?: boolean
}

const VELOCITY_THRESHOLD = 0.5
const DISMISS_THRESHOLD_RATIO = 0.3

export function MobileBottomSheet({
  open,
  onOpenChange,
  children,
  title,
  heightPercent = 60,
  className,
  showHandle = true,
  preventFocus = false,
}: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({
    isDragging: false,
    startY: 0,
    currentY: 0,
    startTime: 0,
    sheetHeight: 0,
  })
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimatingIn, setIsAnimatingIn] = useState(false)
  const rafRef = useRef<number | null>(null)

  // Prevent keyboard from opening when preventFocus is true
  useEffect(() => {
    if (open && preventFocus && sheetRef.current) {
      const preventInputFocus = (e: FocusEvent) => {
        const target = e.target as HTMLElement
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          // Only prevent if the input is type text/search etc (not buttons)
          const inputType = (target as HTMLInputElement).type
          if (!inputType || inputType === 'text' || inputType === 'search' || inputType === 'email' || inputType === 'url' || inputType === 'tel' || target.tagName === 'TEXTAREA') {
            target.setAttribute('readonly', 'true')
            requestAnimationFrame(() => {
              target.removeAttribute('readonly')
            })
          }
        }
      }

      const sheet = sheetRef.current
      sheet.addEventListener('focusin', preventInputFocus, { capture: true })
      return () => {
        sheet.removeEventListener('focusin', preventInputFocus, { capture: true })
      }
    }
  }, [open, preventFocus])

  // Handle open/close
  useEffect(() => {
    if (open) {
      // Prevent body scroll
      document.body.style.overflow = 'hidden'
      setIsVisible(true)
      // Force a reflow before starting animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimatingIn(true)
        })
      })
    } else {
      setIsAnimatingIn(false)
      const timer = setTimeout(() => {
        setIsVisible(false)
        document.body.style.overflow = ''
      }, 300)
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Apply transform via direct DOM manipulation for 60fps
  const applyTransform = useCallback((translateY: number, transition?: string) => {
    if (!sheetRef.current || !overlayRef.current) return
    const sheet = sheetRef.current
    const overlay = overlayRef.current

    if (transition) {
      sheet.style.transition = transition
      overlay.style.transition = transition
    } else {
      sheet.style.transition = 'none'
      overlay.style.transition = 'none'
    }

    sheet.style.transform = `translate3d(0, ${translateY}px, 0)`

    // Calculate overlay opacity based on drag progress
    const sheetHeight = dragRef.current.sheetHeight || (window.innerHeight * heightPercent / 100)
    const progress = Math.max(0, 1 - translateY / sheetHeight)
    overlay.style.opacity = String(progress * 0.5)
  }, [heightPercent])

  // Touch handlers for swipe-to-dismiss
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only capture drags from the handle area or scrolled-to-top content
    const touch = e.touches[0]
    const sheet = sheetRef.current
    if (!sheet) return

    dragRef.current = {
      isDragging: true,
      startY: touch.clientY,
      currentY: touch.clientY,
      startTime: Date.now(),
      sheetHeight: sheet.offsetHeight,
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.isDragging) return

    const touch = e.touches[0]
    const deltaY = touch.clientY - dragRef.current.startY

    // Only allow dragging down
    if (deltaY < 0) {
      dragRef.current.currentY = touch.clientY
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        applyTransform(0)
      })
      return
    }

    dragRef.current.currentY = touch.clientY

    // Cancel any pending rAF
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    rafRef.current = requestAnimationFrame(() => {
      applyTransform(deltaY)
    })

    // Prevent scroll while dragging
    e.preventDefault()
  }, [applyTransform])

  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current.isDragging) return

    const deltaY = dragRef.current.currentY - dragRef.current.startY
    const elapsed = Date.now() - dragRef.current.startTime
    const velocity = deltaY / elapsed // px/ms
    const sheetHeight = dragRef.current.sheetHeight

    dragRef.current.isDragging = false

    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    // Dismiss if dragged past threshold or fast swipe
    if (deltaY > sheetHeight * DISMISS_THRESHOLD_RATIO || velocity > VELOCITY_THRESHOLD) {
      // Animate out
      applyTransform(sheetHeight, 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.28s cubic-bezier(0.32, 0.72, 0, 1)')
      setTimeout(() => {
        onOpenChange(false)
        // Reset transform after close
        if (sheetRef.current) {
          sheetRef.current.style.transform = ''
          sheetRef.current.style.transition = ''
        }
        if (overlayRef.current) {
          overlayRef.current.style.opacity = ''
          overlayRef.current.style.transition = ''
        }
      }, 280)
    } else {
      // Snap back
      applyTransform(0, 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.32s cubic-bezier(0.32, 0.72, 0, 1)')
      setTimeout(() => {
        if (sheetRef.current) {
          sheetRef.current.style.transition = ''
        }
        if (overlayRef.current) {
          overlayRef.current.style.transition = ''
        }
      }, 320)
    }
  }, [applyTransform, onOpenChange])

  const handleOverlayClick = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  if (!isVisible && !open) return null

  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: 2147483645, pointerEvents: isVisible ? 'auto' : 'none' }}
    >
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black"
        onClick={handleOverlayClick}
        style={{
          opacity: isAnimatingIn ? 0.5 : 0,
          transition: isAnimatingIn ? 'opacity 0.32s cubic-bezier(0.32, 0.72, 0, 1)' : (open ? 'none' : 'opacity 0.28s cubic-bezier(0.32, 0.72, 0, 1)'),
          willChange: 'opacity',
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-background rounded-t-[20px] shadow-2xl flex flex-col",
          className
        )}
        style={{
          height: `${heightPercent}vh`,
          maxHeight: `${heightPercent}vh`,
          transform: isAnimatingIn ? 'translate3d(0, 0, 0)' : `translate3d(0, 100%, 0)`,
          transition: isAnimatingIn
            ? 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)'
            : (open ? 'none' : 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)'),
          willChange: 'transform',
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
          WebkitPerspective: '1000',
          perspective: '1000',
          contain: 'layout style paint',
        } as React.CSSProperties}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag Handle */}
        {showHandle && (
          <div className="flex-shrink-0 flex items-center justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}

        {/* Title */}
        {title && (
          <div className="flex-shrink-0 px-5 pb-3 pt-2">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
          </div>
        )}

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8"
          style={{
            WebkitOverflowScrolling: 'touch',
          } as React.CSSProperties}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
