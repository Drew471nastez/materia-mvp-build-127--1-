"use client"

import { useState, useCallback, useTransition, useMemo, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { FeaturedBannerCarousel } from "./featured-banner-carousel"
import { ProductCard } from "./product-card"
import { ProductCardSkeleton } from "./product-card-skeleton"
import { Layers, Sparkles, Zap, Share2, Bot, SlidersHorizontal, X, Check, Search, ChevronLeft, ChevronRight, Briefcase, Megaphone, ChevronDown, ArrowRight, Music, Camera, Video, ShoppingBag, GraduationCap, Palette, Code, Lightbulb, FileText } from "lucide-react"
import { Input } from "@/components/ui/input"

// Tap detection helpers for mobile - distinguishes taps from scrolls
const _tapStart = { x: 0, y: 0 }
function onTapStart(e: React.TouchEvent) {
  _tapStart.x = e.touches[0].clientX
  _tapStart.y = e.touches[0].clientY
}
function onTapEnd(callback: () => void) {
  return (e: React.TouchEvent) => {
    const touch = e.changedTouches[0]
    const dx = Math.abs(touch.clientX - _tapStart.x)
    const dy = Math.abs(touch.clientY - _tapStart.y)
    if (dx < 10 && dy < 10) {
      e.preventDefault()
      callback()
    }
  }
}

// Safe body scroll lock/unlock helpers that prevent scroll bugs
let scrollLockCount = 0
let lockedScrollY = 0

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    lockedScrollY = window.scrollY
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
    window.scrollTo(0, lockedScrollY)
  }
}

