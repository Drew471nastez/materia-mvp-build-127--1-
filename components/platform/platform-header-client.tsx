"use client"

import type React from "react"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import type { User } from "@supabase/supabase-js"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { extractUsernameFromHost, getCanonicalSiteUrl, isCustomDomain } from "@/lib/url-helpers"
import { goToSellFormAsPage, isSellFormRoute } from "@/lib/marketplace/sell-route"
import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { savedShelfHref } from "@/lib/marketplace/saved-items"
import { useUrlSearchParams } from "@/lib/use-url-search-params"
import { MobileSearchOverlay } from "@/components/explore/mobile-search-overlay"
import { cn } from "@/lib/utils"
import { DEPARTMENTS, categoryShortLabel, groupsForDepartment } from "@/lib/marketplace/listing-taxonomy"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { readAuthSnapshot, writeAuthSnapshot, clearAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { Heart, Library, Search, MessageCircle, Plus, LayoutDashboard, Settings, LogOut, LogIn, Menu, X, Loader2, ChevronRight, ChevronLeft, ChevronDown, Sparkles, Code, Megaphone, Briefcase, Music, Camera, Video, LayoutGrid, Gift, MoreHorizontal, Bot, Share2, Flame, Zap, ShoppingBag, Lightbulb, ArrowRight, User as UserIcon, Compass } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"

/** One glyph per department, so the Browse menu is not five identical rows. */
const DEPARTMENT_ICONS: Record<string, typeof LayoutGrid> = {
  women: Sparkles,
  men: ShoppingBag,
  kids: Gift,
  entertainment: Music,
  hobby: Lightbulb,
}

const LOGO_URL =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"

/**
 * ===========================================================================
 *  THE CATEGORY BAR AND THE BROWSE MENU ARE THE MARKETPLACE'S OWN TAXONOMY
 * ===========================================================================
 *
 * These were three hand-written lists — All / Audio & Music / Business & Money
 * / Other / Freebies / AI in the bar, and Design / Development / Marketing /
 * Business / AI / Social Media / Music & Audio / Photography / Video & Film /
 * Productivity in the Browse menu. Every one of them is a category from the
 * DIGITAL-PRODUCTS product this codebase used to be. None of them is a thing
 * anybody can list on Storelib.
 *
 * So a shopper's first navigation offered ten doors, all of which opened onto
 * an empty room, while the five departments that actually hold the stock —
 * the ones the sell form makes somebody choose from — appeared nowhere.
 *
 * They are DERIVED now, from lib/marketplace/listing-taxonomy, which is the
 * same module the listing form's category picker reads. That is the point: a
 * department added there appears in the bar and in the menu without anybody
 * remembering to come here, and it is not possible for the two to disagree
 * about what this marketplace sells.
 */

/** The bar under the header: "Toate" and the five departments. */
const DEFAULT_CATEGORIES: Array<{ id: string; label: string; icon: typeof LayoutGrid }> = [
  { id: "all", label: "Toate", icon: LayoutGrid },
  ...DEPARTMENTS.map((d) => ({ id: d.id, label: d.label, icon: LayoutGrid })),
]

// The phone rail shows the same five. It was a second copy of the same literal
// list, which is two places to forget.
const MOBILE_CATEGORIES = DEFAULT_CATEGORIES

/**
 * The Browse menu: the five departments, each drilling into its own groups.
 *
 * The groups come from `groupsForDepartment`, so "Femei" opens Haine / Pantofi
 * / Genți / Accesorii / Frumusețe — the exact list the sell form offers under
 * Femei — and `categoryShortLabel` takes the department off the front so the
 * submenu reads "Haine" rather than "Femei · Haine" under a heading that
 * already says Femei.
 */
const CATEGORIES_WITH_SUBS: Array<{
  id: string
  label: string
  href: string
  icon: typeof LayoutGrid
  subcategories: Array<{ label: string; href: string }>
}> = DEPARTMENTS.map((d) => ({
  id: d.id,
  label: d.label,
  href: `/?category=${d.id}`,
  icon: DEPARTMENT_ICONS[d.id] ?? LayoutGrid,
  subcategories: groupsForDepartment(d.id).map((g) => ({
    label: categoryShortLabel(g),
    href: `/?category=${d.id}&sub=${g.id}`,
  })),
}))

/* SEARCH_CATEGORIES and SearchProduct are gone with the dropdown they fed.
   They described a catalogue this app no longer sells: nine digital-goods
   categories, and a product shaped like a download with a `creator` and a
   dollar price. Search is the marketplace overlay now, which reads listings.
   See components/explore/mobile-search-overlay.tsx. */

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
  /**
   * READ OFF THE ADDRESS BAR, not through useSearchParams().
   *
   * That hook opts this component into Suspense, and the boundary above it
   * (components/marketing/conditional-header.tsx) falls back to a bare black
   * bar. So every navigation that made this re-suspend blanked the entire
   * header — logo, search, messages, wishlist, cart, Vinde acum, avatar — and
   * then filled it back in, which is the flash on pressing Vinde acum. The
   * button was never involved. See lib/use-url-search-params.ts.
   */
  const searchParams = useUrlSearchParams()
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
  /** The field the search panel is measured against. See `anchorTo`. */
  const searchBoxRef = useRef<HTMLDivElement>(null)
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [selectedCategoryForSubs, setSelectedCategoryForSubs] = useState<string | null>(null)
  /** True while the top level is arriving from a BACK press, so it plays the
   *  pop rather than the push. Reset on the way in. */
  const [poppedSub, setPoppedSub] = useState(false)
  const profileDropdownRef = useRef<HTMLDivElement>(null)
  const [desktopProfileOpen, setDesktopProfileOpen] = useState(false)

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  WHY TYPING IN THE HEADER DID NOTHING
   * ═══════════════════════════════════════════════════════════════════════
   *
   * This was:
   *
   *     useEffect(() => { setQuery(searchParams.get("q") ?? "") }, [searchParams])
   *
   * `searchParams` is an OBJECT, and a new one arrives on re-render — so the
   * dependency is an identity, not a value, and the effect fires again and
   * again on a URL that never changed. On the home page `q` is absent, so
   * every one of those runs set the field back to "".
   *
   * And the header re-renders constantly: the auth state resolves, the avatar
   * loads, a dropdown opens — and, fatally, `setSearchModalOpen(true)` fires
   * from the field's own `onChange`. So the sequence for the first character
   * anybody typed was: set query to "n", open the panel, re-render, effect
   * runs, query back to "". The field stayed empty, the panel stayed on its
   * "search vintage, brands, styles…" empty state, and search looked broken
   * because from the outside it WAS.
   *
   * Comparing the VALUE fixes it: a string dependency is stable across
   * re-renders, and the ref makes the intent explicit — the URL may seed this
   * field, and may overwrite it on a real navigation to a different query, but
   * it may never overwrite it merely because React rendered again.
   */
  const urlQuery = searchParams.get("q") ?? ""
  const lastUrlQuery = useRef(urlQuery)
  useEffect(() => {
    if (lastUrlQuery.current === urlQuery) return
    lastUrlQuery.current = urlQuery
    setQuery(urlQuery)
  }, [urlQuery])

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

  /* The debounced `products` lookup that lived here is gone with the dropdown
     it filled. It queried `products` joined to `creators` for digital goods,
     which is not what this marketplace sells and is not what the overlay asks
     for. Search runs inside components/explore/mobile-search-overlay.tsx, once,
     for every screen. */


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
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        const user = sessionData.session?.user ?? null

        // An error here is the session failing to READ — a refresh that hit a
        // rate limit, a dropped connection — not a session that isn't there.
        // Treating the two alike is what turns a passing Supabase incident into
        // a mass logout: the snapshot below is the durable record that draws the
        // signed-in header, and clearing it on a failure we cannot interpret
        // loses the user's state for a reason that may not survive the minute.
        if (sessionError) {
          if (!mountedRef.current) return
          return
        }

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

  // One wishlist, one URL — but that URL is now the SAVED TAB ON YOUR PROFILE
  // rather than a page of its own. See savedShelfHref: the list lives in a tab
  // beside your listings and your reviews, so the bookmark in this bar should
  // land on it rather than on a separate screen with different chrome showing
  // the same items. /wishlist is still there and is still the fallback for
  // anybody whose handle this header does not know — a guest, or a session that
  // has not resolved yet.
  //
  // `profile` is seeded from the persisted auth snapshot before the first paint
  // (see its useState above), so a returning visitor's bookmark points at their
  // own profile immediately rather than at /wishlist for the frame before the
  // session resolves.
  const wishlistHref = useMemo(() => savedShelfHref(profile?.username), [profile?.username])

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

  /**
   * ===========================================================================
   *  SIGNING OUT HERE SIGNS OUT *HERE*
   * ===========================================================================
   *
   * `scope: "local"` is not a detail — a bare `signOut()` defaults to
   * `scope: "global"`, which asks Supabase to REVOKE EVERY REFRESH TOKEN THE
   * ACCOUNT HAS. Signing out on a laptop therefore killed the session on the
   * iOS app, the Android app and every other browser at the same time, without
   * anything on screen suggesting it would.
   *
   * The second-order damage was worse than the logout. Those devices still held
   * a stored refresh token, now dead. On next open they tried to refresh it,
   * got an error back, and sat on a spinner while the auth gate waited for a
   * read that was never going to resolve into a session — which is the
   * "it logs me out randomly and then loads forever" report, both halves of it,
   * from one default argument.
   *
   * Local revokes this device's token and leaves the others alone. Signing out
   * everywhere is still available, deliberately, as its own control in
   * settings — and that one passes `scope: 'global'` on purpose.
   */
  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: "local" })
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

  /**
   * A DEPARTMENT IS A MARKETPLACE FILTER, NOT AN /explore CATEGORY.
   *
   * This sent every click to `/explore?category=…`, which is the legacy
   * digital-goods browse page and knows nothing about Femei or Hobbyuri. Now
   * that the bar carries the real departments, the only page that can answer
   * them is the marketplace itself — the same URL the category tiles at the
   * bottom of the home page have always used.
   */
  const onCategoryClick = (cat: string) => {
    navigateToExploreCategory(cat === "all" ? "/" : `/?category=${encodeURIComponent(cat)}`)
  }

  // "/" is the marketplace, so it gets the category bar. It was excluded here
  // (and again in the two guards below), which is why storelib.com had no
  // category strip while storelib.com/explore did — the same page, minus its
  // navigation.
  const showCategories =
    pathname === "/" || pathname.startsWith("/explore") || pathname === "/wishlist"
  const isDiscoverProductContext = pathname.startsWith("/p/") && isDiscoverMode(pathname, searchParams)
  const isSellerOrProductPage = pathname.startsWith("/u/") || pathname.startsWith("/p/") || pathname.startsWith("/l/") || pathname.startsWith("/s/")
  /**
   * THE SELL FORM IS NOT A WHITE PAGE, so it must not be handed a white lip.
   *
   * Under the black header the shell draws a 20px strip with a white
   * `rounded-t-[20px]` overlay on it — the concave transition into the white
   * search-and-categories bar below. On a route that has no such bar and whose
   * own background is #f6f6f7, that strip is simply a band of white between the
   * header and the page: the empty gap at the top of /products/new, curving at
   * the corners because it is the lip of a bar that is not there.
   *
   * Named rather than folded into the condition, because it is now checked
   * twice — for the lip and for the bar it is the lip OF — and the two must not
   * be able to disagree about which routes they apply to.
   */
  const isSellRoute = pathname.startsWith("/products/new") || pathname.startsWith("/products/edit")
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
      /**
       * THE SELL FORM IS A PAGE ON A DESKTOP, NOT A MODAL OVER THE FEED.
       *
       * Both sell addresses are intercepted routes, so `router.push` renders
       * them into the @modal slot over whatever you were looking at. Right on a
       * phone; wrong on a monitor, where writing a listing is a ten-minute job
       * with eight photographs in it and a modal says the opposite — a quick
       * aside from the page behind, dismissable by clicking away from it.
       *
       * An interception only fires on a client navigation, so the fix is to
       * stop asking the router rather than to defeat it. First, before the
       * canonical and native branches: those decide HOW to navigate, and this
       * decides whether this navigation may be a soft one at all.
       */
      if (isSellFormRoute(targetPath) && goToSellFormAsPage(targetPath)) {
        e.preventDefault()
        return
      }
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

  /**
   * THIS BAR'S HEIGHT, ON THE ROOT, FOR THE THINGS THAT HAVE TO START BELOW IT.
   *
   * The twin of `--web-header-h` in mobile-web-header.tsx, and it exists for
   * the same reason: something else on the page is `position: fixed` and has to
   * know where this ends. Here it is the profile's pinned bar, which used to
   * park itself at `top: 0` on top of seventy-one pixels of black header and
   * leave the bottom third of it showing as a strip.
   *
   * A LAYOUT effect, so the value is published before the browser paints the
   * route it was mounted by. As a passive effect the first painted frame of
   * every navigation has the previous route's number in it, and a fixed element
   * positioned from a stale variable is a visible jump one frame later — the
   * bug mobile-web-header.tsx records at length.
   *
   * ZERO WHEN THIS BAR IS NOT DRAWN, which is most of the product: the shell
   * around it is `display: none` below 48rem and inside the app, and a hidden
   * element measures zero — so the readers fall back to the top of the screen
   * without any of them having to ask whether this header exists.
   *
   * The observer catches what a render cannot predict: the category row opening,
   * the logo's font landing, a window resize crossing the md breakpoint.
   */
  const headerRootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = headerRootRef.current
    if (!el) return
    const publish = () => {
      document.documentElement.style.setProperty(
        "--platform-header-h",
        `${Math.round(el.getBoundingClientRect().height)}px`,
      )
    }
    publish()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      // Zeroed rather than removed: an explicit 0px is one style write, while a
      // removal invalidates custom-property inheritance for the whole document
      // on a frame that is already committing a route. And a stale height left
      // behind would push a bar down past a header that is no longer there.
      document.documentElement.style.setProperty("--platform-header-h", "0px")
    }
  }, [])

  return (
    <>
      <div ref={headerRootRef} id="platform-header-root" className={cn("z-40 w-full bg-black backdrop-blur supports-[backdrop-filter]:bg-black", isSellerOrProductPage ? "relative" : "sticky top-0")}>
    <header className={cn("w-full bg-black", !(isNativePlatform() && isSellerOrProductPage) && "border-b border-white/10")}>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div
          // 81 → 68 on a desktop. Eighty-one pixels of black is a band, and it
          // was one on every page: the tallest thing on a marketplace should be
          // a photograph of something for sale, not the bar above it. The logo
          // comes down with it — at 46px in a 68px row it would have four
          // pixels of air top and bottom, which is a logo wedged into a bar
          // rather than sitting in one. Untouched below md, where the row is
          // sized by the safe-area inset rather than by this.
          className="platform-header-row flex md:h-[68px] items-center justify-between gap-4 pb-3 md:pb-[3px]"
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
                    className="h-[38px] w-auto rounded-[7px]"
                    priority
                  />
                  <span className="text-[20px] font-bold text-white tracking-tight">Storelib</span>
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
                    className="h-[38px] w-auto rounded-[7px]"
                    priority
                  />
                  <span className="text-[20px] font-bold text-white tracking-tight">Storelib</span>
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
                    /* THE ICON, WITHOUT THE WORD.
                    
                       It read "Categories" in English on a Romanian
                       marketplace, immediately left of a field whose
                       placeholder is "Caută orice" — one bar, two languages,
                       and the only untranslated string on it. Translating it
                       was the obvious repair and the wrong one: "Categorii" is
                       nine characters of chrome next to a hamburger that
                       already means exactly that, and it was eating width the
                       search field could use.
                    
                       A square target with a tooltip and an aria-label instead.
                       The three lines are the most universally understood glyph
                       in an interface, this one opens a menu of categories, and
                       the tooltip says so for anybody who hesitates. */
                    aria-label="Categorii"
                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-150 cursor-pointer ${
                      categoriesDropdownOpen
                        ? "bg-white/15 text-white"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Menu className="w-[20px] h-[20px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                  Categorii
                </TooltipContent>
              </Tooltip>

              {/* Categories Megamenu Dropdown with dedicated subcategory view */}
              {categoriesDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-[320px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-200 z-50">
                  {/* ═══════════════════════════════════════════════════════
                      THE TWO LEVELS PUSH, THEY DO NOT SWAP
                      ═══════════════════════════════════════════════════════

                      Picking a department replaced one list with another in a
                      single frame, so the menu simply became a different menu
                      and nothing said which direction you had gone — the Back
                      button was the only evidence you were a level deep.

                      The listing form solved this once already, in
                      components/sell/picker-page.tsx: the arriving level slides
                      in from the right while the leaving one steps 25% left and
                      dims to 0.62, and the same pair runs backwards on the way
                      out. `sub-push` / `sub-pop` in app/globals.css are that
                      movement at the same 360ms and the same curve, so a
                      drill-down in the header and a drill-down in the sell form
                      are recognisably the same gesture rather than two
                      animations that happen to live in one app.

                      Only transform and opacity, for the reason picker-page
                      gives: anything animating width or height across a subtree
                      this size drops the whole menu onto the main thread. */}
                  <div className="max-h-[70vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>
                    {/* Subcategory View */}
                    {selectedCategoryForSubs && selectedCategoryData ? (
                      <div className="sub-push p-3">
                        <button
                          onClick={() => {
                            // Mark the RETURN so the level underneath plays the
                            // pop rather than the push — without this the list
                            // you are going back to slides in from the right as
                            // though you had gone deeper.
                            setPoppedSub(true)
                            setSelectedCategoryForSubs(null)
                          }}
                          className="flex items-center gap-2 px-2 py-2 mb-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span>Toate categoriile</span>
                        </button>
                        <div className="flex items-center gap-3 px-3 py-2 mb-2">
                          <selectedCategoryData.icon className="h-5 w-5 text-violet-500" />
                          <span className="text-base font-semibold text-gray-900">{selectedCategoryData.label}</span>
                        </div>
                        <Link
                          href={getCanonicalOrRelativePath(selectedCategoryData.href + '&scroll=recommended')}
                          onClick={() => setCategoriesDropdownOpen(false)}
                          className="flex items-center justify-between px-3 py-2.5 mb-1 rounded-lg text-sm font-medium text-gray-800 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
                        >
                          <span>Vezi tot din {selectedCategoryData.label}</span>
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
                      <div className={cn("p-3", poppedSub && "sub-pop")}>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Categorii</h3>
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
                                    setPoppedSub(false)
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

          {/* THE MARKETPLACE'S SEARCH, not the digital-goods one.

              What was here was a field with its own dropdown: nine categories
              from the product this app used to be (Design, Development,
              Marketing, AI…), results linking to /p/ pages, dollar prices,
              "Product by", English copy on a Romanian site. None of it had been
              updated when the marketplace replaced it, so a desktop browser was
              searching a catalogue that is no longer the catalogue.

              The real search already exists and every phone has been using it:
              items, categories and people behind three tabs, recent queries and
              the popular-expansion table. It was `md:hidden`. So this is a
              TRIGGER now, and the overlay it opens is that one — see
              components/explore/mobile-search-overlay.tsx, which grew a desktop
              shape rather than a desktop copy. */}
          {/* ONE FIELD, IN THE BAR, WITH THE RESULTS UNDER IT.

              A real input rather than a button that opens a modal with its own
              input. Both earlier versions of this were wrong in opposite ways:
              a centred modal put two search boxes on screen at once, and hiding
              this one while the modal was open meant the thing you clicked
              vanished from where you clicked it and a different one appeared
              lower down.

              The field stays. It never moves, it is always the one you type in,
              and the panel is a child of this container so it lines up with the
              field at every width without measuring anything. This is the shape
              the old dropdown had right; what was wrong with it was its
              CONTENTS, which are now the marketplace's. */}
          {/* 518px, down from `max-w-xl` (576). Ten percent off a field that had
              grown into the widest object in the bar: at 576 it ran most of the
              way between the logo and the icons on a 1400px measure, which made
              the header read as a search page with some navigation attached
              rather than as navigation with a search in it. It is still by some
              distance the largest control up there. */}
          <div ref={searchBoxRef} className="relative hidden md:flex flex-1 max-w-[518px] mx-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                // Typing is opening. Somebody who starts typing into a closed
                // field means to search, and making them press it first is a
                // step that exists only because the panel is a separate thing.
                if (!searchModalOpen) setSearchModalOpen(true)
              }}
              onFocus={() => setSearchModalOpen(true)}
              // AND on click. After Escape the field still holds focus, so
              // `onFocus` cannot fire again — clicking the search box would do
              // nothing at all until you clicked somewhere else first.
              onClick={() => setSearchModalOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchModalOpen(false)
              }}
              placeholder={t("search_placeholder")}
              aria-label={t("search_placeholder")}
              className={`h-11 w-full border border-white/15 bg-white/10 pl-11 pr-4 text-[15px] text-white outline-none transition-colors placeholder:text-white/50 focus:border-violet-500 focus:bg-white/[0.14] ${isDiscoverProductContext ? "rounded-[8px]" : "rounded-full"}`}
            />
            {query && (
              <button
                type="button"
                aria-label={t("marketplace.clear_search")}
                onClick={() => setQuery("")}
                className="absolute right-3.5 top-1/2 z-10 -translate-y-1/2 text-white/40 transition-colors hover:text-white/80"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <MobileSearchOverlay
              open={searchModalOpen}
              onClose={() => setSearchModalOpen(false)}
              anchored
              anchorTo={searchBoxRef}
              query={query}
              onQueryChange={setQuery}
              // The marketplace, not the legacy /explore browse page — the ids
              // are departments now and only the feed knows what they mean.
              onSelectCategory={(id) => {
                setSearchModalOpen(false)
                router.push(id === "all" ? "/" : `/?category=${encodeURIComponent(id)}`)
              }}
            />
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

              {/* Wishlist — h-11 w-11 = 44px tap target. Signed-in only, for
                  the reason spelled out beside the desktop pair below: a saved
                  count shown to somebody who has never been here is the
                  interface guessing out loud. */}
              {user && (
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
              )}

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

                {/* ═══════════════════════════════════════════════════════════
                    THE HEART AND THE BAG ARE FOR PEOPLE WHO HAVE AN ACCOUNT
                    ═══════════════════════════════════════════════════════════

                    Both were drawn to everybody, and to a stranger they are two
                    icons that lead to two empty rooms. Worse than empty: the
                    heart carried a COUNT — the guest wishlist hangs off a cookie
                    — so a first-time visitor could arrive at a black bar
                    advertising that they had two saved items and a shopping bag,
                    on a site they had never used. A number about you, on a page
                    that has never met you, is the interface guessing out loud.

                    The row is also a pitch when it is empty. Signed out, what is
                    left is search, Vinde, Log in and Sign up: the two things a
                    stranger can do and the two ways in. Signed in, the icons are
                    back and they mean something, because by then there is a list
                    behind each of them.

                    Messages was already gated this way and has been since it was
                    added — "there's nothing to show otherwise", a few lines up.
                    This is the same rule finally applied to its two neighbours. */}
                {user && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={getCanonicalOrRelativePath(wishlistHref)} onClick={(e) => onCanonicalNav(e, wishlistHref)}
                      className="relative flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      aria-label={t("wishlist")}
                    >
                      <Heart className="h-[22px] w-[22px]" />
                      {/* 16px, down from 20. At h-5 the bubble was half the
                          height of the heart it sat on and read as an alert
                          rather than a count — on a black header a red disc
                          that size is the loudest thing in the row. It only
                          has to be legible at a glance, and two digits at
                          9.5px are. */}
                      {wishlistCount > 0 && (
                        <span className="absolute -top-px -right-px flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9.5px] font-bold leading-none text-white">
                          {wishlistCount > 99 ? "99+" : wishlistCount}
                        </span>
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                    Wishlist
                  </TooltipContent>
                </Tooltip>

                )}

                {/* THE BAG STAYS FOR EVERYBODY, and the heart does not.
                    
                    They looked like the same case and are not. A wishlist is a
                    record of what YOU have done — it is only ever a list of your
                    own decisions, so on a page that has never met you it is
                    either empty or, worse, carrying a count from a cookie you do
                    not know you have.
                    
                    A basket is a step in buying something, and buying does not
                    require an account here: the cart works signed out and the
                    sign-in happens at checkout. Hiding it would be hiding the
                    only place a guest's items are, from the guest whose items
                    they are. */}
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
                {/* EIGHT PIXELS, NOT A PILL. A fully rounded button reads as a
                    chip — something to toggle or dismiss — and this is the
                    primary action of the whole marketplace. A modest radius is
                    what every other real control on this site already uses: the
                    hero's CTA, the search field's panel, the listing cards. It
                    also stops the two buttons in this row being lozenges beside
                    a rectangular search field, which is what made the bar read
                    as three unrelated shapes. */}
                <Button asChild className="h-10 rounded-lg px-5 text-[14.5px] font-semibold bg-[#7c3aed] text-white hover:bg-[#6d28d9] shadow-[0_2px_12px_-2px_rgba(124,58,237,0.6)] transition-transform active:scale-[0.97]">
                  <Link href={startSellingHref} onClick={(e) => onCanonicalNav(e, startSellingHref)}>
                    <span className="flex items-center gap-1.5">
                      <Plus className="h-4 w-4" strokeWidth={3} />
                      {t("sell_now")}
                    </span>
                  </Link>
                </Button>

                {/* ═══════════════════════════════════════════════════════════
                    SIGNED OUT: ONE CONTROL, SPLIT — NOT TWO BUTTONS
                    ═══════════════════════════════════════════════════════════

                    It was an outlined pill beside a ghost pill: two objects of
                    the same size and shape, so the row asked a question it has
                    no business asking. Between "sign up" and "log in" there is
                    always a right answer for the person reading it, and they
                    already know which one they are.

                    So they are ONE thing with two weights. Log in is the plain
                    word — the returning half needs recognising, not selling to
                    — and Sign up is the only solid object in the pair, which
                    makes it the thing a first-time visitor's eye lands on.

                    THE HAIRLINE IS GONE, AND THE GAP DOES ITS JOB.
                    A rule between two things is what you reach for when they
                    are NOT obviously related — it is a separator, and drawing
                    one here argued against the very point of the control. Two
                    words a few pixels apart, one of them filled, already read
                    as one object; the rule was pushing them apart and then
                    asking a line to hold them together.

                    And Log in is at FULL WHITE now, not 85%. It was the word
                    a returning shopper is looking for, dimmed — which put the
                    only two things in the pair at the same low contrast as
                    each other, and made the half most people need the harder
                    one to find.

                    It sits exactly where the avatar sits when you are signed
                    in, so the row never changes shape. */}
                {!user && (
                  <div className="flex items-center gap-2">
                    <Link
                      href="/login"
                      className="px-2 text-[15px] font-semibold text-white transition-opacity duration-200 hover:opacity-70"
                    >
                      {t("log_in")}
                    </Link>
                    {/* Solid dark grey rather than white. The bar is pure
                        black, so a filled neutral is a real object on it — and
                        it stays out of the way of the one purple button beside
                        it, which is the marketplace's actual primary action. A
                        white pill here would be two things shouting. */}
                    <Link
                      href="/signup"
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-white/15 bg-neutral-800 px-5 text-[14.5px] font-semibold text-white transition-colors duration-200 hover:bg-neutral-700"
                    >
                      {t("sign_up")}
                    </Link>
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
      {!isSellRoute && (showCategories || (!pathname.startsWith("/features") && !pathname.startsWith("/blog") && !pathname.startsWith("/pricing") && !isFaqRoute && !isSellerOrProductPage)) && (
        <div className="relative z-[35] bg-black h-[20px]">
          <div className="absolute inset-0 bg-white rounded-t-[20px]" />
        </div>
      )}

      {/* White UI section for search bar and category pills (below the black header) */}
      {!isSellRoute && (showCategories || (!pathname.startsWith("/features") && !pathname.startsWith("/blog") && !pathname.startsWith("/pricing") && !isFaqRoute && !isSellerOrProductPage)) && (
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
              /* Same lip above, same arithmetic — see the note on the desktop nav
                 below. pt-0 lets the 20px concave block be the top padding, and
                 pb-4 comes close to matching it under a 36px pill. */
              <div className="md:hidden px-0 pt-0 pb-4 overflow-x-auto scrollbar-hide">
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
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Desktop Categories - White/Light UI */}
            {showCategories && (
              <nav className="hidden md:block">
                {/* ═══════════════════════════════════════════════════════════
                    THE 20px NOBODY WAS COUNTING
                    ═══════════════════════════════════════════════════════════

                    Three values were tried here — pt-1, pt-4, pt-2.5 — and all
                    three were guesses at the wrong number, because the white
                    above these labels does not start where this element starts.

                    A SEPARATE 20px BLOCK sits above it: the concave transition,
                    `bg-black h-[20px]` with a `rounded-t-[20px]` white overlay,
                    which is what makes the corners curve where the black bar
                    meets the white. Its twenty pixels are white too, so the gap
                    above the labels has always been LIP + whatever was set
                    here, while the gap below was only what was set here.
                    pt-2.5 therefore read as 30 above against 14 below — the
                    lopsided band of white in the screenshot, and the reason no
                    value of `pt` alone was ever going to centre this.

                    So the padding-top is ZERO and the lip IS the top padding.
                    `pb-5` matches it, and the row is centred in the white for
                    the first time: 20 above, 20 below.

                    If that block's height ever changes, this has to change with
                    it. They are one measurement written in two places, which is
                    exactly how this went wrong.

                    NO DIVIDERS HERE. They were tried and taken out: these six
                    are one flat list of filters over the same thing, and ruling
                    between them made a navigation bar out of a category rail.
                    The rules belong in the search panel, where Articole /
                    Categorii / Persoane really are three different KINDS of
                    result — see components/explore/mobile-search-overlay.tsx.
                    Gaps are the right separator for a list; rules are for a
                    choice between unlike things. */}
                <div className="overflow-x-auto scrollbar-hide">
                  <div className="flex items-center justify-start gap-7 whitespace-nowrap pb-5 pt-0 text-[14.5px]">
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
