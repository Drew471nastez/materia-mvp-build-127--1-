"use client"

import { useState, useCallback, useTransition, useMemo, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { FeaturedBannerCarousel } from "./featured-banner-carousel"
import { RecommendedSection } from "./recommended-section"
import { ProductCard } from "./product-card"
import { ProductCardSkeleton } from "./product-card-skeleton"

// Fixed 6 categories only
const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "design", label: "Design" },
  { id: "development", label: "Development" },
  { id: "marketing", label: "Marketing" },
  { id: "business", label: "Business" },
  { id: "education", label: "Education" },
] as const

interface ExplorePageClientProps {
  initialProducts: any[]
  initialCategory: string
  searchQuery: string
}

export function ExplorePageClient({
  initialProducts,
  initialCategory,
  searchQuery,
}: ExplorePageClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedCategory, setSelectedCategory] = useState(initialCategory.toLowerCase() || "all")
  const [isLoadingCategory, setIsLoadingCategory] = useState(false)
  const categoryChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Products for different sections
  const featuredProducts = useMemo(() => {
    // Get first 5 products with thumbnails for the featured carousel
    return initialProducts.filter(p => p.thumbnail_url).slice(0, 5)
  }, [initialProducts])

  const recommendedProducts = useMemo(() => {
    // Get up to 15 products for the recommended section (paginated by 3)
    return initialProducts.slice(0, 15)
  }, [initialProducts])

  // Filter products by selected category
  const filteredProducts = useMemo(() => {
    if (selectedCategory === "all") {
      return initialProducts
    }
    return initialProducts.filter(p => {
      const productCategory = (p.category || p.categoryName || "").toLowerCase()
      const creatorTags = p.creator?.niche_tags?.map((t: string) => t.toLowerCase()) || []
      return productCategory === selectedCategory || creatorTags.includes(selectedCategory)
    })
  }, [initialProducts, selectedCategory])

  // Handle category change with instant feedback
  const handleCategoryChange = useCallback((categoryId: string) => {
    // Instant UI feedback
    setSelectedCategory(categoryId)
    setIsLoadingCategory(true)

    // Clear any pending timeout
    if (categoryChangeTimeoutRef.current) {
      clearTimeout(categoryChangeTimeoutRef.current)
    }

    // Small delay to show loading state, then update URL
    categoryChangeTimeoutRef.current = setTimeout(() => {
      startTransition(() => {
        const newUrl = `/explore?category=${categoryId}${searchQuery ? `&q=${searchQuery}` : ""}`
        router.push(newUrl, { scroll: false })
      })
      setIsLoadingCategory(false)
    }, 100)
  }, [router, searchQuery])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (categoryChangeTimeoutRef.current) {
        clearTimeout(categoryChangeTimeoutRef.current)
      }
    }
  }, [])

  // Sync category from URL on mount/navigation
  useEffect(() => {
    const normalizedCategory = initialCategory.toLowerCase() || "all"
    if (normalizedCategory !== selectedCategory) {
      setSelectedCategory(normalizedCategory)
    }
  }, [initialCategory])

  const showSkeletons = isPending || isLoadingCategory

  return (
    <div className="space-y-6">
      {/* Featured Banner Carousel - only show if we have featured products and no search */}
      {!searchQuery && featuredProducts.length > 0 && (
        <FeaturedBannerCarousel products={featuredProducts} />
      )}

      {/* Recommended Section - only show if no search and we have products */}
      {!searchQuery && recommendedProducts.length > 0 && (
        <RecommendedSection products={recommendedProducts} />
      )}

      {/* Category Pills - Positioned UNDER Recommended section */}
      <nav aria-label="Product categories" className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {CATEGORIES.map((category) => {
          const isSelected = selectedCategory === category.id
          const isLoading = isLoadingCategory && selectedCategory === category.id

          return (
            <button
              key={category.id}
              onClick={() => handleCategoryChange(category.id)}
              disabled={isLoading}
              className={`
                relative inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium
                whitespace-nowrap transition-colors duration-150 ease-out
                ${isSelected
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }
              `}
              aria-pressed={isSelected}
            >
              {/* Subtle loading indicator - small pulsing dot */}
              {isLoading && (
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              )}
              {category.label}
            </button>
          )
        })}
      </nav>

      {/* Products Section - Shows when category is selected or searching */}
      {(selectedCategory !== "all" || searchQuery) && (
        <section>
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-5">
            {searchQuery
              ? `Results for "${searchQuery}"`
              : `${CATEGORIES.find(c => c.id === selectedCategory)?.label || "All"} Products`
            }
          </h2>

          {showSkeletons ? (
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  srcParam="?src=platform"
                  priority={index < 3}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
              <p className="text-neutral-500">
                {searchQuery
                  ? `No products found for "${searchQuery}"`
                  : "No products found in this category."
                }
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
