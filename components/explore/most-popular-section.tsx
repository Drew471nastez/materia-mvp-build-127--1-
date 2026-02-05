"use client"

import { useMemo, useState, useEffect, useCallback, useRef } from "react"
import { ProductCard } from "./product-card"

interface MostPopularSectionProps {
  products: any[]
}

export function MostPopularSection({ products }: MostPopularSectionProps) {
  // Get most popular products based on sales count
  const popularProducts = useMemo(() => {
    return [...products]
      .filter(p => p.thumbnail_url) // Only products with thumbnails
      .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
      .slice(0, 6) // 6 products for 3x2 grid on desktop
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
    <section className="mt-8 md:mt-12 pt-6 md:pt-8 pb-[30px] border-t border-neutral-100">
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
