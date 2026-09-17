"use client"

import { useState, useCallback, useTransition, useMemo, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { FeaturedBannerCarousel } from "./featured-banner-carousel"
import { ExploreHero } from "./explore-hero"
import { ProductCard } from "./product-card"
import { useEntranceOnChange } from "@/lib/ui/use-entrance-on-change"
import { ProductCardSkeleton } from "./product-card-skeleton"
import { Layers, Sparkles, Zap, Share2, Bot, SlidersHorizontal, X, Check, Search, ChevronLeft, ChevronRight, Briefcase, Megaphone, ChevronDown, ArrowRight, Music, Camera, Video, ShoppingBag, GraduationCap, Palette, Code, Lightbulb, FileText } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useLocale } from "@/components/locale-provider"
import { EMPTY_INTERESTS, FOR_YOU_ID, buildPillRow, interestScore, type Interests } from "@/lib/explore/interests"

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
    /* "Tech", per the owner. The id stays `development` because it is what
       products carry in their category column and what every link already
       written points at; the label is the part a visitor reads. */
    label: "Tech",
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

/**
 * The sheet's own motion. 320ms on the iOS sheet curve: 400 was long enough
 * to notice as a wait rather than as the sheet arriving.
 */
const SHEET_MS = 320
const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

// Filter types for Recommended section
/**
 * THE PILLS, WHICH ARE A SUBSET AND SAY SO.
 *
 * Nine of the fifteen categories, chosen because they are the ones with
 * products in them, plus "More..." for the rest — which opens the picker that
 * already existed rather than being a second list to keep in step. Derived
 * from CATEGORIES so a label or an icon is edited in one place.
 */
const PILL_IDS = [
  "all",
  "design",
  "development",
  "business",
  "marketing",
  "ai",
  "education",
  "productivity",
  "video",
] as const
/**
 * REAL EMOJI, NOT LINE ICONS. The owner asked for the platform's own emoji,
 * which is what every marketplace with a category row uses: they carry colour
 * and read at 14px where a one-pixel stroke does not, and they are the same
 * glyphs a visitor sees everywhere else on their phone.
 *
 * Kept here rather than on CATEGORIES because the label and the id are shared
 * with the picker and the URL, and only the pills want a face on them.
 */
const PILL_EMOJI: Record<string, string> = {
  all: "\u{1F30D}",
  /* For you keeps the globe, per the owner: the pill in that position has
     always been the world and swapping its face as well as its name would
     make it read as a different control rather than the same one, named
     for you. */
  "for-you": "\u{1F30D}",
  design: "\u{1F3A8}",
  business: "\u{1F4BC}",
  marketing: "\u{1F4C8}",
  ai: "\u{2728}",
  education: "\u{1F393}",
  development: "\u{1F4BB}",
  productivity: "\u{26A1}",
  video: "\u{1F3AC}",
  /* The other six, because an interest pill can be any category and a pill
     with no face next to eight that have one looks broken. */
  "social-media": "\u{1F4AC}",
  photography: "\u{1F4F7}",
  "audio-music": "\u{1F3B5}",
  ecommerce: "\u{1F6D2}",
  freebies: "\u{1F381}",
  other: "\u{1F4E6}",
}
const CATEGORY_PILLS = PILL_IDS
  .map((id) => CATEGORIES.find((c) => c.id === id))
  .filter((c): c is (typeof CATEGORIES)[number] => Boolean(c))

/**
 * The row's shape is decided by lib/explore/interests, which is pure and
 * tested. This turns its ids into the objects the pills are drawn from.
 */
function pillsFrom(interests: Interests) {
  const row = buildPillRow(
    interests,
    PILL_IDS,
    CATEGORIES.map((c) => c.id),
  )
  return {
    first: { id: row.firstId, label: row.firstLabel },
    pills: row.ids
      .map((id) => CATEGORIES.find((c) => c.id === id))
      .filter((c): c is (typeof CATEGORIES)[number] => Boolean(c)),
    personalised: row.personalised,
  }
}

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

/**
 * EIGHT ROWS, which at three across is twenty-four. The number is derived
 * from the rows and the columns rather than written out, so changing either
 * one keeps the other honest. It was seven for a day; the owner said eight.
 */
