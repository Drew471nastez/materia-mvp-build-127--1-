"use client"

import type React from "react"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import type { User } from "@supabase/supabase-js"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { extractUsernameFromHost, getCanonicalSiteUrl, isCustomDomain, isSellerPage, isProductPage, getProductInternalPath } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { Heart, Library, Search, LayoutDashboard, Settings, LogOut, LogIn, Menu, X, Loader2, ChevronRight, ChevronLeft, ChevronDown, Sparkles, Code, Megaphone, Briefcase, Music, Camera, Video, Bot, Share2, Flame, Zap, ShoppingBag, Lightbulb, ArrowRight, User as UserIcon, Compass, Globe } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { LanguageModal } from "@/components/platform/language-modal"
import { readAuthSnapshot, writeAuthSnapshot, clearAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { useSearchHandoff } from "@/lib/explore/use-search-handoff"

const LOGO_URL =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"



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
    /** The handle, so a result links to `/<handle>/<slug>` rather than `/p/`. */
    username?: string
  }
}

/**
 * Where a search result points.
 *
 * `creators.slug` FIRST, because that is the column that actually holds the
 * handle. Asked of the live database: `creators.username` exists and is null
 * on every row sampled, while `slug` reads "zarrabianco", "ghazi-gharbi" —
 * and it is `slug` that the rename in settings keeps in step with
 * `profiles.username`. Preferring `username` would have quietly sent every
 * result back to `/p/<slug>`.
 */
const productPath = (product: SearchProduct) =>
  getProductInternalPath(product.slug, product.creator?.slug || product.creator?.username || undefined)

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

