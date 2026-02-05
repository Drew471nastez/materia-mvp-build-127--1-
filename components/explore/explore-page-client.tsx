"use client"

import { useState, useCallback, useTransition, useMemo, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FeaturedBannerCarousel } from "./featured-banner-carousel"
import { ProductCard } from "./product-card"
import { ProductCardSkeleton } from "./product-card-skeleton"
import { Layers, Sparkles, Zap, Share2, Bot, SlidersHorizontal, X, Check, ChevronRight } from "lucide-react"

// Categories with icons - includes all header categories
const CATEGORIES = [
  { id: "all", label: "All", icon: Layers },
  { id: "design", label: "Design", icon: Sparkles },
  { id: "development", label: "Development", icon: Zap },
  { id: "marketing", label: "Marketing", icon: Share2 },
  { id: "business", label: "Business", icon: Layers },
  { id: "ai", label: "AI", icon: Bot },
  { id: "social-media", label: "Social Media", icon: Share2 },
  { id: "productivity", label: "Productivity", icon: Zap },
] as const

// Filter types for category section
const RECOMMENDATION_FILTERS = [
  { id: "curated", label: "Curated" },
  { id: "trending", label: "Trending" },
  { id: "hot-new", label: "Hot & New" },
] as const

// Price filter options
const PRICE_FILTERS = [
  { id: "all", label: "All Prices" },
  { id: "free", label: "Free" },
  { id: "under-10", label: "Under $10" },
  { id: "10-50", label: "$10 - $50" },
  { id: "50-plus", label: "$50+" },
] as const

// Sort options
const SORT_OPTIONS = [
  { id: "newest", label: "Newest" },
  { id: "popular", label: "Most Popular" },
  { id: "price-low", label: "Price: Low to High" },
  { id: "price-high", label: "Price: High to Low" },
] as const

