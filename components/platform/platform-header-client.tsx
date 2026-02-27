"use client"

import type React from "react"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { extractUsernameFromHost, getCanonicalSiteUrl } from "@/lib/url-helpers"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { Heart, Library, Search, LayoutDashboard, Settings, LogOut, LogIn, Menu, X, Loader2, ChevronRight, ChevronLeft, ChevronDown, Sparkles, Code, Megaphone, Briefcase, Music, Camera, Video, LayoutGrid, Gift, MoreHorizontal, Bot, Share2, Flame, Zap, ShoppingBag, Lightbulb, ArrowRight, User as UserIcon, Compass } from "lucide-react"
import { useLocale } from "@/components/locale-provider"

const LOGO_URL =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"

// Desktop category bar with icons
const DEFAULT_CATEGORIES = [
  { id: "all", label: "All", icon: LayoutGrid, badge: null },
  { id: "audio-music", label: "Audio & Music", icon: Music, badge: null },
  { id: "business", label: "Business & Money", icon: Briefcase, badge: null },
  { id: "other", label: "Other", icon: MoreHorizontal, badge: null },
  { id: "freebies", label: "Freebies", icon: Gift, badge: null },
  { id: "ai", label: "AI", icon: Bot, badge: "HOT" },
]

// Mobile category pills - 6 categories as pill buttons with icons
const MOBILE_CATEGORIES = [
  { id: "all", label: "All", icon: LayoutGrid, badge: null },
  { id: "audio-music", label: "Audio & Music", icon: Music, badge: null },
  { id: "business", label: "Business & Money", icon: Briefcase, badge: null },
  { id: "other", label: "Other", icon: MoreHorizontal, badge: null },
  { id: "freebies", label: "Freebies", icon: Gift, badge: null },
  { id: "ai", label: "AI", icon: Bot, badge: "HOT" },
]

// Categories with subcategories for the dropdown
const CATEGORIES_WITH_SUBS = [
  {
    label: "Design",
    href: "/explore?category=design",
    icon: Sparkles,
    subcategories: [
      { label: "UI/UX Templates", href: "/explore?category=design&sub=ui-ux" },
      { label: "Graphics & Illustrations", href: "/explore?category=design&sub=graphics" },
      { label: "Fonts & Typography", href: "/explore?category=design&sub=fonts" },
      { label: "Icons & Elements", href: "/explore?category=design&sub=icons" },
      { label: "Mockups", href: "/explore?category=design&sub=mockups" },
    ]
  },
  {
    label: "Development",
    href: "/explore?category=development",
    icon: Code,
    subcategories: [
      { label: "Web Templates", href: "/explore?category=development&sub=web" },
      { label: "Mobile Apps", href: "/explore?category=development&sub=mobile" },
      { label: "Scripts & Plugins", href: "/explore?category=development&sub=scripts" },
      { label: "APIs & Tools", href: "/explore?category=development&sub=apis" },
      { label: "Code Snippets", href: "/explore?category=development&sub=snippets" },
    ]
  },
  {
    label: "Marketing",
    href: "/explore?category=marketing",
    icon: Megaphone,
    subcategories: [
      { label: "Email Templates", href: "/explore?category=marketing&sub=email" },
      { label: "Ad Creatives", href: "/explore?category=marketing&sub=ads" },
      { label: "Landing Pages", href: "/explore?category=marketing&sub=landing" },
      { label: "SEO Tools", href: "/explore?category=marketing&sub=seo" },
    ]
  },
  {
    label: "Business",
    href: "/explore?category=business",
    icon: Briefcase,
    subcategories: [
      { label: "Spreadsheets", href: "/explore?category=business&sub=spreadsheets" },
      { label: "Presentations", href: "/explore?category=business&sub=presentations" },
      { label: "Documents & Contracts", href: "/explore?category=business&sub=documents" },
      { label: "Finance Tools", href: "/explore?category=business&sub=finance" },
    ]
  },
  {
    label: "AI",
    href: "/explore?category=ai",
    icon: Bot,
    isHot: true,
    subcategories: [
      { label: "AI Prompts", href: "/explore?category=ai&sub=prompts" },
      { label: "ChatGPT Templates", href: "/explore?category=ai&sub=chatgpt" },
      { label: "AI Art Prompts", href: "/explore?category=ai&sub=art-prompts" },
      { label: "Automation Tools", href: "/explore?category=ai&sub=automation" },
      { label: "AI Workflows", href: "/explore?category=ai&sub=workflows" },
    ]
  },
  {
    label: "Social Media",
    href: "/explore?category=social-media",
    icon: Share2,
    subcategories: [
      { label: "Instagram Templates", href: "/explore?category=social-media&sub=instagram" },
      { label: "TikTok Content", href: "/explore?category=social-media&sub=tiktok" },
      { label: "YouTube Assets", href: "/explore?category=social-media&sub=youtube" },
      { label: "Social Media Kits", href: "/explore?category=social-media&sub=kits" },
    ]
  },
  {
    label: "Music & Audio",
    href: "/explore?category=music",
    icon: Music,
    subcategories: [
      { label: "Sound Effects", href: "/explore?category=music&sub=sfx" },
      { label: "Music Loops", href: "/explore?category=music&sub=loops" },
      { label: "Podcast Templates", href: "/explore?category=music&sub=podcast" },
    ]
  },
  {
    label: "Photography",
    href: "/explore?category=photography",
    icon: Camera,
    subcategories: [
      { label: "Presets & Filters", href: "/explore?category=photography&sub=presets" },
      { label: "Stock Photos", href: "/explore?category=photography&sub=stock" },
      { label: "Overlays & Textures", href: "/explore?category=photography&sub=overlays" },
    ]
  },
  {
    label: "Video & Film",
    href: "/explore?category=video",
    icon: Video,
    subcategories: [
      { label: "Video Templates", href: "/explore?category=video&sub=templates" },
      { label: "Motion Graphics", href: "/explore?category=video&sub=motion" },
      { label: "LUTs & Color Grades", href: "/explore?category=video&sub=luts" },
    ]
  },
  {
    label: "Productivity",
    href: "/explore?category=productivity",
    icon: Zap,
    subcategories: [
      { label: "Notion Templates", href: "/explore?category=productivity&sub=notion" },
      { label: "Calendars & Planners", href: "/explore?category=productivity&sub=planners" },
      { label: "Checklists", href: "/explore?category=productivity&sub=checklists" },
    ]
  },
  {
    label: "E-commerce",
    href: "/explore?category=ecommerce",
    icon: ShoppingBag,
    subcategories: [
      { label: "Shopify Themes", href: "/explore?category=ecommerce&sub=shopify" },
      { label: "Product Mockups", href: "/explore?category=ecommerce&sub=mockups" },
      { label: "Store Templates", href: "/explore?category=ecommerce&sub=stores" },
    ]
  },
  {
    label: "Education",
    href: "/explore?category=education",
    icon: Lightbulb,
    subcategories: [
      { label: "Online Courses", href: "/explore?category=education&sub=courses" },
      { label: "Ebooks & Guides", href: "/explore?category=education&sub=ebooks" },
      { label: "Worksheets", href: "/explore?category=education&sub=worksheets" },
    ]
  },
]

