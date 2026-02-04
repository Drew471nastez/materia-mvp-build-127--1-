"use client"

import { useState, useCallback, useTransition, useMemo, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { FeaturedBannerCarousel } from "./featured-banner-carousel"
import { RecommendedSection } from "./recommended-section"
import { ProductCard } from "./product-card"
import { ProductCardSkeleton } from "./product-card-skeleton"
import { Layers, Sparkles, Code, Megaphone, Briefcase, GraduationCap } from "lucide-react"

// Fixed 6 categories only with icons
const CATEGORIES = [
  { id: "all", label: "All", icon: Layers },
  { id: "design", label: "Design", icon: Sparkles },
  { id: "development", label: "Development", icon: Code },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "business", label: "Business", icon: Briefcase },
  { id: "education", label: "Education", icon: GraduationCap },
] as const

// Filter types for Recommended section
const RECOMMENDATION_FILTERS = [
  { id: "curated", label: "Curated" },
  { id: "trending", label: "Trending" },
  { id: "hot-new", label: "Hot & New" },
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
  const [recommendationFilter, setRecommendationFilter] = useState<"curated" | "trending" | "hot-new">("curated")
  const categoryChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Products for different sections
  const featuredProducts = useMemo(() => {
    // Get first 5 products with thumbnails for the featured carousel
    return initialProducts.filter(p => p.thumbnail_url).slice(0, 5)
  }, [initialProducts])

  // Get recommended products based on filter
  const recommendedProducts = useMemo(() => {
    let products = [...initialProducts]

    switch (recommendationFilter) {
      case "trending":
        // Sort by sales count (most popular)
        products = products.sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
        break
      case "hot-new":
        // Sort by creation date (newest first) and has some sales
        products = products
          .filter(p => new Date(p.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) // Last 30 days
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        // If not enough recent products, add older ones
        if (products.length < 15) {
          const olderProducts = initialProducts
            .filter(p => !products.find(rp => rp.id === p.id))
            .slice(0, 15 - products.length)
          products = [...products, ...olderProducts]
        }
        break
      case "curated":
      default:
        // Default curated: mix of high-rated and diverse categories
        products = products.sort((a, b) => {
          const scoreA = (a.reviews_average || 0) * (a.reviews_count || 0) + (a.sales_count || 0)
          const scoreB = (b.reviews_average || 0) * (b.reviews_count || 0) + (b.sales_count || 0)
          return scoreB - scoreA
        })
        break
    }

    return products.slice(0, 15)
  }, [initialProducts, recommendationFilter])

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

      {/* Recommended Section with filter pills - only show if no search and we have products */}
      {!searchQuery && recommendedProducts.length > 0 && (
        <div className="mt-10">
          {/* Filter pills above Recommended */}
          <div className="flex items-center gap-2 mb-6">
            {RECOMMENDATION_FILTERS.map((filter) => {
              const isSelected = recommendationFilter === filter.id
              return (
                <button
                  key={filter.id}
                  onClick={() => setRecommendationFilter(filter.id as typeof recommendationFilter)}
                  className={`
                    px-4 py-2 rounded-full text-sm font-medium cursor-pointer select-none
                    transition-all duration-150 ease-out
                    active:scale-[0.98]
                    ${isSelected
                      ? "bg-neutral-900 text-white shadow-sm"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900"
                    }
                  `}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>

          {/* Recommended section */}
          <RecommendedSection products={recommendedProducts} filterType={recommendationFilter} />
        </div>
      )}

      {/* Category Pills - Left aligned, with icons, positioned under Recommended section with extra gap */}
      <nav aria-label="Product categories" className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide mt-10">
        {CATEGORIES.map((category, index) => {
          const isSelected = selectedCategory === category.id
          const Icon = category.icon

          return (
            <button
              key={category.id}
              onClick={() => handleCategoryChange(category.id)}
              className={`
                relative inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium
                whitespace-nowrap cursor-pointer select-none
                transition-all duration-150 ease-out
                active:scale-[0.98]
                ${isSelected
                  ? "bg-neutral-900 text-white shadow-sm"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900"
                }
              `}
              aria-pressed={isSelected}
            >
              {/* Show icon on first category (All) */}
              {index === 0 && <Icon className="w-4 h-4" />}
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
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in-0 duration-200">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : filteredProducts.length > 0 ? (
            <div
              key={`products-${selectedCategory}`}
              className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
            >
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