export function PlatformHeaderClient({ initialWishlistCount = 0 }: { initialWishlistCount?: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { t } = useLocale()

  /**
   * ===========================================================================
   *  SEEDED FROM THE LAST KNOWN SESSION, SO THERE IS NO SKELETON TO FLASH
   * ===========================================================================
   *
   * `loading` started as `true` unconditionally, which meant the grey pills of
   * HeaderActionsSkeleton were painted on EVERY page load and every navigation,
   * for everybody, and then replaced a moment later once supabase.auth.getUser()
   * came back over the network. Two circles, a pill and another circle, in grey,
   * on black -- an animation that told the viewer nothing they did not already
   * know, on a header whose contents had not actually changed since the last
   * page.
   *
   * The header now starts from a snapshot of the last resolved session in
   * localStorage. A returning visitor gets their real avatar and their real
   * buttons on the FIRST PAINT, with no placeholder and no flash of "Log in"
   * before the avatar appears. Only a genuinely first-time visitor -- who has no
   * snapshot, and for whom a placeholder is honest -- ever sees loading=true.
   *
   * The snapshot is a rendering hint and NEVER an authorisation: only the id,
   * the display name, the avatar and the seller flag are read from it, every one
   * of them cosmetic. The real getUser() call still runs on mount and still
   * overwrites all of this; nothing is gated on the snapshot being truthful.
   */
  const [user, setUser] = useState<User | null>(() => {
    const seed = readAuthSnapshot()
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
  const [loading, setLoading] = useState(() => readAuthSnapshot() === null)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  /**
   * Seeded from the last known count, for the same reason the session is.
   *
   * It started at 0 on every load, so the badge was ABSENT for as long as
   * /api/wishlist took to answer and then appeared — the red bubble arriving
   * late, after the page had already settled. Nothing was flickering; the
   * header simply did not know the number yet and rendered the honest zero.
   *
   * It knows the last one now, so the badge is correct on the first paint and
   * the fetch only confirms it. A stale count is corrected within the same
   * second and is a far smaller wrong than a control that moves after you have
   * started reading the page.
   */
  const [wishlistCount, setWishlistCount] = useState(initialWishlistCount)

  /**
   * One writer for the badge, so the stored value cannot drift from what is
   * drawn — and it writes a COOKIE, not localStorage.
   *
   * That distinction is the whole fix. Seeding React state from localStorage
   * only helps once the client has hydrated: the SERVER still renders the badge
   * as absent, the page paints without it, and it appears a moment later. That
   * is the bubble arriving late, and it is why the first attempt at this did not
   * work — it moved the delay from "after the fetch" to "after hydration"
   * instead of removing it.
   *
   * localStorage is invisible to the server. A cookie is not, so the count is
   * read in the marketing layout and passed down as `initialWishlistCount`,
   * which puts the badge in the first painted HTML. The same trick the locale
   * provider already uses, for the same reason.
   *
   * `samesite=lax` and no `secure` flag on localhost only; this is a display
   * count, never an authorisation, and the real list is still fetched.
   */
  const applyWishlistCount = useCallback((next: number) => {
    setWishlistCount((prev) => (prev === next ? prev : next))
    try {
      document.cookie = `storelib_wishlist_count=${next}; path=/; max-age=31536000; samesite=lax`
    } catch {
      /* cookies unavailable — the badge is still correct for this page */
    }
  }, [])
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
  /**
   * The language picker, opened from either account menu.
   *
   * State lives here rather than in the modal because BOTH menus open the same
   * one, and each has to close itself on the click that opens it -- a sheet
   * left open behind a modal reappears when the modal closes.
   */
  const [languageOpen, setLanguageOpen] = useState(false)

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
              slug,
              username
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
              username: p.creators.username,
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
        applyWishlistCount(data.count || data.items?.length || 0)
      }
    } catch (err) {
      console.error("[v0] Failed to fetch wishlist count:", err)
    }
  }, [applyWishlistCount])

  useEffect(() => {
    fetchWishlistCount()
  }, [fetchWishlistCount])

  useEffect(() => {
    const handleWishlistUpdate = (event: CustomEvent) => {
      if (typeof event.detail?.count === "number") {
        applyWishlistCount(event.detail.count)
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
        // Only when there is nothing to show yet. With a snapshot in hand,
        // flipping this back to true would reintroduce the very flash the
        // snapshot exists to remove.
        if (isInitial && readAuthSnapshot() === null) {
          setLoading(true)
        }

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()

        if (error || !user) {
          if (!mountedRef.current) return
          clearAuthSnapshot()
          // The cached badge belongs to whoever was signed in. Leaving it would
          // show the previous account's count to the next person at this device
          // until the guest fetch returns.
          try {
            document.cookie = "storelib_wishlist_count=0; path=/; max-age=0; samesite=lax"
          } catch { /* ignore */ }
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
          const pd = (profileData as Profile) ?? null
          setProfile(pd)
          // Persist avatar so the next render (or next page load) shows it immediately
          const freshAvatar = pd?.avatar_url || null
          if (freshAvatar) {
            setCachedAvatarUrl(freshAvatar)
            try { localStorage.setItem("_sl_avatar", freshAvatar) } catch {}
          }
          const isSellerByState = !!creatorData?.onboarding_completed
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

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE CATEGORY STRIP IS GONE, AND THE SEARCH WAITS ITS TURN
   * ═════════════════════════════════════════════════════════════════════════
   * A white band under the black header carried All / Audio & Music /
   * Business & Money / Other / Freebies / AI, on every Explore page. It went
   * on the owner's instruction: Explore already has category pills of its
   * own, under its own heading, where somebody browsing is looking. Two rows
   * of the same six categories, one of them in a different place and a
   * different shape, is a second navigation for the same thing.
   *
   * The band held the phone's search trigger too, so that moves into the
   * black row with the desktop one, and both now follow the page. See
   * lib/explore/use-search-handoff: while Explore's own big field is on
   * screen the header has none, and it grows one the moment that field
   * scrolls away.
   */
  const isExploreSurface = pathname === "/explore" || pathname.startsWith("/explore") || pathname === "/wishlist"
  const searchInHeader = useSearchHandoff(isExploreSurface)
  /* Both spellings of a product: `/p/<slug>` still resolves and redirects,
     and `/<handle>/<slug>` is what everything hands out now. */
  const isDiscoverProductContext = isProductPage(pathname) && isDiscoverMode(pathname, searchParams)
  const isSellerOrProductPage = isSellerPage(pathname) || pathname.startsWith("/s/")
  const isBlogRoute = pathname === "/blog" || pathname.startsWith('/blog/')
  const isFaqRoute = pathname === "/faq"
  const isMarketingNavRoute = pathname === "/" || pathname === "/features" || pathname === "/pricing" || isBlogRoute || isFaqRoute

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
    path.startsWith("/app") || path.startsWith("/creator-page") || path.startsWith("/store-builder") || path.startsWith("/library")

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
          className="platform-header-row flex md:h-[77px] items-center justify-between gap-4 pb-3 md:pb-[3px]"
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
                    width={131}
                    height={44}
                    className="h-[44px] w-auto rounded-[7px]"
                    priority
                  />
                  <span className="text-[21px] font-bold text-white tracking-tight">Storelib</span>
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
                        "px-4 py-2 text-[15px] font-medium rounded-full border transition-[background-color,border-color,color,scale] duration-180 ease-out",
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
                            href="/explore" onClick={(e) => onCanonicalNav(e, "/explore")}
                            className="flex h-[42px] w-[42px] items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
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
                      <Button asChild className="h-[42px] rounded-lg px-6 text-[15px] bg-violet-600 text-white hover:bg-violet-700 cursor-pointer">
                        <Link href={getCanonicalOrRelativePath(hasCompletedSellerOnboarding ? "/app" : "/library")} onClick={(e) => onCanonicalNav(e, hasCompletedSellerOnboarding ? "/app" : "/library")}>
                          {hasCompletedSellerOnboarding ? "Dashboard" : "Library"}
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* Log In */}
                      <Link href={getCanonicalOrRelativePath("/login")} onClick={(e) => onCanonicalNav(e, "/login")}>
                        <Button variant="ghost" className="h-[42px] px-5 rounded-lg text-[15px] font-medium text-white border border-white/70 hover:bg-white/10 hover:text-white cursor-pointer">
                          Log In
                        </Button>
                      </Link>
                      {/* Start Selling */}
                      <Button asChild className="h-[42px] rounded-lg px-6 text-[15px] bg-violet-600 text-white hover:bg-violet-700 cursor-pointer">
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
                      width={120}
                      height={40}
                      className="h-[42px] w-auto rounded-[7px]"
                      priority
                    />
                    <span className="text-[19px] font-bold text-white tracking-tight">Storelib</span>
                  </Link>
                </div>

                {/* Right - Only hamburger (glassmorphism) with animation */}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  /* A 40px disc is under the 44px a thumb reliably hits, and this one sits in the corner of the screen where a hand is least accurate. The pseudo-element extends the TOUCH target 8px in every direction without moving the disc, so a near miss still opens the menu. `touch-manipulation` drops the browser's double-tap-to-zoom wait, which is the other half of "it sometimes does not register". */
                  className="relative flex h-10 w-10 touch-manipulation items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-white hover:bg-white/15 transition cursor-pointer before:absolute before:-inset-2 before:content-['']"
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
                    width={131}
                    height={44}
                    className="h-[44px] w-auto rounded-[7px]"
                    priority
                  />
                  <span className="text-[21px] font-bold text-white tracking-tight">Storelib</span>
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
          {/*
            NOT RENDERED RATHER THAN HIDDEN. On Explore, while the page's own
            field is on screen, there is no search here at all and the row
            rebalances around the logo and the actions — which is the shape
            Skool's discovery header has, and the reason it reads as calm. An
            invisible one holding its width would leave a gap in the middle of
            the bar instead. See lib/explore/use-search-handoff.
          */}
          {searchInHeader && (
          <div className="hidden md:flex flex-1 max-w-xl mx-4 relative motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/40 pointer-events-none z-10" />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setSearchModalOpen(true)}
                placeholder={t("search_placeholder")}
                className={`h-[42px] w-full pl-11 pr-4 bg-white/10 border-white/15 text-white text-[15px] placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-0 focus-visible:border-violet-500 ${isDiscoverProductContext ? "rounded-[8px]" : "rounded-full"}`}
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
                          href={getCanonicalOrRelativePath(productPath(product))}
                          onClick={(e) => {
                            onCanonicalNav(e, productPath(product))
                            setSearchModalOpen(false)
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer group"
                        >
                          {product.thumbnail_url ? (
                            <Image
                              src={product.thumbnail_url}
                              alt={product.title}
                              width={46}
                              height={44}
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
          )}

          {/* Mobile Header for Non-Homepage pages */}
          <div className="md:hidden flex items-center justify-between flex-1 -ml-6">
            {/* Hamburger + Logo left, icons right */}
            <div className="flex items-center gap-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                /* The same slack as the homepage's, and this one starts even
                   smaller at 36px. See the note on that button. */
                className="relative flex h-9 w-9 touch-manipulation items-center justify-center text-white transition cursor-pointer before:absolute before:-inset-2.5 before:content-['']"
                aria-label={mobileMenuOpen ? "Close categories" : "Open categories"}
              >
                <AnimatedHamburger isOpen={mobileMenuOpen} />
              </button>

              {/* Logo next to hamburger - links to /explore */}
              <Link href="/explore" onClick={(e) => onCanonicalNav(e, "/explore")} className="shrink-0 flex items-center gap-1.5">
                <Image
                  src={LOGO_URL || "/placeholder.svg"}
                  alt="Storelib"
                  width={108}
                  height={36}
                  className="h-[38px] w-auto rounded-[7px]"
                  priority
                />
                <span className="text-[19px] font-bold text-white tracking-tight">Storelib</span>
              </Link>
            </div>

            {/* Right - Mobile Icons */}
            <div className="flex items-center gap-1">
              {/* Library - only show when logged in; h-[42px] w-[42px] = 44px tap target */}
              {user && (
                <Link
                  href={getCanonicalOrRelativePath("/library")} onClick={(e) => { e.preventDefault(); setMobileProfileOpen(false); onCanonicalNav(e, "/library") }}
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-full text-white/80 hover:bg-white/10 transition cursor-pointer"
                  aria-label="Library"
                >
                  <Library className="h-5 w-5" />
                </Link>
              )}

              {/* Wishlist — h-[42px] w-[42px] = 44px tap target */}
              <Link
                href={getCanonicalOrRelativePath(wishlistHref)} onClick={(e) => onCanonicalNav(e, wishlistHref)}
                className="relative flex h-[42px] w-[42px] items-center justify-center rounded-full text-white/80 hover:bg-white/10 transition cursor-pointer"
                aria-label="Wishlist"
              >
                {/* The badge is anchored to the ICON, not to the link.
                    The link is a 44px tap target and the heart is 20px inside
                    it, so a badge positioned against the link sat roughly 12px
                    clear of the glyph — it read as floating loose rather than
                    attached. It was always so; shrinking the bubble is what made
                    the gap obvious. This wrapper is the size of the heart, so
                    -top/-right land on the heart's own corner. */}
                <span className="relative inline-flex">
                  <Heart className="h-5 w-5" />
                  {wishlistCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-red-500 px-[3px] text-[7px] font-bold leading-none text-white">
                      {wishlistCount > 99 ? "99+" : wishlistCount}
                    </span>
                  )}
                </span>
              </Link>

              {/* Mobile Avatar or Sign In button — use h-[42px] w-[42px] wrapper for 44px tap target */}
              {user ? (
                <button
                  type="button"
                  onClick={() => setMobileProfileOpen(true)}
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-full cursor-pointer"
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
                {/* Wishlist */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={getCanonicalOrRelativePath(wishlistHref)} onClick={(e) => onCanonicalNav(e, wishlistHref)}
                      className="relative flex h-[42px] w-[42px] items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      aria-label={t("wishlist")}
                    >
                      <span className="relative inline-flex">
                        <Heart className="h-[22px] w-[22px]" />
                        {wishlistCount > 0 && (
                          <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-[3px] text-[8px] font-bold leading-none text-white">
                            {wishlistCount > 99 ? "99+" : wishlistCount}
                          </span>
                        )}
                      </span>
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
                      className="hidden sm:flex h-[42px] w-[42px] items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
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
                <Button asChild className="h-[42px] rounded-full px-6 text-[15px] bg-violet-600 text-white hover:bg-violet-700">
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
                          <Avatar className="h-[42px] w-[42px] border border-gray-200 transition-opacity duration-150">
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
                            e.preventDefault()
                            setDesktopProfileOpen(false)
                            onCanonicalNav(e, "/library")
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
                        <button
                          type="button"
                          onClick={() => { setDesktopProfileOpen(false); setLanguageOpen(true) }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 cursor-pointer"
                        >
                          <Globe className="h-4 w-4 shrink-0" />
                          <span>{t("settings.language")}</span>
                        </button>

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
                className={`h-[42px] w-full pl-10 pr-10 bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-500 text-sm ${isDiscoverProductContext ? "rounded-[8px]" : "rounded-full"}`}
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
                        navigateReliably(productPath(product))
                        setSearchModalOpen(false)
                      }}
                      className="flex w-full items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer touch-manipulation text-left"
                    >
                      {product.thumbnail_url ? (
                        <Image
                          src={product.thumbnail_url}
                          alt={product.title}
                          width={46}
                          height={44}
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
                <Button className="w-full h-[42px] rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 gap-2">
                  <LogIn className="h-4 w-4" />
                  Sign in
                </Button>
              </Link>
              {/* Discover button - black with icon */}
              <Link href="/explore" onClick={(e) => { onCanonicalNav(e, "/explore"); setMobileMenuOpen(false) }} className="block">
                <Button className="w-full h-[42px] rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 gap-2">
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
                <Avatar className="h-[42px] w-[42px] border border-gray-200">
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
                  <Button className="w-full h-[42px] rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Button>
                </Link>
              ) : (
                <Link href={getCanonicalOrRelativePath("/onboarding")} onClick={(e) => { onCanonicalNav(e, "/onboarding"); setMobileMenuOpen(false) }} className="block mb-2">
                  <Button className="w-full h-[42px] rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 gap-2">
                    <Sparkles className="h-4 w-4" />
                    Become a Seller
                  </Button>
                </Link>
              )}
              {/* Discover button - black with icon */}
              <Link href="/explore" onClick={(e) => { onCanonicalNav(e, "/explore"); setMobileMenuOpen(false) }} className="block">
                <Button className="w-full h-[42px] rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 gap-2">
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
                className="w-full h-[42px] flex items-center gap-2 px-3 bg-gray-100 border border-gray-200 text-gray-600 rounded-xl text-sm cursor-pointer overflow-hidden"
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
                <Link
                  href={getCanonicalOrRelativePath("/library")}
                  onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); onCanonicalNav(e, "/library") }}
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
            <button
              type="button"
              onClick={() => { setMobileProfileOpen(false); setLanguageOpen(true) }}
              className="flex w-full items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-gray-400" />
                <span>{t("settings.language")}</span>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </button>
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

      {/* Rendered outside both menus on purpose: each closes itself on the
          click that opens this, so it cannot be a child of either. */}
      <LanguageModal open={languageOpen} onOpenChange={setLanguageOpen} />
    </header>
      </div>

      {/*
        The concave lead-in from the black header into the white strip below
        it. Both are the phone's search strip now, so both come and go with
        it: an empty white band under the header on Explore is a bar with
        nothing in it.
      */}
      {searchInHeader && (pathname !== "/" && !pathname.startsWith("/features") && !pathname.startsWith("/blog") && !pathname.startsWith("/pricing") && !isFaqRoute && !isSellerOrProductPage) && (
        <div className="relative z-[35] bg-black h-[20px] md:hidden">
          <div className="absolute inset-0 bg-white rounded-t-[20px]" />
        </div>
      )}

      {/* The phone's search strip. It carried the category pills too, until
          those went; see the note where isExploreSurface is declared. */}
      {searchInHeader && (pathname !== "/" && !pathname.startsWith("/features") && !pathname.startsWith("/blog") && !pathname.startsWith("/pricing") && !isFaqRoute && !isSellerOrProductPage) && (
        <div className="relative z-[35] w-full bg-white border-b border-neutral-200 md:hidden">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
            {/* Mobile Search Bar Trigger */}
            {true && (
              <div className="md:hidden pt-1.5 pb-1.5">
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

          </div>
        </div>
      )}

      {/* Concave bottom edge — black background with rounded white overlay creates concave corners.
          Skipped on the FAQ page, whose hero is black too, and on any page that already
          renders the white strip above, to avoid two black bars. */}
      {!isFaqRoute && (pathname === "/" || pathname.startsWith("/features") || pathname.startsWith("/blog") || pathname.startsWith("/pricing")) && (
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
        <Skeleton className="h-[42px] w-[72px] rounded-lg bg-white/10" />
        {/* Start Selling button skeleton */}
        <Skeleton className="h-[42px] w-[110px] rounded-lg bg-white/10" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5">
      {/* Wishlist circle */}
      <Skeleton className="h-[42px] w-[42px] rounded-full bg-white/10" />
      {/* Library circle */}
      <Skeleton className="h-[42px] w-[42px] rounded-full bg-white/10 hidden sm:block" />
      {/* CTA button */}
      <Skeleton className="h-[42px] w-28 rounded-full bg-white/10" />
      {/* Avatar circle */}
      <Skeleton className="h-[42px] w-[42px] rounded-full bg-white/10" />
    </div>
  )
}
