"use client"

import { useMemo, useState, useEffect, useCallback, useRef } from "react"
import { ProductCard } from "./product-card"

interface MostPopularSectionProps {
  products: any[]
}

export function MostPopularSection({ products }: MostPopularSectionProps) {
  // Get most popular products — prioritize recent activity (last 48 hours) with engagement scoring
  const popularProducts = useMemo(() => {
    const now = Date.now()
    const fortyEightHoursAgo = now - 48 * 60 * 60 * 1000
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

    const scored = [...products]
      .filter(p => p.thumbnail_url)
      .map(p => {
        const createdAt = new Date(p.created_at).getTime()
        const isRecent48h = createdAt > fortyEightHoursAgo
        const isRecentWeek = createdAt > sevenDaysAgo

        // Engagement score: purchases/downloads weighted heaviest, then reviews, then views
        const salesScore = (p.sales_count || 0) * 5
        const reviewScore = (p.reviews_count || 0) * 3
        const ratingBonus = (p.reviews_average || 0) >= 4 ? (p.reviews_average || 0) * 2 : 0
        const viewScore = (p.view_count || 0) * 0.1
        const baseScore = salesScore + reviewScore + ratingBonus + viewScore

        // Recency boost: 3x for last 48h, 1.5x for last week
        const recencyMultiplier = isRecent48h ? 3 : isRecentWeek ? 1.5 : 1

        return { ...p, _score: baseScore * recencyMultiplier }
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 9)

    return scored
  }, [products])

  // Mobile: show max 6 products for cleaner navigation
  const mobileProducts = popularProducts.slice(0, 6)

  // Mobile carousel state
  const [currentMobileIndex, setCurrentMobileIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const mobileScrollRef = useRef<HTMLDivElement>(null)
  const autoplayIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const totalMobileProducts = mobileProducts.length

  // Scroll to specific product on mobile
  const scrollToProduct = useCallback((index: number) => {
    if (mobileScrollRef.current) {
      const targetSlide = mobileScrollRef.current.querySelector<HTMLElement>(`[data-popular-slide="${index}"]`)
      if (targetSlide) {
        targetSlide.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
      }
    }
    setCurrentMobileIndex(index)
  }, [])

  // Go to next product (mobile)
  const goToNextMobile = useCallback(() => {
    const nextIndex = (currentMobileIndex + 1) % totalMobileProducts
    scrollToProduct(nextIndex)
  }, [currentMobileIndex, totalMobileProducts, scrollToProduct])

  // Mobile autoplay (5s interval, pauses on touch)
  useEffect(() => {
    if (totalMobileProducts <= 1 || isPaused) return

    autoplayIntervalRef.current = setInterval(() => {
      goToNextMobile()
    }, 5000)

    return () => {
      if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current)
    }
  }, [isPaused, totalMobileProducts, goToNextMobile])

  // Handle scroll events to update current index
  const handleScroll = useCallback(() => {
    if (!mobileScrollRef.current) return

    const container = mobileScrollRef.current
    const slides = Array.from(container.querySelectorAll<HTMLElement>("[data-popular-slide]"))
    if (slides.length === 0) return

    const maxScrollLeft = container.scrollWidth - container.clientWidth
    const edgeThreshold = 8

    // Clamp edge cases so last/first dot stays accurate when browser cannot fully center slides at bounds
    if (container.scrollLeft <= edgeThreshold) {
      if (currentMobileIndex !== 0) setCurrentMobileIndex(0)
      return
    }

    if (container.scrollLeft >= maxScrollLeft - edgeThreshold) {
      const lastIndex = slides.length - 1
      if (currentMobileIndex !== lastIndex) setCurrentMobileIndex(lastIndex)
      return
    }

    const containerCenter = container.scrollLeft + container.clientWidth / 2

    let closestIndex = 0
    let closestDistance = Number.POSITIVE_INFINITY

    slides.forEach((slide, index) => {
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2
      const distance = Math.abs(slideCenter - containerCenter)

      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })

    if (closestIndex !== currentMobileIndex) {
      setCurrentMobileIndex(closestIndex)
    }
  }, [currentMobileIndex])

  // Pause autoplay on touch, resume after delay so it doesn't fight manual swiping
  const handleTouchStart = useCallback(() => {
    setIsPaused(true)
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current)
    pauseTimeoutRef.current = setTimeout(() => {
      setIsPaused(false)
    }, 6000) // 6s pause after touch so autoplay doesn't snap carousel back
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current)
    }
  }, [])

  if (popularProducts.length === 0) {
    return null
  }

  return (
    <section className="mt-8 md:mt-12 pt-[24px] pb-[24px] border-t border-neutral-100">
      {/* Section header */}
      <div className="flex items-center justify-between mb-5 md:mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg sm:text-2xl font-bold text-neutral-900">
            Most popular
          </h2>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 md:gap-1.5 md:px-3.5 md:py-2 rounded-full text-xs md:text-sm font-semibold bg-neutral-900 text-white">
            <span>🔥</span>
            <span>Hot</span>
          </span>
        </div>

      </div>

      {/* Desktop: Static 3x2 grid - no carousel, no dots */}
      <div className="hidden md:grid grid-cols-3 gap-5">
        {popularProducts.slice(0, 6).map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            srcParam="?src=platform"
            priority={index < 6}
          />
        ))}
      </div>

      {/* Mobile: Horizontal scroll carousel */}
      <div
        className="md:hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={mobileScrollRef}
          onScroll={handleScroll}
          className="overflow-x-auto scrollbar-hide -mx-4 px-4 snap-x snap-proximity"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="flex gap-4 pr-4">
            {mobileProducts.map((product, index) => (
              <div key={product.id} data-popular-slide={index} className="flex-shrink-0 w-[85%] snap-center">
                <ProductCard
                  product={product}
                  srcParam="?src=platform"
                  priority={index < 3}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Mobile navigation dots — pill style */}
        {totalMobileProducts > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {mobileProducts.map((_, index) => {
              const isActive = index === currentMobileIndex
              return (
                <button
                  key={index}
                  onClick={() => scrollToProduct(index)}
                  className={`rounded-full cursor-pointer transition-all duration-300 ${
                    isActive
                      ? "w-6 h-2 bg-neutral-900"
                      : "w-2 h-2 bg-neutral-300 hover:bg-neutral-400"
                  }`}
                  aria-label={`Go to product ${index + 1}`}
                />
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