// Mobile Filter Bottom Sheet Component
function MobileFilterSheet({
  isOpen,
  onClose,
  priceFilter,
  setPriceFilter,
  sortBy,
  setSortBy,
  resetFilters,
  activeFilterCount,
}: {
  isOpen: boolean
  onClose: () => void
  priceFilter: string
  setPriceFilter: (value: string) => void
  sortBy: string
  setSortBy: (value: string) => void
  resetFilters: () => void
  activeFilterCount: number
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
      }, 400)
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setDragY(0)
    setTimeout(() => {
      onClose()
    }, 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const sheetElement = sheetRef.current
    if (!sheetElement) return

    const sheetRect = sheetElement.getBoundingClientRect()
    const touchYInSheet = touch.clientY - sheetRect.top

    if (touchYInSheet <= 60) {
      startY.current = touch.clientY
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current
    if (diff > 0) {
      setDragY(diff * 0.8)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 80) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100] md:hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ease-out ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDuration: '400ms' }}
        onClick={handleClose}
      />
      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '85vh',
        }}
      >
        {/* Handle bar */}
        <div className="pt-3 pb-2">
          <button
            onClick={handleClose}
            className="w-full flex justify-center py-2 cursor-pointer touch-none"
          >
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100">
          <h3 className="text-lg font-semibold text-neutral-900">Filters</h3>
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="text-sm text-violet-600 font-medium cursor-pointer"
            >
              Reset all
            </button>
          )}
        </div>

        <div className="overflow-y-auto overscroll-contain p-4 space-y-6" style={{ maxHeight: 'calc(85vh - 140px)' }}>
          {/* Price Filter */}
          <div>
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Price Range</h4>
            <div className="flex flex-wrap gap-2">
              {PRICE_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setPriceFilter(filter.id)}
                  className={`
                    inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium
                    transition-all duration-150 cursor-pointer
                    ${priceFilter === filter.id
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }
                  `}
                >
                  {priceFilter === filter.id && <Check className="w-3.5 h-3.5" />}
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sort By */}
          <div>
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Sort By</h4>
            <div className="space-y-1">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSortBy(option.id)}
                  className={`
                    flex items-center justify-between w-full px-4 py-3.5 rounded-xl text-sm font-medium
                    transition-all duration-150 cursor-pointer
                    ${sortBy === option.id
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-50"
                    }
                  `}
                >
                  <span>{option.label}</span>
                  {sortBy === option.id && <Check className="w-5 h-5 text-violet-600" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-4 border-t border-neutral-100 bg-white">
          <button
            onClick={resetFilters}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors cursor-pointer"
          >
            Reset
          </button>
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  )
}

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
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [selectedCategory, setSelectedCategory] = useState(initialCategory.toLowerCase() || "all")
  const [isLoadingCategory, setIsLoadingCategory] = useState(false)
  const [recommendationFilter, setRecommendationFilter] = useState<"curated" | "trending" | "hot-new">("curated")
  const categoryChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const categorySectionRef = useRef<HTMLElement>(null)
  const hasScrolledRef = useRef(false)

  // Filter states
  const [priceFilter, setPriceFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("newest")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Smooth scroll to category section when category changes from URL (external navigation)
  useEffect(() => {
    const categoryParam = searchParams.get("category")

    // Only scroll if coming from header navigation (category param present and not "all")
    if (categoryParam && categoryParam !== "all" && !hasScrolledRef.current) {
      hasScrolledRef.current = true
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        categorySectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      }, 150)
    }
  }, [searchParams])

  // Reset scroll flag when category changes internally
  useEffect(() => {
    if (selectedCategory === "all") {
      hasScrolledRef.current = false
    }
  }, [selectedCategory])

  // Products for featured section
  const featuredProducts = useMemo(() => {
    return initialProducts.filter(p => p.thumbnail_url).slice(0, 5)
  }, [initialProducts])

  // Get category products based on filter and selected category
  const categoryProducts = useMemo(() => {
    let products = [...initialProducts]

    // Filter by category first (if not "all")
    if (selectedCategory !== "all") {
      products = products.filter(p => {
        const productCategory = (p.category || p.categoryName || "").toLowerCase()
        const creatorTags = p.creator?.niche_tags?.map((t: string) => t.toLowerCase()) || []
        return productCategory === selectedCategory || creatorTags.includes(selectedCategory)
      })
    }

    // Apply recommendation filter
    switch (recommendationFilter) {
      case "trending":
        products = products.sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
        break
      case "hot-new":
        products = products
          .filter(p => new Date(p.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        if (products.length < 15) {
          const olderProducts = initialProducts
            .filter(p => !products.find(rp => rp.id === p.id))
            .slice(0, 15 - products.length)
          products = [...products, ...olderProducts]
        }
        break
      case "curated":
      default:
        products = products.sort((a, b) => {
          const scoreA = (a.reviews_average || 0) * (a.reviews_count || 0) + (a.sales_count || 0)
          const scoreB = (b.reviews_average || 0) * (b.reviews_count || 0) + (b.sales_count || 0)
          return scoreB - scoreA
        })
        break
    }

    // Apply price filter
    switch (priceFilter) {
      case "free":
        products = products.filter(p => p.price_cents === 0)
        break
      case "under-10":
        products = products.filter(p => p.price_cents > 0 && p.price_cents < 1000)
        break
      case "10-50":
        products = products.filter(p => p.price_cents >= 1000 && p.price_cents <= 5000)
        break
      case "50-plus":
        products = products.filter(p => p.price_cents > 5000)
        break
    }

    // Apply sort
    switch (sortBy) {
      case "popular":
        products = products.sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
        break
      case "price-low":
        products = products.sort((a, b) => (a.price_cents || 0) - (b.price_cents || 0))
        break
      case "price-high":
        products = products.sort((a, b) => (b.price_cents || 0) - (a.price_cents || 0))
        break
      case "newest":
        products = products.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
    }

    return products.slice(0, 30)
  }, [initialProducts, selectedCategory, recommendationFilter, priceFilter, sortBy])

  // Get active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (priceFilter !== "all") count++
    if (sortBy !== "newest") count++
    return count
  }, [priceFilter, sortBy])

  // Reset filters
  const resetFilters = useCallback(() => {
    setPriceFilter("all")
    setSortBy("newest")
  }, [])

  // Get section title based on selected category
  const sectionTitle = useMemo(() => {
    if (searchQuery) return `Results for "${searchQuery}"`
    if (selectedCategory === "all") return "Recommended"
    return CATEGORIES.find(c => c.id === selectedCategory)?.label || "Products"
  }, [selectedCategory, searchQuery])

  // Handle category change with instant feedback and auto-scroll
  const handleCategoryChange = useCallback((categoryId: string) => {
    // Instant UI feedback
    setSelectedCategory(categoryId)
    setIsLoadingCategory(true)

    // Clear any pending timeout
    if (categoryChangeTimeoutRef.current) {
      clearTimeout(categoryChangeTimeoutRef.current)
    }

    // Small delay to show loading state, then update URL and scroll
    categoryChangeTimeoutRef.current = setTimeout(() => {
      startTransition(() => {
        const newUrl = `/explore?category=${categoryId}${searchQuery ? `&q=${searchQuery}` : ""}`
        router.push(newUrl, { scroll: false })
      })
      setIsLoadingCategory(false)

      // Auto-scroll to category section if not "all"
      if (categoryId !== "all") {
        setTimeout(() => {
          categorySectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })
        }, 50)
      }
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
      {/* Featured Banner Carousel - always first, only show if no search */}
      {!searchQuery && featuredProducts.length > 0 && (
        <FeaturedBannerCarousel products={featuredProducts} />
      )}

      {/* Dynamic Category Section - shows after banner */}
      {!searchQuery && (
        <section ref={categorySectionRef} className="mt-10 scroll-mt-28">
          {/* Section Header with Title, Filter Pills, and Filters Button */}
          <div className="flex flex-col gap-4 mb-6">
            {/* Title Row */}
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900">
                {sectionTitle}
              </h2>

              {/* Filters Button - Desktop dropdown, Mobile opens sheet */}
              <div className="relative">
                {/* Desktop Filter Button */}
                <button
                  onClick={() => {
                    if (window.innerWidth >= 768) {
                      setFiltersOpen(!filtersOpen)
                    } else {
                      setMobileFiltersOpen(true)
                    }
                  }}
                  className={`
                    inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium
                    transition-all duration-150 cursor-pointer select-none
                    ${filtersOpen || activeFilterCount > 0
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                    }
                  `}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="hidden sm:inline">Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-white text-neutral-900 text-[11px] font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {/* Desktop Filters Dropdown */}
                {filtersOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40 hidden md:block"
                      onClick={() => setFiltersOpen(false)}
                    />
                    <div className="hidden md:block absolute right-0 top-full mt-2 w-[320px] bg-white rounded-2xl shadow-xl border border-neutral-200 z-50 animate-in fade-in-0 slide-in-from-top-2 duration-200 overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
                        <h3 className="text-sm font-semibold text-neutral-900">Filters</h3>
                        <button
                          onClick={() => setFiltersOpen(false)}
                          className="p-1 rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4 text-neutral-500" />
                        </button>
                      </div>

                      <div className="p-4 space-y-5">
                        {/* Price Filter */}
                        <div>
                          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Price</h4>
                          <div className="flex flex-wrap gap-2">
                            {PRICE_FILTERS.map((filter) => (
                              <button
                                key={filter.id}
                                onClick={() => setPriceFilter(filter.id)}
                                className={`
                                  inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
                                  transition-all duration-150 cursor-pointer
                                  ${priceFilter === filter.id
                                    ? "bg-neutral-900 text-white"
                                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                                  }
                                `}
                              >
                                {priceFilter === filter.id && <Check className="w-3 h-3" />}
                                {filter.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Sort By */}
                        <div>
                          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Sort By</h4>
                          <div className="space-y-1">
                            {SORT_OPTIONS.map((option) => (
                              <button
                                key={option.id}
                                onClick={() => setSortBy(option.id)}
                                className={`
                                  flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm font-medium
                                  transition-all duration-150 cursor-pointer
                                  ${sortBy === option.id
                                    ? "bg-neutral-100 text-neutral-900"
                                    : "text-neutral-600 hover:bg-neutral-50"
                                  }
                                `}
                              >
                                <span>{option.label}</span>
                                {sortBy === option.id && <Check className="w-4 h-4 text-violet-600" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center gap-3 px-4 py-3 border-t border-neutral-100 bg-neutral-50">
                        <button
                          onClick={resetFilters}
                          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-200 transition-colors cursor-pointer"
                        >
                          Reset
                        </button>
                        <button
                          onClick={() => setFiltersOpen(false)}
                          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Filter Pills Row - Curated, Trending, Hot & New */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {RECOMMENDATION_FILTERS.map((filter) => {
                const isSelected = recommendationFilter === filter.id
                return (
                  <button
                    key={filter.id}
                    onClick={() => setRecommendationFilter(filter.id as typeof recommendationFilter)}
                    className={`
                      px-4 py-2 rounded-full text-sm font-medium cursor-pointer select-none whitespace-nowrap
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

            {/* Active Filters Pills */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-neutral-500">Active:</span>
                {priceFilter !== "all" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                    {PRICE_FILTERS.find(f => f.id === priceFilter)?.label}
                    <button
                      onClick={() => setPriceFilter("all")}
                      className="hover:bg-violet-200 rounded-full p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {sortBy !== "newest" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                    {SORT_OPTIONS.find(o => o.id === sortBy)?.label}
                    <button
                      onClick={() => setSortBy("newest")}
                      className="hover:bg-violet-200 rounded-full p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                <button
                  onClick={resetFilters}
                  className="text-xs text-neutral-500 hover:text-neutral-700 underline cursor-pointer"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Products Grid */}
          {showSkeletons ? (
            <div className="grid gap-5 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 animate-in fade-in-0 duration-200">
              {Array.from({ length: 10 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : categoryProducts.length > 0 ? (
            <div
              key={`products-${selectedCategory}-${recommendationFilter}-${priceFilter}-${sortBy}`}
              className="grid gap-5 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
            >
              {categoryProducts.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  srcParam="?src=platform"
                  priority={index < 5}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
              <p className="text-neutral-500">
                {priceFilter !== "all"
                  ? "No products match your filters. Try adjusting your price range."
                  : "No products found in this category."
                }
              </p>
              {activeFilterCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="mt-3 text-sm text-violet-600 hover:text-violet-700 font-medium cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Product count */}
          {categoryProducts.length > 0 && (
            <p className="text-sm text-neutral-500 mt-4 text-center">
              Showing {categoryProducts.length} {categoryProducts.length === 1 ? "product" : "products"}
            </p>
          )}
        </section>
      )}

      {/* Category Pills - positioned below the category section */}
      <nav aria-label="Product categories" className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide mt-8">
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
              {index === 0 && <Icon className="w-4 h-4" />}
              {category.label}
            </button>
          )
        })}
      </nav>

      {/* Search Results Section - only shows when searching */}
      {searchQuery && (
        <section className="mt-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-5">
            Results for "{searchQuery}"
          </h2>

          {categoryProducts.length > 0 ? (
            <div className="grid gap-5 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 animate-in fade-in-0 duration-200">
              {categoryProducts.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  srcParam="?src=platform"
                  priority={index < 5}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
              <p className="text-neutral-500">No products found for "{searchQuery}"</p>
            </div>
          )}
        </section>
      )}

      {/* Mobile Filter Sheet */}
      <MobileFilterSheet
        isOpen={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        priceFilter={priceFilter}
        setPriceFilter={setPriceFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        resetFilters={resetFilters}
        activeFilterCount={activeFilterCount}
      />
    </div>
  )
}
