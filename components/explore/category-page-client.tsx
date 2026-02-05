"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ProductCard } from "./product-card"
import { ProductCardSkeleton } from "./product-card-skeleton"
import { Layers, Sparkles, Zap, Share2, Bot, SlidersHorizontal, X, Check, Search, ChevronLeft, ChevronRight, Briefcase, Megaphone, ArrowLeft, Music, Camera, Video, ShoppingBag, GraduationCap, Code, Grid3X3, LayoutGrid, Rows3, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"

// Categories with icons and subcategories - Extended list matching explore-page-client
const CATEGORIES = [
  {
    id: "design",
    label: "Design",
    icon: Sparkles,
    description: "Beautiful templates, graphics, fonts, and design assets",
    color: "from-pink-500 to-violet-500",
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
    description: "Web templates, mobile apps, scripts, and developer tools",
    color: "from-blue-500 to-cyan-500",
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
    description: "Email templates, ad creatives, landing pages, and SEO tools",
    color: "from-orange-500 to-red-500",
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
    description: "Spreadsheets, presentations, documents, and business tools",
    color: "from-emerald-500 to-teal-500",
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
    description: "AI prompts, ChatGPT templates, and automation tools",
    color: "from-violet-500 to-purple-500",
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
    description: "Instagram, TikTok, YouTube templates and content packs",
    color: "from-pink-500 to-rose-500",
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
    description: "Notion templates, planners, checklists, and dashboards",
    color: "from-amber-500 to-orange-500",
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
    description: "Lightroom presets, photo overlays, and Photoshop actions",
    color: "from-sky-500 to-blue-500",
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
    description: "Video templates, transitions, motion graphics, and effects",
    color: "from-red-500 to-pink-500",
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
    description: "Royalty-free music, sound effects, loops, and samples",
    color: "from-indigo-500 to-violet-500",
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
    description: "Online courses, eBooks, tutorials, and educational content",
    color: "from-green-500 to-emerald-500",
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
    description: "Store themes, product photography, and e-commerce tools",
    color: "from-teal-500 to-cyan-500",
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
    description: "Free digital products, templates, and resources",
    color: "from-green-500 to-emerald-500",
    subcategories: []
  },
  {
    id: "other",
    label: "Other",
    icon: Layers,
    description: "Miscellaneous digital products and resources",
    color: "from-gray-500 to-slate-500",
    subcategories: []
  },
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

const PRODUCTS_PER_PAGE = 15 // 3 per row x 5 rows

// View mode options
type ViewMode = "grid" | "compact" | "list"

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
    if (diff > 0) setDragY(diff * 0.8)
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
    <div className="fixed inset-0 z-[100] md:hidden">
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ease-out ${isAnimating ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDuration: '400ms' }}
        onClick={handleClose}
      />
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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

        <div className="flex items-center gap-3 px-4 pt-4 border-t border-neutral-100 bg-white shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
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

// Subcategory Selector Modal
function SubcategorySelectorModal({
  isOpen,
  onClose,
  subcategories,
  selectedSubcategories,
  onSelectSubcategory,
  categoryLabel,
}: {
  isOpen: boolean
  onClose: () => void
  subcategories: readonly { id: string; label: string }[]
  selectedSubcategories: string[]
  onSelectSubcategory: (subId: string) => void
  categoryLabel: string
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

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
      }, 300)
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setTimeout(() => {
      onClose()
    }, 300)
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ease-out ${isAnimating ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDuration: '300ms' }}
        onClick={handleClose}
      />
      <div className="flex items-center justify-center h-full p-4">
        <div
          className={`bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transition-all duration-300 ${
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
            <div className="grid grid-cols-2 gap-2">
              {subcategories.map((sub) => {
                const isSelected = selectedSubcategories.includes(sub.id)
                return (
                  <button
                    key={sub.id}
                    onClick={() => {
                      onSelectSubcategory(sub.id)
                      handleClose()
                    }}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? "bg-violet-100 text-violet-700 ring-2 ring-violet-500"
                        : "bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    {isSelected && <Check className="w-4 h-4" />}
                    <span className="truncate">{sub.label}</span>
                  </button>
                )
              })}
            </div>
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
  initialSubcategory?: string
}

export function CategoryPageClient({
  initialProducts,
  category,
  categoryLabel,
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

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("grid")

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Get category info
  const categoryInfo = CATEGORIES.find(c => c.id === category)
  const CategoryIcon = categoryInfo?.icon || Layers
  const availableSubcategories = categoryInfo?.subcategories || []
  const categoryDescription = categoryInfo?.description || ""
  const categoryColor = categoryInfo?.color || "from-neutral-500 to-neutral-600"

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
        // Update URL
        if (newSubs.length === 0) {
          router.push(`/explore/${category}`, { scroll: false })
        }
        return newSubs
      } else {
        // Update URL
        router.push(`/explore/${category}?sub=${subId}`, { scroll: false })
        return [subId]
      }
    })
  }, [category, router])

  // Category keywords for matching - more comprehensive
  const categoryKeywords: Record<string, string[]> = {
    "design": ["design", "ui", "ux", "graphic", "template", "figma", "canva", "photoshop", "illustrator", "mockup", "logo", "brand", "icon", "font", "typography", "creative", "visual", "layout", "sketch", "adobe", "style", "art", "image", "banner", "poster", "flyer", "card", "kit"],
    "development": ["development", "code", "web", "app", "react", "nextjs", "javascript", "typescript", "html", "css", "wordpress", "shopify", "plugin", "script", "api", "software", "developer", "coding", "programming", "tech", "website", "saas", "tool", "component", "library", "framework"],
    "marketing": ["marketing", "email", "newsletter", "ad", "ads", "landing", "seo", "copywriting", "funnel", "campaign", "conversion", "growth", "leads", "sales", "promotion", "advertising", "digital", "content", "strategy", "brand"],
    "business": ["business", "spreadsheet", "excel", "presentation", "powerpoint", "document", "contract", "invoice", "proposal", "plan", "finance", "startup", "entrepreneur", "company", "corporate", "office", "professional", "management", "report", "pitch", "deck"],
    "ai": ["ai", "artificial intelligence", "chatgpt", "gpt", "prompt", "midjourney", "dalle", "automation", "machine learning", "openai", "claude", "llm", "bot", "assistant", "generative"],
    "social-media": ["social", "instagram", "tiktok", "youtube", "twitter", "linkedin", "pinterest", "reels", "shorts", "content", "post", "feed", "story", "stories", "influencer", "creator", "viral", "engagement", "followers"],
    "productivity": ["productivity", "notion", "planner", "calendar", "checklist", "tracker", "dashboard", "airtable", "organization", "workflow", "todo", "task", "schedule", "time", "management", "efficiency", "system", "template"],
    "photography": ["photo", "photography", "lightroom", "preset", "overlay", "photoshop", "action", "lut", "stock", "camera", "image", "picture", "portrait", "landscape", "editing", "filter", "color"],
    "video": ["video", "motion", "after effects", "premiere", "davinci", "transition", "effect", "animation", "film", "movie", "editing", "footage", "vfx", "intro", "outro", "youtube"],
    "audio-music": ["audio", "music", "sound", "sfx", "loop", "sample", "podcast", "royalty", "beat", "track", "song", "voice", "recording", "mix"],
    "education": ["education", "course", "ebook", "tutorial", "worksheet", "guide", "learn", "training", "lesson", "class", "teaching", "knowledge", "book", "pdf", "study"],
    "ecommerce": ["ecommerce", "e-commerce", "store", "shop", "product", "pricing", "shopify", "woocommerce", "sell", "retail", "commerce", "marketplace", "cart", "checkout"],
    "other": ["other", "misc", "miscellaneous", "general", "various"],
    "freebies": ["free", "freebie", "giveaway"],
  }

  // Filter products
  const filteredProducts = useMemo(() => {
    let products = [...initialProducts]

    // Special handling for "freebies" category - show free products
    // If no free products exist, show all products (fallback for good UX)
    if (category === "freebies") {
      const freeProducts = products.filter(p => p.price_cents === 0)
      if (freeProducts.length > 0) {
        products = freeProducts
      }
      // If no free products, show all products sorted by price (lowest first)
      else {
        products = products.sort((a, b) => (a.price_cents || 0) - (b.price_cents || 0))
      }
    }
    // Special handling for "other" category - show products that don't strongly match main categories
    // If no products match the "other" criteria, show all products sorted by newest
    else if (category === "other") {
      const mainCategoryKeywords = Object.entries(categoryKeywords)
        .filter(([key]) => key !== "other" && key !== "freebies")
        .flatMap(([_, keywords]) => keywords)

      const otherProducts = products.filter(p => {
        const productCategory = (p.category || p.categoryName || "").toLowerCase()
        const productTitle = (p.title || "").toLowerCase()
        const productDesc = (p.description || "").toLowerCase()
        const productTags = p.tags?.map((t: string) => t.toLowerCase()) || []
        const allSearchableText = `${productCategory} ${productTitle} ${productDesc} ${productTags.join(" ")}`

        // Include if it doesn't strongly match any main category
        const matchCount = mainCategoryKeywords.filter(keyword => allSearchableText.includes(keyword)).length
        return matchCount < 5 // Products with less than 5 keyword matches are "other" (more inclusive)
      })

      // If we have "other" products, use them; otherwise show all products
      if (otherProducts.length > 0) {
        products = otherProducts
      }
      // If no "other" products, products stays as all products
    }
    // Regular category filtering - sort by relevance, show matched products first
    else {
      const keywords = categoryKeywords[category] || [category]

      // Score-based sorting for better relevance
      const scoredProducts = products.map(p => {
        const productCategory = (p.category || p.categoryName || "").toLowerCase()
        const productTitle = (p.title || "").toLowerCase()
        const productDesc = (p.description || "").toLowerCase()
        const productTags = p.tags?.map((t: string) => t.toLowerCase()) || []
        const creatorTags = p.creator?.niche_tags?.map((t: string) => t.toLowerCase()) || []
        const allSearchableText = `${productCategory} ${productTitle} ${productDesc} ${productTags.join(" ")} ${creatorTags.join(" ")}`

        // Calculate match score - how many keywords match
        let score = 0

        // Direct category field match gets highest priority
        if (productCategory === category) {
          score += 10
        }

        keywords.forEach(keyword => {
          if (allSearchableText.includes(keyword)) {
            score += 1
            // Bonus for title match
            if (productTitle.includes(keyword)) score += 2
            // Bonus for category match
            if (productCategory.includes(keyword)) score += 2
          }
        })
        return { product: p, score }
      })

      // Only show products with at least some relevance (score > 0)
      // If no products match at all, show all as fallback
      const matchedProducts = scoredProducts.filter(item => item.score > 0)

      if (matchedProducts.length > 0) {
        products = matchedProducts
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score
            return new Date(b.product.created_at).getTime() - new Date(a.product.created_at).getTime()
          })
          .map(item => item.product)
      } else {
        // Fallback: show all products sorted by newest if none match
        products = scoredProducts
          .sort((a, b) => new Date(b.product.created_at).getTime() - new Date(a.product.created_at).getTime())
          .map(item => item.product)
      }
    }

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
    router.push(`/explore/${category}`, { scroll: false })
  }, [category, router])

  // Get current subcategory label
  const currentSubcategoryLabel = useMemo(() => {
    if (selectedSubcategories.length === 0) return null
    const sub = availableSubcategories.find(s => s.id === selectedSubcategories[0])
    return sub?.label || null
  }, [selectedSubcategories, availableSubcategories])

  // Grid class based on view mode
  const gridClass = useMemo(() => {
    switch (viewMode) {
      case "compact":
        return "grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
      case "list":
        return "grid gap-4 grid-cols-1"
      case "grid":
      default:
        return "grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
    }
  }, [viewMode])

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${categoryColor} p-6 sm:p-8`}>
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />

        <div className="relative z-10">
          {/* Back link */}
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Explore</span>
          </Link>

          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <CategoryIcon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
                {currentSubcategoryLabel || categoryLabel}
              </h1>
              <p className="text-white/80 text-sm sm:text-base">{categoryDescription}</p>
              <p className="text-white/60 text-sm mt-2">{filteredProducts.length} products available</p>
            </div>
          </div>
        </div>
      </div>

      {/* Subcategory Pills */}
      {availableSubcategories.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-700">Browse Subcategories</h3>
            <button
              onClick={() => setSubcategorySelectorOpen(true)}
              className="md:hidden inline-flex items-center gap-1 text-sm text-violet-600 font-medium cursor-pointer"
            >
              <span>View All</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => {
                setSelectedSubcategories([])
                router.push(`/explore/${category}`, { scroll: false })
              }}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap cursor-pointer select-none transition-all duration-150 ease-out active:scale-[0.98] ${
                selectedSubcategories.length === 0
                  ? "bg-neutral-900 text-white shadow-sm"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              All {categoryLabel}
            </button>
            {availableSubcategories.map((sub) => {
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
          </div>
        </div>
      )}

      {/* Controls Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative">
        {/* Search */}
        {searchOpen ? (
          <div className="flex-1 animate-in fade-in slide-in-from-top-2 duration-200">
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
                onClick={() => {
                  setSearchQuery("")
                  setSearchOpen(false)
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {/* Search Button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all duration-150 cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* View Mode Toggle - Desktop only */}
            <div className="hidden md:flex items-center gap-1 bg-neutral-100 rounded-full p-1">
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
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  viewMode === "list" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                <Rows3 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
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
          <button onClick={resetFilters} className="text-xs text-neutral-500 hover:text-neutral-700 underline cursor-pointer">
            Clear all
          </button>
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
                priority={index < 6}
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

          {/* Product count */}
          <p className="text-sm text-neutral-500 mt-4 text-center">
            Showing {(currentPage - 1) * PRODUCTS_PER_PAGE + 1}-{Math.min(currentPage * PRODUCTS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length} products
          </p>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-100 mx-auto mb-4 flex items-center justify-center">
            <CategoryIcon className="w-8 h-8 text-neutral-400" />
          </div>
          <p className="text-neutral-500 text-lg font-medium mb-2">
            {searchQuery
              ? `No products found for "${searchQuery}"`
              : priceFilter !== "all"
                ? "No products match your filters"
                : `No products found in ${currentSubcategoryLabel || categoryLabel}`
            }
          </p>
          <p className="text-neutral-400 text-sm mb-4">
            Try adjusting your filters or search terms
          </p>
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

      {/* Subcategory Selector Modal */}
      <SubcategorySelectorModal
        isOpen={subcategorySelectorOpen}
        onClose={() => setSubcategorySelectorOpen(false)}
        subcategories={availableSubcategories}
        selectedSubcategories={selectedSubcategories}
        onSelectSubcategory={handleSubcategorySelect}
        categoryLabel={categoryLabel}
      />
    </div>
  )
}
