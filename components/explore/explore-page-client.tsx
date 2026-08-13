"use client"

import { useState, useCallback, useTransition, useMemo, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { FeaturedBannerCarousel } from "./featured-banner-carousel"
import { ProductCard } from "./product-card"
import { ProductCardSkeleton } from "./product-card-skeleton"
import { AnimatedSearchPlaceholder } from "./animated-search-placeholder"
import {
  SearchSuggestionsPanel,
  type PersonSuggestion,
  type SearchSuggestionsPanelHandle,
} from "./search-suggestions-panel"
import { WishlistProvider } from "./wishlist-context"
import { MobileFeed } from "./mobile-feed"
import {
  CATEGORIES,
  categoryLabel,
  getCategory,
  getSubcategories,
  normalizeCategoryToId,
  type Category,
  type Subcategory,
} from "@/lib/marketplace/categories"
import { useRecentSearches, type RecentSearch } from "@/lib/hooks/use-recent-searches"
import { useRecentlyViewed, type RecentlyViewedProduct } from "@/lib/hooks/use-recently-viewed"
import { getProductInternalPath, getStoreUrl } from "@/lib/url-helpers"
import { Layers, SlidersHorizontal, X, Check, Search, ChevronLeft, ChevronRight, ChevronDown, ArrowRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useLocale } from "@/components/locale-provider"

// Safe body scroll lock/unlock helpers that prevent scroll bugs
let scrollLockCount = 0
let lockedScrollY = 0

function getCurrentScrollY() {
  return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0
}

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    lockedScrollY = getCurrentScrollY()
    document.body.style.setProperty('--scroll-y', `-${lockedScrollY}px`)
    document.body.classList.add('modal-open')
  }
  scrollLockCount++
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0) {
    document.body.classList.remove('modal-open')
    document.body.style.removeProperty('--scroll-y')

    const html = document.documentElement
    const previousScrollBehavior = html.style.scrollBehavior
    html.style.scrollBehavior = 'auto'

    requestAnimationFrame(() => {
      window.scrollTo(0, lockedScrollY)
      document.body.scrollTop = lockedScrollY
      html.scrollTop = lockedScrollY
      html.style.scrollBehavior = previousScrollBehavior
    })
  }
}

// Filter types for Recommended section
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

const PRODUCTS_PER_PAGE = 12 // 4 per row x 3 rows on desktop (portrait cards)

// Debounce before the seller lookup fires — long enough that a fast typist
// spends one request, short enough that the Sellers section still feels live.
const PEOPLE_DEBOUNCE_MS = 250

// Below this a people search matches half the marketplace; not worth the round trip.
const MIN_PEOPLE_QUERY_LENGTH = 2

// Stable references — an inline [] would rebuild the dropdown's memoised row list
// on every keystroke.
const NO_RECENT_SEARCHES: readonly RecentSearch[] = []
const NO_RECENTLY_VIEWED: readonly RecentlyViewedProduct[] = []

