"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { getProductUrl } from "@/lib/url-helpers"

interface FeaturedProduct {
  id: string
  title: string
  slug: string
  thumbnail_url?: string | null
  creator?: {
    slug?: string
    profile?: {
      display_name?: string | null
      username?: string | null
    } | null
  } | null
}

interface FeaturedBannerCarouselProps {
  products: FeaturedProduct[]
}

const AUTOPLAY_INTERVAL = 5000 // 5 seconds

export function FeaturedBannerCarousel({ products }: FeaturedBannerCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const progressRef = useRef<number>(0)
  const animationRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)

  // Limit to 5 products
  const featuredProducts = products.slice(0, 5)
  const totalSlides = featuredProducts.length

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

  if (featuredProducts.length === 0) {
    return null
  }

  const currentProduct = featuredProducts[currentIndex]
  const creatorUsername = currentProduct?.creator?.profile?.username || currentProduct?.creator?.slug || ""
  const creatorName = currentProduct?.creator?.profile?.display_name || "Creator"
  const productUrl = getProductUrl(creatorUsername, currentProduct?.slug || "")

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden bg-neutral-100"
      style={{ aspectRatio: "2.5 / 1", minHeight: "280px", maxHeight: "400px" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Slides */}
      <div className="absolute inset-0">
        {featuredProducts.map((product, index) => {
          const isActive = index === currentIndex
          const username = product.creator?.profile?.username || product.creator?.slug || ""
          const url = getProductUrl(username, product.slug || "")

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

      {/* Content overlay - always visible for current slide */}
      <div className="absolute inset-0 z-20 flex flex-col justify-end p-6 sm:p-8 md:p-10">
        <div className="max-w-lg">
          {/* Product title */}
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 line-clamp-2 drop-shadow-lg">
            {currentProduct?.title || "Featured Product"}
          </h2>

          {/* Creator name */}
          <p className="text-sm sm:text-base text-white/80 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
            {creatorName}
          </p>

          {/* CTA Button */}
          <Link
            href={productUrl}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-neutral-900 font-semibold text-sm rounded-lg hover:bg-white/90 transition-colors shadow-lg"
          >
            View product
          </Link>
        </div>
      </div>

      {/* Navigation arrows - show on hover */}
      <button
        onClick={goToPrevious}
        className={`absolute left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg transition-all duration-200 ${
          isHovered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
        }`}
        aria-label="Previous slide"
      >
        <ChevronLeft className="w-5 h-5 text-neutral-700" />
      </button>

      <button
        onClick={goToNext}
        className={`absolute right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg transition-all duration-200 ${
          isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"
        }`}
        aria-label="Next slide"
      >
        <ChevronRight className="w-5 h-5 text-neutral-700" />
      </button>

      {/* Progress indicators - slim lines at bottom */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
        {featuredProducts.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className="relative h-1 w-8 sm:w-12 rounded-full overflow-hidden bg-white/30 hover:bg-white/40 transition-colors"
            aria-label={`Go to slide ${index + 1}`}
          >
            {/* Progress fill */}
            <div
              className="absolute inset-y-0 left-0 bg-white rounded-full transition-all"
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
