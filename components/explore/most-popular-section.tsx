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
      .slice(0, 6)

    return scored
  }, [products])

  // Mobile carousel state
  const [currentMobileIndex, setCurrentMobileIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const mobileScrollRef = useRef<HTMLDivElement>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const autoplayIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const totalMobileProducts = popularProducts.length

  // Scroll to specific product on mobile
  const scrollToProduct = useCallback((index: number) => {
    if (mobileScrollRef.current) {
      const container = mobileScrollRef.current
      const itemWidth = container.clientWidth * 0.85 + 16 // 85% width + gap
      container.scrollTo({
        left: index * itemWidth,
        behavior: 'smooth'
      })
    }
    setCurrentMobileIndex(index)
    setProgress(0)
  }, [])

  // Go to next product (mobile)
  const goToNextMobile = useCallback(() => {
    const nextIndex = (currentMobileIndex + 1) % totalMobileProducts
    scrollToProduct(nextIndex)
  }, [currentMobileIndex, totalMobileProducts, scrollToProduct])

  // Mobile autoplay with progress
  useEffect(() => {
    if (totalMobileProducts <= 1) return

    const startProgress = () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)

      progressIntervalRef.current = setInterval(() => {
        if (!isPaused) {
          setProgress(prev => {
            if (prev >= 100) return 100
            return prev + 2.5 // 40 steps over 4 seconds
          })
        }
      }, 100)
    }

    const startAutoplay = () => {
      if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current)

      autoplayIntervalRef.current = setInterval(() => {
        if (!isPaused) {
          goToNextMobile()
        }
      }, 4000)
    }

    startProgress()
    startAutoplay()

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current)
    }
  }, [isPaused, totalMobileProducts, goToNextMobile])

  // Reset progress when index changes
  useEffect(() => {
    setProgress(0)
  }, [currentMobileIndex])

  // Handle scroll events to update current index
  const handleScroll = useCallback(() => {
    if (mobileScrollRef.current) {
      const container = mobileScrollRef.current
      const itemWidth = container.clientWidth * 0.85 + 16
      const newIndex = Math.round(container.scrollLeft / itemWidth)
      if (newIndex !== currentMobileIndex && newIndex >= 0 && newIndex < totalMobileProducts) {
        setCurrentMobileIndex(newIndex)
        setProgress(0)
      }
    }
  }, [currentMobileIndex, totalMobileProducts])

  if (popularProducts.length === 0) {
    return null
  }

  return (
    <section className="mt-8 md:mt-12 pt-[24px] pb-[24px] border-t border-neutral-100">
      {/* Section header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">
            Most popular
          </h2>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            <span>🔥</span>
            <span>last 48 hours</span>
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

      {/* Mobile: Horizontal scroll carousel with auto-swipe */}
      <div
        className="md:hidden"
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        <div
          ref={mobileScrollRef}
          onScroll={handleScroll}
          className="overflow-x-auto scrollbar-hide -mx-4 px-4 snap-x snap-mandatory touch-pan-x"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="flex gap-4">
            {popularProducts.map((product, index) => (
              <div key={product.id} className="flex-shrink-0 w-[85%] snap-center">
                <ProductCard
                  product={product}
                  srcParam="?src=platform"
                  priority={index < 3}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Mobile navigation dots with progress fill */}
        {totalMobileProducts > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            {popularProducts.map((_, index) => {
              const isActive = index === currentMobileIndex
              const progressWidth = isActive ? progress : (index < currentMobileIndex ? 100 : 0)

              return (
                <button
                  key={index}
                  onClick={() => scrollToProduct(index)}
                  className="relative h-1 w-8 rounded-full overflow-hidden bg-gray-300 cursor-pointer transition-all hover:bg-gray-400"
                  aria-label={`Go to product ${index + 1}`}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-neutral-800 rounded-full transition-all duration-100"
                    style={{ width: `${progressWidth}%` }}
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