// Simple search categories for search modal
const SEARCH_CATEGORIES = CATEGORIES_WITH_SUBS.slice(0, 9).map(cat => ({
  label: cat.label,
  href: cat.href,
  icon: cat.icon,
  isHot: cat.isHot,
}))

// Product type for search results
type SearchProduct = {
  id: string
  title: string
  slug: string
  thumbnail_url?: string
  price_cents: number
  creator?: {
    display_name?: string
    slug?: string
  }
}

type Profile = {
  display_name?: string | null
  avatar_url?: string | null
  username?: string | null
  is_creator?: boolean | null
}

// Mobile Top Sheet Component for Search - slides down from top
function MobileTopSheet({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      // Prevent pull-to-refresh while sheet is open
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
        // Restore pull-to-refresh after sheet fully closes
        document.documentElement.style.overscrollBehavior = ''
        document.body.style.overscrollBehavior = ''
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    setDragY(0)
    setTimeout(() => {
      onClose()
      // Restore pull-to-refresh
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }, 400)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    const sheetElement = sheetRef.current
    if (!sheetElement) return

    const sheetRect = sheetElement.getBoundingClientRect()
    const touchYInSheet = touch.clientY - sheetRect.top
    const sheetHeight = sheetRect.height

    // Only start dragging if touch is in the handle area (bottom 60px of the sheet)
    if (touchYInSheet >= sheetHeight - 60) {
      startY.current = touch.clientY
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = startY.current - currentY
    if (diff > 0) {
      setDragY(-diff * 0.8)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY < -80) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  if (!isVisible || !isMounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] md:hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ease-out ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDuration: '400ms' }}
        onClick={handleClose}
      />
      {/* Top Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute top-0 left-0 right-0 bg-white rounded-b-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translateY(${dragY}px)` : "translateY(-100%)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '75vh',
        }}
      >
        <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(75vh - 40px)' }}>
          {children}
        </div>
        {/* Handle bar at bottom */}
        <div className="pb-3 pt-2">
          <button
            onClick={handleClose}
            className="w-full flex justify-center py-2 cursor-pointer touch-none"
          >
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Mobile Bottom Sheet Component with swipe-to-close
function MobileBottomSheet({
  isOpen,
  onClose,
  children,
  title,
}: {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDragY(0)
      }, 400)
      return () => clearTimeout(timer)
    }
    return () => {
      document.body.style.overflow = ""
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
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

    // Only start dragging if touch is in the backdrop or handle/header area
    if (touchYInSheet <= 0 || touchYInSheet <= 100) {
      startY.current = touch.clientY
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current
    if (diff > 0) {
      e.preventDefault()
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

  if (!isVisible || !isMounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] md:hidden" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
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
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        style={{
          transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '74vh',
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
        {title && (
          <div className="px-4 pb-3">
            <h3 className="text-[16px] font-semibold text-gray-900">{title}</h3>
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(74vh - 80px)' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Shared ref for tap detection across category buttons inside scrollable modals
// Tracks touch start position; onTouchEnd only fires callback if touch moved < 10px (tap, not scroll)
const tapStartPos = { x: 0, y: 0 }
function handleTapStart(e: React.TouchEvent) {
  tapStartPos.x = e.touches[0].clientX
  tapStartPos.y = e.touches[0].clientY
}
function makeTapEnd(callback: () => void) {
  return (e: React.TouchEvent) => {
    const touch = e.changedTouches[0]
    const dx = Math.abs(touch.clientX - tapStartPos.x)
    const dy = Math.abs(touch.clientY - tapStartPos.y)
    if (dx < 10 && dy < 10) {
      e.preventDefault()
      callback()
    }
  }
}

// Animated Hamburger Icon Component - subtle animation only
function AnimatedHamburger({ isOpen }: { isOpen: boolean }) {
  return (
    <div className="w-[23px] h-[23px] flex flex-col justify-center items-center gap-[5px]">
      <span
        className={`block h-0.5 w-[23px] bg-current rounded-full transition-all duration-200 ease-out ${
          isOpen ? "opacity-60" : "opacity-100"
        }`}
      />
      <span
        className={`block h-0.5 bg-current rounded-full transition-all duration-200 ease-out ${
          isOpen ? "opacity-60 w-4" : "opacity-100 w-[23px]"
        }`}
      />
      <span
        className={`block h-0.5 w-[23px] bg-current rounded-full transition-all duration-200 ease-out ${
          isOpen ? "opacity-60" : "opacity-100"
        }`}
      />
    </div>
  )
}

// Beta launch countdown bar — counts down to March 10, 2026
function LaunchCountdownBar({ onCanonicalNav }: { onCanonicalNav: (e: React.MouseEvent, href: string) => void }) {
  const LAUNCH_DATE = new Date("2026-03-10T00:00:00").getTime()

  const calcRemaining = () => {
    const diff = Math.max(0, LAUNCH_DATE - Date.now())
    const days = Math.floor(diff / 86400000)
    const hours = Math.floor((diff % 86400000) / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    return { days, hours, minutes, seconds }
  }

  const [time, setTime] = useState(calcRemaining)

  useEffect(() => {
    const id = setInterval(() => setTime(calcRemaining()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="bg-[#0a0a0a] text-white">
      <div className="py-2 px-4 md:py-2.5">
        <div className="max-w-[1400px] mx-auto flex items-center justify-center gap-2 md:gap-3 text-center">
          <span className="text-[12px] md:text-[14px] text-white/90">
            <span className="font-semibold text-white">Beta Release</span>
            <span className="hidden md:inline"> — Official Launch In</span>
            <span className="md:hidden"> —</span>
            {" "}
            <span className="font-mono font-bold text-white tabular-nums">
              <span className="hidden md:inline">{time.days}d {String(time.hours).padStart(2, "0")}h {String(time.minutes).padStart(2, "0")}m {String(time.seconds).padStart(2, "0")}s</span>
              <span className="md:hidden">{time.days}d {String(time.hours).padStart(2, "0")}:{String(time.minutes).padStart(2, "0")}:{String(time.seconds).padStart(2, "0")}</span>
            </span>
            <span className="hidden md:inline"> — 10 March</span>
          </span>
          <Link
            href="/signup"
            onClick={(e) => onCanonicalNav(e, "/signup")}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 md:px-4 md:py-1.5 text-[11px] md:text-[12px] font-semibold bg-white text-gray-900 hover:bg-white/90 transition-colors"
          >
            <span>Early Sign Up</span>
            <ArrowRight className="h-3 w-3 md:h-3.5 md:w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export function PlatformHeaderClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { t } = useLocale()

  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isCreator, setIsCreator] = useState(false)
  const [hasCompletedSellerOnboarding, setHasCompletedSellerOnboarding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [wishlistCount, setWishlistCount] = useState(0)

  const mountedRef = useRef(true)

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "")
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchProduct[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [selectedCategoryForSubs, setSelectedCategoryForSubs] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const profileDropdownRef = useRef<HTMLDivElement>(null)
  const [desktopProfileOpen, setDesktopProfileOpen] = useState(false)

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "")
  }, [searchParams])

  // Close modals on route change
  useEffect(() => {
    setSearchModalOpen(false)
    setCategoriesDropdownOpen(false)
    setMobileMenuOpen(false)
    setMobileProfileOpen(false)
    setExpandedCategory(null)
    setSelectedCategoryForSubs(null)
    setDesktopProfileOpen(false)
  }, [pathname])

  // Close desktop dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      // Only close if clicking completely outside the dropdown
      if (!target.closest('[data-categories-dropdown]')) {
        setCategoriesDropdownOpen(false)
        // Reset states when fully closing
        setTimeout(() => {
          setExpandedCategory(null)
          setSelectedCategoryForSubs(null)
        }, 100)
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(target)) {
        setDesktopProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Live search with debounce
  const handleSearchChange = useCallback((value: string) => {
    setQuery(value)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (value.trim().length < 1) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("products")
          .select(`
            id,
            title,
            slug,
            thumbnail_url,
            price_cents,
            creator_id,
            creators!inner (
              display_name,
              slug
            )
          `)
          .ilike("title", `%${value}%`)
          .eq("status", "published")
          .limit(8)

        if (!error && data) {
          const results = data.map((p: any) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            thumbnail_url: p.thumbnail_url,
            price_cents: p.price_cents,
            creator: p.creators ? {
              display_name: p.creators.display_name,
              slug: p.creators.slug,
            } : undefined,
          }))
          setSearchResults(results)
        }
      } catch (err) {
        console.error("Search error:", err)
      } finally {
        setSearchLoading(false)
      }
    }, 300)
  }, [])

  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  const fetchWishlistCount = useCallback(async () => {
    try {
      const guestId = typeof localStorage !== "undefined" ? localStorage.getItem("materia_guest_id") : null
      const url = guestId ? `/api/wishlist?guestId=${encodeURIComponent(guestId)}` : "/api/wishlist"

      const res = await fetch(url, {
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        setWishlistCount(data.count || data.items?.length || 0)
      }
    } catch (err) {
      console.error("[v0] Failed to fetch wishlist count:", err)
    }
  }, [])

  useEffect(() => {
    fetchWishlistCount()
  }, [fetchWishlistCount])

  useEffect(() => {
    const handleWishlistUpdate = (event: CustomEvent) => {
      if (typeof event.detail?.count === "number") {
        setWishlistCount(event.detail.count)
      } else {
        fetchWishlistCount()
      }
    }

    window.addEventListener("wishlist-updated", handleWishlistUpdate as EventListener)
    return () => window.removeEventListener("wishlist-updated", handleWishlistUpdate as EventListener)
  }, [fetchWishlistCount])

  useEffect(() => {
    mountedRef.current = true
    const supabase = createClient()

    const failSafe = window.setTimeout(() => {
      if (!mountedRef.current) return
      setLoading(false)
      setInitialLoadDone(true)
    }, 2500)

    const loadUser = async (isInitial = false) => {
      try {
        if (!mountedRef.current) return
        if (isInitial) {
          setLoading(true)
        }

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()

        if (error || !user) {
          if (!mountedRef.current) return
          setUser(null)
          setProfile(null)
          setIsCreator(false)
          setHasCompletedSellerOnboarding(false)
          return
        }

        if (!mountedRef.current) return
        setUser(user)

        // profiles.avatar_url is the single source of truth for avatar.
        // Both /app/settings and Store Builder sync avatar changes to this field.
        // Do NOT query store_builder_configs separately — it causes split-source flicker.
        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("display_name, avatar_url, username, is_creator")
          .eq("id", user.id)
          .single()

        const { data: creatorData } = await supabase
          .from("creators")
          .select("id, onboarding_completed")
          .eq("user_id", user.id)
          .maybeSingle()

        if (!mountedRef.current) return
        if (profileErr) {
          setProfile(null)
          setIsCreator(false)
          setHasCompletedSellerOnboarding(false)
        } else {
          setProfile((profileData as Profile) ?? null)
          const isSellerByState = !!creatorData?.onboarding_completed
          setIsCreator(isSellerByState)
          setHasCompletedSellerOnboarding(isSellerByState)
        }
      } catch {
        if (!mountedRef.current) return
        setUser(null)
        setProfile(null)
        setIsCreator(false)
        setHasCompletedSellerOnboarding(false)
      } finally {
        if (!mountedRef.current) return
        setLoading(false)
        setInitialLoadDone(true)
      }
    }

    loadUser(true)

    const { data } = supabase.auth.onAuthStateChange(() => {
      loadUser(false)
      fetchWishlistCount()
    })

    return () => {
      mountedRef.current = false
      window.clearTimeout(failSafe)
      data?.subscription?.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchWishlistCount])

  const startSellingHref = useMemo(() => {
    if (!user) return "/signup"
    return hasCompletedSellerOnboarding ? "/app" : "/library"
  }, [user, hasCompletedSellerOnboarding])

  const dashboardHref = useMemo(() => {
    if (!user) return "/signup"
    return hasCompletedSellerOnboarding ? "/app" : "/onboarding"
  }, [user, hasCompletedSellerOnboarding])

  const wishlistHref = useMemo(() => {
    return user ? "/library/wishlist" : "/wishlist"
  }, [user])

  // profiles.avatar_url is the single source of truth.
  // Both /app/settings and Store Builder sync to it. No cache-busting params needed.
  const googleAvatarUrl = (user?.user_metadata as any)?.avatar_url || (user?.user_metadata as any)?.picture || null

  const avatarUrl = profile?.avatar_url || googleAvatarUrl || undefined

  const displayName =
    profile?.display_name ||
    profile?.username ||
    ((user?.user_metadata as any)?.full_name as string | undefined) ||
    (user?.email ? user.email.split("@")[0] : "User")

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setMobileProfileOpen(false)
    setDesktopProfileOpen(false)
    router.push("/")
    router.refresh()
  }

  const onCategoryClick = (cat: string) => {
    const url = `/explore?category=${encodeURIComponent(cat)}&scroll=recommended`
    if (shouldForceCanonicalNav) {
      navigateToCanonical(url)
      return
    }
    router.push(url)
  }

  const showCategories = pathname === "/explore" || pathname.startsWith("/explore")
  const isDiscoverProductContext = pathname.startsWith("/p/") && searchParams.get("layout") === "discover" && searchParams.get("recommended") === "1"
  const isBlogRoute = pathname === "/blog" || pathname.startsWith('/blog/')
  const isMarketingNavRoute = pathname === "/" || pathname === "/features" || pathname === "/pricing" || isBlogRoute

  const canonicalBaseUrl = useMemo(() => getCanonicalSiteUrl(), [])

  const toCanonicalUrl = useCallback(
    (targetPath: string) => {
      const normalizedPath = targetPath.startsWith("/") ? targetPath : `/${targetPath}`
      try {
        return new URL(normalizedPath, canonicalBaseUrl).toString()
      } catch {
        return `${canonicalBaseUrl}${normalizedPath}`
      }
    },
    [canonicalBaseUrl],
  )

  const shouldForceCanonicalNav = useMemo(() => {
    if (typeof window === "undefined") return false
    return Boolean(extractUsernameFromHost(window.location.host))
  }, [pathname])

  const navigateToCanonical = useCallback(
    (targetPath: string) => {
      if (typeof window === "undefined") return
      window.location.assign(toCanonicalUrl(targetPath))
    },
    [toCanonicalUrl],
  )

  const onCanonicalNav = useCallback(
    (e: React.MouseEvent<HTMLElement>, targetPath: string) => {
      if (!shouldForceCanonicalNav) return
      e.preventDefault()
      navigateToCanonical(targetPath)
    },
    [navigateToCanonical, shouldForceCanonicalNav],
  )

  const getCanonicalOrRelativePath = useCallback((targetPath: string) => {
    return shouldForceCanonicalNav ? toCanonicalUrl(targetPath) : targetPath
  }, [shouldForceCanonicalNav, toCanonicalUrl])

  // Detect active category from URL
  const activeCategoryId = useMemo(() => {
    if (pathname.startsWith("/explore/")) {
      const seg = pathname.split("/explore/")[1]?.split("/")[0]?.split("?")[0]
      return seg || "all"
    }
    return searchParams.get("category") || "all"
  }, [pathname, searchParams])

  // Get selected category data for subcategory view
  const selectedCategoryData = selectedCategoryForSubs
    ? CATEGORIES_WITH_SUBS.find(c => c.label === selectedCategoryForSubs)
    : null

  return (
    <>
      <div className="relative z-40 w-full bg-black backdrop-blur supports-[backdrop-filter]:bg-black pt-[env(safe-area-inset-top)]">
    <header className="w-full bg-black border-b border-white/10">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-[68px] md:h-[81px] items-center justify-between gap-4 md:py-[3px]">
          {/* Desktop Homepage Layout - same style for /, /features, /pricing, /blog */}
          {isMarketingNavRoute ? (
            <>
              {/* Homepage Desktop Header */}
              <div className="hidden md:flex items-center justify-between w-full">
                {/* Left - Logo - refreshes main page */}
                <Link href="/" onClick={(e) => { e.preventDefault(); window.location.href = "/" }} className="shrink-0 flex items-center gap-2">
                  <Image
                    src={LOGO_URL || "/placeholder.svg"}
                    alt="Storelib"
                    width={138}
                    height={46}
                    className="h-[46px] w-auto"
                    priority
                  />
                  <span className="text-[22px] font-bold text-white tracking-tight">Storelib</span>
                </Link>

                {/* Center - Nav Links (show for all users) */}
                <nav className="flex items-center gap-2">
                  {[
                    { href: "/explore", label: "Discover", active: pathname.startsWith('/explore') },
                    { href: "/blog", label: "Blog", active: isBlogRoute },
                    { href: "/pricing", label: "Pricing", active: pathname === '/pricing' },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={(e) => onCanonicalNav(e, item.href)}
                      className={cn(
                        "px-4 py-2 text-[15px] font-medium rounded-full border transition-[background-color,border-color,color,transform] duration-180 ease-out",
                        item.active
                          ? "border-white/20 bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                          : "border-transparent text-white/70 hover:text-white hover:bg-white/10 hover:border-white/15 active:scale-[0.98]",
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>

                {/* Right - Actions */}
                <div className="flex items-center gap-3">
                  {loading ? (
                    <HeaderActionsSkeleton />
                  ) : user ? (
                    <>
                      {/* Discover icon */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href="/explore" onClick={(e) => onCanonicalNav(e, "/explore")}
                            className="flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                            aria-label="Discover"
                          >
                            <Compass className="h-[22px] w-[22px]" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                          Discover
                        </TooltipContent>
                      </Tooltip>
                      {/* Primary CTA */}
                      <Button asChild className="h-11 rounded-lg px-6 text-[15px] bg-violet-600 text-white hover:bg-violet-700 cursor-pointer">
                        <Link href={getCanonicalOrRelativePath(hasCompletedSellerOnboarding ? "/app" : "/library")} onClick={(e) => onCanonicalNav(e, hasCompletedSellerOnboarding ? "/app" : "/library")}>
                          {hasCompletedSellerOnboarding ? "Dashboard" : "Library"}
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* Log In */}
                      <Link href="/login">
                        <Button variant="outline" className="h-11 px-5 rounded-lg text-[15px] font-medium text-white border-white/30 hover:bg-white/10 cursor-pointer">
                          Log In
                        </Button>
                      </Link>
                      {/* Start Selling */}
                      <Button asChild className="h-11 rounded-lg px-6 text-[15px] bg-violet-600 text-white hover:bg-violet-700 cursor-pointer">
                        <Link href="/signup" onClick={(e) => onCanonicalNav(e, "/signup")}>
                          Start Selling
                        </Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Mobile Homepage/Marketing Header - Logo left, hamburger right */}
              <div className="md:hidden flex items-center justify-between w-full">
                {/* Left - Logo */}
                <div className="flex items-center gap-0">
                  <Link href="/" onClick={(e) => { e.preventDefault(); window.location.href = "/" }} className="shrink-0 flex items-center gap-1.5">
                    <Image
                      src={LOGO_URL || "/placeholder.svg"}
                      alt="Storelib"
                      width={126}
                      height={42}
                      className="h-[42px] w-auto"
                      priority
                    />
                    <span className="text-[20px] font-bold text-white tracking-tight">Storelib</span>
                  </Link>
                </div>

                {/* Right - Only hamburger (glassmorphism) with animation */}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-white hover:bg-white/15 transition cursor-pointer"
                  aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                >
                  <AnimatedHamburger isOpen={mobileMenuOpen} />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Non-Homepage Desktop Header - Original Layout */}
              {/* Left side - Logo and Categories Button */}
              <div className="flex items-center gap-3 shrink-0">
                {/* Logo with Storelib text - links to /explore */}
                <Link href="/explore" onClick={(e) => onCanonicalNav(e, "/explore")} className="shrink-0 hidden md:flex items-center gap-2">
                  <Image
                    src={LOGO_URL || "/placeholder.svg"}
                    alt="Storelib"
                    width={138}
                    height={46}
                    className="h-[46px] w-auto"
                    priority
                  />
                  <span className="text-[22px] font-bold text-white tracking-tight">Storelib</span>
                </Link>

                {/* Categories Dropdown Button with Tooltip */}
                <div className="relative hidden md:block" data-categories-dropdown>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setCategoriesDropdownOpen(!categoriesDropdownOpen)
                      setExpandedCategory(null)
                      setSelectedCategoryForSubs(null)
                    }}
                    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-[15px] font-medium transition-all duration-150 cursor-pointer ${
                      categoriesDropdownOpen
                        ? "bg-white/15 text-white"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Menu className="w-[18px] h-[18px]" />
                    <span>Categories</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                  Browse all categories
                </TooltipContent>
              </Tooltip>

              {/* Categories Megamenu Dropdown with dedicated subcategory view */}
              {categoriesDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-[320px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-200 z-50">
                  <div className="max-h-[70vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>
                    {/* Subcategory View */}
                    {selectedCategoryForSubs && selectedCategoryData ? (
                      <div className="p-3">
                        <button
                          onClick={() => setSelectedCategoryForSubs(null)}
                          className="flex items-center gap-2 px-2 py-2 mb-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span>Back to Categories</span>
                        </button>
                        <div className="flex items-center gap-3 px-3 py-2 mb-2">
                          <selectedCategoryData.icon className="h-5 w-5 text-violet-500" />
                          <span className="text-base font-semibold text-gray-900">{selectedCategoryData.label}</span>
                          {selectedCategoryData.isHot && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-600">
                              <Flame className="h-3 w-3" />
                              Hot
                            </span>
                          )}
                        </div>
                        <Link
                          href={getCanonicalOrRelativePath(selectedCategoryData.href + '&scroll=recommended')}
                          onClick={() => setCategoriesDropdownOpen(false)}
                          className="flex items-center justify-between px-3 py-2.5 mb-1 rounded-lg text-sm font-medium text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
                        >
                          <span>View All {selectedCategoryData.label}</span>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                        <div className="space-y-0.5 mt-2">
                          {selectedCategoryData.subcategories.map((sub) => (
                            <Link
                              key={sub.label}
                              href={getCanonicalOrRelativePath(sub.href + '&scroll=recommended')}
                              onClick={() => setCategoriesDropdownOpen(false)}
                              className="block px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer"
                            >
                              {sub.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : (
                      /* Main Categories List */
                      <div className="p-3">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Browse Categories</h3>
                        <div className="space-y-0.5">
                          {CATEGORIES_WITH_SUBS.map((cat) => {
                            const Icon = cat.icon
                            const hasSubcats = cat.subcategories && cat.subcategories.length > 0
                            return (
                              <button
                                key={cat.label}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (hasSubcats) {
                                    setSelectedCategoryForSubs(cat.label)
                                  } else {
                                    shouldForceCanonicalNav ? navigateToCanonical(cat.href + '&scroll=recommended') : router.push(cat.href + '&scroll=recommended')
                                    setCategoriesDropdownOpen(false)
                                  }
                                }}
                                className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <Icon className="h-4 w-4 text-gray-400" />
                                  <span>{cat.label}</span>
                                  {cat.isHot && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-600">
                                      <Flame className="h-3 w-3" />
                                      Hot
                                    </span>
                                  )}
                                </div>
                                {hasSubcats && (
                                  <ChevronRight className="h-4 w-4 text-gray-400" />
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Desktop Search - Centered with Modal (10% larger) */}
          <div className="hidden md:flex flex-1 max-w-xl mx-4 relative">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/40 pointer-events-none z-10" />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setSearchModalOpen(true)}
                placeholder={t("search_placeholder")}
                className={`h-11 w-full pl-11 pr-4 bg-white/10 border-white/15 text-white text-[15px] placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-0 focus-visible:border-violet-500 ${isDiscoverProductContext ? "rounded-[8px]" : "rounded-full"}`}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    setSearchResults([])
                    searchInputRef.current?.focus()
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Search Modal Dropdown */}
            {searchModalOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setSearchModalOpen(false)}
                />
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-200 z-50 max-h-[70vh] overflow-y-auto">
                  {!query && (
                    <div className="p-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Categories</h3>
                      <div className="flex flex-wrap gap-2">
                        {SEARCH_CATEGORIES.map((cat) => (
                          <Link
                            key={cat.label}
                            href={getCanonicalOrRelativePath(cat.href + '&scroll=recommended')}
                            onClick={() => setSearchModalOpen(false)}
                            className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors cursor-pointer"
                          >
                            {cat.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchLoading && (
                    <div className="p-6 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                      <span className="ml-2 text-sm text-gray-500">Searching...</span>
                    </div>
                  )}

                  {!searchLoading && searchResults.length > 0 && (
                    <div className="p-2">
                      <h3 className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Products</h3>
                      {searchResults.map((product) => (
                        <Link
                          key={product.id}
                          href={getCanonicalOrRelativePath(`/p/${product.slug}`)}
                          onClick={() => setSearchModalOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer group"
                        >
                          {product.thumbnail_url ? (
                            <Image
                              src={product.thumbnail_url}
                              alt={product.title}
                              width={48}
                              height={48}
                              className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                              <Search className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
                            {product.creator?.display_name && (
                              <p className="text-xs text-gray-500 truncate">Product by {product.creator.display_name}</p>
                            )}
                          </div>
                          <div className="text-sm font-medium text-gray-900">
                            {product.price_cents === 0 ? "Free" : `$${(product.price_cents / 100).toFixed(0)}+`}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}

                  {!searchLoading && query.trim().length >= 1 && searchResults.length === 0 && (
                    <div className="p-6 text-center">
                      <p className="text-sm text-gray-500">No products found for "{query}"</p>
                    </div>
                  )}

                  {!query && (
                    <div className="p-4 bg-gray-50 text-center">
                      <p className="text-xs text-gray-500">Start typing to search products</p>
                    </div>
                  )}

                  {query.trim() && (
                    <div className="p-3 border-t border-gray-100 bg-gray-50">
                      <button
                        type="button"
                        onClick={() => {
                          shouldForceCanonicalNav ? navigateToCanonical(`/explore?q=${encodeURIComponent(query)}`) : router.push(`/explore?q=${encodeURIComponent(query)}`)
                          setSearchModalOpen(false)
                        }}
                        className="w-full py-2.5 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        View all results for "{query}"
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Mobile Header for Non-Homepage pages */}
          <div className="md:hidden flex items-center justify-between flex-1 -ml-6">
            {/* Hamburger + Logo left, icons right */}
            <div className="flex items-center gap-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex h-9 w-9 items-center justify-center text-white transition cursor-pointer"
                aria-label={mobileMenuOpen ? "Close categories" : "Open categories"}
              >
                <AnimatedHamburger isOpen={mobileMenuOpen} />
              </button>

              {/* Logo next to hamburger - links to /explore */}
              <Link href="/explore" onClick={(e) => onCanonicalNav(e, "/explore")} className="shrink-0 flex items-center gap-1.5">
                <Image
                  src={LOGO_URL || "/placeholder.svg"}
                  alt="Storelib"
                  width={114}
                  height={38}
                  className="h-[38px] w-auto"
                  priority
                />
                <span className="text-[19px] font-bold text-white tracking-tight">Storelib</span>
              </Link>
            </div>

            {/* Right - Mobile Icons */}
            <div className="flex items-center gap-1">
              {/* Library - only show when logged in */}
              {user && (
                <Link
                  href={getCanonicalOrRelativePath("/library")} onClick={(e) => onCanonicalNav(e, "/library")}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 transition cursor-pointer"
                  aria-label="Library"
                >
                  <Library className="h-5 w-5" />
                </Link>
              )}

              {/* Wishlist */}
              <Link
                href={getCanonicalOrRelativePath(wishlistHref)} onClick={(e) => onCanonicalNav(e, wishlistHref)}
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 transition cursor-pointer"
                aria-label="Wishlist"
              >
                <Heart className="h-5 w-5" />
                {wishlistCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white ring-1 ring-white">
                    {wishlistCount > 99 ? "99+" : wishlistCount}
                  </span>
                )}
              </Link>

              {/* Mobile Avatar or Sign In button */}
              {user ? (
                <button
                  type="button"
                  onClick={() => setMobileProfileOpen(true)}
                  className="rounded-full cursor-pointer ml-2"
                  aria-label="Open profile menu"
                >
                  <Avatar className="h-8 w-8 border border-gray-200">
                    <AvatarImage src={avatarUrl} alt={displayName} />
                    <AvatarFallback className="bg-gray-100 text-gray-400"><UserIcon className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                </button>
              ) : (
                <Link href="/login">
                  <Button className="ml-2 h-9 px-5 rounded-lg text-sm font-semibold bg-white text-black hover:bg-white/90 gap-2">
                    <UserIcon className="h-4 w-4" />
                    Sign in
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Right Side Actions - Desktop only (10% larger) */}
          <div className="hidden md:flex items-center gap-2.5 shrink-0">
            {loading ? (
              <HeaderActionsSkeleton />
            ) : (
              <>
                {/* Wishlist */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={getCanonicalOrRelativePath(wishlistHref)} onClick={(e) => onCanonicalNav(e, wishlistHref)}
                      className="relative flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      aria-label={t("wishlist")}
                    >
                      <Heart className="h-[22px] w-[22px]" />
                      {wishlistCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                          {wishlistCount > 99 ? "99+" : wishlistCount}
                        </span>
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                    Wishlist
                  </TooltipContent>
                </Tooltip>

                {/* Library */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={getCanonicalOrRelativePath("/library")} onClick={(e) => onCanonicalNav(e, "/library")}
                      className="hidden sm:flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      aria-label={t("library")}
                    >
                      <Library className="h-[22px] w-[22px]" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                    My Library
                  </TooltipContent>
                </Tooltip>

                {/* Library or Dashboard */}
                <Button asChild className="h-11 rounded-full px-6 text-[15px] bg-violet-600 text-white hover:bg-violet-700">
                  <Link href={getCanonicalOrRelativePath(user && hasCompletedSellerOnboarding ? "/app" : startSellingHref)} onClick={(e) => onCanonicalNav(e, user && hasCompletedSellerOnboarding ? "/app" : startSellingHref)}>
                    {user && hasCompletedSellerOnboarding ? t("dashboard") : user ? "Library" : t("start_selling")}
                  </Link>
                </Button>

                {/* User Menu - Desktop styled like sidebar dropdown */}
                {user && (
                  <div ref={profileDropdownRef} className="relative">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setDesktopProfileOpen(!desktopProfileOpen)}
                          className="rounded-full cursor-pointer outline-none ring-offset-black transition-all duration-150 ease-out hover:ring-2 hover:ring-violet-400 hover:ring-offset-2 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
                          aria-label="Open profile menu"
                        >
                          <Avatar className="h-11 w-11 border border-gray-200 transition-opacity duration-150">
                            <AvatarImage src={avatarUrl} alt={displayName} />
                            <AvatarFallback className="bg-gray-100 text-gray-400"><UserIcon className="h-5 w-5" /></AvatarFallback>
                          </Avatar>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                        Your Account
                      </TooltipContent>
                    </Tooltip>

                    {/* Desktop Profile Dropdown - styled like sidebar */}
                    <div
                      className={`absolute right-0 top-full mt-2 z-50 origin-top-right transition-all ease-out ${
                        desktopProfileOpen
                          ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                          : "opacity-0 scale-[0.97] -translate-y-1 pointer-events-none"
                      }`}
                      style={{ transitionDuration: '200ms', transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
                    >
                      <div className="min-w-[220px] rounded-xl border border-gray-200/70 bg-white p-1.5 shadow-lg shadow-black/5">
                        {/* User Info */}
                        <div className="px-3 py-2.5 border-b border-gray-100 mb-1">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border border-gray-200">
                              <AvatarImage src={avatarUrl} alt={displayName} />
                              <AvatarFallback className="bg-gray-100 text-gray-400"><UserIcon className="h-4 w-4" /></AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                              {user.email && <p className="text-xs text-gray-500 truncate">{user.email}</p>}
                            </div>
                          </div>
                        </div>

                        {hasCompletedSellerOnboarding ? (
                        <Link
                          href={getCanonicalOrRelativePath(dashboardHref)}
                          onClick={(e) => {
                            onCanonicalNav(e, dashboardHref)
                            setDesktopProfileOpen(false)
                          }}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer"
                        >
                          <LayoutDashboard className="h-4 w-4 shrink-0" />
                          <span>Dashboard</span>
                        </Link>
                        ) : (
                        <Link
                          href={getCanonicalOrRelativePath('/onboarding')}
                          onClick={(e) => {
                            onCanonicalNav(e, '/onboarding')
                            setDesktopProfileOpen(false)
                          }}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer"
                        >
                          <Sparkles className="h-4 w-4 shrink-0" />
                          <span>Become a Seller</span>
                        </Link>
                        )}
                        <Link
                          href={getCanonicalOrRelativePath("/library")}
                          onClick={(e) => {
                            onCanonicalNav(e, "/library")
                            setDesktopProfileOpen(false)
                          }}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer"
                        >
                          <Library className="h-4 w-4 shrink-0" />
                          <span>My Library</span>
                        </Link>
                        <Link
                          href={getCanonicalOrRelativePath(hasCompletedSellerOnboarding ? "/app/settings" : "/library/settings")}
                          onClick={(e) => { onCanonicalNav(e, hasCompletedSellerOnboarding ? "/app/settings" : "/library/settings"); setDesktopProfileOpen(false) }}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer"
                        >
                          <Settings className="h-4 w-4 shrink-0" />
                          <span>Settings</span>
                        </Link>

                        <div className="my-1.5 h-px bg-gray-100" />

                        <button
                          onClick={handleLogout}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        >
                          <LogOut className="h-4 w-4 shrink-0" />
                          <span>Log out</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          </>
          )}

        </div>

        {/* Mobile Search Bar Trigger - hidden on homepage, features, blog, pricing pages */}
        {pathname !== "/" && !pathname.startsWith("/features") && !pathname.startsWith("/blog") && !pathname.startsWith("/pricing") && (
          <div className="md:hidden pt-2 pb-1.5 border-t border-white/10">
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              className={`w-full h-10 flex items-center gap-2 px-4 bg-white/10 border border-white/15 text-white/50 text-sm cursor-pointer overflow-hidden ${isDiscoverProductContext ? "rounded-[8px]" : "rounded-full"}`}
            >
              <Search className="h-4 w-4 text-white/40 shrink-0" />
              <span className="truncate">{t("search_placeholder")}</span>
            </button>
          </div>
        )}

        {/* Mobile Search Top Sheet Modal */}
        <MobileTopSheet
          isOpen={searchModalOpen}
          onClose={() => setSearchModalOpen(false)}
        >
          <div className="px-4 pt-4 pb-2">
            {/* Search Input inside modal */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
              <Input
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={t("search_placeholder")}
                className={`h-11 w-full pl-10 pr-10 bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-500 text-sm ${isDiscoverProductContext ? "rounded-[8px]" : "rounded-full"}`}
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    setSearchResults([])
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer z-10"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Categories */}
            {!query && (
              <div className="pb-4 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">Categories</h3>
                <div className="flex flex-wrap gap-2">
                  {SEARCH_CATEGORIES.map((cat) => (
                    <Link
                      key={cat.label}
                      href={getCanonicalOrRelativePath(cat.href + '&scroll=recommended')}
                      onClick={() => setSearchModalOpen(false)}
                      className="px-3 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors cursor-pointer"
                    >
                      {cat.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Loading */}
            {searchLoading && (
              <div className="py-8 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                <span className="ml-2 text-sm text-gray-500">Searching...</span>
              </div>
            )}

            {/* Search Results */}
            {!searchLoading && searchResults.length > 0 && (
              <div className="pt-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Products</h3>
                <div className="space-y-0.5">
                  {searchResults.map((product) => (
                    <Link
                      key={product.id}
                      href={getCanonicalOrRelativePath(`/p/${product.slug}`)}
                      onClick={() => setSearchModalOpen(false)}
                      className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      {product.thumbnail_url ? (
                        <Image
                          src={product.thumbnail_url}
                          alt={product.title}
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                          <Search className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
                        {product.creator?.display_name && (
                          <p className="text-xs text-gray-500 truncate">by {product.creator.display_name}</p>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-gray-900">
                        {product.price_cents === 0 ? "Free" : `$${(product.price_cents / 100).toFixed(0)}+`}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* No results */}
            {!searchLoading && query.trim().length >= 1 && searchResults.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-500">No products found for "{query}"</p>
              </div>
            )}

            {/* Hint text */}
            {!query && !searchLoading && (
              <div className="py-4 text-center">
                <p className="text-xs text-gray-500">Start typing to search products</p>
              </div>
            )}

            {/* View all results button */}
            {query.trim() && (
              <div className="pt-3 mt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    shouldForceCanonicalNav ? navigateToCanonical(`/explore?q=${encodeURIComponent(query)}`) : router.push(`/explore?q=${encodeURIComponent(query)}`)
                    setSearchModalOpen(false)
                  }}
                  className="w-full py-3 rounded-xl text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 transition-colors cursor-pointer"
                >
                  View all results for "{query}"
                </button>
              </div>
            )}
          </div>
        </MobileTopSheet>

        {/* Mobile Category Pills */}
        {showCategories && (
          <div className="md:hidden -mx-4 px-4 pt-0.5 pb-1 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-2 whitespace-nowrap">
              {MOBILE_CATEGORIES.map((cat) => {
                const Icon = cat.icon
                const isActive = activeCategoryId === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onCategoryClick(cat.id)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer border ${
                      isActive
                        ? "bg-white text-black border-white"
                        : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white border-white/15"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {cat.label}
                    {cat.badge && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold leading-none bg-gradient-to-r from-gray-900 to-black text-white shadow-sm`}>
                        {cat.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Desktop Categories - only on /explore page */}
        {showCategories && (
          <nav className="border-t border-white/10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 hidden md:block">
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex h-12 items-center justify-start gap-7 whitespace-nowrap text-[15px]">
                {DEFAULT_CATEGORIES.map((cat) => {
                  const Icon = cat.icon
                  const isAll = cat.id === "all"
                  const isActive = activeCategoryId === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => onCategoryClick(cat.id)}
                      className={`inline-flex items-center gap-1.5 transition-colors cursor-pointer font-medium ${
                        isActive
                          ? "text-white"
                          : "text-white/50 hover:text-white"
                      }`}
                    >
                      {isAll && <Icon className="w-[18px] h-[18px]" />}
                      {cat.label}
                      {cat.badge && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-violet-500 to-violet-600 text-white leading-none shadow-sm">
                          {cat.badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </nav>
        )}
      </div>

      {/* Mobile Categories Bottom Sheet with swipe-to-close */}
      <MobileBottomSheet
        isOpen={mobileMenuOpen}
        onClose={() => {
          setMobileMenuOpen(false)
          setExpandedCategory(null)
        }}
      >
        <div className="px-4 pb-6">
          {/* Guest User - Simple Sign in and Discover buttons only */}
          {!user && (
            <div className="mb-6">
              {/* Sign in button */}
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="block mb-2">
                <Button className="w-full h-11 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 gap-2">
                  <LogIn className="h-4 w-4" />
                  Sign in
                </Button>
              </Link>
              {/* Discover button - black with icon */}
              <Link href="/explore" onClick={(e) => { onCanonicalNav(e, "/explore"); setMobileMenuOpen(false) }} className="block">
                <Button className="w-full h-11 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 gap-2">
                  <Compass className="h-4 w-4" />
                  Discover
                </Button>
              </Link>
            </div>
          )}

          {/* Logged-in User Profile Section - On Homepage and Marketing Pages */}
          {user && isMarketingNavRoute && (
            <div className="mb-4 pb-4 border-b border-gray-200">
              {/* Profile Info */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl mb-3">
                <Avatar className="h-11 w-11 border border-gray-200">
                  <AvatarImage src={avatarUrl} alt={displayName} />
                  <AvatarFallback className="bg-gray-100 text-gray-400"><UserIcon className="h-5 w-5" /></AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                  {user.email && <p className="text-xs text-gray-500 truncate">{user.email}</p>}
                </div>
              </div>
              {/* Dashboard / Become Seller button - below profile */}
              {hasCompletedSellerOnboarding ? (
                <Link href={getCanonicalOrRelativePath(dashboardHref)} onClick={(e) => { onCanonicalNav(e, dashboardHref); setMobileMenuOpen(false) }} className="block mb-2">
                  <Button className="w-full h-11 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Button>
                </Link>
              ) : (
                <Link href={getCanonicalOrRelativePath("/onboarding")} onClick={(e) => { onCanonicalNav(e, "/onboarding"); setMobileMenuOpen(false) }} className="block mb-2">
                  <Button className="w-full h-11 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 gap-2">
                    <Sparkles className="h-4 w-4" />
                    Become a Seller
                  </Button>
                </Link>
              )}
              {/* Discover button - black with icon */}
              <Link href="/explore" onClick={(e) => { onCanonicalNav(e, "/explore"); setMobileMenuOpen(false) }} className="block">
                <Button className="w-full h-11 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 gap-2">
                  <Compass className="h-4 w-4" />
                  Discover
                </Button>
              </Link>
            </div>
          )}

          {/* Menu Links - On Homepage and Marketing Pages */}
          {isMarketingNavRoute && (
            <div className="mb-4 pb-4 border-b border-gray-200 mt-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2 pt-2">Menu</h3>
              <div className="space-y-0.5">
                <Link
                  href="/explore"
                  onClick={(e) => { onCanonicalNav(e, "/explore"); setMobileMenuOpen(false) }}
                  className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <span>Discover</span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </Link>
                <Link
                  href="/blog"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <span>Blog</span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </Link>
                <Link
                  href="/pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <span>Pricing</span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </Link>
              </div>
            </div>
          )}

          {isDiscoverProductContext && !isMarketingNavRoute && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false)
                  setSearchModalOpen(true)
                }}
                className="w-full h-11 flex items-center gap-2 px-3 bg-gray-100 border border-gray-200 text-gray-600 rounded-xl text-sm cursor-pointer overflow-hidden"
              >
                <Search className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="truncate">{t("search_placeholder")}</span>
              </button>
            </div>
          )}

          {/* Subcategory View with animation - Only show Browse Categories on non-homepage pages */}
          {!isMarketingNavRoute && expandedCategory ? (
            <div className="animate-in slide-in-from-right-4 fade-in duration-300 ease-out">
              <button
                type="button"
                onClick={() => setExpandedCategory(null)}
                className="flex items-center gap-2 px-2 py-2.5 mb-3 text-sm font-medium text-gray-600 hover:text-gray-900 transition-all duration-200 cursor-pointer rounded-lg hover:bg-gray-100 active:scale-[0.98]"
              >
                <ChevronLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
                <span>Back to Categories</span>
              </button>
              {(() => {
                const cat = CATEGORIES_WITH_SUBS.find(c => c.label === expandedCategory)
                if (!cat) return null
                const Icon = cat.icon
                return (
                  <>
                    <div className="flex items-center gap-3 px-2 py-2 mb-3">
                      <Icon className="h-5 w-5 text-violet-500" />
                      <span className="text-base font-semibold text-gray-900">{cat.label}</span>
                      {cat.isHot && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-600">
                          <Flame className="h-3 w-3" />
                          Hot
                        </span>
                      )}
                    </div>
                    <Link
                      href={getCanonicalOrRelativePath(cat.href + '&scroll=recommended')}
                      onClick={() => {
                        setExpandedCategory(null)
                        setMobileMenuOpen(false)
                      }}
                      className="flex items-center justify-between px-4 py-3 mb-2 rounded-xl text-sm font-medium text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
                    >
                      <span>View All {cat.label}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <div className="space-y-0.5">
                      {cat.subcategories.map((sub, index) => (
                        <Link
                          key={sub.label}
                          href={getCanonicalOrRelativePath(sub.href + '&scroll=recommended')}
                          onClick={() => {
                            setExpandedCategory(null)
                            setMobileMenuOpen(false)
                          }}
                          className="block px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer animate-in fade-in slide-in-from-right-2"
                          style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'both' }}
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>
          ) : !isMarketingNavRoute ? (
            /* Main Categories List - Only show on non-homepage pages */
            <div className="animate-in slide-in-from-left-4 fade-in duration-300 ease-out">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">Browse Categories</h3>
              <div className="space-y-0.5">
                {CATEGORIES_WITH_SUBS.map((cat) => {
                  const Icon = cat.icon
                  const hasSubcats = cat.subcategories && cat.subcategories.length > 0

                  const handleCategoryClick = () => {
                    if (hasSubcats) {
                      setExpandedCategory(cat.label)
                    } else {
                      shouldForceCanonicalNav ? navigateToCanonical(cat.href + '&scroll=recommended') : router.push(cat.href + '&scroll=recommended')
                      setMobileMenuOpen(false)
                    }
                  }

                  return (
                    <button
                      key={cat.label}
                      type="button"
                      onClick={handleCategoryClick}
                      onTouchStart={handleTapStart}
                      onTouchEnd={makeTapEnd(handleCategoryClick)}
                      className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer active:bg-gray-200 touch-manipulation select-none"
                    >
                      <div className="flex items-center gap-3 pointer-events-none">
                        <Icon className="h-5 w-5 text-gray-400" />
                        <span>{cat.label}</span>
                        {cat.isHot && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-600">
                            <Flame className="h-3 w-3" />
                            Hot
                          </span>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400 pointer-events-none" />
                    </button>
                  )
                })}
              </div>

              {/* Quick Links section */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <Link
                  href={getCanonicalOrRelativePath("/library")}
                  onClick={(e) => { onCanonicalNav(e, "/library"); setMobileMenuOpen(false) }}
                  className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Library className="h-5 w-5" />
                    <span>My Library</span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </Link>
                {user && hasCompletedSellerOnboarding && (
                  <Link
                    href={getCanonicalOrRelativePath(dashboardHref)}
                    onClick={(e) => { onCanonicalNav(e, dashboardHref); setMobileMenuOpen(false) }}
                    className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <LayoutDashboard className="h-5 w-5" />
                      <span>Dashboard</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </Link>
                )}
                {user && !hasCompletedSellerOnboarding && (
                  <Link
                    href={getCanonicalOrRelativePath('/onboarding')}
                    onClick={(e) => { onCanonicalNav(e, '/onboarding'); setMobileMenuOpen(false) }}
                    className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-5 w-5" />
                      <span>Become a Seller</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </Link>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </MobileBottomSheet>

      {/* Mobile Profile Bottom Sheet with swipe-to-close */}
      <MobileBottomSheet
        isOpen={mobileProfileOpen}
        onClose={() => setMobileProfileOpen(false)}
      >
        <div className="px-4 pb-6">
          {/* User Info */}
          <div className="flex items-center gap-3 p-3 mb-4 bg-gray-50 rounded-xl">
            <Avatar className="h-12 w-12 border border-gray-200">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="bg-gray-100 text-gray-400"><UserIcon className="h-5 w-5" /></AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-gray-900 truncate">{displayName}</p>
              {user?.email && <p className="text-sm text-gray-500 truncate">{user.email}</p>}
            </div>
          </div>

          {/* Menu Items */}
          <div className="space-y-0.5">
            {hasCompletedSellerOnboarding ? (
            <Link
              href={getCanonicalOrRelativePath(dashboardHref)}
              onClick={(e) => { onCanonicalNav(e, dashboardHref); setMobileProfileOpen(false) }}
              className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <LayoutDashboard className="h-5 w-5 text-gray-400" />
                <span>Dashboard</span>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>
            ) : (
            <Link
              href={getCanonicalOrRelativePath('/onboarding')}
              onClick={(e) => { onCanonicalNav(e, '/onboarding'); setMobileProfileOpen(false) }}
              className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-gray-400" />
                <span>Become a Seller</span>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>
            )}
            <Link
              href={getCanonicalOrRelativePath("/library")}
              onClick={(e) => { onCanonicalNav(e, "/library"); setMobileProfileOpen(false) }}
              className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Library className="h-5 w-5 text-gray-400" />
                <span>My Library</span>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>
            <Link
              href={getCanonicalOrRelativePath(hasCompletedSellerOnboarding ? "/app/settings" : "/library/settings")}
              onClick={(e) => { onCanonicalNav(e, hasCompletedSellerOnboarding ? "/app/settings" : "/library/settings"); setMobileProfileOpen(false) }}
              className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-gray-400" />
                <span>Settings</span>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>
          </div>

          {/* Logout */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl text-base font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <LogOut className="h-5 w-5" />
                <span>Log out</span>
              </div>
            </button>
          </div>
        </div>
      </MobileBottomSheet>
    </header>
      </div>
    </>
  )
}

function HeaderActionsSkeleton() {
  return (
    <div className="flex items-center gap-2.5">
      <Skeleton className="h-11 w-11 rounded-full bg-white/10" />
      <Skeleton className="h-11 w-11 rounded-full bg-white/10" />
      <Skeleton className="h-11 w-24 rounded-full hidden sm:block bg-white/10" />
      <Skeleton className="h-11 w-28 rounded-full bg-white/10" />
    </div>
  )
}