// Mobile Filter Bottom Sheet Component
function MobileFilterSheet({
  isOpen,
  onClose,
  priceFilter,
  setPriceFilter,
  sortBy,
  setSortBy,
  selectedSubcategories,
  setSelectedSubcategories,
  availableSubcategories,
  resetFilters,
  activeFilterCount,
}: {
  isOpen: boolean
  onClose: () => void
  priceFilter: string
  setPriceFilter: (value: string) => void
  sortBy: string
  setSortBy: (value: string) => void
  selectedSubcategories: string[]
  setSelectedSubcategories: (value: string[]) => void
  availableSubcategories: readonly Subcategory[]
  resetFilters: () => void
  activeFilterCount: number
}) {
  const { t } = useLocale()
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    setIsVisible(true)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsAnimating(true)
      })
    })
  }, [isOpen])

  useEffect(() => {
    if (isOpen || !isVisible) return

    setIsAnimating(false)
    const timer = setTimeout(() => {
      setIsVisible(false)
      setDragY(0)
    }, 400)

    return () => clearTimeout(timer)
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
    if (touchYInSheet <= 0 || touchYInSheet <= 100) {
      startY.current = touch.clientY
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current
    if (diff > 0) { e.preventDefault(); setDragY(diff * 0.8) }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 80) handleClose()
    else setDragY(0)
  }

  const toggleSubcategory = (subId: string) => {
    if (selectedSubcategories.includes(subId)) {
      setSelectedSubcategories(selectedSubcategories.filter(s => s !== subId))
    } else {
      setSelectedSubcategories([...selectedSubcategories, subId])
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100] md:hidden" style={{ touchAction: 'none' }} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ease-out ${isAnimating ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDuration: '400ms' }}
        onClick={handleClose}
      />
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl flex flex-col"
        style={{
          transform: !isAnimating
            ? 'translate3d(0, 100%, 0)'
            : dragY > 0
              ? `translate3d(0, ${dragY}px, 0)`
              : 'none',
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '85vh',
        }}
      >
        <div className="pt-3 pb-2 shrink-0">
          <button onClick={handleClose} className="w-full flex justify-center py-2 cursor-pointer touch-none">
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100 shrink-0">
          <h3 className="text-lg font-semibold text-neutral-900">{t("marketplace.filters")}</h3>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-sm text-violet-600 font-medium cursor-pointer">
              {t("marketplace.reset_all")}
            </button>
          )}
        </div>

        <div className="overflow-y-auto overscroll-contain p-4 space-y-6 flex-1 min-h-0" style={{ touchAction: 'pan-y' }}>
          {availableSubcategories.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-neutral-900 mb-3">{t("marketplace.subcategories")}</h4>
              <div className="flex flex-wrap gap-2">
                {availableSubcategories.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => toggleSubcategory(sub.id)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
                      selectedSubcategories.includes(sub.id)
                        ? "bg-violet-600 text-white"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    {selectedSubcategories.includes(sub.id) && <Check className="w-3.5 h-3.5" />}
                    {sub.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">{t("marketplace.price_range")}</h4>
            <div className="flex flex-wrap gap-2">
              {PRICE_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setPriceFilter(filter.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
                    priceFilter === filter.id
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {priceFilter === filter.id && <Check className="w-3.5 h-3.5" />}
                  {t(`marketplace.price_${filter.id}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">{t("marketplace.sort_by")}</h4>
            <div className="space-y-1">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSortBy(option.id)}
                  className={`flex items-center justify-between w-full px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
                    sortBy === option.id ? "bg-neutral-100 text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  <span>{t(`marketplace.sort_${option.id}`)}</span>
                  {sortBy === option.id && <Check className="w-5 h-5 text-violet-600" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 pt-4 border-t border-neutral-100 bg-white shrink-0" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
          <button
            onClick={resetFilters}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors cursor-pointer"
          >
            {t("marketplace.reset")}
          </button>
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            {t("marketplace.apply_filters")}
          </button>
        </div>
      </div>
    </div>
  )
}

// Category Selector Modal Component with Subcategories
function CategorySelectorModal({
  isOpen,
  onClose,
  selectedCategory,
  selectedSubcategory,
  onSelectCategory,
  onSelectSubcategory,
}: {
  isOpen: boolean
  onClose: () => void
  selectedCategory: string
  selectedSubcategory: string | null
  onSelectCategory: (categoryId: string, subcategoryId?: string, subcategoryLabel?: string) => void
  onSelectSubcategory: (categoryId: string, subcategoryId: string, subcategoryLabel: string) => void
}) {
  const { t } = useLocale()
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    setIsVisible(true)
    setExpandedCategory(null)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsAnimating(true)
      })
    })
  }, [isOpen])

  useEffect(() => {
    if (isOpen || !isVisible) return

    setIsAnimating(false)
    const timer = setTimeout(() => {
      setIsVisible(false)
      setDragY(0)
      setExpandedCategory(null)
    }, 400)

    return () => clearTimeout(timer)
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
    if (touchYInSheet <= 0 || touchYInSheet <= 100) {
      startY.current = touch.clientY
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current
    if (diff > 0) { e.preventDefault(); setDragY(diff * 0.8) }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 80) handleClose()
    else setDragY(0)
  }

  const handleSelectCategory = (categoryId: string) => {
    onSelectCategory(categoryId)
    handleClose()
  }

  const handleSelectSubcategory = (categoryId: string, subId: string, subLabel: string) => {
    onSelectSubcategory(categoryId, subId, subLabel)
    handleClose()
  }

  const handleCategoryClick = (cat: Category) => {
    if (cat.subcategories && cat.subcategories.length > 0) {
      setExpandedCategory(expandedCategory === cat.id ? null : cat.id)
    } else {
      handleSelectCategory(cat.id)
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100]" style={{ touchAction: 'none' }}>
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ease-out ${isAnimating ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDuration: '400ms' }}
        onClick={handleClose}
      />
      {/* Desktop Modal */}
      <div className="hidden md:flex items-center justify-center h-full p-4">
        <div
          className={`bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transition-all duration-300 ${
            isAnimating ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
            <h3 className="text-lg font-semibold text-neutral-900">{t("marketplace.select_category")}</h3>
            <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-neutral-100 transition-colors cursor-pointer">
              <X className="w-5 h-5 text-neutral-500" />
            </button>
          </div>
          <div className="p-3 max-h-[60vh] overflow-y-auto">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon
              const isSelected = selectedCategory === cat.id && !selectedSubcategory
              const isExpanded = expandedCategory === cat.id
              // Widened out of the `as const` tuple so .map() resolves to one call signature
              const subcategories: readonly Subcategory[] = cat.subcategories
              const hasSubcats = subcategories.length > 0

              return (
                <div key={cat.id}>
                  <button
                    onClick={() => handleCategoryClick(cat)}
                    className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-left transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isSelected ? "text-white" : "text-neutral-400"}`} />
                    <span className="font-medium flex-1">{cat.label}</span>
                    {hasSubcats && (
                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""} ${isSelected ? "text-white" : "text-neutral-400"}`} />
                    )}
                    {isSelected && !hasSubcats && <Check className="w-5 h-5" />}
                  </button>
                  {/* Subcategories */}
                  {hasSubcats && isExpanded && (
                    <div className="ml-8 mt-1 mb-2 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                      <button
                        onClick={() => handleSelectCategory(cat.id)}
                        className={`flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm text-left transition-all duration-150 cursor-pointer ${
                          selectedCategory === cat.id && !selectedSubcategory
                            ? "bg-violet-100 text-violet-700 font-medium"
                            : "text-neutral-600 hover:bg-neutral-50"
                        }`}
                      >
                        <span>{t("feed.all")} {cat.label}</span>
                        {selectedCategory === cat.id && !selectedSubcategory && <Check className="w-4 h-4 ml-auto" />}
                      </button>
                      {subcategories.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => handleSelectSubcategory(cat.id, sub.id, sub.label)}
                          className={`flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm text-left transition-all duration-150 cursor-pointer ${
                            selectedSubcategory === sub.id
                              ? "bg-violet-100 text-violet-700 font-medium"
                              : "text-neutral-600 hover:bg-neutral-50"
                          }`}
                        >
                          <span>{sub.label}</span>
                          {selectedSubcategory === sub.id && <Check className="w-4 h-4 ml-auto" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {/* Mobile Bottom Sheet - 65% screen height */}
      <div
        ref={sheetRef}
        className="md:hidden absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: !isAnimating
            ? 'translate3d(0, 100%, 0)'
            : dragY > 0
              ? `translate3d(0, ${dragY}px, 0)`
              : 'none',
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '70vh',
        }}
      >
        <div
          className="pt-3 pb-2 touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <button onClick={handleClose} className="w-full flex justify-center py-2 cursor-pointer">
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100">
          <h3 className="text-lg font-semibold text-neutral-900">{t("marketplace.select_category")}</h3>
        </div>

        <div className="overflow-y-auto overscroll-contain p-3" style={{ maxHeight: 'calc(70vh - 80px)', touchAction: 'pan-y' }}>
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isSelected = selectedCategory === cat.id && !selectedSubcategory
            const isExpanded = expandedCategory === cat.id
            // Widened out of the `as const` tuple so .map() resolves to one call signature
            const subcategories: readonly Subcategory[] = cat.subcategories
            const hasSubcats = subcategories.length > 0

            return (
              <div key={cat.id}>
                <button
                  onClick={() => handleCategoryClick(cat)}
                  className={`flex items-center gap-3 w-full px-4 py-4 rounded-xl text-left transition-all duration-150 cursor-pointer touch-manipulation ${
                    isSelected
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isSelected ? "text-white" : "text-neutral-400"}`} />
                  <span className="font-medium text-base flex-1">{cat.label}</span>
                  {hasSubcats && (
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""} ${isSelected ? "text-white" : "text-neutral-400"}`} />
                  )}
                  {isSelected && !hasSubcats && <Check className="w-5 h-5" />}
                </button>
                {/* Mobile Subcategories */}
                {hasSubcats && isExpanded && (
                  <div className="ml-6 mt-1 mb-2 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <button
                      onClick={() => handleSelectCategory(cat.id)}
                      className={`flex items-center gap-2 w-full px-4 py-3 rounded-lg text-sm text-left transition-all duration-150 cursor-pointer touch-manipulation ${
                        selectedCategory === cat.id && !selectedSubcategory
                          ? "bg-violet-100 text-violet-700 font-medium"
                          : "text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      <span>{t("feed.all")} {cat.label}</span>
                      {selectedCategory === cat.id && !selectedSubcategory && <Check className="w-4 h-4 ml-auto" />}
                    </button>
                    {subcategories.map((sub, index) => (
                      <button
                        key={sub.id}
                        onClick={() => handleSelectSubcategory(cat.id, sub.id, sub.label)}
                        className={`flex items-center gap-2 w-full px-4 py-3 rounded-lg text-sm text-left transition-all duration-150 cursor-pointer touch-manipulation animate-in fade-in slide-in-from-right-2 ${
                          selectedSubcategory === sub.id
                            ? "bg-violet-100 text-violet-700 font-medium"
                            : "text-neutral-600 hover:bg-neutral-50"
                        }`}
                        style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'both' }}
                      >
                        <span>{sub.label}</span>
                        {selectedSubcategory === sub.id && <Check className="w-4 h-4 ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Marketplace search field: animated placeholder while idle, suggestions dropdown
// (recent searches, recently viewed listings, sellers) while focused.
function SearchInput({
  searchQuery,
  setSearchQuery,
  categoryId,
}: {
  searchQuery: string
  setSearchQuery: (value: string) => void
  categoryId: string
}) {
  const { t } = useLocale()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<SearchSuggestionsPanelHandle>(null)
  // A tap inside the panel blurs the input on touch, so the close has to be
  // deferred or the tap never reaches the row underneath.
  const blurTimeoutRef = useRef<number | null>(null)

  const [isFocused, setIsFocused] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null)
  const [people, setPeople] = useState<PersonSuggestion[]>([])
  const [peopleLoading, setPeopleLoading] = useState(false)

  const { searches, add: addSearch, remove: removeSearch, clear: clearSearches } = useRecentSearches()
  const { products: recentlyViewed } = useRecentlyViewed()

  const trimmedQuery = searchQuery.trim()
  const isPeopleQuery = trimmedQuery.length >= MIN_PEOPLE_QUERY_LENGTH

  // Debounced seller lookup — one in-flight request, aborted on every keystroke
  useEffect(() => {
    if (!suggestionsOpen || !isPeopleQuery) {
      setPeople([])
      setPeopleLoading(false)
      return
    }

    const controller = new AbortController()
    setPeopleLoading(true)

    const timer = window.setTimeout(() => {
      fetch(`/api/v2/search/people?q=${encodeURIComponent(trimmedQuery)}&limit=4`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: { people?: PersonSuggestion[] }) => {
          setPeople(Array.isArray(data.people) ? data.people : [])
          setPeopleLoading(false)
        })
        .catch(() => {
          // Aborted by the next keystroke, or offline — just drop the Sellers section
          if (controller.signal.aborted) return
          setPeople([])
          setPeopleLoading(false)
        })
    }, PEOPLE_DEBOUNCE_MS)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [suggestionsOpen, isPeopleQuery, trimmedQuery])

  const cancelDeferredClose = useCallback(() => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
  }, [])

  const closeSuggestions = useCallback(() => {
    cancelDeferredClose()
    setSuggestionsOpen(false)
    panelRef.current?.clearHighlight()
  }, [cancelDeferredClose])

  useEffect(() => cancelDeferredClose, [cancelDeferredClose])

  const handleFocus = useCallback(() => {
    cancelDeferredClose()
    setIsFocused(true)
    setSuggestionsOpen(true)
  }, [cancelDeferredClose])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
    cancelDeferredClose()
    blurTimeoutRef.current = window.setTimeout(() => {
      blurTimeoutRef.current = null
      setSuggestionsOpen(false)
      panelRef.current?.clearHighlight()
    }, 150)
  }, [cancelDeferredClose])

  // Seller stores live on a subdomain, so only internal paths can be pushed
  const navigate = useCallback((href: string) => {
    if (href.startsWith("/")) router.push(href)
    else window.location.href = href
  }, [router])

  const dismiss = useCallback(() => {
    closeSuggestions()
    inputRef.current?.blur()
  }, [closeSuggestions])

  // A recent-search row replays with the category it was saved under; a fresh
  // submit inherits whichever category the feed is currently showing.
  const handleSelectSearch = useCallback((query: string, category?: string) => {
    const q = query.trim()
    if (!q) return

    addSearch(q, category)
    setSearchQuery(q)
    dismiss()
    router.push(`/explore?q=${encodeURIComponent(q)}${category ? `&category=${category}` : ""}`)
  }, [addSearch, dismiss, router, setSearchQuery])

  const submitSearch = useCallback(() => {
    handleSelectSearch(searchQuery, categoryId !== "all" ? categoryId : undefined)
  }, [categoryId, handleSelectSearch, searchQuery])

  const handleSelectProduct = useCallback((product: RecentlyViewedProduct) => {
    dismiss()
    router.push(getProductInternalPath(product.slug))
  }, [dismiss, router])

  const handleSelectPerson = useCallback((person: PersonSuggestion) => {
    const username = person.profile?.username
    if (!username) return
    dismiss()
    navigate(getStoreUrl(username))
  }, [dismiss, navigate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSuggestionsOpen(true)
      panelRef.current?.moveHighlight(1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      panelRef.current?.moveHighlight(-1)
    } else if (e.key === "Enter") {
      e.preventDefault()
      // A highlighted row wins over the raw query — that is what the user is looking at
      if (panelRef.current?.commitHighlight()) return
      submitSearch()
    } else if (e.key === "Escape") {
      closeSuggestions()
    }
  }, [closeSuggestions, submitSearch])

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 pointer-events-none" />
      <Input
        ref={inputRef}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        // Empty while idle so the animated overlay is the only placeholder on screen
        placeholder={isFocused ? t("marketplace.search_storelib") : ""}
        aria-label={t("marketplace.search_storelib")}
        role="combobox"
        aria-expanded={suggestionsOpen}
        aria-controls="explore-search-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId ?? undefined}
        className="h-11 w-full pl-10 pr-10 bg-neutral-100 border-neutral-200 text-neutral-900 placeholder:text-neutral-500 rounded-full text-sm"
      />
      {/* Kept mounted and toggled — unmounting would restart the phrase cursor on every blur */}
      <AnimatedSearchPlaceholder
        active={!searchQuery && !isFocused}
        className="absolute left-10 right-10 top-1/2 -translate-y-1/2 text-sm"
      />
      {searchQuery && (
        <button
          onClick={() => {
            setSearchQuery("")
            inputRef.current?.focus()
          }}
          aria-label={t("marketplace.clear_search")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <SearchSuggestionsPanel
        ref={panelRef}
        id="explore-search-suggestions"
        open={suggestionsOpen}
        // Recents and history are for an empty field; once typing starts the
        // dropdown is about the query, not about the past.
        recentSearches={trimmedQuery ? NO_RECENT_SEARCHES : searches}
        recentlyViewed={trimmedQuery ? NO_RECENTLY_VIEWED : recentlyViewed}
        people={people}
        peopleLoading={peopleLoading}
        onSelectSearch={handleSelectSearch}
        onRemoveSearch={removeSearch}
        onClearSearches={clearSearches}
        onSelectProduct={handleSelectProduct}
        onSelectPerson={handleSelectPerson}
        onActiveOptionChange={setActiveOptionId}
        onClose={dismiss}
        // Above the desktop filters dropdown (z-50), which can briefly co-exist
        // during the 150ms deferred close.
        className="absolute left-0 right-0 top-full mt-2 z-[60]"
      />
    </div>
  )
}


function smoothScrollToRecommendedSection(ref: React.RefObject<HTMLElement | null>) {
  if (!ref.current) return

  const yOffset = -96
  const y = ref.current.getBoundingClientRect().top + window.pageYOffset + yOffset

  window.scrollTo({
    top: Math.max(0, y),
    behavior: "smooth",
  })
}

function smoothScrollToBrowseSection(ref: React.RefObject<HTMLElement | null>) {
  if (!ref.current) return

  const yOffset = -96
  const y = ref.current.getBoundingClientRect().top + window.pageYOffset + yOffset

  window.scrollTo({
    top: Math.max(0, y),
    behavior: "smooth",
  })
}

interface ExplorePageClientProps {
  initialProducts: any[]
  initialCategory: string
  searchQuery: string
  initialView?: "grid" | "reels"
  /**
   * Resolved server-side, and passed straight through to the phone feed.
   *
   * Two things on that screen are only true for somebody with an account —
   * the Urmărești and Salvate tabs — and one is only for somebody without —
   * the marketing hero. The feed cannot work this out for itself without
   * asking the client for a session, and a screen that renders one shape and
   * then changes to the other a moment later is worse than either shape.
   */
  signedIn?: boolean
}

export function ExplorePageClient({
  initialProducts,
  initialCategory,
  searchQuery: urlSearchQuery,
  initialView = "grid",
  signedIn = false,
}: ExplorePageClientProps) {
  const { t } = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Main category (for Recommended section)
  const [mainCategory, setMainCategory] = useState(initialCategory.toLowerCase() || "all")

  // Selected subcategory from modal
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null)
  const [selectedSubcategoryLabel, setSelectedSubcategoryLabel] = useState<string | null>(null)

  // Separate category for the Browse by Category section
  const [browseCategory, setBrowseCategory] = useState("all")

  const [isLoadingCategory, setIsLoadingCategory] = useState(false)
  const [recommendationFilter, setRecommendationFilter] = useState<"curated" | "trending" | "hot-new">("curated")
  const categoryChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const categorySectionRef = useRef<HTMLElement>(null)
  const categoryAutoScrollTimeoutRef = useRef<number | null>(null)
  const pendingCategoryAutoScrollRef = useRef(false)
  const browseSectionRef = useRef<HTMLElement>(null)
  const pendingBrowseAutoScrollRef = useRef(false)
  const scrollTargetHandledRef = useRef<string | null>(null)
  const hasMountedRef = useRef(false)

  // Filter states
  const [priceFilter, setPriceFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("newest")
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Category selector modal
  const [categorySelectorOpen, setCategorySelectorOpen] = useState(false)
  const [categorySelectorSource, setCategorySelectorSource] = useState<'recommended' | 'browse'>('recommended')

  // Reset stale scroll lock state on mount (prevents scroll bugs after navigation)
  useEffect(() => {
    scrollLockCount = 0
    document.body.classList.remove("modal-open")
    document.body.style.removeProperty("--scroll-y")
  }, [])

  // Store back-label so product pages can show "< Explore" in their breadcrumb
  useEffect(() => {
    try { sessionStorage.setItem("backPageName", "Explore") } catch { /* ignore */ }
  }, [])

  // Search states — seeded from ?q= so an inbound search reads back in the field
  const [localSearchQuery, setLocalSearchQuery] = useState(urlSearchQuery || "")

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [mainCategory, selectedSubcategoryId, recommendationFilter, priceFilter, sortBy, selectedSubcategories, localSearchQuery])

  // Get available subcategories for current main category
  const availableSubcategories = useMemo(() => getSubcategories(mainCategory), [mainCategory])

  // Products for featured section
  const featuredProducts = useMemo(() => {
    return initialProducts.filter(p => p.thumbnail_url).slice(0, 5)
  }, [initialProducts])

  // Get Recommended section products (based on main category and subcategory)
  const recommendedProducts = useMemo(() => {
    let products = [...initialProducts]

    // Every category except "all": strictly filter by normalized DB category
    if (mainCategory !== "all") {
      products = products.filter(p => {
        // Primary: match via normalized DB category field
        const normalizedCategory = normalizeCategoryToId(p.category || p.categoryName || "")
        if (normalizedCategory === mainCategory) return true

        // Secondary: match via creator niche tags
        const creatorTags = p.creator?.niche_tags?.map((t: string) => normalizeCategoryToId(t)) || []
        if (creatorTags.includes(mainCategory)) return true

        return false
      })
    }

    // Filter by selected subcategory from modal
    if (selectedSubcategoryId) {
      products = products.filter(p => {
        const productSub = (p.subcategory || "").toLowerCase()
        const productTags = p.tags?.map((t: string) => t.toLowerCase()) || []
        const productTitle = (p.title || "").toLowerCase()
        const productDesc = (p.description || "").toLowerCase()

        return productSub.includes(selectedSubcategoryId) ||
               productTags.some((tag: string) => tag.includes(selectedSubcategoryId)) ||
               productTitle.includes(selectedSubcategoryId) ||
               productDesc.includes(selectedSubcategoryId)
      })
    }

    // Filter by subcategories from filters
    if (selectedSubcategories.length > 0) {
      products = products.filter(p => {
        const productSub = (p.subcategory || "").toLowerCase()
        return selectedSubcategories.some(sub => productSub.includes(sub))
      })
    }

    // Filter by local search
    if (localSearchQuery.trim()) {
      const query = localSearchQuery.toLowerCase()
      products = products.filter(p =>
        p.title?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
      )
    }

    // Save the category-filtered set before recommendation sorting (for backfill)
    const categoryFilteredProducts = [...products]

    // Apply recommendation filter with smart sorting algorithms
    switch (recommendationFilter) {
      case "trending":
        // Trending: Score based on recent engagement, sales velocity, and popularity
        // Higher weight to recent activity (last 14 days)
        const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000
        products = products.sort((a, b) => {
          const aCreatedRecently = new Date(a.created_at).getTime() > fourteenDaysAgo ? 1.5 : 1
          const bCreatedRecently = new Date(b.created_at).getTime() > fourteenDaysAgo ? 1.5 : 1
          const scoreA = ((a.sales_count || 0) * 3 + (a.reviews_count || 0) * 2 + (a.view_count || 0) * 0.1) * aCreatedRecently
          const scoreB = ((b.sales_count || 0) * 3 + (b.reviews_count || 0) * 2 + (b.view_count || 0) * 0.1) * bCreatedRecently
          return scoreB - scoreA
        })
        break
      case "hot-new":
        // Hot & New: Products from last 30 days, ranked by early traction and quality
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
        products = products
          .filter(p => new Date(p.created_at).getTime() > thirtyDaysAgo)
          .sort((a, b) => {
            const aIsNew = new Date(a.created_at).getTime() > sevenDaysAgo
            const bIsNew = new Date(b.created_at).getTime() > sevenDaysAgo
            const aNewBoost = aIsNew ? 2 : 1
            const bNewBoost = bIsNew ? 2 : 1
            const scoreA = ((a.sales_count || 0) * 5 + (a.reviews_count || 0) * 3 + (a.reviews_average || 0) * 2) * aNewBoost
            const scoreB = ((b.sales_count || 0) * 5 + (b.reviews_count || 0) * 3 + (b.reviews_average || 0) * 2) * bNewBoost
            if (Math.abs(scoreA - scoreB) < 5) {
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            }
            return scoreB - scoreA
          })
        // Backfill from SAME category (not all products) if not enough hot & new
        if (products.length < 15) {
          const olderProducts = categoryFilteredProducts
            .filter(p => !products.find(rp => rp.id === p.id))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 15 - products.length)
          products = [...products, ...olderProducts]
        }
        break
      case "curated":
      default:
        // Curated: Best overall quality - weighted scoring algorithm
        products = products.sort((a, b) => {
          const aReviewScore = (a.reviews_average || 0) * Math.min(a.reviews_count || 0, 20) * 0.5
          const bReviewScore = (b.reviews_average || 0) * Math.min(b.reviews_count || 0, 20) * 0.5
          const aSalesScore = Math.min(a.sales_count || 0, 100) * 2
          const bSalesScore = Math.min(b.sales_count || 0, 100) * 2
          const aCompleteBonus = (a.thumbnail_url ? 5 : 0) + ((a.description?.length || 0) > 100 ? 5 : 0)
          const bCompleteBonus = (b.thumbnail_url ? 5 : 0) + ((b.description?.length || 0) > 100 ? 5 : 0)
          const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000
          const aFreshBonus = new Date(a.created_at).getTime() > sixtyDaysAgo ? 10 : 0
          const bFreshBonus = new Date(b.created_at).getTime() > sixtyDaysAgo ? 10 : 0
          const scoreA = aReviewScore + aSalesScore + aCompleteBonus + aFreshBonus
          const scoreB = bReviewScore + bSalesScore + bCompleteBonus + bFreshBonus
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

    // Apply sort override — only override recommendation sort for explicit sort picks
    // When sort is "newest" (default), the recommendation filter controls the order
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
      default:
        // Don't override — let the recommendation filter sorting stand
        break
    }

    return products
  }, [initialProducts, mainCategory, selectedSubcategoryId, recommendationFilter, priceFilter, sortBy, selectedSubcategories, localSearchQuery])

  // Paginated products
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE
    return recommendedProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE)
  }, [recommendedProducts, currentPage])

  const totalPages = Math.ceil(recommendedProducts.length / PRODUCTS_PER_PAGE)

  // Get products for the Browse by Category section - 2 rows x 4 = 8 products
  const browseSectionProducts = useMemo(() => {
    let products = [...initialProducts]

    if (browseCategory !== "all") {
      products = products.filter(p => {
        const normalizedCategory = normalizeCategoryToId(p.category || p.categoryName || "")
        if (normalizedCategory === browseCategory) return true
        const creatorTags = p.creator?.niche_tags?.map((t: string) => normalizeCategoryToId(t)) || []
        if (creatorTags.includes(browseCategory)) return true
        return false
      })
    }

    products = products.sort((a, b) => {
      const scoreA = (a.reviews_average || 0) * (a.reviews_count || 0) + (a.sales_count || 0)
      const scoreB = (b.reviews_average || 0) * (b.reviews_count || 0) + (b.sales_count || 0)
      return scoreB - scoreA
    })

    return products.slice(0, 8)
  }, [initialProducts, browseCategory])

  // Get active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (priceFilter !== "all") count++
    if (sortBy !== "newest") count++
    if (selectedSubcategories.length > 0) count += selectedSubcategories.length
    return count
  }, [priceFilter, sortBy, selectedSubcategories])

  // Reset filters
  const resetFilters = useCallback(() => {
    setPriceFilter("all")
    setSortBy("newest")
    setSelectedSubcategories([])
  }, [])

  // Get section title - shows subcategory label if selected
  const sectionTitle = useMemo(() => {
    if (urlSearchQuery) return `${t("marketplace.results_for")} "${urlSearchQuery}"`
    if (selectedSubcategoryLabel) return selectedSubcategoryLabel
    if (mainCategory === "all") return t("feed.recommended")
    return getCategory(mainCategory)?.label || t("marketplace.items_title")
  }, [mainCategory, selectedSubcategoryLabel, urlSearchQuery, t])

  const scrollRecommendedSectionWithRetry = useCallback((attempt = 0) => {
    if (urlSearchQuery) return

    if (categorySectionRef.current) {
      smoothScrollToRecommendedSection(categorySectionRef)
      return
    }

    if (attempt >= 8) return

    categoryAutoScrollTimeoutRef.current = window.setTimeout(() => {
      scrollRecommendedSectionWithRetry(attempt + 1)
    }, 60)
  }, [urlSearchQuery])

  // Handle category change - updates main category and can smooth-scroll to Recommended section
  const handleCategoryChange = useCallback((
    categoryId: string,
    subcategoryId?: string,
    subcategoryLabel?: string,
    shouldAutoScrollToRecommended = false,
  ) => {
    setMainCategory(categoryId)
    setBrowseCategory(categoryId)
    setSelectedSubcategoryId(subcategoryId || null)
    setSelectedSubcategoryLabel(subcategoryLabel || null)
    setSelectedSubcategories([])
    setIsLoadingCategory(true)
    pendingCategoryAutoScrollRef.current = shouldAutoScrollToRecommended

    if (categoryChangeTimeoutRef.current) clearTimeout(categoryChangeTimeoutRef.current)

    categoryChangeTimeoutRef.current = setTimeout(() => {
      startTransition(() => {
        let newUrl = `/explore?category=${categoryId}`
        if (subcategoryId) {
          newUrl += `&sub=${subcategoryId}`
        }
        if (urlSearchQuery) {
          newUrl += `&q=${urlSearchQuery}`
        }
        router.push(newUrl, { scroll: false })
      })
      setIsLoadingCategory(false)

    }, 100)
  }, [router, urlSearchQuery])

  // Handle subcategory selection from modal
  const handleSubcategorySelect = useCallback((categoryId: string, subcategoryId: string, subcategoryLabel: string) => {
    handleCategoryChange(categoryId, subcategoryId, subcategoryLabel, true)
  }, [handleCategoryChange])

  // Handle browse-only category change from browse section pills (doesn't change main/recommended)
  const handleBrowseOnlyChange = useCallback((categoryId: string) => {
    setBrowseCategory(categoryId)
    // Scroll to browse section after content renders
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        smoothScrollToBrowseSection(browseSectionRef)
      })
    })
  }, [])

  // Handle category selection from modal - depends on which section opened it
  const handleModalCategorySelect = useCallback((categoryId: string) => {
    if (categorySelectorSource === 'browse') {
      setBrowseCategory(categoryId)
      pendingBrowseAutoScrollRef.current = true
    } else {
      handleCategoryChange(categoryId, undefined, undefined, true)
    }
  }, [categorySelectorSource, handleCategoryChange])

  // Handle subcategory selection from modal - depends on which section opened it
  const handleModalSubcategorySelect = useCallback((categoryId: string, subcategoryId: string, subcategoryLabel: string) => {
    if (categorySelectorSource === 'browse') {
      setBrowseCategory(categoryId)
      pendingBrowseAutoScrollRef.current = true
    } else {
      handleCategoryChange(categoryId, subcategoryId, subcategoryLabel, true)
    }
  }, [categorySelectorSource, handleCategoryChange])


  useEffect(() => {
    if (
      urlSearchQuery ||
      isLoadingCategory ||
      categorySelectorOpen ||
      !pendingCategoryAutoScrollRef.current
    ) {
      return
    }

    pendingCategoryAutoScrollRef.current = false

    requestAnimationFrame(() => {
      scrollRecommendedSectionWithRetry()
    })
  }, [
    categorySelectorOpen,
    isLoadingCategory,
    mainCategory,
    scrollRecommendedSectionWithRetry,
    selectedSubcategoryId,
    urlSearchQuery,
  ])


  // Auto-scroll to browse section after category selector modal closes (when opened from browse context)
  useEffect(() => {
    if (categorySelectorOpen || !pendingBrowseAutoScrollRef.current) return
    pendingBrowseAutoScrollRef.current = false
    requestAnimationFrame(() => {
      smoothScrollToBrowseSection(browseSectionRef)
    })
  }, [categorySelectorOpen])

  // Mark component as mounted after initial render (skip auto-scroll on page load/reload)
  useEffect(() => {
    const timer = setTimeout(() => { hasMountedRef.current = true }, 500)
    return () => clearTimeout(timer)
  }, [])

  // Handle scroll target from URL (set by header, hamburger, search bar, featured categories)
  // For client-side nav (already mounted): delegate to pendingCategoryAutoScrollRef so scroll
  // fires only after content finishes loading — avoids scroll being interrupted by skeleton→real
  // content swap. For initial page load: wait 800ms for content to render then scroll.
  useEffect(() => {
    const scrollTarget = searchParams.get("scroll")
    const currentUrl = window.location.href
    if (scrollTarget === "recommended" && scrollTargetHandledRef.current !== currentUrl) {
      scrollTargetHandledRef.current = currentUrl
      // Clean up scroll param immediately so it doesn't re-fire
      const url = new URL(window.location.href)
      url.searchParams.delete("scroll")
      window.history.replaceState({}, '', url.pathname + url.search)
      if (hasMountedRef.current) {
        // Client-side nav: queue scroll to fire after isLoadingCategory becomes false
        // This ensures content is stable before the smooth scroll animation starts
        pendingCategoryAutoScrollRef.current = true
      } else {
        // Initial page load: content needs time to render from server
        const timer = setTimeout(() => {
          scrollRecommendedSectionWithRetry()
        }, 800)
        return () => clearTimeout(timer)
      }
    }
  }, [searchParams, scrollRecommendedSectionWithRetry])

  useEffect(() => {
    return () => {
      if (categoryChangeTimeoutRef.current) clearTimeout(categoryChangeTimeoutRef.current)
      if (categoryAutoScrollTimeoutRef.current) window.clearTimeout(categoryAutoScrollTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const normalizedCategory = initialCategory.toLowerCase() || "all"
    if (normalizedCategory !== mainCategory) setMainCategory(normalizedCategory)

    // Check for subcategory in URL
    const subParam = searchParams.get("sub")
    if (subParam && subParam !== selectedSubcategoryId) {
      setSelectedSubcategoryId(subParam)
      // Find the label for this subcategory
      for (const cat of CATEGORIES) {
        const foundSub = cat.subcategories.find(s => s.id === subParam)
        if (foundSub) {
          setSelectedSubcategoryLabel(foundSub.label)
          break
        }
      }
    }
  }, [initialCategory, searchParams])

  const showSkeletons = isPending || isLoadingCategory

  // Get current browse category label
  const browseCategoryLabel = categoryLabel(browseCategory)

  return (
    // One batched wishlist fetch for every card on the page instead of one per card
    <WishlistProvider>
    {/* Mobile: Depop/TikTok-style full-screen feed. Desktop keeps the grid below. */}
    <MobileFeed initialProducts={initialProducts} searchQuery={urlSearchQuery} initialView={initialView} signedIn={signedIn} />
    {/* ═══════════════════════════════════════════════════════════════════════
        ONLY WHEN THERE IS A SEARCH.
        ═══════════════════════════════════════════════════════════════════════

        This block WAS the desktop home page — a banner, a recommended grid, a
        pill rail and a browse grid. It is now the search results screen and
        nothing else: the home page is components/explore/home/desktop-home,
        which the feed renders instead when there is no query.

        Drawing both was the actual bug behind "there are two grids of the same
        thing": the feed's own sections and this component's sections were the
        same hundred listings, ordered twice, one under the other.

        The whole subtree is dropped rather than hidden, so on the home page it
        costs no render — this file is seventeen hundred lines and most of them
        are search chrome. */}
    <div className={urlSearchQuery ? "space-y-8 hidden md:block" : "hidden"}>
      {/* Featured Banner Carousel */}
      {!urlSearchQuery && featuredProducts.length > 0 && (
        <FeaturedBannerCarousel products={featuredProducts} />
      )}

      {/* No search bar here. The header already carries one on every page, and a
          second one on the feed only raised the question of which was which —
          they searched the same catalogue. Search lives in the header. */}

      {/* Dynamic Category Section (Recommended) */}
      {!urlSearchQuery && (
        <section ref={categorySectionRef} className="mt-10 scroll-mt-28">
          {/* Section Header */}
          <div className="flex flex-col gap-4 mb-6 relative">
            {/* Title Row with Search and Filters */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900">
                  {sectionTitle}
                </h2>
                {/* Desktop: Only show Clear when subcategory selected (clears to parent category) */}
                {selectedSubcategoryId && (
                  <button
                    onClick={() => {
                      setSelectedSubcategoryId(null)
                      setSelectedSubcategoryLabel(null)
                      router.push(`/explore?category=${mainCategory}`, { scroll: false })
                    }}
                    className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    {t("search.clear")}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Mobile: Category Icon Button */}
                <button
                  onClick={() => { setCategorySelectorSource('recommended'); setCategorySelectorOpen(true) }}
                  className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all duration-150 cursor-pointer"
                >
                  <Layers className="w-4 h-4" />
                </button>

                {/* Desktop: By Category Pill Button */}
                <button
                  onClick={() => { setCategorySelectorSource('recommended'); setCategorySelectorOpen(true) }}
                  className="hidden md:inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all duration-150 cursor-pointer"
                >
                  <Layers className="w-4 h-4" />
                  <span>{t("marketplace.by_category")}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {/* Filters Button */}
                <button
                  onClick={() => {
                    if (window.innerWidth >= 768) setFiltersOpen(!filtersOpen)
                    else setMobileFiltersOpen(true)
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer select-none ${
                    filtersOpen || activeFilterCount > 0
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("marketplace.filters")}</span>
                  {activeFilterCount > 0 && (
                    <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-white text-neutral-900 text-[11px] font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {/* Desktop Filters Dropdown */}
                {filtersOpen && (
                  <>
                    <div className="fixed inset-0 z-40 hidden md:block" onClick={() => setFiltersOpen(false)} />
                    <div className="hidden md:block absolute right-0 top-full mt-2 w-[340px] bg-white rounded-2xl shadow-xl border border-neutral-200 z-50 animate-in fade-in-0 slide-in-from-top-2 duration-200 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
                        <h3 className="text-sm font-semibold text-neutral-900">{t("marketplace.filters")}</h3>
                        <button onClick={() => setFiltersOpen(false)} className="p-1 rounded-full hover:bg-neutral-100 transition-colors cursor-pointer">
                          <X className="w-4 h-4 text-neutral-500" />
                        </button>
                      </div>

                      <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto">
                        {availableSubcategories.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">{t("marketplace.subcategories")}</h4>
                            <div className="flex flex-wrap gap-2">
                              {availableSubcategories.map((sub) => (
                                <button
                                  key={sub.id}
                                  onClick={() => {
                                    if (selectedSubcategories.includes(sub.id)) {
                                      setSelectedSubcategories(selectedSubcategories.filter(s => s !== sub.id))
                                    } else {
                                      setSelectedSubcategories([...selectedSubcategories, sub.id])
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
                                    selectedSubcategories.includes(sub.id)
                                      ? "bg-violet-600 text-white"
                                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                                  }`}
                                >
                                  {selectedSubcategories.includes(sub.id) && <Check className="w-3 h-3" />}
                                  {sub.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">{t("marketplace.price")}</h4>
                          <div className="flex flex-wrap gap-2">
                            {PRICE_FILTERS.map((filter) => (
                              <button
                                key={filter.id}
                                onClick={() => setPriceFilter(filter.id)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
                                  priceFilter === filter.id
                                    ? "bg-neutral-900 text-white"
                                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                                }`}
                              >
                                {priceFilter === filter.id && <Check className="w-3 h-3" />}
                                {t(`marketplace.price_${filter.id}`)}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">{t("marketplace.sort_by")}</h4>
                          <div className="space-y-1">
                            {SORT_OPTIONS.map((option) => (
                              <button
                                key={option.id}
                                onClick={() => setSortBy(option.id)}
                                className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
                                  sortBy === option.id ? "bg-neutral-100 text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"
                                }`}
                              >
                                <span>{t(`marketplace.sort_${option.id}`)}</span>
                                {sortBy === option.id && <Check className="w-4 h-4 text-violet-600" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 px-4 py-3 border-t border-neutral-100 bg-neutral-50">
                        <button onClick={resetFilters} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-200 transition-colors cursor-pointer">
                          {t("marketplace.reset")}
                        </button>
                        <button onClick={() => setFiltersOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer">
                          {t("marketplace.apply")}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Filter Pills Row */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {RECOMMENDATION_FILTERS.map((filter) => {
                const isSelected = recommendationFilter === filter.id
                return (
                  <button
                    key={filter.id}
                    onClick={() => setRecommendationFilter(filter.id as typeof recommendationFilter)}
                    className={`px-4 py-2 rounded-full text-sm font-medium cursor-pointer select-none whitespace-nowrap transition-all duration-150 ease-out active:scale-[0.98] ${
                      isSelected
                        ? "bg-neutral-900 text-white shadow-sm"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900"
                    }`}
                  >
                    {t(`marketplace.rec_${filter.id}`)}
                  </button>
                )
              })}
            </div>

            {/* Mobile: Clear Badge and Category Badge - shown below pills on mobile when category selected */}
            {(mainCategory !== "all" || selectedSubcategoryId) && (
              <div className="md:hidden flex items-center gap-2 mt-2">
                {/* Purple Clear badge */}
                <button
                  onClick={() => {
                    setMainCategory("all")
                    setSelectedSubcategoryId(null)
                    setSelectedSubcategoryLabel(null)
                    router.push("/explore", { scroll: false })
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  {t("search.clear")}
                </button>
                {/* Black category/subcategory name badge */}
                <button
                  onClick={() => {
                    setMainCategory("all")
                    setSelectedSubcategoryId(null)
                    setSelectedSubcategoryLabel(null)
                    router.push("/explore", { scroll: false })
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  {selectedSubcategoryLabel || getCategory(mainCategory)?.label || t("marketplace.category")}
                </button>
              </div>
            )}

            {/* Active Filters Pills */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-neutral-500">{t("marketplace.active")}</span>
                {selectedSubcategories.map(subId => {
                  const sub = availableSubcategories.find(s => s.id === subId)
                  return sub ? (
                    <span key={subId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                      {sub.label}
                      <button onClick={() => setSelectedSubcategories(selectedSubcategories.filter(s => s !== subId))} className="hover:bg-violet-200 rounded-full p-0.5 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ) : null
                })}
                {priceFilter !== "all" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                    {t(`marketplace.price_${priceFilter}`)}
                    <button onClick={() => setPriceFilter("all")} className="hover:bg-violet-200 rounded-full p-0.5 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {sortBy !== "newest" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                    {t(`marketplace.sort_${sortBy}`)}
                    <button onClick={() => setSortBy("newest")} className="hover:bg-violet-200 rounded-full p-0.5 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                <button onClick={resetFilters} className="text-xs text-neutral-500 hover:text-neutral-700 underline cursor-pointer">
                  {t("marketplace.clear_all")}
                </button>
              </div>
            )}
          </div>

          {/* Products Grid - portrait cards, 2 per row on mobile up to 4 on desktop */}
          {showSkeletons ? (
            <div className="grid gap-x-3 gap-y-6 sm:gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 animate-in fade-in-0 duration-200">
              {Array.from({ length: PRODUCTS_PER_PAGE }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : paginatedProducts.length > 0 ? (
            <>
              <div
                key={`products-${mainCategory}-${selectedSubcategoryId}-${recommendationFilter}-${priceFilter}-${sortBy}-${currentPage}`}
                className="grid gap-x-3 gap-y-6 sm:gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
              >
                {paginatedProducts.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    srcParam="?src=platform"
                    priority={index < 4}
                    clientNav
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page: number
                    if (totalPages <= 5) {
                      page = i + 1
                    } else if (currentPage <= 3) {
                      page = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i
                    } else {
                      page = currentPage - 2 + i
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                          currentPage === page
                            ? "bg-neutral-900 text-white"
                            : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                        }`}
                      >
                        {page}
                      </button>
                    )
                  })}

                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}

              <p className="text-sm text-neutral-500 mt-4 text-center">
                {t("marketplace.showing")} {(currentPage - 1) * PRODUCTS_PER_PAGE + 1}-{Math.min(currentPage * PRODUCTS_PER_PAGE, recommendedProducts.length)} {t("marketplace.of")} {recommendedProducts.length} {t("marketplace.items")}
              </p>

              {/* Show All Button */}
              {(mainCategory !== "all" || selectedSubcategoryId) && (
                <div className="flex justify-center mt-8">
                  <Link
                    href={selectedSubcategoryId
                      ? `/explore/${mainCategory}?sub=${selectedSubcategoryId}`
                      : `/explore/${mainCategory}`
                    }
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    <span>{t("marketplace.show_all")} {selectedSubcategoryLabel || sectionTitle}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
              <p className="text-neutral-500">
                {localSearchQuery
                  ? `${t("marketplace.no_items_for")} "${localSearchQuery}"`
                  : priceFilter !== "all"
                    ? t("marketplace.no_items_match")
                    : `${t("marketplace.no_items_in")} ${sectionTitle}.`
                }
              </p>
              {(activeFilterCount > 0 || selectedSubcategoryId) && (
                <button
                  onClick={() => {
                    resetFilters()
                    setSelectedSubcategoryId(null)
                    setSelectedSubcategoryLabel(null)
                  }}
                  className="mt-3 text-sm text-violet-600 hover:text-violet-700 font-medium cursor-pointer"
                >
                  {t("marketplace.clear_filters")}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Browse by Category Section */}
      <section ref={browseSectionRef} className="mt-12 pt-8 border-t border-neutral-200 scroll-mt-28">
        {/* Section Header */}
        <div className="flex flex-col gap-4 mb-4">
          {/* Mobile: By Category button above pills, right-aligned */}
          <div className="flex md:hidden justify-end">
            <button
              onClick={() => { setCategorySelectorSource('browse'); setCategorySelectorOpen(true) }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
            >
              <span>{t("marketplace.by_category")}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Desktop: Title and By Category button on same row */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-neutral-900">
              {browseCategory === "all" ? t("marketplace.browse_by_category") : browseCategoryLabel}
            </h3>

            {/* Desktop: By Category button */}
            <button
              onClick={() => { setCategorySelectorSource('browse'); setCategorySelectorOpen(true) }}
              className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
            >
              <span>{t("marketplace.by_category")}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Category Pills */}
          <nav aria-label={t("marketplace.browse_categories")} className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {CATEGORIES.map((category) => {
              const isSelected = browseCategory === category.id
              const Icon = category.icon
              return (
                <button
                  key={category.id}
                  onClick={() => handleBrowseOnlyChange(category.id)}
                  className={`relative inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap cursor-pointer select-none transition-all duration-150 ease-out active:scale-[0.98] ${
                    isSelected
                      ? "bg-neutral-900 text-white shadow-sm"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900"
                  }`}
                  aria-pressed={isSelected}
                >
                  <Icon className="w-4 h-4" />
                  {category.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Products Grid - 2 rows on desktop */}
        {browseSectionProducts.length > 0 ? (
          <div className="grid gap-x-3 gap-y-6 sm:gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 animate-in fade-in-0 duration-200">
            {browseSectionProducts.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                srcParam="?src=platform"
                priority={index < 4}
                clientNav
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center">
            <p className="text-neutral-500">{t("marketplace.no_items_category")}</p>
          </div>
        )}

        {/* Show All Button */}
        {browseSectionProducts.length > 0 && (
          <div className="flex justify-center mt-6">
            <Link
              href={browseCategory === "all" ? "/explore" : `/explore/${browseCategory}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <span>{t("marketplace.show_all")} {browseCategory !== "all" ? browseCategoryLabel : t("marketplace.items")}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </section>

      {/* Search Results Section */}
      {urlSearchQuery && (
        <section className="mt-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-5">
            {t("marketplace.results_for")} "{urlSearchQuery}"
          </h2>
          {recommendedProducts.length > 0 ? (
            <div className="grid gap-x-3 gap-y-6 sm:gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 animate-in fade-in-0 duration-200">
              {recommendedProducts.slice(0, 16).map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  srcParam="?src=platform"
                  priority={index < 4}
                  clientNav
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
              <p className="text-neutral-500">{t("marketplace.no_items_for")} "{urlSearchQuery}"</p>
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
        selectedSubcategories={selectedSubcategories}
        setSelectedSubcategories={setSelectedSubcategories}
        availableSubcategories={availableSubcategories}
        resetFilters={resetFilters}
        activeFilterCount={activeFilterCount}
      />

      {/* Category Selector Modal */}
      <CategorySelectorModal
        isOpen={categorySelectorOpen}
        onClose={() => setCategorySelectorOpen(false)}
        selectedCategory={categorySelectorSource === 'browse' ? browseCategory : mainCategory}
        selectedSubcategory={categorySelectorSource === 'browse' ? null : selectedSubcategoryId}
        onSelectCategory={handleModalCategorySelect}
        onSelectSubcategory={handleModalSubcategorySelect}
      />
    </div>
    </WishlistProvider>
  )
}
