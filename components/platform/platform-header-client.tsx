"use client"

import type React from "react"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import type { User } from "@supabase/supabase-js"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { extractUsernameFromHost, getCanonicalSiteUrl, isCustomDomain } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { readAuthSnapshot, writeAuthSnapshot, clearAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { Heart, Library, Search, MessageCircle, Plus, LayoutDashboard, Settings, LogOut, LogIn, Menu, X, Loader2, ChevronRight, ChevronLeft, ChevronDown, Sparkles, Code, Megaphone, Briefcase, Music, Camera, Video, LayoutGrid, Gift, MoreHorizontal, Bot, Share2, Flame, Zap, ShoppingBag, Lightbulb, ArrowRight, User as UserIcon, Compass } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"

const LOGO_URL =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"

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

  // ── Handle-bar-only drag handlers (MobileTopSheet) ─────────────────────
  // Touch handlers are ONLY on the handle bar at the bottom, NOT on the full
  // sheet. This guarantees that touches on search inputs, category pills, and
  // product result links inside the sheet are NEVER intercepted by drag logic.
  const handleHandleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleHandleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = startY.current - currentY // positive = dragging up (towards close)
    if (diff > 0) {
      e.preventDefault()
      setDragY(-diff * 0.8) // negative = sheet moves up
    }
  }

  const handleHandleTouchEnd = () => {
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
    <div data-mobile-top-sheet="true" className="fixed inset-0 z-[100] md:hidden">
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
        className="absolute top-0 left-0 right-0 bg-white rounded-b-[24px] shadow-2xl"
        style={{
          // Use 'none' instead of translateY(0px) when fully open — CSS transforms
          // create a new containing block on iOS which can offset touch coordinates,
          // causing taps to register on the wrong list item.
          transform: isAnimating ? (dragY !== 0 ? `translateY(${dragY}px)` : 'none') : "translateY(-100%)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '75vh',
        }}
      >
        <div className="mobile-top-sheet-scroll overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(75vh - 40px)' }}>
          {children}
        </div>
        {/* Handle bar at bottom — the ONLY drag target */}
        <div
          className="pb-3 pt-2 touch-none"
          onTouchStart={handleHandleTouchStart}
          onTouchMove={handleHandleTouchMove}
          onTouchEnd={handleHandleTouchEnd}
        >
          <button
            onClick={handleClose}
            className="w-full flex justify-center py-2 cursor-pointer"
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
  contentKey,
}: {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  contentKey?: string | null
}) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
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

  // ── Shared drag finisher ────────────────────────────────────────────────
  const finishDrag = () => {
    setIsDragging(false)
    if (dragY > 80) {
      handleClose()
    } else {
      setDragY(0)
    }
  }

  // ── Handle-bar drag (always active on handle) ───────────────────────────
  const handleHandleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleHandleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current
    if (diff > 0) {
      e.preventDefault()
      setDragY(diff * 0.8)
    }
  }

  // ── Full-sheet drag (active when scroll content is at the very top) ─────
  // This lets users swipe down from anywhere in the sheet to dismiss it,
  // not just from the narrow handle bar. Only activates when the scroll
  // container is at scrollTop ≤ 2 px so normal upward scrolling is unaffected.
  const handleSheetTouchStart = (e: React.TouchEvent) => {
    const scrollEl = scrollRef.current
    if (scrollEl && scrollEl.scrollTop > 2) return // content is scrolled — don't start drag
    startY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleSheetTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const scrollEl = scrollRef.current
    if (scrollEl && scrollEl.scrollTop > 2) {
      // Content scrolled away from top mid-gesture — cancel drag, let scroll run
      setIsDragging(false)
      setDragY(0)
      return
    }
    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current
    if (diff > 0) {
      e.preventDefault()
      setDragY(diff * 0.8)
    } else {
      // Moving upward — cancel drag so scroll container takes over
      setIsDragging(false)
      setDragY(0)
    }
  }

  if (!isVisible || !isMounted) return null

  return createPortal(
    <div data-mobile-bottom-sheet="true" className="fixed inset-0 z-[100] md:hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity ease-out ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDuration: '400ms' }}
        onClick={handleClose}
      />
      {/* Bottom Sheet — full-sheet drag active when scroll is at top */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl"
        onTouchStart={handleSheetTouchStart}
        onTouchMove={handleSheetTouchMove}
        onTouchEnd={finishDrag}
        style={{
          // Use 'none' instead of translateY(0px) when fully open — CSS transforms
          // create a new containing block on iOS which can offset touch coordinates,
          // causing taps to register on the wrong list item.
          transform: isAnimating ? (dragY !== 0 ? `translateY(${dragY}px)` : 'none') : "translateY(100%)",
          transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '74vh',
        }}
      >
        {/* Handle bar — always a drag target regardless of scroll position */}
        <div
          className="pt-3 pb-2 touch-none"
          onTouchStart={handleHandleTouchStart}
          onTouchMove={handleHandleTouchMove}
          onTouchEnd={finishDrag}
        >
          <button
            onClick={handleClose}
            className="w-full flex justify-center py-2 cursor-pointer"
          >
            <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
          </button>
        </div>
        {title && (
          <div className="px-4 pb-3">
            <h3 className="text-[16px] font-semibold text-gray-900">{title}</h3>
          </div>
        )}
        {/* key resets scroll to top when switching between main list and subcategory view.
            Without this, expanding a category while scrolled down makes the subcategory
            view appear blank because the scroll position is past the shorter content. */}
        <div
          ref={scrollRef}
          key={contentKey ?? 'default'}
          className="overflow-y-auto overscroll-contain"
          style={{ maxHeight: 'calc(74vh - 80px)' }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// tapStartPos / handleTapStart / makeTapEnd removed — the MobileBottomSheet
// drag threshold is now ≤56 px so category buttons below that zone never
// have their click events suppressed. Plain onClick is sufficient.

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

  const [user, setUser] = useState<User | null>(() => {
    const seed = readAuthSnapshot()
    // Only the id is ever read off this before the real session lands.
    return seed?.signedIn && seed.userId ? ({ id: seed.userId } as User) : null
  })
  const [profile, setProfile] = useState<Profile | null>(() => {
    const seed = readAuthSnapshot()
    return seed?.signedIn
      ? ({
          display_name: seed.displayName,
          avatar_url: seed.avatarUrl,
          username: seed.username,
        } as Profile)
      : null
  })
  const [isCreator, setIsCreator] = useState(() => !!readAuthSnapshot()?.isSeller)
  const [hasCompletedSellerOnboarding, setHasCompletedSellerOnboarding] = useState(
    () => !!readAuthSnapshot()?.isSeller,
  )
  // Seeded from the persisted snapshot, so a returning visitor gets the correct
  // header on the FIRST paint — no skeleton, no flash of "Log in" before the
  // avatar appears. Only a genuinely first-time visitor ever sees loading=true.
  const [loading, setLoading] = useState(() => readAuthSnapshot() === null)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  // Seeded from the last known value. The badge used to start at 0 on every page
  // load and jump to the real count once a fetch returned — that pop, on every
  // navigation, is the "red circle flickering randomly".
  const [wishlistCount, setWishlistCount] = useState(() => {
    if (typeof window === "undefined") return 0
    const n = Number(localStorage.getItem("_sl_wishlist_count"))
    return Number.isFinite(n) && n >= 0 ? n : 0
  })
  // Persist avatar URL so it shows immediately on re-renders/navigations (no placeholder flash)
  const [cachedAvatarUrl, setCachedAvatarUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    try { return localStorage.getItem("_sl_avatar") } catch { return null }
  })

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
      // Never interfere with mobile sheet portals. These render to document.body
      // outside the header DOM tree, so they always appear "outside" the header.
      // Without this guard, every tap inside the bottom sheet fires mousedown on
      // document → setExpandedCategory(null) is scheduled 100ms later → the
      // subcategory view opens for 100ms and immediately collapses back.
      if (
        target.closest('[data-mobile-bottom-sheet]') ||
        target.closest('[data-mobile-top-sheet]')
      ) {
        return
      }
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
        const next = data.count || data.items?.length || 0
        setWishlistCount((prev) => (prev === next ? prev : next))
        try {
          localStorage.setItem("_sl_wishlist_count", String(next))
        } catch {
          /* storage unavailable */
        }
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
        const next = event.detail.count
        setWishlistCount((prev) => (prev === next ? prev : next))
        try {
          localStorage.setItem("_sl_wishlist_count", String(next))
        } catch {
          /* storage unavailable */
        }
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

    const loadUser = async () => {
      try {
        if (!mountedRef.current) return

        // getSession() reads the stored session locally; getUser() posts to
        // Supabase to re-validate the JWT. This runs on every page load purely to
        // decide which header to draw, so it takes the local read — a header does
        // not need to re-verify a token, and anything that actually matters is
        // authorised server-side anyway. This alone removes a network round trip
        // from in front of the first paint.
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const user = session?.user ?? null

        if (!user) {
          if (!mountedRef.current) return
          setUser(null)
          setProfile(null)
          setIsCreator(false)
          setHasCompletedSellerOnboarding(false)
          clearAuthSnapshot()
          setCachedAvatarUrl(null)
          return
        }

        if (!mountedRef.current) return
        setUser(user)

        // In parallel, not one after the other — they don't depend on each other,
        // and serialising them doubled how long the header took to settle.
        // profiles.avatar_url is the single source of truth for the avatar; both
        // /app/settings and Store Builder sync to it. Do NOT also read
        // store_builder_configs — two sources is what caused avatar flicker.
        const [profileRes, creatorRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("display_name, avatar_url, username, is_creator")
            .eq("id", user.id)
            .single(),
          supabase.from("creators").select("id, onboarding_completed").eq("user_id", user.id).maybeSingle(),
        ])

        if (!mountedRef.current) return
        if (profileRes.error) {
          // Signed in but the profile row didn't load — keep the session state.
          // Blanking it here is what made a logged-in header fall back to "Log in".
          setProfile(null)
        } else {
          const pd = (profileRes.data as Profile) ?? null
          setProfile(pd)
          const freshAvatar = pd?.avatar_url || null
          if (freshAvatar) setCachedAvatarUrl(freshAvatar)
          const isSellerByState = !!creatorRes.data?.onboarding_completed
          setIsCreator(isSellerByState)
          setHasCompletedSellerOnboarding(isSellerByState)
          writeAuthSnapshot({
            signedIn: true,
            userId: user.id,
            avatarUrl: freshAvatar,
            displayName: pd?.display_name ?? null,
            username: pd?.username ?? null,
            isSeller: isSellerByState,
          })
        }
      } catch {
        // A failed lookup is not proof of being signed out — leave whatever the
        // snapshot seeded rather than throwing the user back to a logged-out
        // header on a flaky connection.
        if (!mountedRef.current) return
      } finally {
        if (!mountedRef.current) return
        setLoading(false)
        setInitialLoadDone(true)
      }
    }

    loadUser()

    const { data } = supabase.auth.onAuthStateChange((event: string) => {
      // Clear the snapshot the instant we sign out, so a reload can't briefly
      // show the previous user's avatar before the session check catches up.
      if (event === "SIGNED_OUT") {
        clearAuthSnapshot()
        setCachedAvatarUrl(null)
      }
      loadUser()
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
    // Selling is part of the marketplace, not a dashboard task — signed-in
    // sellers go straight to the listing form rather than through onboarding.
    if (!user) return "/signup"
    return "/products/new"
  }, [user])

  const dashboardHref = useMemo(() => {
    if (!user) return "/signup"
    return hasCompletedSellerOnboarding ? "/app" : "/onboarding"
  }, [user, hasCompletedSellerOnboarding])

  // One wishlist, one URL. Signed-in users were sent to /library/wishlist and
  // everyone else to /wishlist — same list, two addresses, and the library one is
  // seller tooling rather than somewhere a shopper should end up.
  const wishlistHref = useMemo(() => "/wishlist", [])

  // profiles.avatar_url is the single source of truth.
  // Both /app/settings and Store Builder sync to it. No cache-busting params needed.
  const googleAvatarUrl = (user?.user_metadata as any)?.avatar_url || (user?.user_metadata as any)?.picture || null

  // cachedAvatarUrl seeds from localStorage so the correct avatar shows on the FIRST render
  // (before the async profile fetch resolves), preventing the placeholder flash.
  const avatarUrl = profile?.avatar_url || googleAvatarUrl || cachedAvatarUrl || undefined

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
    setCachedAvatarUrl(null)
    try { localStorage.removeItem("_sl_avatar") } catch {}
    if (isNativePlatform()) {
      window.location.replace("/welcome")
    } else {
      router.push("/")
      router.refresh()
    }
  }

  const onCategoryClick = (cat: string) => {
    const url = `/explore?category=${encodeURIComponent(cat)}&scroll=recommended`
    navigateToExploreCategory(url)
  }

  // "/" is the marketplace, so it gets the category bar. It was excluded here
  // (and again in the two guards below), which is why storelib.com had no
  // category strip while storelib.com/explore did — the same page, minus its
  // navigation.
  const showCategories =
    pathname === "/" || pathname.startsWith("/explore") || pathname === "/wishlist"
  const isDiscoverProductContext = pathname.startsWith("/p/") && isDiscoverMode(pathname, searchParams)
  const isSellerOrProductPage = pathname.startsWith("/u/") || pathname.startsWith("/p/") || pathname.startsWith("/l/") || pathname.startsWith("/s/")
  const isBlogRoute = pathname === "/blog" || pathname.startsWith('/blog/')
  const isFaqRoute = pathname === "/faq"
  // "/" is the marketplace now, not a landing page, so it gets the marketplace
  // header — the same one /explore has always had, with search, categories and
  // the action row. It used to fall in here and render the old Home / Discover /
  // Blog / Pricing / FAQ nav instead, which is why storelib.com and
  // storelib.com/explore looked like two different products.
  const isMarketingNavRoute = pathname === "/features" || pathname === "/pricing" || isBlogRoute || isFaqRoute

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
    const host = window.location.host
    // Force canonical storelib.com URLs on seller subdomains (seller.storelib.com)
    // AND on seller custom domains (e.g. materiabuilder.store). Both lack /explore,
    // /library, /app routes so all navigation must go to the canonical domain.
    return Boolean(extractUsernameFromHost(host)) || isCustomDomain(host)
  }, [pathname])

  const navigateToCanonical = useCallback(
    (targetPath: string) => {
      if (typeof window === "undefined") return
      window.location.assign(toCanonicalUrl(targetPath))
    },
    [toCanonicalUrl],
  )

  // Cross-layout routes require a full page reload even in Capacitor.
  // Same-layout routes (/explore, /u/, /p/, /l/, /library, /wishlist) use
  // router.push to keep client-side navigation and preserve the auth session.
  const isCrossLayoutPath = (path: string) =>
    path.startsWith("/app") || path.startsWith("/store-builder") || path.startsWith("/library")

  const navigateReliably = useCallback(
    (targetPath: string) => {
      if (typeof window === "undefined") return
      if (targetPath !== pathname) startNavigationLoading()
      // Seller subdomain: ALWAYS navigate to canonical storelib.com URL.
      // This check MUST come before isNativePlatform() — a Capacitor app on
      // sellername.storelib.com must also use canonical URLs, otherwise
      // router.push() would land on sellername.storelib.com/explore which
      // doesn't exist and freezes the page.
      if (shouldForceCanonicalNav) {
        navigateToCanonical(targetPath)
        return
      }
      if (isNativePlatform()) {
        // Cross-layout routes (/app, /store-builder, /library) load a completely
        // different layout and auth context — use full reload to ensure clean state.
        // ALL other same-layout paths (/explore, /p/, /u/, /l/, /wishlist, etc.)
        // use router.push() for smooth client-side transition, no white flash.
        if (isCrossLayoutPath(targetPath)) {
          window.location.href = targetPath
          return
        }
        router.push(targetPath)
        return
      }
      router.push(targetPath)
    },
    [shouldForceCanonicalNav, navigateToCanonical, router],
  )

  // Navigate to an /explore category URL using router.push() for smooth client-side
  // transition regardless of current page — avoids full page reload / white flash on
  // Capacitor. Seller subdomains use canonical storelib.com URL instead.
  const navigateToExploreCategory = useCallback((url: string) => {
    startNavigationLoading()
    if (shouldForceCanonicalNav) {
      navigateToCanonical(url)
    } else {
      router.push(url, { scroll: false })
    }
  }, [router, shouldForceCanonicalNav, navigateToCanonical])

  const onCanonicalNav = useCallback(
    (e: React.MouseEvent<HTMLElement>, targetPath: string) => {
      if (targetPath !== pathname) startNavigationLoading()
      // When on a seller subdomain (e.g. sellername.storelib.com), ALL navigation
      // to non-seller routes (/library, /app, /explore, /signup, etc.) MUST use
      // the canonical storelib.com URL. Relative paths would land on
      // sellername.storelib.com/library which doesn't exist and blocks the UI.
      // This check runs first — before the Capacitor branch — so native apps on
      // a seller subdomain also get canonical routing.
      if (shouldForceCanonicalNav) {
        e.preventDefault()
        navigateToCanonical(targetPath) // window.location.assign("https://storelib.com/path")
        return
      }
      // In Capacitor: mirror navigateReliably — use router.push() for same-layout
      // paths so the transition is smooth (loading.tsx skeleton shows, no white flash).
      // Only cross-layout paths (/app, /store-builder, /library) need window.location.href.
      if (isNativePlatform()) {
        e.preventDefault()
        if (isCrossLayoutPath(targetPath)) {
          window.location.href = targetPath
          return
        }
        router.push(targetPath)
        return
      }
    },
    [navigateToCanonical, shouldForceCanonicalNav, router],
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
      <div id="platform-header-root" className={cn("z-40 w-full bg-black backdrop-blur supports-[backdrop-filter]:bg-black", isSellerOrProductPage ? "relative" : "sticky top-0")}>
    <header className={cn("w-full bg-black", !(isNativePlatform() && isSellerOrProductPage) && "border-b border-white/10")}>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div
          className="platform-header-row flex md:h-[81px] items-center justify-between gap-4 pb-3 md:pb-[3px]"
        >
          {/* Desktop Homepage Layout - same style for /, /features, /pricing, /blog */}
          {isMarketingNavRoute ? (
            <>
              {/* Homepage Desktop Header */}
              <div className="hidden md:flex items-center justify-between w-full">
                {/* Left - Logo - refreshes main page */}
                <Link href="/" onClick={(e) => { e.preventDefault(); if (isNativePlatform()) { router.push("/") } else { window.location.href = "/" } }} className="shrink-0 flex items-center gap-2">
                  <Image
                    src={LOGO_URL || "/placeholder.svg"}
                    alt="Storelib"
                    width={138}
                    height={46}
                    className="h-[46px] w-auto rounded-[7px]"
                    priority
                  />
                  <span className="text-[22px] font-bold text-white tracking-tight">Storelib</span>
                </Link>

                {/* Center - Nav Links (show for all users) */}
                <nav className="flex items-center gap-2">
                  {[
                    { href: "/", label: "Home", active: pathname === '/' },
                    { href: "/explore", label: "Discover", active: pathname.startsWith('/explore') },
                    { href: "/blog", label: "Blog", active: isBlogRoute },
                    { href: "/pricing", label: "Pricing", active: pathname === '/pricing' },
                    { href: "/faq", label: "FAQ", active: isFaqRoute },
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
                    <HeaderActionsSkeleton isMarketingRoute />
                  ) : user ? (
                    <>
                      {/* Discover icon */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href="/" onClick={(e) => onCanonicalNav(e, "/")}
                            className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
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
                      <Link href={getCanonicalOrRelativePath("/login")} onClick={(e) => onCanonicalNav(e, "/login")}>
                        <Button variant="ghost" className="h-11 px-5 rounded-lg text-[15px] font-medium text-white border border-white/70 hover:bg-white/10 hover:text-white cursor-pointer">
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
                  <Link href="/" onClick={(e) => { e.preventDefault(); if (isNativePlatform()) { router.push("/") } else { window.location.href = "/" } }} className="shrink-0 flex items-center gap-1.5">
                    <Image
                      src={LOGO_URL || "/placeholder.svg"}
                      alt="Storelib"
                      width={126}
                      height={42}
                      className="h-[42px] w-auto rounded-[7px]"
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
                <Link href="/" onClick={(e) => onCanonicalNav(e, "/")} className="shrink-0 hidden md:flex items-center gap-2">
                  <Image
                    src={LOGO_URL || "/placeholder.svg"}
                    alt="Storelib"
                    width={138}
                    height={46}
                    className="h-[46px] w-auto rounded-[7px]"
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
                                    navigateToExploreCategory(cat.href + '&scroll=recommended')
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
                            onClick={(e) => {
                              onCanonicalNav(e, cat.href + '&scroll=recommended')
                              setSearchModalOpen(false)
                            }}
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
                          onClick={(e) => {
                            onCanonicalNav(e, `/p/${product.slug}`)
                            setSearchModalOpen(false)
                          }}
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
                          navigateReliably(`/explore?q=${encodeURIComponent(query)}`)
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
              <Link href="/" onClick={(e) => onCanonicalNav(e, "/")} className="shrink-0 flex items-center gap-1.5">
                <Image
                  src={LOGO_URL || "/placeholder.svg"}
                  alt="Storelib"
                  width={114}
                  height={38}
                  className="h-[38px] w-auto rounded-[7px]"
                  priority
                />
                <span className="text-[19px] font-bold text-white tracking-tight">Storelib</span>
              </Link>
            </div>

            {/* Right - Mobile Icons */}
            <div className="flex items-center gap-1">

              {/* Wishlist — h-11 w-11 = 44px tap target */}
              <Link
                href={getCanonicalOrRelativePath(wishlistHref)} onClick={(e) => onCanonicalNav(e, wishlistHref)}
                className="relative flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 transition cursor-pointer"
                aria-label="Wishlist"
              >
                <Heart className="h-5 w-5" />
                {wishlistCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                    {wishlistCount > 99 ? "99+" : wishlistCount}
                  </span>
                )}
              </Link>

              {/* Mobile Avatar or Sign In button — use h-11 w-11 wrapper for 44px tap target */}
              {user ? (
                <button
                  type="button"
                  onClick={() => setMobileProfileOpen(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-full cursor-pointer"
                  aria-label="Open profile menu"
                >
                  <Avatar className="h-8 w-8 border border-gray-200">
                    <AvatarImage src={avatarUrl} alt={displayName} />
                    <AvatarFallback className="bg-gray-100 text-gray-400"><UserIcon className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                </button>
              ) : (
                <Link href={getCanonicalOrRelativePath("/login")} onClick={(e) => onCanonicalNav(e, "/login")}>
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
                {/* Messages — signed in only; there's nothing to show otherwise. */}
                {user && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={getCanonicalOrRelativePath("/messages")} onClick={(e) => onCanonicalNav(e, "/messages")}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                        aria-label={t("messages")}
                      >
                        <MessageCircle className="h-[22px] w-[22px]" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                      {t("messages")}
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Wishlist */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={getCanonicalOrRelativePath(wishlistHref)} onClick={(e) => onCanonicalNav(e, wishlistHref)}
                      className="relative flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      aria-label={t("wishlist")}
                    >
                      <Heart className="h-[22px] w-[22px]" />
                      {wishlistCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                          {wishlistCount > 99 ? "99+" : wishlistCount}
                        </span>
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                    Wishlist
                  </TooltipContent>
                </Tooltip>

                {/* Bag */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={getCanonicalOrRelativePath("/cart")} onClick={(e) => onCanonicalNav(e, "/cart")}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      aria-label={t("bag")}
                    >
                      <ShoppingBag className="h-[22px] w-[22px]" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                    {t("bag")}
                  </TooltipContent>
                </Tooltip>

                {/* Sell now — the one filled action in the row, in brand purple.
                    A seller who's finished onboarding gets their dashboard here
                    instead; there's no separate "My Library" icon any more. */}
                {/* Always Sell — never "Panou". This is the primary action of a
                    marketplace header, and sending an onboarded seller to a
                    dashboard instead is what stopped it ever reaching the
                    listing form. */}
                <Button asChild className="h-10 rounded-full px-5 text-[14.5px] font-semibold bg-[#7c3aed] text-white hover:bg-[#6d28d9] shadow-[0_2px_12px_-2px_rgba(124,58,237,0.6)] transition-transform active:scale-[0.97]">
                  <Link href={startSellingHref} onClick={(e) => onCanonicalNav(e, startSellingHref)}>
                    <span className="flex items-center gap-1.5">
                      <Plus className="h-4 w-4" strokeWidth={3} />
                      {t("sell_now")}
                    </span>
                  </Link>
                </Button>

                {/* Signed out: sign up / log in, exactly where the avatar sits
                    when you are signed in — so the row never changes shape. */}
                {!user && (
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" className="h-10 rounded-full border-white/25 bg-transparent px-5 text-[14.5px] font-semibold text-white hover:bg-white/10 hover:text-white">
                      <Link href="/signup">{t("sign_up")}</Link>
                    </Button>
                    <Button asChild variant="ghost" className="h-10 rounded-full px-4 text-[14.5px] font-semibold text-white/85 hover:bg-white/10 hover:text-white">
                      <Link href="/login">{t("log_in")}</Link>
                    </Button>
                  </div>
                )}

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
                          <Avatar className="h-10 w-10 border border-gray-200 transition-opacity duration-150">
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
                          href={getCanonicalOrRelativePath("/settings")}
                          onClick={(e) => { onCanonicalNav(e, "/settings"); setDesktopProfileOpen(false) }}
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

        {/* Mobile Search Bar Trigger is now rendered below in white UI section */}

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
                    <button
                      key={cat.label}
                      type="button"
                      onClick={() => {
                        navigateToExploreCategory(cat.href + '&scroll=recommended')
                        setSearchModalOpen(false)
                      }}
                      className="px-3 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors cursor-pointer touch-manipulation"
                    >
                      {cat.label}
                    </button>
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
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        navigateReliably(`/p/${product.slug}`)
                        setSearchModalOpen(false)
                      }}
                      className="flex w-full items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer touch-manipulation text-left"
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
                    </button>
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
                    navigateReliably(`/explore?q=${encodeURIComponent(query)}`)
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

        {/* Mobile & Desktop Categories are now rendered below in white UI section */}
      </div>

      {/* Mobile Categories Bottom Sheet with swipe-to-close */}
      <MobileBottomSheet
        isOpen={mobileMenuOpen}
        onClose={() => {
          setMobileMenuOpen(false)
          setExpandedCategory(null)
        }}
        contentKey={expandedCategory}
      >
        <div className="px-4 pb-6">
          {/* Guest User - Simple Sign in and Discover buttons only */}
          {!user && (
            <div className="mb-6">
              {/* Sign in button */}
              <Link href="/login" onClick={(e) => { onCanonicalNav(e, "/login"); setMobileMenuOpen(false) }} className="block mb-2">
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

          {/* Menu Links - On Homepage and Marketing Pages (hidden in Capacitor: links go to storelib.com) */}
          {isMarketingNavRoute && !isNativePlatform() && (
            <div className="mb-4 pb-4 border-b border-gray-200 mt-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2 pt-2">Menu</h3>
              <div className="space-y-0.5">
                <Link
                  href="/"
                  onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); if (isNativePlatform()) { router.push("/") } else { window.location.href = "/" } }}
                  className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <span>Home</span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </Link>
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
                <Link
                  href="/faq"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <span>FAQ</span>
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
                    <button
                      type="button"
                      onClick={() => {
                        navigateToExploreCategory(cat.href + '&scroll=recommended')
                        setExpandedCategory(null)
                        setMobileMenuOpen(false)
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 mb-2 rounded-xl text-sm font-medium text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer touch-manipulation"
                    >
                      <span>View All {cat.label}</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <div className="space-y-0.5">
                      {cat.subcategories.map((sub, index) => (
                        <button
                          key={sub.label}
                          type="button"
                          onClick={() => {
                            navigateToExploreCategory(sub.href + '&scroll=recommended')
                            setExpandedCategory(null)
                            setMobileMenuOpen(false)
                          }}
                          className="block w-full text-left px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer touch-manipulation animate-in fade-in slide-in-from-right-2"
                          style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'both' }}
                        >
                          {sub.label}
                        </button>
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
                      navigateToExploreCategory(cat.href + '&scroll=recommended')
                      setMobileMenuOpen(false)
                    }
                  }

                  return (
                    <button
                      key={cat.label}
                      type="button"
                      onClick={handleCategoryClick}
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
              href={getCanonicalOrRelativePath("/settings")}
              onClick={(e) => { onCanonicalNav(e, "/settings"); setMobileProfileOpen(false) }}
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

      {/* Concave transition from black header to white category bar */}
      {(showCategories || (!pathname.startsWith("/features") && !pathname.startsWith("/blog") && !pathname.startsWith("/pricing") && !isFaqRoute && !isSellerOrProductPage)) && (
        <div className="relative z-[35] bg-black h-[20px]">
          <div className="absolute inset-0 bg-white rounded-t-[20px]" />
        </div>
      )}

      {/* White UI section for search bar and category pills (below the black header) */}
      {(showCategories || (!pathname.startsWith("/features") && !pathname.startsWith("/blog") && !pathname.startsWith("/pricing") && !isFaqRoute && !isSellerOrProductPage)) && (
        <div className={`relative z-[35] w-full bg-white border-b border-neutral-200${!showCategories ? " md:hidden" : ""}`}>
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
            {/* Mobile Search Bar Trigger */}
            {pathname !== "/" && !pathname.startsWith("/features") && !pathname.startsWith("/blog") && !pathname.startsWith("/pricing") && !isFaqRoute && (
              <div className="md:hidden pt-0 pb-1.5">
                <button
                  type="button"
                  onClick={() => setSearchModalOpen(true)}
                  className={`w-full h-10 flex items-center gap-2 px-4 bg-neutral-100 border border-neutral-200 text-neutral-500 text-sm cursor-pointer overflow-hidden ${isDiscoverProductContext ? "rounded-[8px]" : "rounded-full"}`}
                >
                  <Search className="h-4 w-4 text-neutral-400 shrink-0" />
                  <span className="truncate">{t("search_placeholder")}</span>
                </button>
              </div>
            )}

            {/* Mobile Category Pills - White/Light UI */}
            {showCategories && (
              <div className="md:hidden px-0 pt-1 pb-2 overflow-x-auto scrollbar-hide">
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
                            ? "bg-neutral-900 text-white border-neutral-900"
                            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 border-neutral-200"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {cat.label}
                        {cat.badge && (
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold leading-none ${isActive ? "bg-white text-neutral-900" : "bg-gradient-to-r from-violet-500 to-violet-600 text-white"} shadow-sm`}>
                            {cat.badge}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Desktop Categories - White/Light UI */}
            {showCategories && (
              <nav className="hidden md:block">
                <div className="overflow-x-auto scrollbar-hide">
                  <div className="flex items-center justify-start gap-7 whitespace-nowrap text-[14.5px] pt-1 pb-4">
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
                              ? "text-neutral-900"
                              : "text-neutral-500 hover:text-neutral-900"
                          }`}
                        >
                          {isAll && <Icon className="w-[18px] h-[18px]" />}
                          {cat.label}
                          {cat.badge && (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gradient-to-r from-violet-500 to-violet-600 text-white leading-none shadow-sm">
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
        </div>
      )}

      {/* Concave bottom edge — black background with rounded white overlay creates concave corners */}
      {/* Skip on FAQ page since its hero is also black, on explore pages which have the white category bar,
          and on any non-marketing page that already renders the white section above (to avoid double black bars) */}
      {!showCategories && !isFaqRoute && (pathname === "/" || pathname.startsWith("/features") || pathname.startsWith("/blog") || pathname.startsWith("/pricing")) && (
        <div className="relative z-30 bg-black h-[20px] -mb-px">
          <div className="absolute inset-0 bg-white rounded-t-[20px]" />
        </div>
      )}
    </>
  )
}

function HeaderActionsSkeleton({ isMarketingRoute = false }: { isMarketingRoute?: boolean }) {
  if (isMarketingRoute) {
    return (
      <div className="flex items-center gap-3">
        {/* Log In button skeleton */}
        <Skeleton className="h-11 w-[72px] rounded-lg bg-white/10" />
        {/* Start Selling button skeleton */}
        <Skeleton className="h-11 w-[110px] rounded-lg bg-white/10" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5">
      {/* Wishlist circle */}
      <Skeleton className="h-11 w-11 rounded-full bg-white/10" />
      {/* Library circle */}
      <Skeleton className="h-11 w-11 rounded-full bg-white/10 hidden sm:block" />
      {/* CTA button */}
      <Skeleton className="h-11 w-28 rounded-full bg-white/10" />
      {/* Avatar circle */}
      <Skeleton className="h-11 w-11 rounded-full bg-white/10" />
    </div>
  )
}
