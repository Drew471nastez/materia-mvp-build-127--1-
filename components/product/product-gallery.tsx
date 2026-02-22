"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ProductGalleryProps {
  images: string[]
  title: string
  // Mobile dots navigation mode (hides thumbnails, shows dots, enables autoplay)
  mobileDotsMode?: boolean
  // Desktop dots navigation mode (hides thumbnails, shows dots, enables autoplay)
  desktopDotsMode?: boolean
  // Autoplay interval in ms (default 7000 = 7 seconds)
  autoplayInterval?: number
  // Editor preview modes - these OVERRIDE screen detection
  // When true, forces mobile dots mode (editor mobile preview)
  forceDotsMode?: boolean
  // When true, forces desktop dots mode (editor desktop preview)
  forceDesktopDotsMode?: boolean
  // When true, we're in editor mobile preview - desktop dots should NOT apply
  isEditorMobilePreview?: boolean
  // Theme selection color for thumbnail border (uses theme preset accent/primary color)
  selectionColor?: string
  // Background color for the gallery container (for dark themes)
  backgroundColor?: string
}

export function ProductGallery({
  images,
  title,
  mobileDotsMode = false,
  desktopDotsMode = false,
  autoplayInterval = 7000,
  forceDotsMode = false,
  forceDesktopDotsMode = false,
  isEditorMobilePreview = false,
  selectionColor,
  backgroundColor
}: ProductGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isMobileScreen, setIsMobileScreen] = useState(false)
  const [isDesktopScreen, setIsDesktopScreen] = useState(true)
  const [isHovering, setIsHovering] = useState(false)

  // GPU-accelerated drag state — uses refs to avoid re-renders during drag
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragCurrentXRef = useRef(0)
  const containerWidthRef = useRef(0)
  const imageRef = useRef<HTMLDivElement>(null)
  const slideContainerRef = useRef<HTMLDivElement>(null)
  const autoplayRef = useRef<NodeJS.Timeout | null>(null)
  const rafRef = useRef<number | null>(null)
  const isTransitioningRef = useRef(false)

  // Minimum swipe distance (in px) to trigger navigation
  const minSwipeDistance = 30
  // Velocity threshold for fast swipe detection (px/ms)
  const velocityThreshold = 0.25
  const dragStartTimeRef = useRef(0)

  // Detect actual screen size (only for live page, not editor preview)
  useEffect(() => {
    if (forceDotsMode || forceDesktopDotsMode || isEditorMobilePreview) return

    const checkScreen = () => {
      const width = window.innerWidth
      setIsMobileScreen(width < 640)
      setIsDesktopScreen(width >= 640)
    }
    checkScreen()
    window.addEventListener("resize", checkScreen)
    return () => window.removeEventListener("resize", checkScreen)
  }, [forceDotsMode, forceDesktopDotsMode, isEditorMobilePreview])

  // Determine if we should show dots navigation
  const showDotsNavigation = (() => {
    if (isEditorMobilePreview) {
      return forceDotsMode
    }
    if (forceDesktopDotsMode) {
      return true
    }
    if (mobileDotsMode && isMobileScreen) {
      return true
    }
    if (desktopDotsMode && isDesktopScreen) {
      return true
    }
    return false
  })()

  const goToPrevious = useCallback(() => {
    if (isTransitioningRef.current) return
    isTransitioningRef.current = true
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
    setTimeout(() => { isTransitioningRef.current = false }, 350)
  }, [images.length])

  const goToNext = useCallback(() => {
    if (isTransitioningRef.current) return
    isTransitioningRef.current = true
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
    setTimeout(() => { isTransitioningRef.current = false }, 350)
  }, [images.length])

  // Autoplay for dots mode
  useEffect(() => {
    if (!showDotsNavigation || images.length <= 1 || isPaused) return

    autoplayRef.current = setInterval(() => {
      goToNext()
    }, autoplayInterval)

    return () => {
      if (autoplayRef.current) {
        clearInterval(autoplayRef.current)
      }
    }
  }, [showDotsNavigation, images.length, isPaused, autoplayInterval, goToNext])

  // Pause autoplay on user interaction, resume after delay
  const handleUserInteraction = useCallback(() => {
    setIsPaused(true)
    setTimeout(() => setIsPaused(false), 10000)
  }, [])

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // --- GPU-accelerated drag handlers ---

  const startDrag = useCallback((clientX: number) => {
    if (images.length <= 1) return
    isDraggingRef.current = true
    setIsDragging(true)
    dragStartXRef.current = clientX
    dragCurrentXRef.current = clientX
    dragStartTimeRef.current = Date.now()
    containerWidthRef.current = imageRef.current?.offsetWidth || 300
    // Kill transition immediately for zero-latency drag tracking
    if (slideContainerRef.current) {
      slideContainerRef.current.style.transition = 'none'
    }
    handleUserInteraction()
  }, [images.length, handleUserInteraction])

  const moveDrag = useCallback((clientX: number) => {
    if (!isDraggingRef.current) return
    dragCurrentXRef.current = clientX
    const delta = dragCurrentXRef.current - dragStartXRef.current
    // Clamp offset for rubber-band effect at edges
    const maxDrag = containerWidthRef.current * 0.45
    const clamped = Math.max(-maxDrag, Math.min(maxDrag, delta))
    // Direct DOM manipulation via RAF for zero-latency GPU-composited drag
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (slideContainerRef.current) {
        slideContainerRef.current.style.transform = `translate3d(${clamped}px, 0, 0)`
      }
      setDragOffset(clamped)
    })
  }, [])

  const endDrag = useCallback(() => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setIsDragging(false)

    const distance = dragCurrentXRef.current - dragStartXRef.current
    const elapsed = Date.now() - dragStartTimeRef.current
    const velocity = Math.abs(distance) / Math.max(elapsed, 1)
    const isFastSwipe = velocity > velocityThreshold

    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    // Determine if swipe should trigger navigation
    const shouldNavigate = Math.abs(distance) > minSwipeDistance || isFastSwipe
    if (shouldNavigate) {
      if (distance < 0) {
        goToNext()
      } else {
        goToPrevious()
      }
    }

    // Animate drag offset back to 0 — re-enable CSS transition for snap-back
    if (slideContainerRef.current) {
      slideContainerRef.current.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      slideContainerRef.current.style.transform = 'translate3d(0, 0, 0)'
    }
    setDragOffset(0)
  }, [goToNext, goToPrevious])

  // Touch events
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startDrag(e.touches[0].clientX)
  }, [startDrag])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    moveDrag(e.touches[0].clientX)
  }, [moveDrag])

  const onTouchEnd = useCallback(() => {
    endDrag()
  }, [endDrag])

  // Mouse events
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    startDrag(e.clientX)
  }, [startDrag])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    e.preventDefault()
    moveDrag(e.clientX)
  }, [moveDrag])

  const onMouseUp = useCallback(() => {
    endDrag()
  }, [endDrag])

  const onMouseLeave = useCallback(() => {
    if (isDraggingRef.current) endDrag()
    setIsHovering(false)
  }, [endDrag])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        goToPrevious()
        handleUserInteraction()
      } else if (e.key === "ArrowRight") {
        goToNext()
        handleUserInteraction()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [goToPrevious, goToNext, handleUserInteraction])

  if (images.length === 0) return null

  return (
    <div className="space-y-3 sm:space-y-4 w-full">
      {/* Main Image */}
      <div
        ref={imageRef}
        className={cn(
          "relative aspect-video overflow-hidden rounded-xl w-full group",
          !backgroundColor && "bg-muted",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{
          ...(backgroundColor ? { backgroundColor } : {}),
          touchAction: images.length > 1 ? 'pan-y pinch-zoom' : 'auto',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onMouseEnter={() => setIsHovering(true)}
      >
        {/* GPU-accelerated sliding image container */}
        <div
          ref={slideContainerRef}
          className="absolute inset-0"
          style={{
            transform: `translate3d(${dragOffset}px, 0, 0)`,
            transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            perspective: 1000,
          }}
        >
          {/* Images with smooth crossfade transition */}
          {images.map((image, index) => (
            <Image
              key={index}
              src={image || "/placeholder.svg"}
              alt={`${title} - Image ${index + 1}`}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 66vw, 50vw"
              className={cn(
                "object-cover pointer-events-none select-none",
                "transition-opacity duration-[350ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
                currentIndex === index ? "opacity-100" : "opacity-0"
              )}
              style={{
                willChange: 'opacity',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'translateZ(0)',
              }}
              priority={index === 0}
              loading={index === 0 ? "eager" : "lazy"}
              draggable={false}
            />
          ))}
        </div>

        {/* Navigation Arrows - show on hover for desktop, always visible on mobile */}
        {images.length > 1 && (
          <>
            <Button
              variant="secondary"
              size="icon"
              className={cn(
                "absolute left-2 sm:left-3 top-1/2 h-9 w-9 sm:h-10 sm:w-10 -translate-y-1/2 rounded-full bg-white/90 shadow-md hover:bg-white transition-all duration-200 ease-in-out z-10",
                "sm:opacity-0 sm:scale-95 sm:group-hover:opacity-100 sm:group-hover:scale-100"
              )}
              onClick={(e) => {
                e.stopPropagation()
                goToPrevious()
                handleUserInteraction()
              }}
              aria-label="Previous image"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className={cn(
                "absolute right-2 sm:right-3 top-1/2 h-9 w-9 sm:h-10 sm:w-10 -translate-y-1/2 rounded-full bg-white/90 shadow-md hover:bg-white transition-all duration-200 ease-in-out z-10",
                "sm:opacity-0 sm:scale-95 sm:group-hover:opacity-100 sm:group-hover:scale-100"
              )}
              onClick={(e) => {
                e.stopPropagation()
                goToNext()
                handleUserInteraction()
              }}
              aria-label="Next image"
            >
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </>
        )}

        {/* Image Counter (show when not in dots mode) */}
        {images.length > 1 && !showDotsNavigation && (
          <div className="absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-xs sm:text-sm text-white z-10">
            {currentIndex + 1} / {images.length}
          </div>
        )}

        {/* Dots Navigation (when dots mode is active) */}
        {images.length > 1 && showDotsNavigation && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentIndex(index)
                  handleUserInteraction()
                }}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  currentIndex === index
                    ? "w-6 bg-white"
                    : "w-2 bg-white/50 hover:bg-white/70"
                )}
                aria-label={`Go to image ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnail Strip (hide when dots mode is active) */}
      {images.length > 1 && !showDotsNavigation && (
        <div className="w-full overflow-hidden">
          <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory px-1 scrollbar-hide">
            {images.map((image, index) => (
              <button
                key={index}
                onClick={() => {
                  setCurrentIndex(index)
                  handleUserInteraction()
                }}
                className={cn(
                  "relative shrink-0 overflow-hidden rounded-lg border-2 transition-all snap-start",
                  "h-16 w-20 sm:h-20 sm:w-24",
                  currentIndex === index
                    ? selectionColor ? "" : "border-primary ring-2 ring-primary/20"
                    : "border-transparent hover:border-muted-foreground/30",
                )}
                style={currentIndex === index && selectionColor ? {
                  borderColor: selectionColor,
                  boxShadow: `0 0 0 2px ${selectionColor}33`
                } : undefined}
                aria-label={`View image ${index + 1}`}
              >
                <Image
                  src={image || "/placeholder.svg"}
                  alt={`${title} thumbnail ${index + 1}`}
                  fill
                  sizes="(max-width: 640px) 80px, 96px"
                  className="object-cover"
                  style={{
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden',
                  }}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
