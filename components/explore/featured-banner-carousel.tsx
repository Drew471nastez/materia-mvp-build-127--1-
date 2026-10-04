"use client"

import { useState, useEffect, useCallback, useRef, TouchEvent, ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { getProductUrl, getStoreUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/smart-link"
import { AppAvatar } from "@/components/app/app-avatar"
import { intervalOf, perInterval } from "@/lib/pricing/list-price"

interface FeaturedProduct {
  id: string
  title: string
  slug: string
  price_cents?: number
  type?: string | null
  price_interval?: "month" | "year" | null
  thumbnail_url?: string | null
  creator?: {
    slug?: string
    profile?: {
      display_name?: string | null
      username?: string | null
      avatar_url?: string | null
    } | null
  } | null
}

interface FeaturedBannerCarouselProps {
  products: FeaturedProduct[]
  overlay?: React.ReactNode  // Custom overlay replaces default product info
}

const AUTOPLAY_INTERVAL = 5000 // 5 seconds

export function FeaturedBannerCarousel({ products, overlay }: FeaturedBannerCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const progressRef = useRef<number>(0)
  const animationRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)

  // Touch/swipe state
  const touchStartX = useRef<number>(0)
  const touchEndX = useRef<number>(0)
  const touchMoved = useRef<boolean>(false)

  // Limit to 5 products
  const featuredProducts = products.slice(0, 5)
  const totalSlides = featuredProducts.length

  // Format price helper
  const formatPrice = (cents?: number) => {
    if (!cents || cents === 0) return "Free"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  // Reset progress when slide changes
  useEffect(() => {
    progressRef.current = 0
    setProgress(0)
    lastTimeRef.current = 0
  }, [currentIndex])

  // Autoplay with smooth progress animation
  useEffect(() => {
    if (totalSlides <= 1 || isPaused) return

    const animate = (timestamp: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp
      }

      const elapsed = timestamp - lastTimeRef.current
      progressRef.current = Math.min(progressRef.current + elapsed, AUTOPLAY_INTERVAL)
      setProgress((progressRef.current / AUTOPLAY_INTERVAL) * 100)

      if (progressRef.current >= AUTOPLAY_INTERVAL) {
        setCurrentIndex((prev) => (prev + 1) % totalSlides)
        progressRef.current = 0
        lastTimeRef.current = timestamp
      } else {
        lastTimeRef.current = timestamp
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [totalSlides, isPaused, currentIndex])

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index)
    progressRef.current = 0
    setProgress(0)
    lastTimeRef.current = 0
  }, [])

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides)
  }, [totalSlides])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % totalSlides)
  }, [totalSlides])

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
    setIsPaused(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    setIsPaused(false)
    lastTimeRef.current = 0
  }, [])

  // Touch handlers for swipe — distinguishes taps from swipes so links/buttons work
  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.targetTouches[0].clientX
    touchEndX.current = e.targetTouches[0].clientX // reset so a tap = diff 0
    touchMoved.current = false
    setIsPaused(true)
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    touchEndX.current = e.targetTouches[0].clientX
    touchMoved.current = true
  }, [])

  const handleTouchEnd = useCallback(() => {
    // Only evaluate swipe if the finger actually moved
    if (touchMoved.current) {
      const diff = touchStartX.current - touchEndX.current
      const minSwipeDistance = 50

      if (Math.abs(diff) > minSwipeDistance) {
        if (diff > 0) {
          goToNext()
        } else {
          goToPrevious()
        }
      }
    }
    // If !touchMoved, it was a tap — do nothing so links/buttons get the click

    setIsPaused(false)
    lastTimeRef.current = 0
  }, [goToNext, goToPrevious])

  if (featuredProducts.length === 0) {
    return null
  }

  const currentProduct = featuredProducts[currentIndex]
  // Only use profile.username — it's what /u/[username] routes look up.
  const creatorUsername = currentProduct?.creator?.profile?.username || ""
  const creatorName = currentProduct?.creator?.profile?.display_name || "Creator"
  const creatorAvatar = currentProduct?.creator?.profile?.avatar_url
  const baseProductUrl = getProductUrl(creatorUsername, currentProduct?.slug || "")
  const productUrl = `${baseProductUrl}${baseProductUrl.includes("?") ? "&" : "?"}layout=discover&recommended=1`
  // "#" when username is unknown so the creator link is a safe no-op.
  const creatorStoreUrl = creatorUsername ? getStoreUrl(creatorUsername) : "#"
  const productPrice = currentProduct?.price_cents

  return (
    <div className="w-full">
      {/* Banner Container */}
      <div
        className="relative w-full rounded-2xl overflow-hidden bg-neutral-200 touch-pan-y md:min-h-[231px] md:max-h-[315px]"
        style={{ aspectRatio: "3.15 / 1", minHeight: "220px", maxHeight: "300px" }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
      {/* Slides */}
      <div className="absolute inset-0">
        {featuredProducts.map((product, index) => {
          const isActive = index === currentIndex

          return (
            <div
              key={product.id}
              className={`absolute inset-0 transition-opacity duration-500 ease-out ${
                isActive ? "opacity-100 z-10" : "opacity-0 z-0"
              }`}
            >
              {/* Background Image */}
              {product.thumbnail_url ? (
                <Image
                  src={product.thumbnail_url}
                  alt={product.title || "Featured product"}
                  fill
                  sizes="100vw"
                  className="object-cover"
                  priority={index === 0}
                  loading={index === 0 ? undefined : "lazy"}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-600" />
              )}

              {/* Dark overlay for text readability */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />

              {/* Additional subtle gradient from left */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />
            </div>
          )
        })}
      </div>

      {/* Content overlay - custom or default product info */}
      <div className="absolute inset-0 z-20 flex flex-col justify-end p-5 sm:p-6 md:p-8">
        {overlay ? (
          <>{overlay}</>
        ) : (
          <div className="max-w-lg">
            {/* Product title */}
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-3 line-clamp-2 drop-shadow-lg">
              {currentProduct?.title || "Featured Product"}
            </h2>

            {/* Creator info with avatar - clickable */}
            <SmartLink
              href={creatorStoreUrl}
              className="inline-flex items-center gap-2.5 mb-4 group"
            >
              {/* The shared avatar on the picture's dark ground: a photo, or the default face, never initials. */}
              <AppAvatar src={creatorAvatar} name={creatorName} alt="" size={24} kind="person" tone="dark" />
              <span className="text-sm text-white/80 group-hover:text-white transition-colors">
                {creatorName}
              </span>
            </SmartLink>

            {/* Price and CTA */}
            <div className="flex items-center gap-4">
              <SmartLink
                href={productUrl}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-neutral-900 font-semibold text-sm rounded-lg hover:bg-white/90 transition-colors shadow-lg"
              >
                View product
              </SmartLink>
              <span className="text-lg font-bold text-white drop-shadow-md">
                {/* A membership's price is per month or year (lib/pricing/list-price). */}
                {productPrice ? perInterval(formatPrice(productPrice), intervalOf(currentProduct ?? {})) : formatPrice(productPrice)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation arrows - positioned at bottom right, hidden on mobile */}
        <div
          className={`absolute bottom-5 right-5 sm:bottom-6 sm:right-6 z-30 hidden md:flex items-center gap-2 transition-opacity duration-200 ${
            isHovered ? "opacity-100" : "opacity-0"
          }`}
        >
          <button
            onClick={goToPrevious}
            className="w-10 h-10 rounded-full bg-neutral-900/80 hover:bg-neutral-900 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Previous slide"
            type="button"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>

          <button
            onClick={goToNext}
            className="w-10 h-10 rounded-full bg-neutral-900/80 hover:bg-neutral-900 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Next slide"
            type="button"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Desktop Progress indicators - INSIDE banner, white, bottom center */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 hidden md:flex items-center gap-2">
          {featuredProducts.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className="relative h-1 w-8 rounded-full overflow-hidden bg-white/30 hover:bg-white/40 transition-colors cursor-pointer"
              aria-label={`Go to slide ${index + 1}`}
              type="button"
            >
              <div
                className="absolute inset-y-0 left-0 bg-white rounded-full"
                style={{
                  width: index === currentIndex ? `${progress}%` : index < currentIndex ? "100%" : "0%",
                  transition: index === currentIndex ? "none" : "width 0.3s ease-out"
                }}
              />
            </button>
          ))}
        </div>
      </div> {/* End of Banner Container */}

      {/* Mobile Progress indicators - OUTSIDE banner, below it */}
      <div className="flex md:hidden items-center justify-center gap-2 mt-3">
        {featuredProducts.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className="relative h-1 w-8 rounded-full overflow-hidden bg-gray-300 hover:bg-gray-400 transition-colors cursor-pointer"
            aria-label={`Go to slide ${index + 1}`}
            type="button"
          >
            <div
              className="absolute inset-y-0 left-0 bg-neutral-800 rounded-full"
              style={{
                width: index === currentIndex ? `${progress}%` : index < currentIndex ? "100%" : "0%",
                transition: index === currentIndex ? "none" : "width 0.3s ease-out"
              }}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