// Categories with icons and subcategories - Extended list
const CATEGORIES = [
  {
    id: "all",
    label: "All",
    icon: Layers,
    subcategories: []
  },
  {
    id: "design",
    label: "Design",
    icon: Sparkles,
    subcategories: [
      { id: "ui-ux", label: "UI/UX Templates" },
      { id: "graphics", label: "Graphics & Illustrations" },
      { id: "fonts", label: "Fonts & Typography" },
      { id: "icons", label: "Icons & Elements" },
      { id: "mockups", label: "Mockups" },
      { id: "logos", label: "Logo Templates" },
      { id: "branding", label: "Branding Kits" },
      { id: "print", label: "Print Design" },
    ]
  },
  {
    id: "development",
    label: "Development",
    icon: Code,
    subcategories: [
      { id: "web", label: "Web Templates" },
      { id: "mobile", label: "Mobile Apps" },
      { id: "scripts", label: "Scripts & Plugins" },
      { id: "apis", label: "APIs & Tools" },
      { id: "wordpress", label: "WordPress Themes" },
      { id: "shopify", label: "Shopify Themes" },
      { id: "react", label: "React Components" },
      { id: "nextjs", label: "Next.js Templates" },
    ]
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    subcategories: [
      { id: "email", label: "Email Templates" },
      { id: "ads", label: "Ad Creatives" },
      { id: "landing", label: "Landing Pages" },
      { id: "seo", label: "SEO Tools" },
      { id: "copywriting", label: "Copywriting Templates" },
      { id: "funnels", label: "Sales Funnels" },
    ]
  },
  {
    id: "business",
    label: "Business",
    icon: Briefcase,
    subcategories: [
      { id: "spreadsheets", label: "Spreadsheets" },
      { id: "presentations", label: "Presentations" },
      { id: "documents", label: "Documents & Contracts" },
      { id: "invoices", label: "Invoice Templates" },
      { id: "proposals", label: "Proposal Templates" },
      { id: "business-plans", label: "Business Plans" },
    ]
  },
  {
    id: "ai",
    label: "AI",
    icon: Bot,
    subcategories: [
      { id: "prompts", label: "AI Prompts" },
      { id: "chatgpt", label: "ChatGPT Templates" },
      { id: "midjourney", label: "Midjourney Prompts" },
      { id: "automation", label: "Automation Tools" },
      { id: "ai-tools", label: "AI-Powered Tools" },
    ]
  },
  {
    id: "social-media",
    label: "Social Media",
    icon: Share2,
    subcategories: [
      { id: "instagram", label: "Instagram Templates" },
      { id: "tiktok", label: "TikTok Content" },
      { id: "youtube", label: "YouTube Assets" },
      { id: "twitter", label: "Twitter/X Templates" },
      { id: "linkedin", label: "LinkedIn Templates" },
      { id: "pinterest", label: "Pinterest Templates" },
      { id: "reels", label: "Reels & Shorts" },
    ]
  },
  {
    id: "productivity",
    label: "Productivity",
    icon: Zap,
    subcategories: [
      { id: "notion", label: "Notion Templates" },
      { id: "planners", label: "Calendars & Planners" },
      { id: "checklists", label: "Checklists" },
      { id: "trackers", label: "Habit Trackers" },
      { id: "dashboards", label: "Dashboards" },
      { id: "airtable", label: "Airtable Templates" },
    ]
  },
  {
    id: "photography",
    label: "Photography",
    icon: Camera,
    subcategories: [
      { id: "presets", label: "Lightroom Presets" },
      { id: "overlays", label: "Photo Overlays" },
      { id: "actions", label: "Photoshop Actions" },
      { id: "luts", label: "Color LUTs" },
      { id: "stock", label: "Stock Photos" },
    ]
  },
  {
    id: "video",
    label: "Video",
    icon: Video,
    subcategories: [
      { id: "templates", label: "Video Templates" },
      { id: "transitions", label: "Transitions & Effects" },
      { id: "motion", label: "Motion Graphics" },
      { id: "after-effects", label: "After Effects" },
      { id: "premiere", label: "Premiere Pro" },
      { id: "davinci", label: "DaVinci Resolve" },
    ]
  },
  {
    id: "audio-music",
    label: "Audio & Music",
    icon: Music,
    subcategories: [
      { id: "music", label: "Royalty-Free Music" },
      { id: "sfx", label: "Sound Effects" },
      { id: "loops", label: "Loops & Samples" },
      { id: "podcasts", label: "Podcast Templates" },
    ]
  },
  {
    id: "education",
    label: "Education",
    icon: GraduationCap,
    subcategories: [
      { id: "courses", label: "Online Courses" },
      { id: "ebooks", label: "eBooks" },
      { id: "tutorials", label: "Tutorials" },
      { id: "worksheets", label: "Worksheets" },
      { id: "guides", label: "Guides & How-tos" },
    ]
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    icon: ShoppingBag,
    subcategories: [
      { id: "product-photos", label: "Product Photography" },
      { id: "store-themes", label: "Store Themes" },
      { id: "pricing", label: "Pricing Templates" },
      { id: "emails", label: "E-commerce Emails" },
    ]
  },
  {
    id: "freebies",
    label: "Freebies",
    icon: Sparkles,
    subcategories: []
  },
  {
    id: "other",
    label: "Other",
    icon: Layers,
    subcategories: []
  },
] as const

