"use client"

import { useState, useCallback, useTransition, useMemo, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
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
    }, 150)
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
    <div className="space-y-8">
      {/* Featured Banner Carousel - only show if we have featured products and no search */}
      {!searchQuery && featuredProducts.length > 0 && (
        <FeaturedBannerCarousel products={featuredProducts} />
      )}

      {/* Category Pills - Single row, 6 categories only */}
      <nav aria-label="Product categories" className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {CATEGORIES.map((category) => {
          const isSelected = selectedCategory === category.id
          const isLoading = isLoadingCategory && selectedCategory === category.id

          return (
            <button
              key={category.id}
              onClick={() => handleCategoryChange(category.id)}
              disabled={isLoading}
              className={`
                relative inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium
                whitespace-nowrap transition-all duration-200 ease-out
                ${isSelected
                  ? "bg-neutral-900 text-white shadow-sm"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 active:bg-neutral-300"
                }
                ${isLoading ? "cursor-wait" : "cursor-pointer"}
              `}
              aria-pressed={isSelected}
            >
              {isLoading && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              {category.label}
            </button>
          )
        })}
      </nav>

      {/* Recommended Section - only show if no search and we have products */}
      {!searchQuery && recommendedProducts.length > 0 && (
        <RecommendedSection products={recommendedProducts} />
      )}

      {/* All Products Section (when filtering or searching) */}
      {(searchQuery || selectedCategory !== "all") && (
        <section className="mt-8">
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-6">
            {searchQuery
              ? `Results for "${searchQuery}"`
              : `${CATEGORIES.find(c => c.id === selectedCategory)?.label || "All"} Products`
            }
          </h2>

          {showSkeletons ? (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
