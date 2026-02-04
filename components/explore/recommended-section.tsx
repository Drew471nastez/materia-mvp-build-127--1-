"use client"

import { useState, useCallback, useMemo } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ProductCard } from "./product-card"

interface RecommendedSectionProps {
  products: any[]
}

const ITEMS_PER_PAGE = 3

export function RecommendedSection({ products }: RecommendedSectionProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const totalPages = Math.ceil(products.length / ITEMS_PER_PAGE)

  const currentProducts = useMemo(() => {
    const startIndex = currentPage * ITEMS_PER_PAGE
    return products.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [products, currentPage])

  const goToPrevious = useCallback(() => {
    if (isTransitioning) return
    setIsTransitioning(true)
    setCurrentPage((prev) => Math.max(0, prev - 1))
    setTimeout(() => setIsTransitioning(false), 300)
  }, [isTransitioning])

  const goToNext = useCallback(() => {
    if (isTransitioning) return
    setIsTransitioning(true)
    setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))
    setTimeout(() => setIsTransitioning(false), 300)
  }, [isTransitioning, totalPages])

  const canGoPrevious = currentPage > 0
  const canGoNext = currentPage < totalPages - 1

  if (products.length === 0) {
    return null
  }

  return (
    <section className="mt-10">
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
                disabled={!canGoPrevious}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  canGoPrevious
                    ? "hover:bg-neutral-100 text-neutral-700"
                    : "text-neutral-300 cursor-not-allowed"
                }`}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={goToNext}
                disabled={!canGoNext}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  canGoNext
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

      {/* Products grid with transition */}
      <div
        className={`grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 transition-opacity duration-300 ${
          isTransitioning ? "opacity-50" : "opacity-100"
        }`}
      >
        {currentProducts.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            srcParam="?src=platform"
            priority={index < 3}
          />
        ))}
      </div>
    </section>
  )
}