// Map from DB category display values to our code category IDs
// Products in the DB may have values like "Digital Art", "Other", "Productivity" etc.
// This normalizes them to our URL-safe IDs like "design", "other", "productivity"
const DB_CATEGORY_TO_ID: Record<string, string> = {
  // Exact ID matches (after SQL migration has been run)
  "productivity": "productivity",
  "design": "design",
  "development": "development",
  "marketing": "marketing",
  "business": "business",
  "ai": "ai",
  "social-media": "social-media",
  "photography": "photography",
  "video": "video",
  "audio-music": "audio-music",
  "education": "education",
  "ecommerce": "ecommerce",
  "freebies": "freebies",
  "other": "other",
  // Common display-name variants from the DB
  "digital art": "design",
  "graphic design": "design",
  "graphics": "design",
  "ui/ux": "design",
  "ui ux": "design",
  "ui/ux design": "design",
  "web design": "design",
  "illustration": "design",
  "branding": "design",
  "typography": "design",
  "web development": "development",
  "software": "development",
  "software development": "development",
  "coding": "development",
  "programming": "development",
  "web templates": "development",
  "social media": "social-media",
  "social": "social-media",
  "audio & music": "audio-music",
  "audio": "audio-music",
  "music": "audio-music",
  "sound": "audio-music",
  "e-commerce": "ecommerce",
  "online store": "ecommerce",
  "photo": "photography",
  "photos": "photography",
  "photo editing": "photography",
  "lightroom": "photography",
  "presets": "photography",
  "lightroom presets": "photography",
  "video editing": "video",
  "motion graphics": "video",
  "animation": "video",
  "artificial intelligence": "ai",
  "machine learning": "ai",
  "prompts": "ai",
  "ai prompts": "ai",
  "chatgpt": "ai",
  "gpt": "ai",
  "templates": "productivity",
  "notion": "productivity",
  "notion templates": "productivity",
  "planners": "productivity",
  "planner": "productivity",
  "spreadsheets": "business",
  "spreadsheet": "business",
  "presentations": "business",
  "presentation": "business",
  "finance": "business",
  "courses": "education",
  "online courses": "education",
  "ebooks": "education",
  "ebook": "education",
  "e-book": "education",
  "tutorials": "education",
  "tutorial": "education",
  "free": "freebies",
  "freebie": "freebies",
  "digital marketing": "marketing",
  "seo": "marketing",
  "email marketing": "marketing",
}

