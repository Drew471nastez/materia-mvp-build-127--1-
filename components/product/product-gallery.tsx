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
}

export function ProductGallery({ 
  images, 
  title, 
  mobileDotsMode = false,
  desktopDotsMode = false,
  autoplayInterval = 7000,
  forceDotsMode = false,
  forceDesktopDotsMode = false,
  isEditorMobilePreview = false
}: ProductGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isMobileScreen, setIsMobileScreen] = useState(false)
  const [isDesktopScreen, setIsDesktopScreen] = useState(true)
  const imageRef = useRef<HTMLDivElement>(null)
  const autoplayRef = useRef<NodeJS.Timeout | null>(null)

  // Minimum swipe distance (in px) to trigger navigation
  const minSwipeDistance = 50

  // Detect actual screen size (only for live page, not editor preview)
  useEffect(() => {
    // Skip screen detection if we're in editor preview mode
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
  // Priority: Editor preview modes > Live page screen detection
  const showDotsNavigation = (() => {
    // Editor mobile preview: only show dots if mobile dots is enabled
    if (isEditorMobilePreview) {
      return forceDotsMode // This is true when mobileGalleryDots is ON and we're in mobile preview
    }
    
    // Editor desktop preview: only show dots if desktop dots is enabled
    if (forceDesktopDotsMode) {
      return true
    }
    
    // Live page: check actual screen size
    if (mobileDotsMode && isMobileScreen) {
      return true
    }
    if (desktopDotsMode && isDesktopScreen) {
      return true
    }
    
    return false
  })()

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  }, [images.length])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
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
    // Resume autoplay after 10 seconds of no interaction
    setTimeout(() => setIsPaused(false), 10000)
  }, [])

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
    handleUserInteraction()
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      goToNext()
    } else if (isRightSwipe) {
      goToPrevious()
    }

    setTouchStart(null)
    setTouchEnd(null)
  }

  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setStartX(e.clientX)
    handleUserInteraction()
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    e.preventDefault()
  }

  const onMouseUp = (e: React.MouseEvent) => {
    if (!isDragging) return

    const distance = startX - e.clientX
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      goToNext()
    } else if (isRightSwipe) {
      goToPrevious()
    }

    setIsDragging(false)
  }

  const onMouseLeave = () => {
    setIsDragging(false)
  }

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
  }, [currentIndex, images.length, goToPrevious, goToNext, handleUserInteraction])

  if (images.length === 0) return null

  return (
    <div className="space-y-3 sm:space-y-4 w-full">
      {/* Main Image */}
      <div
        ref={imageRef}
        className={cn(
          "relative aspect-video overflow-hidden rounded-xl bg-muted w-full",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <Image
          src={images[currentIndex] || "/placeholder.svg"}
          alt={`${title} - Image ${currentIndex + 1}`}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 66vw, 50vw"
          className="object-cover pointer-events-none select-none"
          priority
          draggable={false}
        />

        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <Button
              variant="secondary"
              size="icon"
              className="absolute left-2 sm:left-3 top-1/2 h-9 w-9 sm:h-10 sm:w-10 -translate-y-1/2 rounded-full bg-white/90 shadow-md hover:bg-white"
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
              className="absolute right-2 sm:right-3 top-1/2 h-9 w-9 sm:h-10 sm:w-10 -translate-y-1/2 rounded-full bg-white/90 shadow-md hover:bg-white"
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
          <div className="absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-xs sm:text-sm text-white">
            {currentIndex + 1} / {images.length}
          </div>
        )}

        {/* Dots Navigation (when dots mode is active) */}
        {images.length > 1 && showDotsNavigation && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
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
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-transparent hover:border-muted-foreground/30",
                )}
                aria-label={`View image ${index + 1}`}
              >
                <Image
                  src={image || "/placeholder.svg"}
                  alt={`${title} thumbnail ${index + 1}`}
                  fill
                  sizes="(max-width: 640px) 80px, 96px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
