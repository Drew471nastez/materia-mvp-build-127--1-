"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProductMediaViewer } from "@/components/product/product-media-viewer"
import { useIsPhone } from "@/components/storefront/use-is-phone"
import { cn } from "@/lib/utils"

interface MediaItem {
  url: string
  type: "image" | "video" | "youtube"
  thumbnailUrl?: string
}

interface ProductGalleryProps {
  images: string[]
  title: string
  // Optional video URL for the product
  videoUrl?: string | null
  // YouTube embed URLs
  youtubeUrls?: string[]
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
  videoUrl,
  youtubeUrls = [],
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
  /**
   * Which pictures have actually arrived. A slide is painted transparent
   * until its own image has decoded and then fades, so the first frame of a
   * product page is a calm grey box rather than a flash of nothing followed
   * by a picture snapping in. See the note where this is read.
   */
  const [loaded, setLoaded] = useState<Record<number, boolean>>({})
  /** Full screen, phone only. */
  const [viewerOpen, setViewerOpen] = useState(false)
  const isPhone = useIsPhone()
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isMobileScreen, setIsMobileScreen] = useState(false)
  const [isDesktopScreen, setIsDesktopScreen] = useState(true)
  const [isHovering, setIsHovering] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Video player state
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [isVideoMuted, setIsVideoMuted] = useState(true)
  const [videoProgress, setVideoProgress] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  const imageRef = useRef<HTMLDivElement>(null)
  const autoplayRef = useRef<NodeJS.Timeout | null>(null)

  // Helper to convert any YouTube URL to embed format
  const toYouTubeEmbed = (url: string): string => {
    // Already in embed format
    if (url.includes('youtube.com/embed/')) return url

    // Extract video ID from various formats
    let videoId: string | null = null
    const patterns = [
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) {
        videoId = match[1]
        break
      }
    }

    return videoId ? `https://www.youtube.com/embed/${videoId}` : url
  }

  // Helper to get YouTube thumbnail URL from embed/video URL
  const getYouTubeThumbnail = (url: string): string => {
    let videoId: string | null = null
    const patterns = [
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) {
        videoId = match[1]
        break
      }
    }
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ""
  }

  // Build media items array: YouTube FIRST (if exists), then images, then video
  // This ensures YouTube embeds show first in the gallery when set by creator
  // YouTube embeds do NOT generate thumbnails - they are pure embeds only
  const mediaItems: MediaItem[] = [
    ...youtubeUrls.map(url => ({
      url: toYouTubeEmbed(url),
      type: "youtube" as const,
      // No thumbnailUrl for YouTube - pure embed only
    })),
    ...images.map(url => ({ url, type: "image" as const })),
    ...(videoUrl ? [{ url: videoUrl, type: "video" as const }] : []),
  ]

  // Video controls
  const toggleVideoPlay = useCallback(() => {
    if (videoRef.current) {
      if (isVideoPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsVideoPlaying(!isVideoPlaying)
    }
  }, [isVideoPlaying])

  const toggleVideoMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isVideoMuted
      setIsVideoMuted(!isVideoMuted)
    }
  }, [isVideoMuted])

  const handleVideoTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const progress = (videoRef.current.currentTime / videoRef.current.duration) * 100
      setVideoProgress(progress)
    }
  }, [])

  const handleVideoSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (videoRef.current) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percentage = x / rect.width
      videoRef.current.currentTime = percentage * videoRef.current.duration
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        videoRef.current.requestFullscreen()
      }
    }
  }, [])

  // Pause video when switching away from video slide
  useEffect(() => {
    const currentMedia = mediaItems[currentIndex]
    if (currentMedia?.type !== "video" && videoRef.current) {
      videoRef.current.pause()
      setIsVideoPlaying(false)
    }
  }, [currentIndex, mediaItems])

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
    if (isTransitioning) return
    setIsTransitioning(true)
    setCurrentIndex((prev) => (prev === 0 ? mediaItems.length - 1 : prev - 1))
    // Reset transition state after animation completes
    setTimeout(() => setIsTransitioning(false), 300)
  }, [mediaItems.length, isTransitioning])

  const goToNext = useCallback(() => {
    if (isTransitioning) return
    setIsTransitioning(true)
    setCurrentIndex((prev) => (prev === mediaItems.length - 1 ? 0 : prev + 1))
    // Reset transition state after animation completes
    setTimeout(() => setIsTransitioning(false), 300)
  }, [mediaItems.length, isTransitioning])

  // Autoplay for dots mode (only for images, pause on video/youtube)
  useEffect(() => {
    const currentMedia = mediaItems[currentIndex]
    if (!showDotsNavigation || mediaItems.length <= 1 || isPaused || currentMedia?.type !== "image") return

    autoplayRef.current = setInterval(() => {
      goToNext()
    }, autoplayInterval)

    return () => {
      if (autoplayRef.current) {
        clearInterval(autoplayRef.current)
      }
    }
  }, [showDotsNavigation, mediaItems.length, mediaItems, currentIndex, isPaused, autoplayInterval, goToNext])

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
      } else if (e.key === " " && mediaItems[currentIndex]?.type === "video") {
        e.preventDefault()
        toggleVideoPlay()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [currentIndex, mediaItems, goToPrevious, goToNext, handleUserInteraction, toggleVideoPlay])

  if (mediaItems.length === 0) return null

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
        style={backgroundColor ? { backgroundColor } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        /**
         * A TAP OPENS IT, A SWIPE DOES NOT.
         *
         * `onClick` fires after a swipe too, so opening on a bare click would
         * put the viewer up every time somebody moved to the next picture.
         * `touchEnd` has already recorded where the finger started and
         * finished; under the threshold that decides a slide change, this was
         * a tap.
         *
         * Phone only, deliberately. On a desktop the gallery is 600px wide
         * beside the buy card and there is nothing a lightbox would add.
         */
        onClick={() => {
          if (!isPhone) return
          const moved = touchStart !== null && touchEnd !== null ? Math.abs(touchStart - touchEnd) : 0
          if (moved > 10) return
          if (mediaItems[currentIndex]?.type === "youtube") return
          setViewerOpen(true)
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          setIsDragging(false)
          setIsHovering(false)
        }}
        onMouseEnter={() => setIsHovering(true)}
      >
        {/* Media items with smooth fade transition */}
        {mediaItems.map((media, index) => (
          <div
            key={index}
            className={cn(
              "absolute inset-0 transition-opacity duration-300 ease-in-out",
              currentIndex === index ? "opacity-100 z-10" : "opacity-0 z-0"
            )}
          >
            {media.type === "image" && (
              /**
               * IT ARRIVES RATHER THAN APPEARING.
               *
               * Every slide was painted at full opacity from the first frame,
               * so the picture snapped in the instant it decoded — on a phone
               * on mobile data that is a visible pop on the largest element
               * of the page. Held transparent until its own `onLoad`, then
               * faded over 400ms, it reads as the picture settling onto the
               * grey box that was already there.
               *
               * `priority` on the first one, so the browser starts it from
               * the document head instead of after hydration; the rest are
               * lazy, because a product with eight pictures should not fetch
               * eight before anyone has asked.
               */
              <Image
                src={media.url || "/placeholder.svg"}
                alt={`${title} - Image ${index + 1}`}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 66vw, 50vw"
                className={cn(
                  "object-cover pointer-events-none select-none",
                  "transition-opacity duration-[400ms] ease-out",
                  loaded[index] ? "opacity-100" : "opacity-0",
                )}
                priority={index === 0}
                loading={index === 0 ? "eager" : "lazy"}
                onLoad={() => setLoaded((m) => (m[index] ? m : { ...m, [index]: true }))}
                draggable={false}
              />
            )}
            {media.type === "video" && (
              <div className="relative w-full h-full bg-black">
                <video
                  ref={currentIndex === index ? videoRef : undefined}
                  src={media.url}
                  className="w-full h-full object-contain"
                  loop
                  muted={isVideoMuted}
                  playsInline
                  onTimeUpdate={handleVideoTimeUpdate}
                  onEnded={() => setIsVideoPlaying(false)}
                  onClick={toggleVideoPlay}
                />
                {/* Video Controls Overlay */}
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 via-transparent to-transparent transition-opacity duration-300",
                    isVideoPlaying && !isHovering ? "opacity-0" : "opacity-100"
                  )}
                >
                  {/* Play/Pause Button Center */}
                  {!isVideoPlaying && (
                    <button
                      onClick={toggleVideoPlay}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/90 flex items-center justify-center shadow-lg transform transition-transform hover:scale-105">
                        <Play className="w-8 h-8 sm:w-10 sm:h-10 text-gray-900 ml-1" fill="currentColor" />
                      </div>
                    </button>
                  )}
                  {/* Bottom Controls */}
                  <div className="p-3 sm:p-4 space-y-2">
                    {/* Progress Bar */}
                    <div
                      className="w-full h-1 bg-white/30 rounded-full cursor-pointer overflow-hidden"
                      onClick={handleVideoSeek}
                    >
                      <div
                        className="h-full bg-white rounded-full transition-all duration-100"
                        style={{ width: `${videoProgress}%` }}
                      />
                    </div>
                    {/* Control Buttons */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={toggleVideoPlay}
                          className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                        >
                          {isVideoPlaying ? (
                            <Pause className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                          ) : (
                            <Play className="w-4 h-4 sm:w-5 sm:h-5 text-white ml-0.5" />
                          )}
                        </button>
                        <button
                          onClick={toggleVideoMute}
                          className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                        >
                          {isVideoMuted ? (
                            <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                          ) : (
                            <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                          )}
                        </button>
                      </div>
                      <button
                        onClick={toggleFullscreen}
                        className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                      >
                        <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {media.type === "youtube" && currentIndex === index && (
              <div className="relative w-full h-full bg-black">
                <iframe
                  src={`${media.url}?autoplay=0&modestbranding=1&rel=0`}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={`${title} - Video ${index + 1}`}
                />
              </div>
            )}
            {media.type === "youtube" && currentIndex !== index && (
              <div className="relative w-full h-full">
                <Image
                  src={getYouTubeThumbnail(media.url)}
                  alt={`${title} - Video ${index + 1}`}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 66vw, 50vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-600 flex items-center justify-center">
                    <Play className="w-8 h-8 sm:w-10 sm:h-10 text-white ml-1" fill="currentColor" />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Navigation Arrows - show on hover for desktop, always visible on mobile */}
        {mediaItems.length > 1 && (
          <>
            <Button
              variant="secondary"
              size="icon"
              className={cn(
                "absolute left-2 sm:left-3 top-1/2 h-9 w-9 sm:h-10 sm:w-10 -translate-y-1/2 rounded-full bg-white/90 shadow-md hover:bg-white transition-all duration-200 ease-in-out z-20",
                // Mobile: always visible, Desktop: show on hover with smooth animation
                "sm:opacity-0 sm:scale-95 sm:group-hover:opacity-100 sm:group-hover:scale-100"
              )}
              onClick={(e) => {
                e.stopPropagation()
                goToPrevious()
                handleUserInteraction()
              }}
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className={cn(
                "absolute right-2 sm:right-3 top-1/2 h-9 w-9 sm:h-10 sm:w-10 -translate-y-1/2 rounded-full bg-white/90 shadow-md hover:bg-white transition-all duration-200 ease-in-out z-20",
                // Mobile: always visible, Desktop: show on hover with smooth animation
                "sm:opacity-0 sm:scale-95 sm:group-hover:opacity-100 sm:group-hover:scale-100"
              )}
              onClick={(e) => {
                e.stopPropagation()
                goToNext()
                handleUserInteraction()
              }}
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </>
        )}

        {/* Media Counter (show when not in dots mode) */}
        {mediaItems.length > 1 && !showDotsNavigation && (
          <div className="absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-xs sm:text-sm text-white z-20">
            {currentIndex + 1} / {mediaItems.length}
          </div>
        )}

        {/* Dots Navigation (when dots mode is active) */}
        {mediaItems.length > 1 && showDotsNavigation && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
            {mediaItems.map((_, index) => (
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
      {mediaItems.length > 1 && !showDotsNavigation && (
        <div className="w-full overflow-hidden">
          <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory px-1 scrollbar-hide">
            {mediaItems.map((media, index) => (
              <button
                key={index}
                onClick={() => {
                  setCurrentIndex(index)
                  handleUserInteraction()
                }}
                /**
                 * A THIN NEUTRAL EDGE, NOT A BRANDED ONE.
                 *
                 * The selected thumbnail carried `border-primary` with a
                 * `ring-2 ring-primary/20` halo around it — a 2px violet
                 * border and a glow, under a photograph, in a strip whose
                 * only job is to say which picture is showing. It read as a
                 * form field with focus rather than as a selection.
                 *
                 * What every shop that does this well uses: the unselected
                 * ones step back, the selected one is at full strength with a
                 * hairline around it in the text colour. No accent, no glow.
                 * `selectionColor` is still honoured when a theme provides
                 * one, as a border and nothing more.
                 */
                className={cn(
                  "relative shrink-0 overflow-hidden rounded-lg border transition-all duration-200 snap-start",
                  "h-16 w-20 sm:h-20 sm:w-24",
                  currentIndex === index
                    ? selectionColor
                      ? "opacity-100"
                      : "border-foreground opacity-100"
                    : "border-transparent opacity-55 hover:opacity-85",
                )}
                style={currentIndex === index && selectionColor ? { borderColor: selectionColor } : undefined}
                aria-label={`View ${media.type === "image" ? "image" : "video"} ${index + 1}`}
              >
                {media.type === "image" && (
                  <Image
                    src={media.url || "/placeholder.svg"}
                    alt={`${title} thumbnail ${index + 1}`}
                    fill
                    sizes="(max-width: 640px) 80px, 96px"
                    className="object-cover"
                  />
                )}
                {media.type === "video" && (
                  <div className="relative w-full h-full bg-gray-900">
                    <video
                      src={media.url}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Play className="h-4 w-4 sm:h-5 sm:w-5 text-white" fill="currentColor" />
                    </div>
                  </div>
                )}
                {media.type === "youtube" && (
                  <div className="relative w-full h-full">
                    <Image
                      src={getYouTubeThumbnail(media.url)}
                      alt={`${title} video thumbnail ${index + 1}`}
                      fill
                      sizes="(max-width: 640px) 80px, 96px"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-red-600 flex items-center justify-center">
                        <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/*
        Mounted only on a phone, so a desktop visitor never downloads it and
        the dialog's listeners are not attached where nothing can open them.
        YouTube embeds are left out of the list: the viewer shows a picture or
        a file, and an iframe full screen is the player's own business.
      */}
      {isPhone && (
        <ProductMediaViewer
          media={mediaItems
            .filter((m) => m.type !== "youtube")
            .map((m) => ({ type: m.type === "video" ? "video" : "image", url: m.url }))}
          title={title}
          index={Math.min(currentIndex, Math.max(0, mediaItems.filter((m) => m.type !== "youtube").length - 1))}
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          onIndexChange={setCurrentIndex}
        />
      )}
    </div>
  )
}
