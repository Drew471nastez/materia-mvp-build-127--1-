"use client"

import { hasConsent } from "@/lib/consent/client"
import type React from "react"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react"
import type { User } from "@supabase/supabase-js"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { extractUsernameFromHost, getCanonicalSiteUrl, isCustomDomain, isSellerPage, isProductPage, getProductInternalPath } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
/* The shell's own avatar: the photo, else the initials, else a plain
   person, and nothing drawn while a photo is on its way (which is what the
   header wants: this is the viewer's own picture and it is cached). */
import { AppAvatar } from "@/components/app/app-avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BottomSheet } from "@/components/ui/bottom-sheet"

import { Heart, Library, Search, LayoutDashboard, Settings, LogOut, Menu, X, Loader2, ChevronRight, ChevronDown, Sparkles, Store, Code, Megaphone, Briefcase, Music, Camera, Video, Bot, Share2, Zap, ShoppingBag, Lightbulb, ArrowRight, User as UserIcon, Compass, Globe } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { LanguageModal } from "@/components/platform/language-modal"
import { readAuthSnapshot, writeAuthSnapshot, clearAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { hasSellerAccess, sellerAccessFrom, type SellerState } from "@/lib/account/seller-access"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { useSearchHandoff, useSearchHandoffState, WINDOW_SLACK } from "@/lib/explore/use-search-handoff"
import { useBuyerTabsHere } from "@/lib/nav/use-buyer-tabs-where"
import { CategoryBrowser, Chevron, type BrowseGroup } from "@/components/explore/category-browser"
import { listPrice } from "@/lib/pricing/list-price"




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
    /* "Tech" here too, or the header's menu and the page's pills disagree
       about the name of the same category. The href keeps `development`. */
    label: "Tech",
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

/**
 * The same list, in the shape the category browser draws
 * (components/explore/category-browser): ids read off the hrefs, so a pick
 * goes where the old menu's link went and the one on screen can be ticked.
 */
const param = (href: string, key: string) => new URLSearchParams(href.split("?")[1] ?? "").get(key) ?? ""
const HEADER_GROUPS: BrowseGroup[] = CATEGORIES_WITH_SUBS.map((c) => ({
  id: param(c.href, "category"),
  label: c.label,
  items: c.subcategories.map((sub) => ({ id: param(sub.href, "sub"), label: sub.label })),
}))
const hrefFor = (groupId: string, itemId: string | null) => {
  const cat = CATEGORIES_WITH_SUBS.find((c) => param(c.href, "category") === groupId)
  const sub = itemId ? cat?.subcategories.find((x) => param(x.href, "sub") === itemId) : undefined
  return (sub ?? cat)?.href ?? "/explore"
}

// Product type for search results
type SearchProduct = {
  id: string
  title: string
  slug: string
  thumbnail_url?: string
  price_cents: number
  compare_at_cents?: number | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  /** A membership reads "$9/month" (lib/pricing/list-price). */
  type?: string | null
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

/** True below 768px, the width from which the header stops drawing its phone buttons. */
/* The header's Categories menu: the panel, and its two states (see where it is drawn). */
const HEADER_MENU_PANEL =
  "absolute top-full left-0 mt-2 z-50 flex h-[min(480px,calc(100dvh-120px))] w-[320px] flex-col overflow-hidden rounded-xl bg-white text-[#1a1a2e] " +
  "shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_4px_-1px_rgba(15,23,42,0.06),0_12px_32px_-8px_rgba(15,23,42,0.18)] " +
  "origin-top-left transition-[opacity,scale,translate] motion-reduce:transition-none"
const HEADER_MENU_OPEN =
  "opacity-100 scale-100 translate-y-0 duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] starting:opacity-0 starting:scale-[0.98] starting:-translate-y-1"
const HEADER_MENU_LEAVING =
  "pointer-events-none opacity-0 scale-[0.98] -translate-y-1 duration-[140ms] ease-[cubic-bezier(0.4,0,1,1)]"

function useBelowMd(): boolean {
  const [below, setBelow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const on = () => setBelow(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return below
}

/**
 * ===========================================================================
 *  THE PHONE MENU AND THE ACCOUNT SHEET ARE THE APP'S ONE SHEET
 * ===========================================================================
 * This was a sheet of its own: React state per drag frame, a CSS transition
 * that moved on release rather than under the finger, a body scroll lock,
 * and a close that waited 400ms on a timer before telling anybody. Every
 * other sheet in Storelib is components/ui/bottom-sheet.tsx, which moves on
 * the compositor (transform and opacity only), follows the thumb without a
 * render per frame, and paints its first frame already below the screen, so
 * it cannot flash open before it slides. These two use it too now, with the
 * same look they had: no title, three quarters of the screen at most, and
 * hidden from the width the header stops drawing its hamburger.
 *
 * `contentKey` still resets the scroll when the menu swaps its category list
 * for a sub-list, through the sheet's own `scrollKey`.
 */
function MobileBottomSheet({
  isOpen,
  onClose,
  children,
  title,
  contentKey,
  fill = false,
  height,
  keepMounted = false,
  onClosed,
}: {
  isOpen: boolean
  onClose: () => void
  /** The slide out has finished. */
  onClosed?: () => void
  children: React.ReactNode
  title?: string
  contentKey?: string | null
  /** The children lay themselves out and scroll themselves (the category browser). */
  fill?: boolean
  /** A fixed height, so a list that changes level does not move the top edge. */
  height?: string
  /** Built while the page is idle and kept, as the app's account sheet is: the tap only slides it up. */
  keepMounted?: boolean
}) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      label={title ?? "Menu"}
      hideFrom="md"
      fill={fill}
      height={height}
      maxHeight={height ?? "min(74dvh, 720px)"}
      className="rounded-t-[24px]"
      scrollKey={contentKey ?? "default"}
      keepMounted={keepMounted}
      onClosed={onClosed}
    >
      {children}
    </BottomSheet>
  )
}

/** A link row in the category sheet, drawn like the browser's own rows. */
function MenuRow({ to, label, onNav, seller = false }: { href: string; to: string; label: string; onNav: (e: React.MouseEvent<HTMLElement>) => void; seller?: boolean }) {
  return (
    <Link
      href={to}
      onClick={onNav}
      data-become-seller={seller ? "" : undefined}
      className={cn(
        "flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[16px] leading-5 outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent] focus-visible:bg-[#f1f2f4]",
        /* Become a seller, in the purple and on a pale violet press: noticed, not shouted. */
        seller ? "font-medium text-violet-700 active:bg-[#f5f3ff]" : "text-[#1a1a2e] active:bg-[#f1f2f4]",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Chevron className={seller ? "text-violet-300" : "text-[#9ca3af]"} />
    </Link>
  )
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   THE LOGO IS FIVE PERCENT SMALLER IN A HEADER, AND ONLY IN A HEADER
  ═══════════════════════════════════════════════════════════════════════════
  The owner asked for the mark to sit a little quieter in the bar. The sizes
  themselves change (44, 42 and 38 before), not a scale on top of them, so
  the picture is still fetched and laid out at the size it is drawn. The
  footers, sign in and everything else keep theirs.
*/
export const HEADER_LOGO = { desktop: 41.8, marketingPhone: 39.9, phone: 36.1 } as const

/** A focus ring that reads on the black bar. */
const DARK_FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"

/** Where a header link goes, and the click that gets it there (canonical host, native shell). */
type HeaderLink = (path: string) => { href: string; onClick: (e: React.MouseEvent<HTMLElement>) => void }

/*
  ═══════════════════════════════════════════════════════════════════════════
   THE LOGGED OUT BUTTONS ON A COMPUTER
  ═══════════════════════════════════════════════════════════════════════════
  The owner's picture (image 20): a thin rule, "Sell on Storelib" as plain
  text, "Log in" outlined and "Sign up" filled in the Storelib purple, both
  with the small `rounded-action` corner rather than a pill. The marketing
  pages carry all four; Explore and the pages that share its header leave
  out Log in, where the wishlist and library icons already sit.

  `placeholder` draws the same row invisibly, for a first visit where the
  header does not know yet who is looking. It holds exactly the width the
  logged out row will take, so nothing beside it moves when the answer
  arrives, and there is no grey pill standing in for a button.
*/
function GuestHeaderActions({ withLogin, link, placeholder = false }: { withLogin: boolean; link: HeaderLink; placeholder?: boolean }) {
  return (
    <div
      data-guest-actions={withLogin ? "marketing" : "buyer"}
      data-placeholder={placeholder ? "" : undefined}
      aria-hidden={placeholder || undefined}
      inert={placeholder || undefined}
      className={cn("flex shrink-0 items-center", placeholder && "invisible")}
    >
      <span aria-hidden data-guest-divider="" className="ml-1 h-6 w-px bg-white/15" />
      {/* "Sell" alone on a tablet, where the bar has no room for three words; the name stays whole for a screen reader. */}
      <Link
        {...link("/sell")}
        data-guest-sell=""
        aria-label="Sell on Storelib"
        className={cn("ml-5 whitespace-nowrap rounded-md px-2 py-2 text-[15px] font-medium text-white/85 transition-colors hover:text-white", DARK_FOCUS)}
      >
        <span className="lg:hidden">Sell</span>
        <span className="hidden lg:inline">Sell on Storelib</span>
      </Link>
      {withLogin && (
        <Link
          {...link("/login")}
          data-guest-login=""
          className={cn("ml-6 inline-flex h-[42px] items-center whitespace-nowrap rounded-action border border-white/30 px-5 text-[15px] font-medium text-white transition-colors hover:border-white/55 hover:bg-white/[0.06]", DARK_FOCUS)}
        >
          Log in
        </Link>
      )}
      <Link
        {...link("/signup")}
        data-guest-signup=""
        className={cn(withLogin ? "ml-3" : "ml-6", "inline-flex h-[42px] items-center whitespace-nowrap rounded-action bg-violet-600 px-5 text-[15px] font-[550] text-white transition-colors hover:bg-violet-700", DARK_FOCUS)}
      >
        Sign up
      </Link>
    </div>
  )
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   THE LOGGED OUT BUTTONS IN THE PHONE MENU
  ═══════════════════════════════════════════════════════════════════════════
  The owner's picture (image 23), in Storelib's purple rather than the blue
  it was drawn in: a filled Sign up, an outlined second button, and "Sell on
  Storelib" as a purple line of text under them. On the marketing pages the
  second button is Discover with its compass; on Explore and the pages that
  share its header it is Log in, because Discover is where you already are.
  46px buttons, 6px apart, labels at 16px, and the text link a 44px row of
  its own so it is as easy to hit as the buttons above it.
*/
const SHEET_BUTTON =
  "flex h-[46px] w-full touch-manipulation items-center justify-center rounded-action text-[16px] transition-colors duration-100 [-webkit-tap-highlight-color:transparent] outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
function GuestSheetActions({ second, link, onDone }: { second: "discover" | "login"; link: HeaderLink; onDone: () => void }) {
  const go = (path: string) => {
    const { href, onClick } = link(path)
    return { href, onClick: (e: React.MouseEvent<HTMLElement>) => { onClick(e); onDone() } }
  }
  return (
    <div data-guest-sheet={second} className="flex flex-col gap-1.5">
      <Link {...go("/signup")} data-menu-sign-up="" className={cn(SHEET_BUTTON, "bg-violet-600 font-[550] text-white hover:bg-violet-700 active:bg-violet-700")}>
        Sign up
      </Link>
      {second === "discover" ? (
        <Link {...go("/explore")} data-menu-discover="" className={cn(SHEET_BUTTON, "gap-3 border border-[#d0d4db] bg-white font-medium text-[#1a1a2e] hover:bg-[#f7f7f9] active:bg-[#f1f2f4]")}>
          <Compass aria-hidden className="h-5 w-5" strokeWidth={1.9} />
          Discover
        </Link>
      ) : (
        <Link {...go("/login")} data-menu-log-in="" className={cn(SHEET_BUTTON, "border border-[#d0d4db] bg-white font-medium text-[#1a1a2e] hover:bg-[#f7f7f9] active:bg-[#f1f2f4]")}>
          Log in
        </Link>
      )}
      <Link {...go("/sell")} data-menu-sell="" className={cn(SHEET_BUTTON, "h-11 font-medium text-violet-600 active:bg-violet-50")}>
        Sell on Storelib
      </Link>
    </div>
  )
}

/*
  "BECOME A SELLER", INVITING BUT CALM. The owner asked for it to be
  noticeable without being a badge: a pale violet row among the plain ones,
  its words in the purple, a store rather than a sparkle. It goes to /sell,
  which decides what a buyer who wants to sell sees next.
*/
/*
  WHAT THE WAY INTO SELLING SAYS, by the account's seller state, the same
  three the profile shows (sellingEntry in lib/account/overview.ts): a seller
  gets Dashboard (drawn by the caller), a seller who began the setup and left
  it gets "Finish setting up your store", and a buyer who never began gets
  "Become a seller". Both of the last two open /sell, which picks up where
  the setup was left.
*/
export const sellingLabel = (state: SellerState) => (state === "started" ? "Finish setting up your store" : "Become a seller")

function BecomeSellerRow({ link, onDone, state = "none" }: { link: HeaderLink; onDone: () => void; state?: SellerState }) {
  const { href, onClick } = link("/sell")
  return (
    <Link
      href={href}
      onClick={(e) => { onClick(e); onDone() }}
      data-seller-state={state}
      data-become-seller=""
      className="flex touch-manipulation items-center justify-between rounded-xl bg-[#f5f3ff] px-4 py-3.5 text-base font-medium text-violet-700 transition-colors hover:bg-[#ede9fe] active:bg-[#ede9fe] [-webkit-tap-highlight-color:transparent] outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    >
      <span className="flex items-center gap-3">
        <Store aria-hidden className="h-5 w-5 text-[#8b5cf6]" />
        <span>{sellingLabel(state)}</span>
      </span>
      <ChevronRight aria-hidden className="h-5 w-5 text-violet-400" />
    </Link>
  )
}

// tapStartPos / handleTapStart / makeTapEnd removed — the MobileBottomSheet
// drag threshold is now ≤56 px so category buttons below that zone never
// have their click events suppressed. Plain onClick is sufficient.

/**
 * ===========================================================================
 *  THE COUNT ON THE HEART, CENTRED
 * ===========================================================================
 * "The number in the red badge is not centred." It was a 17px disc with the
 * digits set at `line-height: 1` and centred as a line: that centres the
 * font's line box (ascender to descender), not the figures, so how far the
 * ink sat from the middle depended on the font's metrics and on where an odd
 * 17px box fell on the pixel grid at 1x, 2x and 3x.
 *
 * Now the box the flexbox centres IS the figures: `text-box` trims the line
 * to cap height over the baseline (figures are cap height in Inter), so the
 * middle of that box is the middle of the ink, whatever the font. The disc
 * is an even 18px in border-box; tabular figures so 1 and 7 take the same
 * width. Where a browser has no `text-box`, `leading-none` is the fallback.
 *
 * AND ON A 1x SCREEN IT SITS ON A WHOLE PIXEL. The header's rows are not
 * whole pixels tall, so the disc lands a fraction of a pixel down the page,
 * while the browser puts a line of text on a whole pixel: on a screen whose
 * pixel is a whole CSS pixel that rounded the figures and their disc apart
 * by up to a pixel (measured 0.67px on a computer). There the badge is moved
 * onto the nearest pixel after layout, and again when the window changes
 * size or the header settles: by its own margin, under half a pixel, and it
 * is absolutely placed, so nothing around it moves. Its layout position and
 * not a `translate`: a `translate` moves the drawing after the text has been
 * put on its pixel, and measured, that left the figures a pixel high. At 2x and 3x
 * the grain is fine enough that the same move made things worse, so it is
 * left alone.
 *
 * scripts/check-buyer-chrome.mjs finds the white figures in screenshots and
 * measures them against the disc, for 1, 5, 9, 12 and 99+
 * at 1x, 2x and 3x: within 0.35px, where the old badge was 0.54px low on a
 * 3x phone (0.7px at 2x) and up to 1.9px off in a fallback face.
 */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const snap = () => {
      el.style.marginTop = ""
      /* At 2x and 3x a pixel of the screen is a third or half of one of these, fine enough to leave. */
      if ((window.devicePixelRatio || 1) >= 1.5) return
      const top = el.getBoundingClientRect().top
      const off = Math.round(top) - top
      if (Math.abs(off) > 0.01) el.style.marginTop = `${off.toFixed(3)}px`
    }
    snap()
    window.addEventListener("resize", snap)
    /* The header's rows settling (a photo, a font) move it too. */
    const header = el.closest("#platform-header-root")
    const ro = header && typeof ResizeObserver !== "undefined" ? new ResizeObserver(snap) : null
    if (ro && header) ro.observe(header)
    return () => {
      window.removeEventListener("resize", snap)
      ro?.disconnect()
    }
  }, [count])
  if (count <= 0) return null
  return (
    <span
      ref={ref}
      data-count-badge=""
      className={cn(
        "box-border flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-[5px] text-white ring-2 ring-black",
        className,
      )}
    >
      <span className="block text-[10px] font-semibold leading-none tabular-nums [font-feature-settings:'tnum'] [text-box:trim-both_cap_alphabetic]">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  )
}

// Animated Hamburger Icon Component - subtle animation only
/*
 * The three lines of the menu button. Opening the sheet dims them and draws
 * the middle one shorter, and nothing else: by opacity and `scale` about its
 * middle, on the compositor, never by width. A width animating in the
 * header laid the header out again on every frame of the sheet's slide,
 * which is the one moment nothing else should be asking for a frame.
 */
function AnimatedHamburger({ isOpen }: { isOpen: boolean }) {
  const line = "block h-0.5 w-[23px] rounded-full bg-current transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
  return (
    <div className="w-[23px] h-[23px] flex flex-col justify-center items-center gap-[5px]" data-hamburger={isOpen ? "open" : "closed"}>
      <span className={cn(line, isOpen ? "opacity-60" : "opacity-100")} />
      <span className={cn(line, isOpen ? "opacity-60 scale-x-[0.6957]" : "opacity-100 scale-x-100")} />
      <span className={cn(line, isOpen ? "opacity-60" : "opacity-100")} />
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
  /*
    SEEDED BEFORE THE FIRST PAINT, NOT IN THE FIRST RENDER. The snapshot lives
    in localStorage, which the server cannot see: seeding useState from it
    meant the server drew the waiting stand in and a returning visitor's
    browser drew their photo in the same hydration pass, React reported the
    mismatch and redrew the header from scratch. Now the server and the
    browser's first render agree (the stand in), and the snapshot is applied
    in a layout effect, which runs after hydration and before the browser
    paints again: no warning, and no frame of the stand in beyond the one the
    server's HTML already showed. A header mounted later, on a client side
    move between layouts, takes the same path and paints the photo in its
    first frame.
  */
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isCreator, setIsCreator] = useState(false)
  const [hasCompletedSellerOnboarding, setHasCompletedSellerOnboarding] = useState(false)
  /* The whole seller state, for what the way into selling says (sellingLabel). */
  const [sellerState, setSellerState] = useState<SellerState>("none")
  const [loading, setLoading] = useState(true)
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
      /* A layout convenience: only with Preferences allowed (lib/consent). */
      if (hasConsent("preferences")) document.cookie = `storelib_wishlist_count=${next}; path=/; max-age=31536000; samesite=lax`
    } catch {
      /* cookies unavailable — the badge is still correct for this page */
    }
  }, [])
  // Persist avatar URL so it shows immediately on re-renders/navigations (no placeholder flash)
  const [cachedAvatarUrl, setCachedAvatarUrl] = useState<string | null>(null)

  /* The snapshot, applied after hydration and before paint (see the note above `user`). */
  useLayoutEffect(() => {
    const seed = readAuthSnapshot()
    let avatar: string | null = null
    try { avatar = localStorage.getItem("_sl_avatar") } catch { /* no storage: nothing cached */ }
    if (avatar) setCachedAvatarUrl(avatar)
    if (!seed) return
    if (seed.signedIn && seed.userId) {
      setUser({ id: seed.userId } as User)
      setProfile({ display_name: seed.displayName, avatar_url: seed.avatarUrl, username: seed.username } as Profile)
    }
    setIsCreator(!!seed.isSeller)
    setHasCompletedSellerOnboarding(!!seed.isSeller)
    setSellerState(seed.isSeller ? "seller" : "none")
    setLoading(false)
  }, [])

  const mountedRef = useRef(true)

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "")
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchProduct[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false)
  /*
    THE MENU STAYS ON SCREEN WHILE IT LEAVES. It was drawn only while open,
    so a click away took it off in the same frame: a white panel gone from
    one frame to the next, which is the snap the owner saw. `present` keeps it
    in the tree through its exit transition and lets go when that ends (at
    once under reduced motion, where there is none, and after 600ms whatever
    happens, so it can never be left behind).
    Set during render when it opens, so the opening frame already has it.
  */
  const [categoriesPresent, setCategoriesPresent] = useState(false)
  if (categoriesDropdownOpen && !categoriesPresent) setCategoriesPresent(true)
  useEffect(() => {
    if (categoriesDropdownOpen || !categoriesPresent) return
    /* No transition runs under reduced motion, so nothing would end: let go now. */
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const t = window.setTimeout(() => setCategoriesPresent(false), still ? 0 : 600)
    return () => window.clearTimeout(t)
  }, [categoriesDropdownOpen, categoriesPresent])
  /* Escape closes it wherever focus is, not only from inside the panel. */
  useEffect(() => {
    if (!categoriesDropdownOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setCategoriesDropdownOpen(false)
      document.querySelector<HTMLElement>("[data-categories-dropdown] > button")?.focus({ preventScroll: true })
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [categoriesDropdownOpen])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  /* Counts the menu sheet's closes, so its kept category list starts again from the top. */
  const [menuRound, setMenuRound] = useState(0)
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false)
  /* Below 768px, where the header opens sheets rather than dropdowns. */
  const belowMd = useBelowMd()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
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
  }, [pathname])

  // Close desktop dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      // Never interfere with mobile sheet portals. These render to document.body
      // outside the header DOM tree, so they always appear "outside" the header.
      // Without this guard, every tap inside the bottom sheet fires mousedown on
      // document and closes things that are not what was tapped.
      if (
        target.closest('[data-app-sheet]') ||
        target.closest('[data-mobile-bottom-sheet]') ||
        target.closest('[data-mobile-top-sheet]')
      ) {
        return
      }
      // Only close if clicking completely outside the dropdown
      if (!target.closest('[data-categories-dropdown]')) {
        setCategoriesDropdownOpen(false)
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

        /*
          ═══════════════════════════════════════════════════════════════════
           ONE LETTER IS A SEARCH, AND A TITLE IS NOT THE ONLY THING TO MATCH
          ═══════════════════════════════════════════════════════════════════
          This asked `title ilike %v%` and nothing else, so "m" found only
          products with an m in their name and nothing by a creator called
          Marcus, and nothing whose description says what it is.

          A search term goes into a PostgREST filter STRING, where a comma
          separates one filter from the next and a parenthesis opens a group.
          Typing a comma therefore did not search for a comma, it produced a
          malformed filter and no results at all. So the term is stripped of
          the characters that mean something to the grammar before it is used.
        */
        const term = value.trim().replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim()
        if (!term) {
          setSearchResults([])
          return
        }

        const SELECT = `
            id,
            title,
            slug,
            thumbnail_url,
            price_cents,
            compare_at_cents,
            pay_what_you_want,
            pwyw_min_price_cents,
            type,
            creator_id,
            creators!inner (
              display_name,
              slug,
              username
            )
          `

        /* Two questions at once: products that say it, and products by
           somebody called it. */
        const [byText, byCreator] = await Promise.all([
          supabase
            .from("products")
            .select(SELECT)
            .or(`title.ilike.%${term}%,description.ilike.%${term}%`)
            .eq("status", "published")
            .limit(8),
          supabase
            .from("products")
            .select(SELECT)
            .or(`display_name.ilike.%${term}%,username.ilike.%${term}%,slug.ilike.%${term}%`, {
              referencedTable: "creators",
            })
            .eq("status", "published")
            .limit(8),
        ])

        const error = byText.error
        /* Titles first, then the creator matches that are not already in. */
        const seen = new Set<string>()
        const data = [...(byText.data || []), ...(byCreator.data || [])].filter((p: any) => {
          if (!p?.creators || seen.has(p.id)) return false
          seen.add(p.id)
          return true
        }).slice(0, 8)

        if (!error && data) {
          const results = data.map((p: any) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            thumbnail_url: p.thumbnail_url,
            price_cents: p.price_cents,
            compare_at_cents: p.compare_at_cents,
            pay_what_you_want: p.pay_what_you_want,
            pwyw_min_price_cents: p.pwyw_min_price_cents,
            type: p.type,
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

    const loadUser = async (isInitial = false): Promise<string | null | undefined> => {
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
          setSellerState("none")
          return
        }

        if (!mountedRef.current) return user.id
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
          /*
            THE PROFILE COULD NOT BE READ, BUT THE CREATORS ROW WAS. That row is
            the one that says whether onboarding is finished, so it still
            decides: a seller whose profile read failed is a seller, not a
            buyer offered the onboarding again.
          */
          const state = sellerAccessFrom({ creator: creatorData, profile: null }).state
          setIsCreator(state === "seller")
          setHasCompletedSellerOnboarding(state === "seller")
          setSellerState(state)
        } else {
          const pd = (profileData as Profile) ?? null
          setProfile(pd)
          // Persist avatar so the next render (or next page load) shows it immediately
          const freshAvatar = pd?.avatar_url || null
          setCachedAvatarUrl(freshAvatar)
          try {
            /* A removed photo is forgotten here too, or the next page would open on it. */
            if (freshAvatar) localStorage.setItem("_sl_avatar", freshAvatar)
            else localStorage.removeItem("_sl_avatar")
          } catch {}
          // SELLER ACCESS: the shared answer (lib/account/seller-access.ts), worked
          // out from the two rows read just above, so it costs no third query.
          // Only "seller" is seller access; an onboarding begun and not finished
          // ("started") is still a buyer here. It decides Dashboard against Become
          // a seller everywhere in this header, and it is written to the snapshot
          // so the next page opens on the right one.
          const access = sellerAccessFrom({ creator: creatorData, profile: profileData })
          const isSellerByState = hasSellerAccess(access)
          setIsCreator(isSellerByState)
          setHasCompletedSellerOnboarding(isSellerByState)
          setSellerState(access.state)
          writeAuthSnapshot({
            signedIn: true,
            userId: user.id,
            avatarUrl: freshAvatar,
            displayName: pd?.display_name ?? null,
            username: pd?.username ?? null,
            isSeller: isSellerByState,
          })
        }
        return user.id
      } catch {
        if (!mountedRef.current) return
        setUser(null)
        setProfile(null)
        setIsCreator(false)
        setHasCompletedSellerOnboarding(false)
        setSellerState("none")
      } finally {
        if (!mountedRef.current) return
        setLoading(false)
        setInitialLoadDone(true)
      }
    }

    /*
      ONE READ OF WHO IS SIGNED IN, NOT THREE. Supabase answers a new
      subscription at once (INITIAL_SESSION) and, for a session read from
      the cookie, again (SIGNED_IN), for the same person the read on mount
      is already asking about. Each answer ran that read again, the user,
      the profile and the creator row, and the wishlist count with them:
      three calls to Supabase Auth and three to /api/wishlist on every
      creator page a signed in person opened (scripts/check-creator-page-
      audit.mjs). Now an event reads again only when it names somebody
      other than the last read found, or the user's own details changed.
    */
    let loadedFor: Promise<string | null> = loadUser(true).then((id) => id ?? null)

    const { data } = supabase.auth.onAuthStateChange((event: string, session: { user?: { id?: string } } | null) => {
      const id = session?.user?.id ?? null
      loadedFor = loadedFor.then((was) => {
        if (event !== "USER_UPDATED" && was === id) return was
        fetchWishlistCount()
        return loadUser(false).then((now) => now ?? null)
      })
    })

    return () => {
      mountedRef.current = false
      window.clearTimeout(failSafe)
      data?.subscription?.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchWishlistCount])

  /*
    A SELLER'S WAY IN IS THE DASHBOARD; EVERYBODY ELSE'S IS /sell. /sell is
    the one door to selling (it sends a guest to sign up with the intent kept,
    a buyer into seller onboarding and a seller to /app), so no link here
    decides that for itself any more.
  */
  const dashboardHref = hasCompletedSellerOnboarding ? "/app" : "/sell"

  const wishlistHref = useMemo(() => {
    return user ? "/library/wishlist" : "/wishlist"
  }, [user])

  // profiles.avatar_url is the single source of truth (lib/account/avatar): no
  // fallback to the Google picture, so a photo removed in Settings stays removed.
  // cachedAvatarUrl seeds from localStorage so the correct avatar shows on the FIRST render
  // (before the async profile fetch resolves), preventing the placeholder flash.
  /*
    AND A PHOTO JUST CHANGED IS THIS ONE, WITHOUT A RELOAD. Everything in
    /app already reads the shell's copy (lib/account/avatar-store), which
    Settings writes the moment it saves or removes a picture, in this tab
    and in every other one. This header did not: it asked the database once
    on mount and then kept that answer, so changing your photo in Settings
    left the old one in the black bar until the next full load. It reads
    the same copy now, and falls back to what it fetched, so "it updates
    the profile image in realtime, in the top bar and in the header".
  */
  const avatarUrl = useShellAvatar(profile ? profile.avatar_url : cachedAvatarUrl) || undefined

  const displayName =
    profile?.display_name ||
    profile?.username ||
    ((user?.user_metadata as any)?.full_name as string | undefined) ||
    (user?.email ? user.email.split("@")[0] : "User")

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: "local" })
    setMobileProfileOpen(false)
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
  /*
    ═══════════════════════════════════════════════════════════════════════
     WHERE THE PHONE'S TAB BAR IS, THE HEADER DOES NOT REPEAT IT
    ═══════════════════════════════════════════════════════════════════════
    "When logged in, on phones where the bottom tab bar shows, do not show
    the Library icon in the header (it's in the tab bar). Anything else the
    tab bar duplicates should go too, but keep the wishlist heart and the
    avatar." So on those pages the phone row is the menu, the logo, the
    heart and the photo; the search strip that followed the page down under
    the header is the tab bar's Search now; and the menu sheet loses its My
    Library row and its search link. The same answer the bar itself uses
    (lib/nav/use-buyer-tabs-where), so nothing goes where the bar is not.
    Both are drawn below 768px only, so a computer is untouched.
  */
  const tabsHere = useBuyerTabsHere(pathname)
  /*
    AND THE LIBRARY AND THE ACCOUNT HAVE NO SEARCH STRIP AT ANY WIDTH. It
    was "Search for anything" over the owner's own purchases (image 25),
    a marketplace search on the one page that is not the marketplace.
  */
  const isOwnPages = pathname === "/library" || pathname.startsWith("/library/") || pathname === "/account" || pathname.startsWith("/account/")
  /* The phone's strip: its line is still 8px from the top of the window. */
  const searchInHeader = useSearchHandoff(isExploreSurface)
  /**
   * HOW TALL THE STICKY BAR IS, so the phone's search strip can sit under it
   * and stick too.
   *
   * The strip is a SIBLING of #platform-header-root, not a child, and it has
   * to stay one: on native that element is `position: fixed` with an explicit
   * height, so a child that appears and disappears would be clipped by it or
   * would change a height three other rules depend on. Measured on the phone
   * and confirmed: the header's search worked on a desktop, where the field
   * is inside the bar, and did nothing on a phone, where the strip scrolled
   * away with the page.
   */
  const headerRootRef = useRef<HTMLDivElement | null>(null)
  const [headerH, setHeaderH] = useState(0)
  useEffect(() => {
    const el = headerRootRef.current
    if (!el) return
    const measure = () => setHeaderH(Math.round(el.getBoundingClientRect().height))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  /*
    THE DESKTOP FIELD'S LINE IS THE BOTTOM OF THIS BAR. "It needs to appear
    smooth, when I start scrolling down past the initial search bar under the
    Discover heading." The field arrives as the page's own goes under the
    header, not 60px later when it leaves the window, and it fades in rather
    than popping. Until the bar is measured the old line stands in.
  */
  const deskHandoff = useSearchHandoffState(isExploreSurface, headerH || WINDOW_SLACK)
  /*
    ═══════════════════════════════════════════════════════════════════════
     THE BAR DOES NOT GO ANYWHERE ANY MORE
    ═══════════════════════════════════════════════════════════════════════
    #252 hid it in the band between "scrolled past the bar" and "scrolled past
    the search", with a second reading of the document so a page too short for
    the search to scroll away could not hide it for ever. The owner has asked
    for it sticky always, so both readings and the translate are gone rather
    than left behind switched off: two scroll listeners and a resize listener
    that feed nothing are cost with no behaviour attached.

    What stays is the handoff. searchInHeader still decides whether the bar
    carries a search field, because that is a different question from whether
    the bar is on screen.
  */

  /* Both spellings of a product: `/p/<slug>` still resolves and redirects,
     and `/<handle>/<slug>` is what everything hands out now. */
  const isDiscoverProductContext = isProductPage(pathname) && isDiscoverMode(pathname, searchParams)
  const isSellerOrProductPage = isSellerPage(pathname) || pathname.startsWith("/s/")

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  A BACK NAVIGATION MUST NOT LEAVE THE TOP OF THE WINDOW EMPTY
   * ═══════════════════════════════════════════════════════════════════════
   * On a product page this bar is `relative`: it scrolls away and the page's
   * own creator bar takes the top. That is right while somebody is reading a
   * product, and wrong for the moment in between two pages.
   *
   * Going back from a product to the marketplace, the window is put at the
   * destination's scroll offset BEFORE the destination has rendered. Safari
   * does it on popstate; Chromium waits for the commit, which is why no probe
   * here had ever seen it. Filmed on a phone, three frames at 60fps with no
   * header at all and page content running up under the browser's own chrome:
   *
   *     4389ms   product page, bar at the top
   *     4406ms   no bar, content at the top of the window
   *     4423ms   no bar
   *     4439ms   no bar
   *     4456ms   the bar is back
   *
   * Asked for explicitly in Chromium — the same scroll one tick before the
   * pop — it is the same picture, and it names the cause: the root sits at
   * `top: -900px`, which is a `relative` element on a page scrolled 900px.
   *
   * So for as long as a pop is in flight the bar is pinned, whatever surface
   * it thinks it is on. Arriving on a product page it unpins at the commit,
   * and a product page is at the top of itself when you arrive, where pinned
   * and unpinned are the same picture. Bounded by a timer as well as by the
   * commit, because a pop that changes nothing would otherwise pin it for
   * good.
   */
  /*
    A CLASS ON <html>, NOT A PIECE OF STATE, because the browser scrolls the
    page you are leaving DURING the pop and React re-renders after it. State
    arrives a frame late, and a frame is what this bug is made of. The
    listener writes the class synchronously and app/globals.css pins the bar
    off it; the effect below takes it off once the new route is up, and the
    timer takes it off when a pop changes nothing.
  */
  useEffect(() => {
    let timer = 0
    const clear = () => {
      window.clearTimeout(timer)
      document.documentElement.classList.remove("pop-in-flight")
    }
    const onPop = () => {
      document.documentElement.classList.add("pop-in-flight")
      window.clearTimeout(timer)
      timer = window.setTimeout(clear, 700)
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      clear()
    }
  }, [])
  /* The new route is up: the surface is whatever the new pathname says. */
  useEffect(() => {
    document.documentElement.classList.remove("pop-in-flight")
  }, [pathname])
  const isBlogRoute = pathname === "/blog" || pathname.startsWith('/blog/')
  const isFaqRoute = pathname === "/faq"
  /*
    The Storelib Developer Hub is read, like the blog, rather than shopped.
    It takes the blog's header: the marketing links, no marketplace search
    strip laid over its first lines on a phone, and the same curved edge.
  */
  const isDevelopersRoute = pathname === "/developers" || pathname.startsWith("/developers/")
  const isMarketingNavRoute = pathname === "/" || pathname === "/features" || pathname === "/pricing" || isBlogRoute || isFaqRoute || isDevelopersRoute

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
      /*
        A CLICK THIS SWALLOWED IS A LINK THAT DOES NOTHING.
        On the apex domain in a browser neither branch above runs, and the
        <Link> default is what navigates. If a caller already cancelled that
        default (closing a sheet, say) the tap goes nowhere and the page never
        loads. That is what happened to My Library. Carry the navigation
        ourselves rather than dropping it.
      */
      if (e.defaultPrevented) router.push(targetPath)
    },
    [navigateToCanonical, shouldForceCanonicalNav, router],
  )

  const getCanonicalOrRelativePath = useCallback((targetPath: string) => {
    return shouldForceCanonicalNav ? toCanonicalUrl(targetPath) : targetPath
  }, [shouldForceCanonicalNav, toCanonicalUrl])

  /* The href and the click for one path, in the form the buttons above take. */
  const headerLink: HeaderLink = useCallback(
    (path: string) => ({ href: getCanonicalOrRelativePath(path), onClick: (e: React.MouseEvent<HTMLElement>) => onCanonicalNav(e, path) }),
    [getCanonicalOrRelativePath, onCanonicalNav],
  )

  // Detect active category from URL
  const activeCategoryId = useMemo(() => {
    if (pathname.startsWith("/explore/")) {
      const seg = pathname.split("/explore/")[1]?.split("/")[0]?.split("?")[0]
      return seg || "all"
    }
    /* Explore writes `c` now and still reads `category` (app/(marketing)/explore/page.tsx). */
    return searchParams.get("c") || searchParams.get("category") || "all"
  }, [pathname, searchParams])
  const activeSubId = searchParams.get("sub")

  /* A pick from either category list: where the old menu's link went. */
  const pickCategory = useCallback((groupId: string, itemId: string | null) => {
    setCategoriesDropdownOpen(false)
    setMobileMenuOpen(false)
    navigateToExploreCategory(hrefFor(groupId, itemId) + "&scroll=recommended")
  }, [navigateToExploreCategory])
  const browserSelection = pathname.startsWith("/explore") && activeCategoryId !== "all"
    ? { group: activeCategoryId, item: activeSubId }
    : { group: null, item: null }

  /*
    DASHBOARD, FOR AN ACCOUNT WITH SELLER ACCESS ONLY. A buyer sees no
    Dashboard and no Start selling beside their photo; their way to selling
    is Become a seller in the account menu and the phone sheet. Filled purple
    with the shared `rounded-action` corner, the same button as Sign up.
  */
  const sellerDashboardButton = hasCompletedSellerOnboarding ? (
    <Link
      {...headerLink("/app")}
      data-header-dashboard=""
      className={cn("inline-flex h-[42px] items-center whitespace-nowrap rounded-action bg-violet-600 px-5 text-[15px] font-[550] text-white transition-colors hover:bg-violet-700", DARK_FOCUS)}
    >
      {t("dashboard")}
    </Link>
  ) : null

  /*
    THE PHOTO IS THE WAY TO THE ACCOUNT, ON A COMPUTER. The owner: "just the
    normal buyer controls and the avatar (-> /account)". It opened a menu of
    Dashboard, My Library, Settings, Language and Log out; every one of those
    is now either in the bar already (Dashboard for a seller, the library
    icon) or on /account (settings, language, selling, log out), so the photo
    goes there itself, as a plain link a screen reader names and a keyboard
    reaches in one stop.
  */
  const desktopAccountMenu = user ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          {...headerLink("/account")}
          aria-label="Your account"
          data-header-avatar=""
          className="rounded-full cursor-pointer outline-none ring-offset-black transition-all duration-150 ease-out hover:ring-2 hover:ring-violet-400 hover:ring-offset-2 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
        >
          <AppAvatar src={avatarUrl} name={(displayName || "").trim()} alt="" size={42} className="border border-gray-200 transition-opacity duration-150" />
        </Link>
      </TooltipTrigger>
      <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
        Your account
      </TooltipContent>
    </Tooltip>
  ) : null

  return (
    <>
      <div ref={headerRootRef} id="platform-header-root" className={cn(
        /*
          A LITTLE DEPTH, SO THE BAR SITS OVER THE PAGE RATHER THAN ABUTTING
          IT. `platform-header-depth` is the shared --bar-depth-dark, the same
          value the creator page's and the product page's bars use, so the
          three strips a visitor moves between sit at the same height. Black
          rather than slate because a slate shadow under a black bar is
          lighter than the bar and reads as a halo at the seam.
        */
        "platform-header-depth z-40 w-full bg-black backdrop-blur supports-[backdrop-filter]:bg-black",
        isSellerOrProductPage ? "relative" : "sticky top-0",
      )}>
    <header className={cn("w-full bg-black", !(isNativePlatform() && isSellerOrProductPage) && "border-b border-white/10")}>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div
          /*
            THREE PERCENT OFF, MEASURED ON THE DEPLOYED PAGE RATHER THAN
            ARITHMETIC.

            The first version of this note added the two 3px rails to the row
            and called the header 83px. That is wrong: Tailwind sets
            box-sizing: border-box, so `h-[77px]` INCLUDES its own padding.
            Measured on production the row is the height named here and the
            root is one pixel more:

                77px     the original
                74.5px   3.2% off
                70.75px  another 5% off that
                69.35px  and a further 2%

            and the measured root is one pixel more than whichever of those
            the row is set to. The padding is left alone on purpose — it holds
            the contents clear of the window edge, and taking the height out
            of it would have moved them rather than shortened the bar.
          */
          /* pb-[10.3px]: the phone half of the 5% cut, the other half being the
             padding-top in .platform-header-row. The md rails are untouched. */
          className="platform-header-row flex md:h-[69.35px] items-center justify-between gap-4 pb-[10.3px] md:pb-[3px]"
        >
          {/* Desktop Homepage Layout - same style for /, /features, /pricing, /blog */}
          {isMarketingNavRoute ? (
            <>
              {/* Homepage Desktop Header */}
              <div className="hidden md:flex items-center justify-between w-full">
                {/* Left - Logo - refreshes main page */}
                <Link href="/" onClick={(e) => { e.preventDefault(); if (isNativePlatform()) { router.push("/") } else { window.location.href = "/" } }} className="shrink-0 flex items-center gap-2">
                  <StorelibLogo size={HEADER_LOGO.desktop} priority />
                  <span className="text-[21px] font-bold text-white tracking-tight">Storelib</span>
                </Link>

                {/* Center - Nav Links (show for all users). On a tablet they
                    close up and Home goes (the logo is Home), so the owner's
                    four on the right still fit beside them at 768px. */}
                <nav className="flex items-center gap-1 lg:gap-2">
                  {[
                    { href: "/", label: "Home", active: pathname === '/', wide: true },
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
                        "px-3 lg:px-4 py-2 text-[14px] lg:text-[15px] font-medium rounded-full border transition-[background-color,border-color,color,scale] duration-180 ease-out",
                        "wide" in item && item.wide && "hidden lg:inline",
                        item.active
                          ? "border-white/20 bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                          : "border-transparent text-white/70 hover:text-white hover:bg-white/10 hover:border-white/15 active:scale-[0.98]",
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>

                {/*
                  Right: a guest gets the owner's row in full (a rule, Sell on
                  Storelib, Log in, Sign up). Signed in, the same things as on
                  the buyer pages: Discover and the library as icons, Dashboard
                  only for a seller, and the photo.
                */}
                <div className="flex items-center gap-2.5">
                  {loading ? (
                    <GuestHeaderActions withLogin link={headerLink} placeholder />
                  ) : user ? (
                    <>
                      {/* Discover icon */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            {...headerLink("/explore")}
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            {...headerLink("/library")}
                            /* From lg: on a tablet the photo's menu has My Library. */
                            className="hidden lg:flex h-[42px] w-[42px] items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                            aria-label={t("library")}
                          >
                            <Library className="h-[22px] w-[22px]" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                          My Library
                        </TooltipContent>
                      </Tooltip>
                      {sellerDashboardButton}
                      {desktopAccountMenu}
                    </>
                  ) : (
                    <GuestHeaderActions withLogin link={headerLink} />
                  )}
                </div>
              </div>

              {/* Mobile Homepage/Marketing Header - Logo left, hamburger right.
                  min-h-[42px]: the 42px logo used to set this row's height, and
                  at 39.9px it would take the bar 2px under the 64.6px that
                  conditional-header's placeholder reserves, a jump on every load. */}
              <div className="md:hidden flex min-h-[42px] items-center justify-between w-full">
                {/* Left - Logo */}
                <div className="flex items-center gap-0">
                  <Link href="/" onClick={(e) => { e.preventDefault(); if (isNativePlatform()) { router.push("/") } else { window.location.href = "/" } }} className="shrink-0 flex items-center gap-1.5">
                    <StorelibLogo size={HEADER_LOGO.marketingPhone} priority />
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
                  <StorelibLogo size={HEADER_LOGO.desktop} priority />
                  <span className="text-[21px] font-bold text-white tracking-tight">Storelib</span>
                </Link>

                {/* Categories Dropdown Button with Tooltip */}
                <div className="relative hidden md:block" data-categories-dropdown>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setCategoriesDropdownOpen(!categoriesDropdownOpen)}
                    aria-expanded={categoriesDropdownOpen}
                    aria-haspopup="true"
                    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-[15px] font-medium transition-colors duration-150 cursor-pointer ${
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

              {/*
                THE SAME LIST AS EXPLORE'S MORE PICKER, HANGING FROM THE BUTTON.
                Plain rows, a chevron where a category opens and a tick on the
                one you are on; a category's subcategories slide in as a level
                of their own with a back row, instead of replacing the list
                with a "Back to Categories" link over a violet icon and a Hot
                badge. See components/explore/category-browser.
              */}
              {/*
                IN AND OUT BY TRANSITION, NOT BY KEYFRAMES. It opens from its
                `starting:` values (@starting-style) and closes by the same
                transition run backwards: a fade with a 4px lift and a hair of
                scale toward the button, 160ms in and 140ms out. A transition
                reverses from wherever it is, so a click that reopens it while
                it is leaving turns it round instead of restarting it.
                Opacity, `scale` and `translate` only (Tailwind's scale-* and
                translate-y-* are those properties, not `transform`), on a
                panel that is `absolute`, so nothing behind it moves. Leaving,
                it takes no pointer and no focus, so a row under the cursor
                cannot light up on its way out.
              */}
              {categoriesPresent && (
                <div
                  data-header-categories=""
                  data-state={categoriesDropdownOpen ? "open" : "closed"}
                  role="dialog"
                  aria-label="Categories"
                  inert={categoriesDropdownOpen ? undefined : true}
                  onTransitionEnd={(e) => {
                    if (e.target === e.currentTarget && e.propertyName === "opacity" && !categoriesDropdownOpen) setCategoriesPresent(false)
                  }}
                  className={cn(HEADER_MENU_PANEL, categoriesDropdownOpen ? HEADER_MENU_OPEN : HEADER_MENU_LEAVING)}
                >
                  <CategoryBrowser
                    groups={HEADER_GROUPS}
                    selectedGroup={browserSelection.group}
                    selectedItem={browserSelection.item}
                    onPick={pickCategory}
                    phone={false}
                    heading="Browse categories"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Desktop Search - Centered with Modal (10% larger) */}
          {/*
            HIDDEN RATHER THAN NOT RENDERED, NOW. It used to be absent while
            Explore's own field was on screen and mounted when that field
            went, which is a field popping into the bar and, with the row
            being justify-between, the only thing that decided where the
            middle of the bar was. The owner asked for it to arrive smoothly
            and with nothing in the header moving: so it is always here on a
            computer, holding its own width (the logo and the actions sit at
            the ends of the row either way, so the empty middle is the same
            empty middle), and it fades in with a few pixels of drop.

            Opacity and `translate` only (Tailwind's translate-y is the
            `translate` property, so that is what the transition names), and
            `visibility` so a hidden field is out of the tab order once it has
            faded. Arriving on a page puts it where it belongs without a fade
            (`animate` is false), so a back navigation never flashes it. Held
            while its results are open, so it never leaves from under typing.
            See lib/explore/use-search-handoff.
          */}
          {(() => {
            const shown = deskHandoff.inHeader || searchModalOpen
            return (
          <div
            data-header-search={shown ? "shown" : "hidden"}
            aria-hidden={shown ? undefined : true}
            inert={shown ? undefined : true}
            className={`hidden md:flex flex-1 max-w-xl mx-4 relative transition-[opacity,translate,visibility] motion-reduce:transition-none ${
              shown
                ? "visible opacity-100 translate-y-0 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
                : "invisible pointer-events-none opacity-0 -translate-y-1 duration-150 ease-[cubic-bezier(0.4,0,1,1)]"
            }`}
            style={deskHandoff.animate ? undefined : { transitionDuration: "0ms" }}
          >
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/40 pointer-events-none z-10" />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setSearchModalOpen(true)}
                placeholder={t("search_placeholder")}
                className={`h-[42px] w-full pl-11 pr-4 bg-white/10 border-white/15 text-white text-[15px] placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white/45 focus:border-white/45 ${isDiscoverProductContext ? "rounded-[8px]" : "rounded-full"}`}
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
                            {listPrice(product).main}
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
            )
          })()}

          {/* Mobile Header for Non-Homepage pages */}
          <div className="md:hidden flex items-center justify-between flex-1 -ml-6">
            {/* Hamburger + Logo left, icons right */}
            <div className="flex items-center gap-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                /*
                  THE SLACK WAS THERE AND THE LOGO WAS EATING HALF OF IT.

                  This is 36px of icon with a pseudo-element extending the
                  touch target ten pixels all round — and the logo link sits
                  immediately to its right with `gap-0`, later in the DOM, so
                  on the right-hand side the logo won the hit test and a near
                  miss navigated to Explore instead of opening the menu.

                  `z-10` puts the button's target above its neighbour, and the
                  slack is asymmetric now: generous to the left, where the
                  screen edge is and a thumb undershoots, and up and down;
                  barely any to the right, where the logo is a legitimate
                  target of its own.
                */
                className="relative z-10 flex h-9 w-9 touch-manipulation items-center justify-center text-white transition cursor-pointer before:absolute before:-left-4 before:-top-3 before:-bottom-3 before:-right-1.5 before:content-['']"
                aria-label={mobileMenuOpen ? "Close categories" : "Open categories"}
              >
                <AnimatedHamburger isOpen={mobileMenuOpen} />
              </button>

              {/* Logo next to hamburger - links to /explore */}
              <Link href="/explore" onClick={(e) => onCanonicalNav(e, "/explore")} className="shrink-0 flex items-center gap-1.5">
                <StorelibLogo size={HEADER_LOGO.phone} priority />
                <span className="text-[19px] font-bold text-white tracking-tight">Storelib</span>
              </Link>
            </div>

            {/* Right - Mobile Icons */}
            <div className="flex items-center gap-1">
              {/* Library - only show when logged in and the tab bar is not there
                  to carry it; h-[42px] w-[42px] = 44px tap target */}
              {user && !tabsHere && (
                <Link
                  href={getCanonicalOrRelativePath("/library")} onClick={(e) => { onCanonicalNav(e, "/library"); setMobileProfileOpen(false) }}
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
                    /*
                        A BADGE, NOT A BLISTER ON THE ICON.

                        It was 14px with 7px type, pushed half off the heart's
                        top-right corner, so the number was barely legible and
                        the disc read as part of the outline rather than as a
                        count sitting on top of it.

                        Bigger, and ringed in the header's own black: the ring
                        punches a gap between the disc and the heart, which is
                        what makes a notification badge read as a separate
                        object on every app that has one. tabular-nums so 7
                        and 77 do not shift the disc sideways.
                      */
                      <CountBadge count={wishlistCount} className="absolute -top-1.5 -right-2" />
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
                  <AppAvatar src={avatarUrl} name={(displayName || "").trim()} alt="" size={32} className="border border-gray-200" />
                </button>
              ) : (
                /* The white Sign in the owner asked to keep on a phone. One link,
                   drawn as the button (not a button inside a link, which a screen
                   reader announces as two controls and a keyboard stops on twice).
                   While the header does not know yet who is looking (the server's
                   HTML, and a first visit until the session read answers) it holds
                   its place unseen, as the computer's row does, rather than showing
                   Sign in to somebody whose photo is a moment away. */
                <Button asChild className={cn("ml-2 h-9 px-5 rounded-lg text-sm font-semibold bg-white text-black hover:bg-white/90 gap-2", loading && "invisible")}>
                  <Link {...headerLink("/login")} data-phone-sign-in="" data-placeholder={loading ? "" : undefined} aria-hidden={loading || undefined} tabIndex={loading ? -1 : undefined}>
                    <UserIcon className="h-4 w-4" />
                    Sign in
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/*
            THE RIGHT OF THE BAR ON A COMPUTER. The wishlist and the library
            are here for everybody, as they were. After them, a guest gets the
            owner's row (a rule, Sell on Storelib, Sign up; no Log in on these
            pages), a signed in buyer gets nothing more than their photo, and
            a seller gets Dashboard beside it. No Start selling and no second
            Library button: the icon beside it already is one.
          */}
          <div className="hidden md:flex items-center gap-2.5 shrink-0">
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
                          <CountBadge count={wishlistCount} className="absolute -top-1.5 -right-2" />
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

                {loading ? (
                  <GuestHeaderActions withLogin={false} link={headerLink} placeholder />
                ) : user ? (
                  <>
                    {sellerDashboardButton}
                    {desktopAccountMenu}
                  </>
                ) : (
                  <GuestHeaderActions withLogin={false} link={headerLink} />
                )}
          </div>
          </>
          )}

        </div>

        {/* Mobile Search Bar Trigger is now rendered below in white UI section */}


        {/* Mobile & Desktop Categories are now rendered below in white UI section */}
      </div>

      {/* Mobile Categories Bottom Sheet with swipe-to-close */}
      {/*
        ON EXPLORE, A PRODUCT OR THE WISHLIST THIS SHEET IS THE CATEGORY
        BROWSER: the same list as Explore's More picker, at a fixed height so
        opening a category never moves the sheet's top, each level its own
        scroller, and a category's subcategories sliding in as a level with a
        back row. What sat around the old list (sign in for a guest, the
        search link on a product, My Library and the rest) scrolls with the
        first level. On the marketing pages it is the menu it always was.
      */}
      {/*
        BUILT AHEAD AND KEPT, on a phone. "The animation when I open it needs
        to be smooth and clean." It was built on the tap: React rendering the
        category list and the browser styling and laying out every row of it
        before the first frame of the slide could be drawn, which on a phone
        is the stutter at the start of the open. Kept, it waits below the
        screen on its own layer and the tap only slides it up, as the account
        sheet and the app's sheets do (components/ui/bottom-sheet.tsx). The
        category list is drawn afresh once it has slid away (`menuRound`), so
        it still opens on the first level every time.
      */}
      <MobileBottomSheet
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onClosed={() => setMenuRound((n) => n + 1)}
        keepMounted={belowMd}
        fill={!isMarketingNavRoute}
        height={isMarketingNavRoute ? undefined : "min(78dvh, 680px)"}
      >
        {isMarketingNavRoute ? (
        <div className="px-4 pb-6">
          {/* A guest: the owner's three, Sign up, Discover, Sell on Storelib (image 23). */}
          {!user && (
            <div className="px-1 pt-3 pb-2 border-b border-[#eef0f2]">
              <GuestSheetActions second="discover" link={headerLink} onDone={() => setMobileMenuOpen(false)} />
            </div>
          )}

          {/* Signed in, on the homepage and the marketing pages */}
          {user && isMarketingNavRoute && (
            <div className="pt-1 pb-4 border-b border-gray-200">
              {/* Who is signed in, and the way to their account. */}
              <Link
                {...headerLink("/account")}
                onClick={(e) => { onCanonicalNav(e, "/account"); setMobileMenuOpen(false) }}
                data-account-link=""
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl mb-3 active:bg-gray-100 transition-colors [-webkit-tap-highlight-color:transparent]"
              >
                <AppAvatar src={avatarUrl} name={(displayName || "").trim()} alt="" size={42} className="border border-gray-200" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-900 truncate">{displayName}</span>
                  <span className="block text-xs text-gray-500 truncate">{user.email || "Your account"}</span>
                </span>
                <ChevronRight aria-hidden className="h-5 w-5 text-gray-400" />
              </Link>
              <div className="flex flex-col gap-1.5">
                {hasCompletedSellerOnboarding ? (
                  <Link
                    {...headerLink("/app")}
                    onClick={(e) => { onCanonicalNav(e, "/app"); setMobileMenuOpen(false) }}
                    data-sheet-dashboard=""
                    className={cn(SHEET_BUTTON, "gap-2 bg-violet-600 font-[550] text-white hover:bg-violet-700 active:bg-violet-700")}
                  >
                    <LayoutDashboard aria-hidden className="h-[18px] w-[18px]" />
                    Dashboard
                  </Link>
                ) : (
                  <BecomeSellerRow link={headerLink} state={sellerState} onDone={() => setMobileMenuOpen(false)} />
                )}
                <Link
                  {...headerLink("/explore")}
                  onClick={(e) => { onCanonicalNav(e, "/explore"); setMobileMenuOpen(false) }}
                  className={cn(SHEET_BUTTON, "gap-3 border border-[#d0d4db] bg-white font-medium text-[#1a1a2e] hover:bg-[#f7f7f9] active:bg-[#f1f2f4]")}
                >
                  <Compass aria-hidden className="h-5 w-5" strokeWidth={1.9} />
                  Discover
                </Link>
              </div>
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

        </div>
        ) : (
          <CategoryBrowser
            key={menuRound}
            groups={HEADER_GROUPS}
            selectedGroup={browserSelection.group}
            selectedItem={browserSelection.item}
            onPick={pickCategory}
            phone
            heading="Browse categories"
            rootTop={
              <>
              <div className="px-4 pt-3">
                {/*
                  A GUEST ON EXPLORE, A PRODUCT OR ANY PAGE WITH THIS HEADER:
                  Sign up, Log in, Sell on Storelib. The marketing menu's three
                  with Log in where Discover was, because this is Discover.
                  "A bit more space between the drag pill and the buttons"
                  still holds (pt-3, 16px under the pill).
                */}
                {!user && (
                  <div className="mb-2">
                    <GuestSheetActions second="login" link={headerLink} onDone={() => setMobileMenuOpen(false)} />
                  </div>
                )}
                {isDiscoverProductContext && !tabsHere && (
                  /* This opened a search sheet that no longer exists. It goes to
                     the page whose whole top half is a search field instead. */
                  <Link
                    href="/explore"
                    onClick={() => setMobileMenuOpen(false)}
                    className="mb-2 flex h-11 w-full items-center gap-2 overflow-hidden rounded-[10px] bg-[#f1f2f4] px-3 text-[15px] text-[#6b7280]"
                  >
                    <Search className="h-4 w-4 shrink-0 text-[#6b7280]" />
                    <span className="truncate">{t("search_placeholder")}</span>
                  </Link>
                )}
              </div>
              {/* My Library sits under the buttons, above the categories, rather than at the foot of the list.
                  Not where the tab bar is: Library is one of its four. */}
              {!tabsHere && (
              <div className="border-b border-[#eef0f2] pb-1">
                <MenuRow href="/library" label="My Library" onNav={(e) => { onCanonicalNav(e, "/library"); setMobileMenuOpen(false) }} to={getCanonicalOrRelativePath("/library")} />
              </div>
              )}
              </>
            }
            rootBottom={
              user ? (
              <div className="border-t border-[#eef0f2] pb-2 pt-1">
                {hasCompletedSellerOnboarding && (
                  <MenuRow href={dashboardHref} label="Dashboard" onNav={(e) => { onCanonicalNav(e, dashboardHref); setMobileMenuOpen(false) }} to={getCanonicalOrRelativePath(dashboardHref)} />
                )}
                {!hasCompletedSellerOnboarding && (
                  <MenuRow seller href="/sell" label={sellingLabel(sellerState)} onNav={(e) => { onCanonicalNav(e, "/sell"); setMobileMenuOpen(false) }} to={getCanonicalOrRelativePath("/sell")} />
                )}
              </div>
              ) : null
            }
          />
        )}
      </MobileBottomSheet>

      {/*
        The account sheet, the one a signed in visitor opens from their photo.
        It is a menu with nothing typed into it and nothing that changes
        between opens, so it is built while the page is idle and kept, as the
        app's own account sheet is (components/app/mobile-account-menu.tsx):
        the tap that opens it only slides it up. On a phone only, where the
        header draws the button that opens it.
      */}
      <MobileBottomSheet
        isOpen={mobileProfileOpen}
        onClose={() => setMobileProfileOpen(false)}
        keepMounted={!!user && belowMd}
      >
        <div className="px-4 pb-6">
          {/* User Info */}
          <div className="flex items-center gap-3 p-3 mb-4 bg-gray-50 rounded-xl">
            <AppAvatar src={avatarUrl} name={(displayName || "").trim()} alt="" size={48} className="border border-gray-200" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-gray-900 truncate">{displayName}</p>
            </div>
          </div>

          {/* Menu Items */}
          <div className="space-y-0.5">
            {hasCompletedSellerOnboarding ? (
            <Link
              href={getCanonicalOrRelativePath(dashboardHref)}
              onClick={(e) => { onCanonicalNav(e, dashboardHref); setMobileProfileOpen(false) }}
              data-sheet-dashboard=""
              className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <LayoutDashboard className="h-5 w-5 text-gray-400" />
                <span>Dashboard</span>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>
            ) : (
              <div className="pb-1.5">
                <BecomeSellerRow link={headerLink} state={sellerState} onDone={() => setMobileProfileOpen(false)} />
              </div>
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
              /* The buyer's account page holds the settings now, for a seller too:
                 the photo, name, password, language and log out are the account's,
                 not the shop's. /library/settings only redirects there. */
              {...headerLink("/account")}
              onClick={(e) => { onCanonicalNav(e, "/account"); setMobileProfileOpen(false) }}
              data-account-link=""
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
        ═══════════════════════════════════════════════════════════════════════
         THE PHONE'S SEARCH STRIP: FIXED, SQUARE, AND OUT OF THE WAY
        ═══════════════════════════════════════════════════════════════════════
        Three faults in one element, all reported together.

        IT WAS `sticky`, SO IT WAS IN FLOW. Appearing added about seventy
        pixels to the document and pushed everything below it down; scrolling
        back up took them away again. Near the threshold that is a page that
        jumps under the finger, which is "the page glitches when I scroll".
        `fixed` takes it out of flow entirely: it overlays the top of the
        content the way a bar that appears on scroll is supposed to, and the
        page underneath never moves.

        IT HAD ROUNDED TOP CORNERS. A concave lead-in belongs between a black
        header and a white PAGE, where it softens the join. This is a bar that
        arrives over content, and the owner asked for the corners gone.

        AND IT SAT TOO LOW, because that lead-in was twenty pixels of black
        above it. Without it the field starts directly under the header.
      */}
      {/* Not where the tab bar is (its Search is the way in there), and
          never on the library or the account. */}
      {searchInHeader && !tabsHere && !isOwnPages && (pathname !== "/" && !pathname.startsWith("/features") && !pathname.startsWith("/blog") && !pathname.startsWith("/pricing") && !isFaqRoute && !isDevelopersRoute && !isSellerOrProductPage) && (
        <div
          /*
            NO ENTRANCE ON THIS BAR. It faded in on mount, which replayed on
            every arrival; then it faded in only when it appeared while the
            page was up, which still fired whenever the handoff resolved a
            frame late. A bar that appears as you scroll past the page's own
            field should just appear, the way every sticky header does.
          */
          data-header-search-strip=""
          className="fixed inset-x-0 z-[35] md:hidden bg-white border-b border-neutral-200"
          style={{ top: headerH }}
        >
          {/*
            ═══════════════════════════════════════════════════════════════
             A FIELD, NOT A DOOR TO A FIELD
            ═══════════════════════════════════════════════════════════════
            This was a button that looked like a search box, and tapping it
            threw a sheet over the whole page containing the real one. Two
            taps and a full-screen animation to type a word, and the sheet is
            what the owner asked to be rid of.

            So this IS the field. Tapping it puts a cursor in it, the
            keyboard comes up, and the results open underneath in the space
            that is left. Nothing covers the page and nothing slides.
          */}
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
            <div className="py-2 flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  value={query}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setSearchModalOpen(true)}
                  placeholder={t("search_placeholder")}
                  aria-label={t("search_placeholder")}
                  className="h-10 w-full rounded-[10px] border-neutral-200 bg-neutral-100 pl-9 pr-9 text-sm text-neutral-900 placeholder:text-neutral-500 focus-visible:ring-0 focus-visible:border-neutral-300"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("")
                      setSearchResults([])
                    }}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {/* The way out, since there is no scrim to tap any more. */}
              {searchModalOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchModalOpen(false)
                    setQuery("")
                    setSearchResults([])
                  }}
                  className="shrink-0 text-sm font-medium text-neutral-600 cursor-pointer px-1"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/*
            The results, in the room the keyboard leaves. --vv-h is the
            visible viewport from components/viewport-vars, so this stops
            above the keyboard rather than running underneath it.
          */}
          {searchModalOpen && (
            <div
              className="absolute inset-x-0 top-full overflow-y-auto overscroll-contain border-b border-neutral-200 bg-white px-4 pb-4 pt-3 shadow-[0_12px_28px_-18px_rgba(15,23,42,0.45)]"
              style={{ maxHeight: `calc(var(--vv-h, 100dvh) - ${headerH + 56}px)` }}
            >
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
                      {listPrice(product).main}
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
          )}
        </div>
      )}

      {/* Concave bottom edge — black background with rounded white overlay creates concave corners.
          Skipped on the FAQ page, whose hero is black too, and on any page that already
          renders the white strip above, to avoid two black bars. */}
      {!isFaqRoute && (pathname === "/" || pathname.startsWith("/features") || pathname.startsWith("/blog") || pathname.startsWith("/pricing") || isDevelopersRoute) && (
        <div className="relative z-30 bg-black h-[20px] -mb-px">
          <div className="absolute inset-0 bg-white rounded-t-[20px]" />
        </div>
      )}
    </>
  )
}