const PRODUCTS_PER_ROW = 3
const ROWS_PER_PAGE = 8
const PRODUCTS_PER_PAGE = PRODUCTS_PER_ROW * ROWS_PER_PAGE

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
  /* No state per frame: see the note on handleTouchMove below. */
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
      paint(0)
    }, SHEET_MS)

    return () => clearTimeout(timer)
  }, [isOpen, isVisible])

  const handleClose = () => {
    setIsAnimating(false)
    dragY.current = 0
    setTimeout(() => {
      onClose()
    }, SHEET_MS)
  }

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE SHEET FOLLOWS THE FINGER, WRITTEN STRAIGHT TO THE NODE
    ═══════════════════════════════════════════════════════════════════════
    This used to call setDragY on every touchmove, which is a React render
    per frame of a drag: the sheet, its header, every filter row and every
    subcategory chip reconciled sixty times a second while a thumb moved.
    That is the lag. components/app/analytics-chart already solved the same
    problem the same way and tests/analytics-chart pins it — "the box follows
    the finger every frame, written straight to the node", "no React state
    carries the position".

    So the offset lives in a ref and goes onto the element's own transform.
    React is told once, at the end, and only to decide open or closed.

    ONE TO ONE, NOT 0.8. The old damping meant the sheet trailed the thumb by
    a fifth of the distance, which reads as the sheet being heavy rather than
    as it being held. Downward is exact. Upward is rubber-banded to a few
    pixels, because there is nowhere above for it to go.

    AND A FLICK COUNTS. Distance alone means a fast short swipe leaves the
    sheet open under a thumb that has clearly thrown it away, so velocity over
    the last moments of the gesture closes it too.
  */
  const dragY = useRef(0)
  const dragging = useRef(false)
  const lastY = useRef(0)
  const lastT = useRef(0)
  const velocity = useRef(0)
  const startedInList = useRef(false)

  const paint = (y: number) => {
    const el = sheetRef.current
    if (el) el.style.transform = y === 0 ? "none" : `translate3d(0, ${y}px, 0)`
  }

  /*
    ═══════════════════════════════════════════════════════════════════════
     NATIVE LISTENERS, BECAUSE REACT'S touchmove IS PASSIVE
    ═══════════════════════════════════════════════════════════════════════
    These were React props, and the e.preventDefault() in the move handler
    has never done anything. React 17 moved event delegation to the root
    container and registers touchstart, touchmove and wheel as PASSIVE
    listeners, where preventDefault is a no-op the browser ignores (Chrome
    logs "Unable to preventDefault inside passive event listener invocation"
    and Safari silently does nothing).

    That is both reported bugs at once. Dragging the sheet asked the page not
    to scroll, the page scrolled anyway; and a downward drag near the top of
    the document is what Safari's pull-to-refresh is, so it offered to reload
    the page instead of moving the sheet.

    components/ui/bottom-sheet already drags from a native listener for this
    reason. So does this now: attached to the sheet itself, non-passive, and
    torn down with it.
  */
  useEffect(() => {
    const el = sheetRef.current
    if (!isVisible || !el) return

    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      const target = e.target as HTMLElement
      /* Only from the grip, or from a list already scrolled to its top:
         otherwise a drag on the list is a scroll of the list. */
      const fromGrip = target.closest("[data-sheet-grip]") !== null
      const scroller = target.closest("[data-sheet-scroll]") as HTMLElement | null
      if (!fromGrip && scroller && scroller.scrollTop > 0) return
      startedInList.current = !fromGrip && scroller !== null
      startY.current = touch.clientY
      lastY.current = touch.clientY
      lastT.current = e.timeStamp
      velocity.current = 0
      dragging.current = true
      el.style.transition = "none"
    }

    const onMove = (e: TouchEvent) => {
      if (!dragging.current) return
      const y = e.touches[0].clientY
      const dt = e.timeStamp - lastT.current
      if (dt > 0) velocity.current = (y - lastY.current) / dt
      lastY.current = y
      lastT.current = e.timeStamp

      const diff = y - startY.current
      /*
        A DRAG THAT BEGAN IN THE LIST AND TURNS UPWARD IS A SCROLL. The list
        was at its top, which is why the drag was allowed to start, but the
        moment it heads up the visitor is reaching for the rest of the
        filters. Hand the gesture back rather than rubber-banding a sheet
        that cannot go up anyway.
      */
      if (diff < 0 && startedInList.current) {
        dragging.current = false
        el.style.transition = `transform ${SHEET_MS}ms ${SHEET_EASE}`
        dragY.current = 0
        paint(0)
        return
      }
      /* Up from the grip has nowhere to go, so it gives a little and stops. */
      const offset = diff >= 0 ? diff : Math.max(diff / 6, -24)
      /* Non-passive, so this is the thing that actually stops the page
         moving and stops Safari reading the gesture as a reload. */
      if (e.cancelable) e.preventDefault()
      dragY.current = offset
      paint(offset)
    }

    const onEnd = () => {
      if (!dragging.current) return
      dragging.current = false
      el.style.transition = `transform ${SHEET_MS}ms ${SHEET_EASE}`
      const thrown = velocity.current > 0.5
      const far = dragY.current > 96
      dragY.current = 0
      if (thrown || far) {
        handleClose()
        return
      }
      paint(0)
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd)
    el.addEventListener("touchcancel", onEnd)
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
    }
  })

  /*
    AND NOTHING BEHIND IT MOVES AT ALL.

    `overflow: hidden` on body is what the other sheets use and it is not
    enough on iOS, which keeps scrolling the document through it. Taking the
    document out of flow at its current offset is the version that holds: the
    page cannot scroll because there is nothing to scroll, so it cannot chain
    and cannot be pulled far enough to trigger a refresh either.

    The offset is put back on the way out, or closing the sheet jumps the
    visitor to the top of a very long page.
  */
  useEffect(() => {
    if (!isVisible) return
    const body = document.body
    const y = window.scrollY
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    }
    body.style.position = "fixed"
    body.style.top = `-${y}px`
    body.style.left = "0"
    body.style.right = "0"
    body.style.width = "100%"
    return () => {
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.left = prev.left
      body.style.right = prev.right
      body.style.width = prev.width
      window.scrollTo(0, y)
    }
  }, [isVisible])

  const toggleSubcategory = (subId: string) => {
    if (selectedSubcategories.includes(subId)) {
      setSelectedSubcategories(selectedSubcategories.filter(s => s !== subId))
    } else {
      setSelectedSubcategories([...selectedSubcategories, subId])
    }
  }

  if (!isVisible) return null

  return (
    /*
      NO touch-action HERE. The used value is the intersection down the tree,
      so `none` on this root would override the scroller's `pan-y` and the
      filter list would not scroll at all. It goes on the scrim and on the
      sheet's chrome instead, which are the parts that have nothing to scroll.
    */
    <div className="fixed inset-0 z-[100] md:hidden">
      {/* No backdrop-filter. A full-screen blurring layer over a very tall
          page is the one iOS reliably mispaints; plain black does the job. */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ease-out ${isAnimating ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDuration: `${SHEET_MS}ms`, touchAction: "none" }}
        onClick={handleClose}
      />
      <div
        ref={sheetRef}
        data-filters-sheet
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[22px] flex flex-col shadow-[0_-8px_28px_-12px_rgba(15,23,42,0.28)]"
        style={{
          transform: isAnimating ? "none" : "translate3d(0, 100%, 0)",
          transition: `transform ${SHEET_MS}ms ${SHEET_EASE}`,
          /*
            72% of the SMALL viewport, down from 85vh. `vh` on a phone is the
            height with the browser chrome retracted, so 85vh was taller than
            the screen it had to fit into whenever the bar was showing.
          */
          maxHeight: "72svh",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* The grip is the drag target, and it is not a button: tapping it did
            nothing a visitor wanted and swallowed the start of the gesture. */}
        <div data-sheet-grip className="pt-2.5 pb-1.5 shrink-0 touch-none flex justify-center" style={{ touchAction: "none" }}>
          <div className="h-1 w-9 rounded-full bg-neutral-300" />
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100 shrink-0">
          <h3 className="text-lg font-semibold text-neutral-900">Filters</h3>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-sm text-violet-600 font-medium cursor-pointer">
              Reset all
            </button>
          )}
        </div>

        {/* data-sheet-scroll: a drag that starts in here is a scroll unless the
            list is already at its top. See handleTouchStart. */}
        <div
          data-sheet-scroll
          className="overflow-y-auto overscroll-contain px-4 pt-3 pb-4 space-y-5 flex-1 min-h-0"
          style={{ touchAction: "pan-y" }}
        >
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

  const handleCategoryClick = (cat: typeof CATEGORIES[number]) => {
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
          <h3 className="text-lg font-semibold text-neutral-900">Select Category</h3>
        </div>

        <div className="overflow-y-auto overscroll-contain p-3" style={{ maxHeight: 'calc(70vh - 80px)', touchAction: 'pan-y' }}>
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isSelected = selectedCategory === cat.id && !selectedSubcategory
            const isExpanded = expandedCategory === cat.id
            const hasSubcats = cat.subcategories && cat.subcategories.length > 0

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
                      <span>All {cat.label}</span>
                      {selectedCategory === cat.id && !selectedSubcategory && <Check className="w-4 h-4 ml-auto" />}
                    </button>
                    {cat.subcategories.map((sub, index) => (
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

// Search Input Component
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
  /** See lib/explore/interests. Empty and `enough: false` when signed out. */
  interests?: Interests
  searchQuery: string
}

export function ExplorePageClient({
  initialProducts,
  initialCategory,
  interests = EMPTY_INTERESTS,
  searchQuery: urlSearchQuery,
}: ExplorePageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Main category (for Recommended section)
  /*
    FOR YOU IS THE DEFAULT, for an account that has shown us enough. Arriving
    on /explore with no category in the address is "show me the front of the
    shop", and for somebody we know something about the front of the shop is
    their own. An address that names a category still wins.
  */
  const [mainCategory, setMainCategory] = useState(() => {
    const fromUrl = initialCategory.toLowerCase() || "all"
    return fromUrl === "all" && interests.enough ? FOR_YOU_ID : fromUrl
  })

  // Selected subcategory from modal
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null)
  const [selectedSubcategoryLabel, setSelectedSubcategoryLabel] = useState<string | null>(null)

  // Separate category for the Browse by Category section
  const [browseCategory, setBrowseCategory] = useState("all")

  const [isLoadingCategory, setIsLoadingCategory] = useState(false)
  const [recommendationFilter, setRecommendationFilter] = useState<"curated" | "trending" | "hot-new">("curated")
  const categoryChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const categorySectionRef = useRef<HTMLElement>(null)
  /*
    ═══════════════════════════════════════════════════════════════════════
     THE LAST CATEGORY THE VISITOR ACTUALLY CHOSE
    ═══════════════════════════════════════════════════════════════════════
    Tapping a pill sets the state at once and writes the URL a moment later,
    and the URL write is a server round trip. When it lands, the effect below
    reads the category out of it and applies it — which is right when somebody
    arrives on a link, and wrong when they have tapped two more pills since.
    The reply to "design" would arrive after they had moved to "ai" and put
    them back on design.

    That is "it bugs when I switch too fast". So the choice is remembered, and
    an incoming URL that does not match it is a reply to a question that has
    been superseded.
  */
  const chosenCategoryRef = useRef<string | null>(null)
  const categoryAutoScrollTimeoutRef = useRef<number | null>(null)
  const pendingCategoryAutoScrollRef = useRef(false)
  const browseSectionRef = useRef<HTMLElement>(null)
  const pendingBrowseAutoScrollRef = useRef(false)
  const scrollTargetHandledRef = useRef<string | null>(null)
  const hasMountedRef = useRef(false)

  // Filter states
  const [priceFilter, setPriceFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("newest")
  /*
    ═══════════════════════════════════════════════════════════════════════
     useLocale, NOT useLanguage, AND THE DIFFERENCE TOOK THE PAGE DOWN
    ═══════════════════════════════════════════════════════════════════════
    There are two language contexts in this codebase. lib/i18n/context's
    LanguageProvider is mounted in ONE place, components/app/app-layout-wrapper,
    which wraps the /app workspace and nothing else. Its useLanguage throws
    when there is no provider above it, and /explore is under (marketing),
    so calling it here replaced the whole page with an error boundary.

    LocaleProvider is in the root layout, so it is above everything, and its
    useLocale carries the same language and the same setter. That is the one
    a marketing route can use.
  */
  const { language, setLanguage, languages: availableLanguages } = useLocale()

  /* See buildPills: identical to everybody else's row below the threshold. */
  const pillRow = useMemo(() => pillsFrom(interests), [interests])
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

  // Search states
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

    /*
      ═══════════════════════════════════════════════════════════════════════
       FOR YOU IS AN ORDER, NOT A FILTER
      ═══════════════════════════════════════════════════════════════════════
      It could have been "only products in your categories", and that makes a
      page that runs out. Ranking instead means the things this person is most
      likely to want are at the top and the rest of the catalogue is still
      underneath, so scrolling never hits a wall and the pagination still has
      eight rows to fill.

      What it does remove is what they already own. Being sold a thing you
      have already bought is the one recommendation that is definitely wrong.
    */
    if (mainCategory === FOR_YOU_ID) {
      const owned = new Set(interests.ownedProductIds)
      products = products
        .filter((p) => !owned.has(p.id))
        .map((p) => ({ p, score: interestScore(p, interests) }))
        .sort((a, b) => b.score - a.score)
        .map(({ p }) => p)
    }
    // Special handling for "freebies" category - show free products
    else if (mainCategory === "freebies") {
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
  }, [initialProducts, mainCategory, selectedSubcategoryId, recommendationFilter, priceFilter, sortBy, selectedSubcategories, localSearchQuery, interests])

  // Paginated products
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE
    return recommendedProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE)
  }, [recommendedProducts, currentPage])

  /*
    ═══════════════════════════════════════════════════════════════════════════
     THE GRIDS FADE IN WHEN THEY CHANGE, NOT WHEN YOU ARRIVE AT THEM
    ═══════════════════════════════════════════════════════════════════════════
    Each of these three grids carried `animate-in fade-in-0` unconditionally.
    That is right for what it was written for — pick a category, change the
    sort, go to page two, and the new set fades up instead of snapping — and it
    is wrong on arrival, because a mount is a mount and coming BACK from a
    product page is one.

    The main grid is 3364px tall. Filmed on production going back to /explore:

         54ms   mean 194.4   65.6% white   the listing, as it was
         73ms   mean 227.2   90.3% white   the grid at opacity 0
        142ms   mean 212.0   66.8% white   coming back
        327ms   mean 194.7   61.8% white   settled

    A quarter of a second of near-white page on every return, and the same
    88.9/89.0% white shows up in the screen recording that reported it.

    The token each one passes is what already decides whether its CONTENTS
    changed: the filters for the first, the browsed category for the second,
    the query for the third. First render compares it against itself and
    nothing animates; anything different afterwards is a change the visitor
    made while looking at it.
  */
  const productsGridToken = `products-${mainCategory}-${selectedSubcategoryId}-${recommendationFilter}-${priceFilter}-${sortBy}-${currentPage}`
  const productsGridEntrance = useEntranceOnChange(
    productsGridToken,
    "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
  )
  const browseGridEntrance = useEntranceOnChange(browseCategory, "animate-in fade-in-0 duration-200")
  const searchGridEntrance = useEntranceOnChange(urlSearchQuery || "", "animate-in fade-in-0 duration-200")

  const totalPages = Math.ceil(recommendedProducts.length / PRODUCTS_PER_PAGE)

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  CHANGING PAGE PUTS YOU AT THE TOP OF THE NEW ONE
   * ═════════════════════════════════════════════════════════════════════════
   * The controls set the page and nothing else, so pressing 2 left the
   * visitor exactly where they were — at the BOTTOM of the list, looking at
   * the last row of a page they had already read, with twenty-one new
   * products above them and no sign anything had happened. Every catalogue
   * that pages returns you to the start of the list, because that is where
   * the thing you asked for is.
   *
   * The section's own top rather than the document's: the heading, the pills
   * and the filters stay in view, so the list changes under controls that do
   * not move.
   */
  /**
   * ===========================================================================
   *  THE URL SAYS WHAT YOU ARE LOOKING AT
   * ===========================================================================
   * Switching a category used to leave `?category=design` behind and nothing
   * else, so a link somebody sent you opened on a different sort in whatever
   * language their browser happened to pick. The owner asked for the shape
   * `?c=…&lang=…&srt=…`, and all three are read back on arrival, which is the
   * only thing that makes them worth writing.
   *
   * `srt` carries the sort ids this page actually has — newest, popular,
   * price-low, price-high — rather than a word invented for the URL. `lang`
   * carries the code from lib/i18n, which is what setLanguage takes, so the
   * link opens in the language it was shared from.
   */
  const exploreHref = useCallback(
    (categoryId: string, sort: string = sortBy) => {
      const params = new URLSearchParams()
      if (categoryId && categoryId !== "all" && categoryId !== FOR_YOU_ID) params.set("c", categoryId)
      params.set("lang", language)
      params.set("srt", sort)
      return `/explore?${params.toString()}`
    },
    [language, sortBy],
  )

  const goToPage = useCallback((page: number) => {
    const next = Math.max(1, Math.min(totalPages, page))
    if (next === currentPage) return
    setCurrentPage(next)
    smoothScrollToRecommendedSection(categorySectionRef)
  }, [currentPage, totalPages])

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
    setCurrentPage(1)
    chosenCategoryRef.current = categoryId
    pendingCategoryAutoScrollRef.current = shouldAutoScrollToRecommended

    /*
      ═══════════════════════════════════════════════════════════════════════
       THE FLASHING WAS A LOADING STATE FOR SOMETHING THAT NEVER LOADED
      ═══════════════════════════════════════════════════════════════════════
      This used to raise isLoadingCategory, wait 100ms on a timer, push the
      URL inside a transition, and lower it again. Every one of those steps
      puts skeletons on screen: the flag directly, the transition through
      isPending. The filtering itself is a useMemo over products that are
      already in memory, so there was nothing to wait for. Tapping through
      the pills quickly meant skeletons in, cards back, skeletons in again,
      which is the popping and flashing that was reported.

      The state changes now and the list is simply correct on the next frame.

      THE URL FOLLOWS, DEBOUNCED AND WITHOUT A HISTORY ENTRY. Each push was
      also a server round trip and a new entry in history, so five taps left
      five pages to walk back through. `replace` after a short pause means
      the address ends up describing what you are looking at, and Back still
      goes where you came from.
    */
    if (categoryChangeTimeoutRef.current) clearTimeout(categoryChangeTimeoutRef.current)
    categoryChangeTimeoutRef.current = setTimeout(() => {
      let newUrl = exploreHref(categoryId)
      if (subcategoryId) newUrl += `&sub=${subcategoryId}`
      if (urlSearchQuery) newUrl += `&q=${urlSearchQuery}`
      router.replace(newUrl, { scroll: false })
    }, 250)
  }, [router, urlSearchQuery, exploreHref])

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
    const raw = initialCategory.toLowerCase() || "all"
    /* The address has no word for For you: it is the absence of a category,
       same as All. Which of the two that means depends on the account. */
    const normalizedCategory = raw === "all" && interests.enough ? FOR_YOU_ID : raw
    /* A reply that has been overtaken. Ignore the category it carries; the
       rest of the effect still runs, because sub, srt and lang are not part
       of what was superseded. */
    const superseded =
      chosenCategoryRef.current !== null && chosenCategoryRef.current !== normalizedCategory
    if (chosenCategoryRef.current === normalizedCategory) chosenCategoryRef.current = null
    if (!superseded && normalizedCategory !== mainCategory) setMainCategory(normalizedCategory)

    /* Written by exploreHref above; both are ignored when absent. */
    const srtParam = searchParams.get("srt")
    if (srtParam && SORT_OPTIONS.some((o) => o.id === srtParam) && srtParam !== sortBy) {
      setSortBy(srtParam)
    }
    const langParam = searchParams.get("lang")
    if (langParam && availableLanguages.some((l) => l.code === langParam) && langParam !== language) {
      setLanguage(langParam as typeof language)
    }

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
  }, [initialCategory, searchParams, interests.enough])

  const showSkeletons = isPending || isLoadingCategory

  // Get current browse category label
  const browseCategoryLabel = CATEGORIES.find(c => c.id === browseCategory)?.label || "All"

  return (
    <div className="space-y-8">
      <ExploreHero query={localSearchQuery} onQueryChange={setLocalSearchQuery} />

      {/*
        THE BANNER SLIDER IS GONE. A full-width carousel of one product at a
        time, with dots, sat between the heading and the list — so the first
        thing under "Discover" was a single product chosen for you rather than
        the catalogue you came to look through. The owner asked for no sliders
        here, and the list starts immediately now.
      */}

      {/* Dynamic Category Section (Recommended) */}
      {!urlSearchQuery && (
        <section ref={categorySectionRef} className="mt-2 scroll-mt-28">
          {/* Section Header */}
          <div className="flex flex-col gap-4 mb-6 relative">
            {/*
              NO SECTION TITLE. It said "Recommended", above a list that is
              the whole page — a heading for the only thing on the screen. The
              row is the categories and a way to filter them, which is what
              somebody standing in front of a catalogue actually reaches for.

              The By Category button went with it: the pills ARE the
              categories now, so a button that opens a list of them is the
              same choice twice.
            */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/*
                THE ROW SCROLLS AND SAYS SO. It was clipped dead at the
                Filters button with a pill cut in half at the edge, which
                reads as broken rather than as more-to-the-right. The mask
                fades the last few pixels instead.
              */}
              {/*
                CENTRED, NOT PACKED AGAINST THE LEFT EDGE.

                The scroller and the row are two elements now, because they
                want opposite things. `justify-content: center` inside a
                scroll container makes the first item unreachable once the
                content overflows — a known flexbox behaviour, and on a phone
                the first pill is "All". So the outer box scrolls and the
                inner row is `w-max mx-auto`: auto margins centre it while it
                fits and do nothing once it does not, which is scrolling from
                the left with nothing cut off.

                Wide enough to hold them all, it wraps and centres each line
                instead of scrolling at all.
              */}
              {/*
                ONE ROW, AT EVERY WIDTH.

                It used to wrap on a desktop, and with nine pills and a
                Filters button that meant "More..." sitting alone on a second
                line under a centred row — which reads as a mistake rather
                than as a row that continues. The owner asked for one row and
                sideways scrolling when it does not fit.

                So the wrap is gone and the scroller is the scroller at every
                width. `w-max mx-auto` still centres the row while it fits and
                does nothing once it is wider than its track, which is
                scrolling from the left with the first pill reachable. The
                mask fades the right edge at every width now, so a pill that
                continues past the edge looks like more rather than like a
                pill cut in half.
              */}
              <div
                className="flex-1 min-w-0 overflow-x-auto scrollbar-hide -mx-1 px-1 py-0.5 [mask-image:linear-gradient(to_right,transparent_0,black_8px,black_calc(100%-20px),transparent_100%)]"
              >
              <div
                data-category-pills-row
                className="flex w-max mx-auto items-center gap-2"
              >
                {/* "All", or "For you" for an account we know something about.
                    Same position, same globe, same behaviour: it is the pill
                    that clears the category, and it is first. */}
                {[{ id: pillRow.first.id, label: pillRow.first.label }, ...pillRow.pills].map((cat) => {
                  const isSelected = mainCategory === cat.id
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setMainCategory(cat.id)
                        setSelectedSubcategoryId(null)
                        setSelectedSubcategoryLabel(null)
                        setCurrentPage(1)
                        chosenCategoryRef.current = cat.id
                        /* Debounced and replacing, for the reason in
                           handleCategorySelect: a tap is not a page. */
                        if (categoryChangeTimeoutRef.current) clearTimeout(categoryChangeTimeoutRef.current)
                        categoryChangeTimeoutRef.current = setTimeout(() => {
                          router.replace(exploreHref(cat.id), { scroll: false })
                        }, 250)
                        /* Switching a category changes what the list is, so
                           the list starts again from its top rather than
                           leaving somebody in the middle of a page of
                           products they have not seen. Same movement the
                           pager uses. */
                        smoothScrollToRecommendedSection(categorySectionRef)
                      }}
                      className={`inline-flex items-center gap-1.5 shrink-0 px-3.5 py-2 rounded-full text-sm font-medium cursor-pointer select-none whitespace-nowrap border transition-colors duration-150 ${
                        isSelected
                          ? "bg-neutral-900 text-white border-neutral-900"
                          : "bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300 hover:text-neutral-800"
                      }`}
                    >
                      <span aria-hidden className="text-[15px] leading-none">{PILL_EMOJI[cat.id]}</span>
                      {cat.label}
                    </button>
                  )
                })}
                {/* Everything that did not fit, in the picker that already exists. */}
                <button
                  onClick={() => { setCategorySelectorSource('recommended'); setCategorySelectorOpen(true) }}
                  className="inline-flex items-center gap-1.5 shrink-0 px-3.5 py-2 rounded-full text-sm font-medium cursor-pointer select-none whitespace-nowrap border bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300 hover:text-neutral-800 transition-colors duration-150"
                >
                  More...
                </button>
              </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 relative">
                {/* Filters Button */}
                <button
                  onClick={() => {
                    if (window.innerWidth >= 768) setFiltersOpen(!filtersOpen)
                    else setMobileFiltersOpen(true)
                  }}
                  /*
                    AN EDGE AND A SHADOW, because on a phone this collapses to
                    the icon alone and a bare glyph on a light background does
                    not read as something you can press. The pills beside it
                    have a border; this has that and a little depth, so it sits
                    one layer above the row rather than in it.
                  */
                  className={`inline-flex items-center justify-center gap-2 h-[38px] px-3.5 sm:px-4 rounded-[10px] text-sm font-medium border transition-all duration-150 cursor-pointer select-none ${
                    filtersOpen || activeFilterCount > 0
                      ? "bg-neutral-900 text-white border-neutral-900 shadow-[0_1px_2px_rgba(15,23,42,0.18)]"
                      : "bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300 hover:text-neutral-800 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_1px_1px_rgba(15,23,42,0.04)]"
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

            {/*
              THE SEARCH MOVED UP INTO THE HERO, where a visitor arriving to
              browse is already looking, and where it is wide enough to read.
              It was a collapsed field here behind a toggle that nothing
              opened any more. components/explore/explore-hero has it, and the
              header borrows it once it scrolls away.
            */}

            {/*
              THE CURATED / TRENDING / HOT & NEW ROW IS GONE. It was a second
              row of pills under the first, sorting the same list a different
              way, and two rows of pills for one grid is the clutter the owner
              pointed at. What it did lives in the Filters panel, which
              already had a sort with the same options in it.
            */}

            {/*
              NO "CLEAR" CHIP. It sat under the pills whenever a category was
              on, and the owner took it out: the pill row is already the
              control. The category you are in is the filled pill, and the way
              out of it is the first pill — tapping that is how you get back to
              everything, which is what a visitor tries first anyway.

              A SUBcategory still earns a chip, because the row above only
              names the parent, so without it there is nothing on screen
              saying which subcategory is on.
            */}
            {selectedSubcategoryLabel && (
              <div className="md:hidden flex items-center gap-2 mt-2">
                <button
                  onClick={() => {
                    setSelectedSubcategoryId(null)
                    setSelectedSubcategoryLabel(null)
                    router.push(`/explore/${mainCategory}`, { scroll: false })
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  {selectedSubcategoryLabel}
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
                key={productsGridToken}
                /*
                  The entrance plays when the visitor CHANGES something and not
                  when they arrive. Coming back from a product page is an
                  arrival, and this grid is 3364px tall: filmed on production it
                  took the whole page to 90.3% white and spent 250ms fading
                  back. See lib/ui/use-entrance-on-change.ts.
                */
                className={`grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${productsGridEntrance}`}
              >
                {paginatedProducts.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    srcParam="?src=platform"
                    priority={index < 3}
                    clientNav
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
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
                        onClick={() => goToPage(page)}
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
                    onClick={() => goToPage(currentPage + 1)}
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
            /*
              MIN-HEIGHT, SO AN EMPTY RESULT CANNOT PULL THE FOOTER UP INTO
              THE FOLD. A search that matches nothing is a normal thing to
              happen, and when it does the page should still be a page. Two
              thirds of the viewport keeps the footer where a footer belongs,
              below what you are looking at, rather than arriving under the
              category pills.
            */
            <div className="min-h-[60svh] flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
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

      {/*
        THE SECOND CATEGORY BOARD IS GONE.

        "Browse by Category" sat between the product list and
        FeaturedCategoriesSection — which is "Explore categories you can build
        with" — so the page offered two category boards, one under the other,
        with the same categories in both. The owner asked for the upper one
        off. The pills at the top of the list are the third way to choose one
        and the one that does not send you anywhere.
      */}

      {/* Search Results Section */}
      {urlSearchQuery && (
        <section className="mt-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-5">
            Results for "{urlSearchQuery}"
          </h2>
          {recommendedProducts.length > 0 ? (
            <div className={`grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${searchGridEntrance}`}>
              {recommendedProducts.slice(0, 15).map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  srcParam="?src=platform"
                  priority={index < 3}
                  clientNav
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
        selectedCategory={categorySelectorSource === 'browse' ? browseCategory : mainCategory}
        selectedSubcategory={categorySelectorSource === 'browse' ? null : selectedSubcategoryId}
        onSelectCategory={handleModalCategorySelect}
        onSelectSubcategory={handleModalSubcategorySelect}
      />
    </div>
  )
}
