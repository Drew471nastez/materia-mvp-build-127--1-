"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ProductCard } from "./product-card"
import { Layers, SlidersHorizontal, X, Check, Search, ChevronLeft, ChevronRight, ArrowLeft, Grid3X3, LayoutGrid, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { getCategory, getSubcategories, normalizeCategoryToId } from "@/lib/marketplace/categories"

const PRICE_FILTERS = [
  { id: "all", label: "All Prices" },
  { id: "free", label: "Free" },
  { id: "under-10", label: "Under $10" },
  { id: "10-50", label: "$10 - $50" },
  { id: "50-plus", label: "$50+" },
] as const

const SORT_OPTIONS = [
  { id: "newest", label: "Newest" },
  { id: "popular", label: "Most Popular" },
  { id: "price-low", label: "Price: Low to High" },
  { id: "price-high", label: "Price: High to Low" },
] as const

// 16 = four full rows of the 4-column portrait grid below
const PRODUCTS_PER_PAGE = 16
const MAX_VISIBLE_PILLS = 7

type ViewMode = "grid" | "compact"

// Mobile Filter Bottom Sheet
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
  availableSubcategories: readonly { id: string; label: string }[]
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
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { setIsAnimating(true) })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
      const timer = setTimeout(() => { setIsVisible(false); setDragY(0) }, 400)
      return () => clearTimeout(timer)
    }
    return () => { document.body.style.overflow = ""; document.documentElement.style.overscrollBehavior = ''; document.body.style.overscrollBehavior = '' }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setDragY(0)
    setTimeout(() => { onClose() }, 400)
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
    const diff = e.touches[0].clientY - startY.current
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
    <div className="fixed inset-0 z-[100] md:hidden" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ease-out ${isAnimating ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDuration: '400ms' }}
        onClick={handleClose}
      />
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl flex flex-col"
        style={{
          transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
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
          <h3 className="text-lg font-semibold text-neutral-900">Filters</h3>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-sm text-violet-600 font-medium cursor-pointer">Reset all</button>
          )}
        </div>

        <div className="overflow-y-auto overscroll-contain p-4 space-y-6 flex-1 min-h-0">
          {availableSubcategories.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-neutral-900 mb-3">Subcategories</h4>
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
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Price Range</h4>
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
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-neutral-900 mb-3">Sort By</h4>
            <div className="space-y-1">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSortBy(option.id)}
                  className={`flex items-center justify-between w-full px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
                    sortBy === option.id ? "bg-neutral-100 text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  <span>{option.label}</span>
                  {sortBy === option.id && <Check className="w-5 h-5 text-violet-600" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 pt-4 border-t border-neutral-100 bg-white shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button onClick={resetFilters} className="flex-1 px-4 py-3 rounded-xl text-sm font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors cursor-pointer">Reset</button>
          <button onClick={handleClose} className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer">Apply Filters</button>
        </div>
      </div>
    </div>
  )
}

// Mobile Subcategory Bottom Sheet (slides up from bottom, like hamburger)
function MobileSubcategorySheet({
  isOpen,
  onClose,
  subcategories,
  selectedSubcategories,
  onSelectSubcategory,
  onSelectAll,
  categoryLabel,
}: {
  isOpen: boolean
  onClose: () => void
  subcategories: readonly { id: string; label: string }[]
  selectedSubcategories: string[]
  onSelectSubcategory: (subId: string) => void
  onSelectAll: () => void
  categoryLabel: string
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
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { setIsAnimating(true) })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
      const timer = setTimeout(() => { setIsVisible(false); setDragY(0) }, 400)
      return () => clearTimeout(timer)
    }
    return () => { document.body.style.overflow = ""; document.documentElement.style.overscrollBehavior = ''; document.body.style.overscrollBehavior = '' }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setDragY(0)
    setTimeout(() => { onClose() }, 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const el = sheetRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const touchYInSheet = touch.clientY - rect.top
    if (touchYInSheet <= 0 || touchYInSheet <= 100) {
      startY.current = touch.clientY
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const diff = e.touches[0].clientY - startY.current
    if (diff > 0) { e.preventDefault(); setDragY(diff * 0.8) }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 80) handleClose()
    else setDragY(0)
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100] md:hidden" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ease-out ${isAnimating ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDuration: '400ms' }}
        onClick={handleClose}
      />
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl flex flex-col"
        style={{
          transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '70vh',
        }}
      >
        <div className="pt-3 pb-2 shrink-0">
          <button onClick={handleClose} className="w-full flex justify-center py-2 cursor-pointer touch-none">
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100 shrink-0">
          <h3 className="text-lg font-semibold text-neutral-900">{categoryLabel} Subcategories</h3>
          <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-neutral-100 transition-colors cursor-pointer">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain p-4 flex-1 min-h-0">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { onSelectAll(); handleClose() }}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
                selectedSubcategories.length === 0
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              All {categoryLabel}
            </button>
            {subcategories.map((sub) => {
              const isSelected = selectedSubcategories.includes(sub.id)
              return (
                <button
                  key={sub.id}
                  onClick={() => { onSelectSubcategory(sub.id); handleClose() }}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? "bg-violet-600 text-white"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                  {sub.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Desktop Subcategory Modal (centered)
function DesktopSubcategoryModal({
  isOpen,
  onClose,
  subcategories,
  selectedSubcategories,
  onSelectSubcategory,
  onSelectAll,
  categoryLabel,
}: {
  isOpen: boolean
  onClose: () => void
  subcategories: readonly { id: string; label: string }[]
  selectedSubcategories: string[]
  onSelectSubcategory: (subId: string) => void
  onSelectAll: () => void
  categoryLabel: string
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { setIsAnimating(true) })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
      const timer = setTimeout(() => { setIsVisible(false) }, 300)
      return () => clearTimeout(timer)
    }
    return () => { document.body.style.overflow = ""; document.documentElement.style.overscrollBehavior = ''; document.body.style.overscrollBehavior = '' }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setTimeout(() => { onClose() }, 300)
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100] hidden md:flex items-center justify-center">
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ease-out ${isAnimating ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDuration: '300ms' }}
        onClick={handleClose}
      />
      <div
        className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transition-all duration-300 ${
          isAnimating ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
            <h3 className="text-lg font-semibold text-neutral-900">{categoryLabel} Subcategories</h3>
            <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-neutral-100 transition-colors cursor-pointer">
              <X className="w-5 h-5 text-neutral-500" />
            </button>
          </div>
          <div className="p-4 max-h-[60vh] overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { onSelectAll(); handleClose() }}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
                  selectedSubcategories.length === 0
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                All {categoryLabel}
              </button>
              {subcategories.map((sub) => {
                const isSelected = selectedSubcategories.includes(sub.id)
                return (
                  <button
                    key={sub.id}
                    onClick={() => { onSelectSubcategory(sub.id); handleClose() }}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? "bg-violet-100 text-violet-700 ring-2 ring-violet-500"
                        : "bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    {isSelected && <Check className="w-4 h-4" />}
                    <span>{sub.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
    </div>
  )
}

interface CategoryPageClientProps {
  initialProducts: any[]
  category: string
  categoryLabel: string
  /** SEO/intro copy — owned by the route so it isn't duplicated in the taxonomy */
  categoryDescription?: string
  initialSubcategory?: string
}

export function CategoryPageClient({
  initialProducts,
  category,
  categoryLabel,
  categoryDescription = "",
  initialSubcategory,
}: CategoryPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Filter states
  const [priceFilter, setPriceFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("newest")
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>(
    initialSubcategory ? [initialSubcategory] : []
  )
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [subcategorySelectorOpen, setSubcategorySelectorOpen] = useState(false)

  // Search states
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // View mode (only grid and compact — no list)
  const [viewMode, setViewMode] = useState<ViewMode>("grid")

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Get category info
  const categoryInfo = getCategory(category)
  const CategoryIcon = categoryInfo?.icon || Layers
  const availableSubcategories = getSubcategories(category)

  // Store back-label so product pages can show "< Womenswear" / "< Sneakers" etc.
  useEffect(() => {
    try { sessionStorage.setItem("backPageName", categoryLabel) } catch { /* ignore */ }
  }, [categoryLabel])

  // Read subcategory from URL
  useEffect(() => {
    const subParam = searchParams.get("sub")
    if (subParam && !selectedSubcategories.includes(subParam)) {
      setSelectedSubcategories([subParam])
    }
  }, [searchParams])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [priceFilter, sortBy, selectedSubcategories, searchQuery])

  // Handle subcategory selection
  const handleSubcategorySelect = useCallback((subId: string) => {
    setSelectedSubcategories(prev => {
      if (prev.includes(subId)) {
        const newSubs = prev.filter(s => s !== subId)
        if (newSubs.length === 0) {
          router.push(`/explore/${category}`, { scroll: false })
        }
        return newSubs
      } else {
        router.push(`/explore/${category}?sub=${subId}`, { scroll: false })
        return [subId]
      }
    })
  }, [category, router])

  const handleSelectAll = useCallback(() => {
    setSelectedSubcategories([])
    router.push(`/explore/${category}`, { scroll: false })
  }, [category, router])

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let products = [...initialProducts]

    // Category filtering
    products = products.filter(p => {
      const normalizedCategory = normalizeCategoryToId(p.category || p.categoryName || "")
      if (normalizedCategory === category) return true
      const creatorTags = p.creator?.niche_tags?.map((t: string) => normalizeCategoryToId(t)) || []
      if (creatorTags.includes(category)) return true
      return false
    })

    // Filter by subcategories
    if (selectedSubcategories.length > 0) {
      products = products.filter(p => {
        const productSub = (p.subcategory || "").toLowerCase()
        const productTags = p.tags?.map((t: string) => t.toLowerCase()) || []
        const productTitle = (p.title || "").toLowerCase()
        const productDesc = (p.description || "").toLowerCase()
        return selectedSubcategories.some(sub =>
          productSub.includes(sub) ||
          productTags.some((tag: string) => tag.includes(sub)) ||
          productTitle.includes(sub) ||
          productDesc.includes(sub)
        )
      })
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      products = products.filter(p =>
        p.title?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
      )
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
      default:
        products = products.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
    }

    return products
  }, [initialProducts, category, priceFilter, sortBy, selectedSubcategories, searchQuery])

  // Paginated products
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE
    return filteredProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE)
  }, [filteredProducts, currentPage])

  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE)

  // Active filter count
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
    router.push(`/explore/${category}`, { scroll: false })
  }, [category, router])

  // Current subcategory label
  const currentSubcategoryLabel = useMemo(() => {
    if (selectedSubcategories.length === 0) return null
    const sub = availableSubcategories.find(s => s.id === selectedSubcategories[0])
    return sub?.label || null
  }, [selectedSubcategories, availableSubcategories])

  // Grid class (only grid and compact — no list)
  // Default matches the explore feed exactly so the 4:5 portrait card is sized
  // identically on both surfaces; compact just adds a column at each breakpoint.
  const gridClass = useMemo(() => {
    switch (viewMode) {
      case "compact":
        return "grid gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-5 grid-cols-2 sm:grid-cols-4 lg:grid-cols-5"
      case "grid":
      default:
        return "grid gap-x-3 gap-y-6 sm:gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
    }
  }, [viewMode])

  // Visible subcategory pills (max 8 on desktop, includes "All" button)
  const visiblePillCount = MAX_VISIBLE_PILLS - 1 // -1 for the "All" button
  const hasOverflow = availableSubcategories.length > visiblePillCount
  const visibleSubcategories = hasOverflow ? availableSubcategories.slice(0, visiblePillCount) : availableSubcategories

  return (
    <div className="space-y-6">
      {/* Clean minimal header — no banner, no color */}
      <div>
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Explore</span>
        </Link>

        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-1">
            {currentSubcategoryLabel || categoryLabel}
          </h1>
          <p className="text-neutral-500 text-sm sm:text-base">{categoryDescription}</p>
          <p className="text-neutral-400 text-sm mt-1">{filteredProducts.length} items available</p>
        </div>
      </div>

      {/* Subtle divider between header info and subcategories/content */}
      <div className="border-t border-neutral-100" />

      {/* Desktop Subcategory Pills — hidden on mobile */}
      {availableSubcategories.length > 0 && (
        <div className="hidden md:flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-neutral-700">Browse Subcategories</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSelectAll}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap cursor-pointer select-none transition-all duration-150 ease-out active:scale-[0.98] ${
                selectedSubcategories.length === 0
                  ? "bg-neutral-900 text-white shadow-sm"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              All {categoryLabel}
            </button>
            {visibleSubcategories.map((sub) => {
              const isSelected = selectedSubcategories.includes(sub.id)
              return (
                <button
                  key={sub.id}
                  onClick={() => handleSubcategorySelect(sub.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap cursor-pointer select-none transition-all duration-150 ease-out active:scale-[0.98] ${
                    isSelected
                      ? "bg-violet-600 text-white shadow-sm"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                  {sub.label}
                </button>
              )
            })}
            {hasOverflow && (
              <button
                onClick={() => setSubcategorySelectorOpen(true)}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 cursor-pointer select-none transition-all duration-150 whitespace-nowrap"
              >
                Show all
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Controls Row */}
      <div className="flex items-center justify-between gap-4 relative">
        {/* Desktop controls (left side) */}
        <div className="hidden md:flex items-center gap-2">
          {searchOpen ? (
            <div className="flex-1 min-w-[300px] animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <Input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search in ${currentSubcategoryLabel || categoryLabel}...`}
                  className="h-11 w-full pl-10 pr-10 bg-neutral-100 border-neutral-200 text-neutral-900 placeholder:text-neutral-500 rounded-full text-sm"
                />
                <button
                  onClick={() => { setSearchQuery(""); setSearchOpen(false) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setSearchOpen(true)}
                className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all duration-150 cursor-pointer"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* View Mode Toggle - Desktop only */}
              <div className="flex items-center gap-1 bg-neutral-100 rounded-full p-1">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded-full transition-colors cursor-pointer ${
                    viewMode === "grid" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("compact")}
                  className={`p-2 rounded-full transition-colors cursor-pointer ${
                    viewMode === "compact" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Mobile controls: Filters left, subcategory + search right */}
        <div className="md:hidden flex items-center justify-between w-full">
          <button
            onClick={() => setMobileFiltersOpen(true)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer select-none ${
              activeFilterCount > 0
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-white text-neutral-900 text-[11px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2">
            {searchOpen ? (
              <div className="flex-1 min-w-[200px] animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                  <Input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search in ${currentSubcategoryLabel || categoryLabel}...`}
                    className="h-10 w-full pl-10 pr-10 bg-neutral-100 border-neutral-200 text-neutral-900 placeholder:text-neutral-500 rounded-full text-sm"
                  />
                  <button
                    onClick={() => { setSearchQuery(""); setSearchOpen(false) }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                {availableSubcategories.length > 0 && (
                  <button
                    onClick={() => setSubcategorySelectorOpen(true)}
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all duration-150 cursor-pointer"
                  >
                    <Layers className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setSearchOpen(true)}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all duration-150 cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Desktop filters (right side) */}
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer select-none ${
              filtersOpen || activeFilterCount > 0
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filters</span>
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
                  <h3 className="text-sm font-semibold text-neutral-900">Filters</h3>
                  <button onClick={() => setFiltersOpen(false)} className="p-1 rounded-full hover:bg-neutral-100 transition-colors cursor-pointer">
                    <X className="w-4 h-4 text-neutral-500" />
                  </button>
                </div>

                <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto">
                  <div>
                    <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Price</h4>
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
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Sort By</h4>
                    <div className="space-y-1">
                      {SORT_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => setSortBy(option.id)}
                          className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
                            sortBy === option.id ? "bg-neutral-100 text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"
                          }`}
                        >
                          <span>{option.label}</span>
                          {sortBy === option.id && <Check className="w-4 h-4 text-violet-600" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 px-4 py-3 border-t border-neutral-100 bg-neutral-50">
                  <button onClick={resetFilters} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-200 transition-colors cursor-pointer">Reset</button>
                  <button onClick={() => setFiltersOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer">Apply</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Active Filters Pills */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-neutral-500">Active:</span>
          {selectedSubcategories.map(subId => {
            const sub = availableSubcategories.find(s => s.id === subId)
            return sub ? (
              <span key={subId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                {sub.label}
                <button onClick={() => handleSubcategorySelect(subId)} className="hover:bg-violet-200 rounded-full p-0.5 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ) : null
          })}
          {priceFilter !== "all" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
              {PRICE_FILTERS.find(f => f.id === priceFilter)?.label}
              <button onClick={() => setPriceFilter("all")} className="hover:bg-violet-200 rounded-full p-0.5 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {sortBy !== "newest" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
              {SORT_OPTIONS.find(o => o.id === sortBy)?.label}
              <button onClick={() => setSortBy("newest")} className="hover:bg-violet-200 rounded-full p-0.5 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          <button onClick={resetFilters} className="text-xs text-neutral-500 hover:text-neutral-700 underline cursor-pointer">Clear all</button>
        </div>
      )}

      {/* Products Grid */}
      {paginatedProducts.length > 0 ? (
        <>
          <div
            key={`products-${category}-${selectedSubcategories.join("-")}-${priceFilter}-${sortBy}-${currentPage}-${viewMode}`}
            className={`${gridClass} animate-in fade-in-0 slide-in-from-bottom-2 duration-300`}
          >
            {paginatedProducts.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                srcParam="?src=platform"
                priority={index < 4}
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
            Showing {(currentPage - 1) * PRODUCTS_PER_PAGE + 1}-{Math.min(currentPage * PRODUCTS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length} items
          </p>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
          <p className="text-neutral-500 text-lg font-medium mb-2">
            {searchQuery
              ? `No items found for "${searchQuery}"`
              : priceFilter !== "all"
                ? "No items match your filters"
                : `No items found in ${currentSubcategoryLabel || categoryLabel}`
            }
          </p>
          <p className="text-neutral-400 text-sm mb-4">Try adjusting your filters or search terms</p>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-sm text-violet-600 hover:text-violet-700 font-medium cursor-pointer">
              Clear all filters
            </button>
          )}
        </div>
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

      {/* Desktop Subcategory Modal */}
      <DesktopSubcategoryModal
        isOpen={subcategorySelectorOpen}
        onClose={() => setSubcategorySelectorOpen(false)}
        subcategories={availableSubcategories}
        selectedSubcategories={selectedSubcategories}
        onSelectSubcategory={handleSubcategorySelect}
        onSelectAll={handleSelectAll}
        categoryLabel={categoryLabel}
      />

      {/* Mobile Subcategory Bottom Sheet */}
      <MobileSubcategorySheet
        isOpen={subcategorySelectorOpen}
        onClose={() => setSubcategorySelectorOpen(false)}
        subcategories={availableSubcategories}
        selectedSubcategories={selectedSubcategories}
        onSelectSubcategory={handleSubcategorySelect}
        onSelectAll={handleSelectAll}
        categoryLabel={categoryLabel}
      />
    </div>
  )
}