// Normalize a DB category value to our code category ID
function normalizeCategoryToId(dbCategory: string): string {
  const lower = (dbCategory || "").toLowerCase().trim()
  if (!lower) return ""
  return DB_CATEGORY_TO_ID[lower] || lower
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

const PRODUCTS_PER_PAGE = 9 // 3 per row x 3 rows

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
  availableSubcategories: { id: string; label: string }[]
  resetFilters: () => void
  activeFilterCount: number
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  const hasBodyScrollLock = useRef(false)

  useEffect(() => {
    if (!isOpen) return

    setIsVisible(true)
    if (!hasBodyScrollLock.current) {
      lockBodyScroll()
      hasBodyScrollLock.current = true
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsAnimating(true)
      })
    })

    return () => {
      if (hasBodyScrollLock.current) {
        unlockBodyScroll()
        hasBodyScrollLock.current = false
      }
    }
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
            <button onClick={resetFilters} className="text-sm text-violet-600 font-medium cursor-pointer">
              Reset all
            </button>
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

        <div className="flex items-center gap-3 px-4 pt-4 border-t border-neutral-100 bg-white shrink-0" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
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
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  const hasBodyScrollLock = useRef(false)

  useEffect(() => {
    if (!isOpen) return

    setIsVisible(true)
    setExpandedCategory(null)
    if (!hasBodyScrollLock.current) {
      lockBodyScroll()
      hasBodyScrollLock.current = true
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsAnimating(true)
      })
    })

    return () => {
      if (hasBodyScrollLock.current) {
        unlockBodyScroll()
        hasBodyScrollLock.current = false
      }
    }
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

  const handleCategoryClick = (cat: typeof CATEGORIES[number]) => {
    if (cat.subcategories && cat.subcategories.length > 0) {
      setExpandedCategory(expandedCategory === cat.id ? null : cat.id)
    } else {
      handleSelectCategory(cat.id)
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100]" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
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
            <h3 className="text-lg font-semibold text-neutral-900">Select Category</h3>
            <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-neutral-100 transition-colors cursor-pointer">
              <X className="w-5 h-5 text-neutral-500" />
            </button>
          </div>
          <div className="p-3 max-h-[60vh] overflow-y-auto">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon
              const isSelected = selectedCategory === cat.id && !selectedSubcategory
              const isExpanded = expandedCategory === cat.id
              const hasSubcats = cat.subcategories && cat.subcategories.length > 0

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
                        <span>All {cat.label}</span>
                        {selectedCategory === cat.id && !selectedSubcategory && <Check className="w-4 h-4 ml-auto" />}
                      </button>
                      {cat.subcategories.map((sub) => (
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
          transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '70vh',
        }}
      >
        <div className="pt-3 pb-2">
          <button onClick={handleClose} className="w-full flex justify-center py-2 cursor-pointer touch-none">
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100">
          <h3 className="text-lg font-semibold text-neutral-900">Select Category</h3>
        </div>

        <div className="overflow-y-auto overscroll-contain p-3" style={{ maxHeight: 'calc(70vh - 80px)' }}>
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isSelected = selectedCategory === cat.id && !selectedSubcategory
            const isExpanded = expandedCategory === cat.id
            const hasSubcats = cat.subcategories && cat.subcategories.length > 0

            return (
              <div key={cat.id}>
                <button
                  onClick={() => handleCategoryClick(cat)}
                  onTouchStart={onTapStart}
                  onTouchEnd={onTapEnd(() => handleCategoryClick(cat))}
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
                      onTouchStart={onTapStart}
                      onTouchEnd={onTapEnd(() => handleSelectCategory(cat.id))}
                      className={`flex items-center gap-2 w-full px-4 py-3 rounded-lg text-sm text-left transition-all duration-150 cursor-pointer touch-manipulation ${
                        selectedCategory === cat.id && !selectedSubcategory
                          ? "bg-violet-100 text-violet-700 font-medium"
                          : "text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      <span>All {cat.label}</span>
                      {selectedCategory === cat.id && !selectedSubcategory && <Check className="w-4 h-4 ml-auto" />}
                    </button>
                    {cat.subcategories.map((sub, index) => (
                      <button
                        key={sub.id}
                        onClick={() => handleSelectSubcategory(cat.id, sub.id, sub.label)}
                        onTouchStart={onTapStart}
                        onTouchEnd={onTapEnd(() => handleSelectSubcategory(cat.id, sub.id, sub.label))}
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

// Search Input Component
function SearchInput({
  isOpen,
  onClose,
  searchQuery,
  setSearchQuery,
  categoryName,
}: {
  isOpen: boolean
  onClose: () => void
  searchQuery: string
  setSearchQuery: (value: string) => void
  categoryName: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 pointer-events-none" />
        <Input
          ref={inputRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search in ${categoryName}...`}
          className="h-11 w-full pl-10 pr-10 bg-neutral-100 border-neutral-200 text-neutral-900 placeholder:text-neutral-500 rounded-full text-sm"
        />
        <button
          onClick={() => {
            setSearchQuery("")
            onClose()
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Smooth scroll utility function
function smoothScrollToSection(ref: React.RefObject<HTMLElement | null>) {
  if (ref.current) {
    const yOffset = -100 // Offset for fixed header
    const element = ref.current
    const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset

    window.scrollTo({
      top: y,
      behavior: 'smooth'
    })
  }
}

interface ExplorePageClientProps {
  initialProducts: any[]
  initialCategory: string
  searchQuery: string
}

export function ExplorePageClient({
  initialProducts,
  initialCategory,
  searchQuery: urlSearchQuery,
}: ExplorePageClientProps) {
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

  // Filter states
  const [priceFilter, setPriceFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("newest")
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Category selector modal
  const [categorySelectorOpen, setCategorySelectorOpen] = useState(false)

  // Search states
  const [searchOpen, setSearchOpen] = useState(false)
  const [localSearchQuery, setLocalSearchQuery] = useState("")

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [mainCategory, selectedSubcategoryId, recommendationFilter, priceFilter, sortBy, selectedSubcategories, localSearchQuery])

  // Get available subcategories for current main category
  const availableSubcategories = useMemo(() => {
    const cat = CATEGORIES.find(c => c.id === mainCategory)
    return cat?.subcategories || []
  }, [mainCategory])

  // Products for featured section
  const featuredProducts = useMemo(() => {
    return initialProducts.filter(p => p.thumbnail_url).slice(0, 5)
  }, [initialProducts])

  // Get Recommended section products (based on main category and subcategory)
  const recommendedProducts = useMemo(() => {
    let products = [...initialProducts]

    // Special handling for "freebies" category - show free products
    if (mainCategory === "freebies") {
      products = products.filter(p => p.price_cents === 0)
    }
    // For all other categories (including "other"): strictly filter by normalized DB category
    else if (mainCategory !== "all") {
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

  // Get products for the Browse by Category section - 2 rows x 3 = 6 products
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

    return products.slice(0, 6)
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
    if (urlSearchQuery) return `Results for "${urlSearchQuery}"`
    if (selectedSubcategoryLabel) return selectedSubcategoryLabel
    if (mainCategory === "all") return "Recommended"
    return CATEGORIES.find(c => c.id === mainCategory)?.label || "Products"
  }, [mainCategory, selectedSubcategoryLabel, urlSearchQuery])

  // Handle category change - updates main category and scrolls to Recommended section
  const handleCategoryChange = useCallback((categoryId: string, subcategoryId?: string, subcategoryLabel?: string) => {
    setMainCategory(categoryId)
    setBrowseCategory(categoryId)
    setSelectedSubcategoryId(subcategoryId || null)
    setSelectedSubcategoryLabel(subcategoryLabel || null)
    setSelectedSubcategories([])
    setIsLoadingCategory(true)

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

      // Smooth scroll to Recommended section for both desktop and mobile
      // Wait 450ms for modal animation to complete before scrolling
      if (categoryId !== "all" || subcategoryId) {
        setTimeout(() => {
          smoothScrollToSection(categorySectionRef)
        }, 450)
      }
    }, 100)
  }, [router, urlSearchQuery])

  // Handle subcategory selection from modal
  const handleSubcategorySelect = useCallback((categoryId: string, subcategoryId: string, subcategoryLabel: string) => {
    handleCategoryChange(categoryId, subcategoryId, subcategoryLabel)
  }, [handleCategoryChange])

  // Handle browse category change from pills (only updates browse section, not recommended)
  const handleBrowseCategoryChange = useCallback((categoryId: string) => {
    setBrowseCategory(categoryId)
  }, [])

  // Handle category selection from modal - updates MAIN category and scrolls
  const handleCategorySelectorSelect = useCallback((categoryId: string) => {
    handleCategoryChange(categoryId)
  }, [handleCategoryChange])

  useEffect(() => {
    return () => {
      if (categoryChangeTimeoutRef.current) clearTimeout(categoryChangeTimeoutRef.current)
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
  const browseCategoryLabel = CATEGORIES.find(c => c.id === browseCategory)?.label || "All"

  return (
    <div className="space-y-8">
      {/* Featured Banner Carousel */}
      {!urlSearchQuery && featuredProducts.length > 0 && (
        <FeaturedBannerCarousel products={featuredProducts} />
      )}

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
                    Clear
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Mobile: Category Icon Button */}
                <button
                  onClick={() => setCategorySelectorOpen(true)}
                  className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all duration-150 cursor-pointer"
                >
                  <Layers className="w-4 h-4" />
                </button>

                {/* Desktop: By Category Pill Button */}
                <button
                  onClick={() => setCategorySelectorOpen(true)}
                  className="hidden md:inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all duration-150 cursor-pointer"
                >
                  <Layers className="w-4 h-4" />
                  <span>By Category</span>
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
                    <div className="fixed inset-0 z-40 hidden md:block" onClick={() => setFiltersOpen(false)} />
                    <div className="hidden md:block absolute right-0 top-full mt-2 w-[340px] bg-white rounded-2xl shadow-xl border border-neutral-200 z-50 animate-in fade-in-0 slide-in-from-top-2 duration-200 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
                        <h3 className="text-sm font-semibold text-neutral-900">Filters</h3>
                        <button onClick={() => setFiltersOpen(false)} className="p-1 rounded-full hover:bg-neutral-100 transition-colors cursor-pointer">
                          <X className="w-4 h-4 text-neutral-500" />
                        </button>
                      </div>

                      <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto">
                        {availableSubcategories.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Subcategories</h4>
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
                        <button onClick={resetFilters} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-200 transition-colors cursor-pointer">
                          Reset
                        </button>
                        <button onClick={() => setFiltersOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer">
                          Apply
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Search Input */}
            <SearchInput
              isOpen={searchOpen}
              onClose={() => setSearchOpen(false)}
              searchQuery={localSearchQuery}
              setSearchQuery={setLocalSearchQuery}
              categoryName={sectionTitle}
            />

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
                    {filter.label}
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
                  Clear
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
                  {selectedSubcategoryLabel || CATEGORIES.find(c => c.id === mainCategory)?.label || "Category"}
                </button>
              </div>
            )}

            {/* Active Filters Pills */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-neutral-500">Active:</span>
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
                <button onClick={resetFilters} className="text-xs text-neutral-500 hover:text-neutral-700 underline cursor-pointer">
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Products Grid - 3 per row */}
          {showSkeletons ? (
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in-0 duration-200">
              {Array.from({ length: 9 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : paginatedProducts.length > 0 ? (
            <>
              <div
                key={`products-${mainCategory}-${selectedSubcategoryId}-${recommendationFilter}-${priceFilter}-${sortBy}-${currentPage}`}
                className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
              >
                {paginatedProducts.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    srcParam="?src=platform"
                    priority={index < 3}
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
                Showing {(currentPage - 1) * PRODUCTS_PER_PAGE + 1}-{Math.min(currentPage * PRODUCTS_PER_PAGE, recommendedProducts.length)} of {recommendedProducts.length} products
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
                    <span>Show All {selectedSubcategoryLabel || sectionTitle} Products</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
              <p className="text-neutral-500">
                {localSearchQuery
                  ? `No products found for "${localSearchQuery}"`
                  : priceFilter !== "all"
                    ? "No products match your filters. Try adjusting your price range."
                    : `No products found in ${sectionTitle}.`
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
                  Clear filters
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Browse by Category Section */}
      <section className="mt-12 pt-8 border-t border-neutral-200">
        {/* Section Header */}
        <div className="flex flex-col gap-4 mb-4">
          {/* Mobile: By Category button above pills, right-aligned */}
          <div className="flex md:hidden justify-end">
            <button
              onClick={() => setCategorySelectorOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
            >
              <span>By Category</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Desktop: Title and By Category button on same row */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-neutral-900">
              {browseCategory === "all" ? "Browse by Category" : browseCategoryLabel}
            </h3>

            {/* Desktop: By Category button */}
            <button
              onClick={() => setCategorySelectorOpen(true)}
              className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors cursor-pointer"
            >
              <span>By Category</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Category Pills */}
          <nav aria-label="Browse categories" className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {CATEGORIES.slice(0, 8).map((category) => {
              const isSelected = browseCategory === category.id
              const Icon = category.icon
              return (
                <button
                  key={category.id}
                  onClick={() => handleBrowseCategoryChange(category.id)}
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

        {/* Products Grid - 2 rows x 3 products on desktop */}
        {browseSectionProducts.length > 0 ? (
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in-0 duration-200">
            {browseSectionProducts.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                srcParam="?src=platform"
                priority={index < 3}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center">
            <p className="text-neutral-500">No products found in this category.</p>
          </div>
        )}

        {/* Show All Button */}
        {browseSectionProducts.length > 0 && (
          <div className="flex justify-center mt-6">
            <Link
              href={browseCategory === "all" ? "/explore" : `/explore/${browseCategory}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <span>Show All {browseCategory !== "all" ? browseCategoryLabel : ""} Products</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </section>

      {/* Search Results Section */}
      {urlSearchQuery && (
        <section className="mt-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-5">
            Results for "{urlSearchQuery}"
          </h2>
          {recommendedProducts.length > 0 ? (
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in-0 duration-200">
              {recommendedProducts.slice(0, 15).map((product, index) => (
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
              <p className="text-neutral-500">No products found for "{urlSearchQuery}"</p>
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
        selectedCategory={mainCategory}
        selectedSubcategory={selectedSubcategoryId}
        onSelectCategory={handleCategorySelectorSelect}
        onSelectSubcategory={handleSubcategorySelect}
      />
    </div>
  )
}
