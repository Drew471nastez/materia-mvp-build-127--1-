"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ProductCard } from "./product-card"

interface RecommendedSectionProps {
  products: any[]
  filterType?: "curated" | "trending" | "hot-new"
}

const ITEMS_PER_PAGE = 3

export function RecommendedSection({ products, filterType = "curated" }: RecommendedSectionProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const totalPages = Math.ceil(products.length / ITEMS_PER_PAGE)

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(0)
  }, [filterType])

  const currentProducts = useMemo(() => {
    const startIndex = currentPage * ITEMS_PER_PAGE
    return products.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [products, currentPage])

  const goToPrevious = useCallback(() => {
    if (isAnimating || currentPage === 0) return
    setIsAnimating(true)
    setSlideDirection("right")

    // Small delay for smooth animation
    setTimeout(() => {
      setCurrentPage((prev) => Math.max(0, prev - 1))
      setTimeout(() => {
        setIsAnimating(false)
        setSlideDirection(null)
      }, 200)
    }, 50)
  }, [isAnimating, currentPage])

  const goToNext = useCallback(() => {
    if (isAnimating || currentPage >= totalPages - 1) return
    setIsAnimating(true)
    setSlideDirection("left")

    // Small delay for smooth animation
    setTimeout(() => {
      setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))
      setTimeout(() => {
        setIsAnimating(false)
        setSlideDirection(null)
      }, 200)
    }, 50)
  }, [isAnimating, currentPage, totalPages])

  const canGoPrevious = currentPage > 0
  const canGoNext = currentPage < totalPages - 1

  if (products.length === 0) {
    return null
  }

  return (
    <section>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900">
          Recommended
        </h2>

        {/* Navigation controls */}
        {totalPages > 1 && (
          <div className="flex items-center gap-3">
            {/* Page indicator */}
            <span className="text-sm text-neutral-500 tabular-nums">
              {currentPage + 1}/{totalPages}
            </span>

            {/* Arrow buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={goToPrevious}
                disabled={!canGoPrevious || isAnimating}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 ${
                  canGoPrevious && !isAnimating
                    ? "hover:bg-neutral-100 text-neutral-700"
                    : "text-neutral-300 cursor-not-allowed"
                }`}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={goToNext}
                disabled={!canGoNext || isAnimating}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 ${
                  canGoNext && !isAnimating
                    ? "hover:bg-neutral-100 text-neutral-700"
                    : "text-neutral-300 cursor-not-allowed"
                }`}
                aria-label="Next page"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Products grid with smooth slide animation */}
      <div
        ref={containerRef}
        className="relative overflow-hidden"
      >
        <div
          className={`
            grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
            transition-all duration-200 ease-out
            ${isAnimating && slideDirection === "left" ? "translate-x-[-8px] opacity-90" : ""}
            ${isAnimating && slideDirection === "right" ? "translate-x-[8px] opacity-90" : ""}
            ${!isAnimating ? "translate-x-0 opacity-100" : ""}
          `}
        >
          {currentProducts.map((product, index) => (
            <div
              key={product.id}
              className="transition-all duration-200 ease-out"
              style={{
                transitionDelay: `${index * 30}ms`
              }}
            >
              <ProductCard
                product={product}
                srcParam="?src=platform"
                priority={index < 3}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
