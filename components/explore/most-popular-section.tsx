"use client"

import { useMemo, useState, useEffect, useCallback, useRef, type TouchEvent } from "react"
import { ProductCard } from "./product-card"
import { ArrowRight } from "lucide-react"

interface MostPopularSectionProps {
  products: any[]
}

export function MostPopularSection({ products }: MostPopularSectionProps) {
  // Get most popular products based on sales count - get enough for carousel pages
  const popularProducts = useMemo(() => {
    return [...products]
      .filter(p => p.thumbnail_url) // Only products with thumbnails
      .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
      .slice(0, 18) // Enough for 3 pages of 6 products each
  }, [products])

  const [currentPage, setCurrentPage] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const autoplayIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Touch swipe support
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Desktop: 6 products per page (3x2), Mobile: 1 product per swipe
  const productsPerPageDesktop = 6
  const totalPagesDesktop = Math.ceil(popularProducts.length / productsPerPageDesktop)

  // Get products for current desktop page
  const currentDesktopProducts = useMemo(() => {
    const start = currentPage * productsPerPageDesktop
    return popularProducts.slice(start, start + productsPerPageDesktop)
  }, [popularProducts, currentPage, productsPerPageDesktop])

  const goToNext = useCallback(() => {
    setCurrentPage(prev => (prev + 1) % totalPagesDesktop)
    setProgress(0)
  }, [totalPagesDesktop])

  const goToPrevious = useCallback(() => {
    setCurrentPage(prev => (prev - 1 + totalPagesDesktop) % totalPagesDesktop)
    setProgress(0)
  }, [totalPagesDesktop])

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page)
    setProgress(0)
  }, [])

  // Autoplay with progress bar (5 seconds per slide)
  useEffect(() => {
    if (totalPagesDesktop <= 1) return

    const startProgress = () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)

      progressIntervalRef.current = setInterval(() => {
        if (!isPaused) {
          setProgress(prev => {
            if (prev >= 100) return 100
            return prev + 2 // 50 steps over 5 seconds (100ms interval)
          })
        }
      }, 100)
    }

    const startAutoplay = () => {
      if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current)

      autoplayIntervalRef.current = setInterval(() => {
        if (!isPaused) {
          goToNext()
        }
      }, 5000)
    }

    startProgress()
    startAutoplay()

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      if (autoplayIntervalRef.current) clearInterval(autoplayIntervalRef.current)
    }
  }, [isPaused, totalPagesDesktop, goToNext])

  // Reset progress when page changes
  useEffect(() => {
    setProgress(0)
  }, [currentPage])

  // Touch handlers for mobile swipe
  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.targetTouches[0].clientX
    setIsPaused(true)
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    touchEndX.current = e.targetTouches[0].clientX
  }, [])

  const handleTouchEnd = useCallback(() => {
    const diff = touchStartX.current - touchEndX.current
    const minSwipeDistance = 50

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0) {
        goToNext()
      } else {
        goToPrevious()
      }
    }
    setIsPaused(false)
  }, [goToNext, goToPrevious])

  if (popularProducts.length === 0) {
    return null
  }

  return (
    <section
      className="mt-8 md:mt-12 pt-6 md:pt-8 border-t border-neutral-100"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Section header with navigation arrows */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">
          Most popular
        </h2>

        {/* Navigation arrows - right aligned */}
        {totalPagesDesktop > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToPrevious}
              className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
              aria-label="Previous"
            >
              <ArrowRight className="w-4 h-4 text-neutral-700 rotate-180" />
            </button>
            <button
              type="button"
              onClick={goToNext}
              className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
              aria-label="Next"
            >
              <ArrowRight className="w-4 h-4 text-neutral-700" />
            </button>
          </div>
        )}
      </div>

      {/* Desktop: 3x2 grid carousel */}
      <div
        ref={containerRef}
        className="hidden md:block"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="grid grid-cols-3 gap-5">
          {currentDesktopProducts.map((product, index) => (
            <ProductCard
              key={`${product.id}-${currentPage}`}
              product={product}
              srcParam="?src=platform"
              priority={index < 6}
            />
          ))}
        </div>
      </div>

      {/* Mobile: Horizontal scroll carousel with 1 product visible */}
      <div
        className="md:hidden overflow-x-auto scrollbar-hide -mx-4 px-4 snap-x snap-mandatory touch-pan-x"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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

      {/* Navigation dots with progress fill - below products */}
      {totalPagesDesktop > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {Array.from({ length: totalPagesDesktop }).map((_, index) => {
            const isActive = index === currentPage
            const progressWidth = isActive ? progress : (index < currentPage ? 100 : 0)

            return (
              <button
                key={index}
                onClick={() => goToPage(index)}
                className="relative h-1 w-8 rounded-full overflow-hidden bg-gray-300 cursor-pointer transition-all hover:bg-gray-400"
                aria-label={`Go to page ${index + 1}`}
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
    </section>
  )
}
