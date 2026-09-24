"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Package,
  Settings,
  LogOut,
  ShoppingCart,
  BarChart3,
  Mail,
  CreditCard,
  Link2,
  HelpCircle,
  Zap,
  ChevronDown,
  ChevronRight,
  Compass,
  Library,
  Bell,
  Wallet,
  X,
  Sparkles,
  Store,
  MonitorSmartphone,
  Search,
  Globe,
  ContactRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
// Sheet removed — mobile sidebar now uses pure CSS transitions for reliable close animation
import { AppAvatar } from "@/components/app/app-avatar"
import { MobileAccountMenu } from "@/components/app/mobile-account-menu"
import { DesktopSidebarContent, NAV_ICONS, NAV_ICONS_EXTRA } from "@/components/app/sidebar-desktop-nav"
import type { NavIconPair } from "@/components/app/sidebar-desktop-nav"
import { MobileMenuPage, MobileNavPill, pillBelongsOn, useLockAppScroll } from "@/components/app/sidebar-mobile-nav"
/* The header draws it directly; the bar below does not carry it any more. */
import { CompassIcon as ExploreIcon } from "@solar-icons/react/linear/compass"

import { NotificationsModal, NotificationBadge } from "./notifications-modal"
import { useLanguage } from "@/lib/i18n"
import { LanguageModal } from "@/components/platform/language-modal"
import { toOriginalImageUrl } from "@/lib/storage/image-url"
import { isNativeApp, nativeLogOut, openExternal } from "@/lib/native-bridge"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { prefetchAppPage } from "@/lib/ui/app-navigation"
import { STORELIB_LOGO } from "@/lib/brand/logo"

const EXPLORE_FULL_URL = `https://${process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"}/explore`
const HELP_FULL_URL = `https://${process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"}/help`

// Progress circle component for setup widget
function SetupProgressCircle({ progress, size = 32 }: { progress: number; size?: number }) {
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  )
}

interface SidebarProps {
  creatorSlug?: string
  username?: string
  storePublished?: boolean
  avatarUrl?: string
  displayName?: string
  stripeConnected?: boolean
  stripeStatus?: string
  onePagePublished?: boolean
  setupProgress?: { completed: number; total: number }
}

const DISMISSED_NOTIFICATIONS_KEY = "storelib_dismissed_notifications"

function getDismissedNotifications(): string[] {
  if (typeof window === "undefined") return []
  try {
    const dismissed = localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY)
    return dismissed ? JSON.parse(dismissed) : []
  } catch {
    return []
  }
}

type NotificationsHandle = { open: () => void }

/**
 * The notifications sheet and its open state, memoised for the same reason
 * as the account menu above: the bell used to set state in AppSidebar, and
 * the whole sidebar rendered again on the tap that has to start the sheet
 * moving, and again on the way out.
 */
const NotificationsHost = memo(forwardRef<NotificationsHandle, {
  stripeConnected: boolean
  stripeStatus: string
  onePagePublished: boolean
  onClosed: () => void
}>(function NotificationsHost({ stripeConnected, stripeStatus, onePagePublished, onClosed }, ref) {
  const [open, setOpen] = useState(false)
  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), [])
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (wasOpenRef.current && !open) onClosed()
    wasOpenRef.current = open
  }, [open, onClosed])
  return (
    <NotificationsModal
      open={open}
      onOpenChange={setOpen}
      stripeConnected={stripeConnected}
      stripeStatus={stripeStatus}
      onePagePublished={onePagePublished}
    />
  )
}))

export function AppSidebar({ creatorSlug, username, storePublished, avatarUrl, displayName, stripeConnected = false, stripeStatus = "not_connected", onePagePublished = false, setupProgress }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()
  /**
   * The language picker, opened from either account menu in this sidebar.
   *
   * The modal drives LocaleProvider while this sidebar reads LanguageProvider --
   * two providers, but ONE localStorage key ("storelib_language"), which is what
   * keeps /app and the marketing side agreeing about the chosen language.
   */
  const [languageOpen, setLanguageOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  useLockAppScroll(mobileMenuOpen)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  /* The bell opens the host below by ref: its open state is the host's, so
     opening notifications does not re-render this whole sidebar. */
  const notificationsRef = useRef<NotificationsHandle>(null)
  const openNotifications = useCallback(() => notificationsRef.current?.open(), [])
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([])
  /* The row a click lights before its page arrives is not state here: this
     held a `pendingHref` that nothing ever read, and setting it re-rendered
     this whole shell on every click, at the moment the click should be
     answered. The rows read the navigation record themselves
     (useShownPath, lib/ui/app-navigation). */
  const dropdownRef = useRef<HTMLDivElement>(null)
  /* Stable, so the memoised account menu is not re-rendered by them. */
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])
  const openLanguage = useCallback(() => setLanguageOpen(true), [])

  useEffect(() => {
    setMobileMenuOpen(false)
    setProfileDropdownOpen(false)
    setHeaderProfileOpen(false)
    setSearchOpen(false)
  }, [pathname])

  // Load dismissed notifications from localStorage
  useEffect(() => {
    setDismissedNotifications(getDismissedNotifications())
  }, [])

  // Re-check dismissed notifications when notifications modal closes, and
  // render only when the answer is different.
  const refreshDismissed = useCallback(() => {
    setDismissedNotifications((prev) => {
      const next = getDismissedNotifications()
      return next.join(",") === prev.join(",") ? prev : next
    })
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false)
      }
      /*
        NOT THE ACCOUNT SHEET. It is portaled to <body>, so every press inside
        it is "outside" this row, and on a phone a tap is followed by a
        synthesized mousedown: pressing the sheet's own name, or letting go
        of its handle without dragging, closed it under the finger. The sheet
        closes itself from its scrim, its handle and Escape.
      */
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Calculate notification count (respecting dismissed notifications)
  let notificationCount = 0
  if ((!stripeConnected || (stripeStatus !== "enabled" && stripeStatus !== "connected")) && !dismissedNotifications.includes("payment-setup")) notificationCount++
  if (!onePagePublished && !dismissedNotifications.includes("onepage-setup")) notificationCount++

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setMobileMenuOpen(false)
    setProfileDropdownOpen(false)
    if (isNativePlatform()) {
      nativeLogOut()
    } else {
      // Hard navigation clears all client-side state so the session is truly
      // gone before the login page renders — router.push() leaves cached
      // state that can make it appear as if the sign-out did nothing.
      window.location.assign("/login")
    }
  }
  const signOutRef = useRef(handleSignOut)
  useEffect(() => { signOutRef.current = handleSignOut })
  const signOut = useCallback(() => { void signOutRef.current() }, [])

  type NavItemChild = { href: string; label: string }
  type NavItemData = {
    href: string
    label: string
    /**
     * A REMIX ICON PAIR, not a Lucide component, and the type enforces it.
     *
     * This list feeds `DesktopSidebarContent`, which renders each icon twice —
     * once from `.line` and once from `.fill` — and cross-fades between them
     * to fill the row you are on. A single Lucide component has no fill
     * variant to pair with: the active row would never fill.
     *
     * Which is exactly what shipped. The rail was handed Lucide icons while
     * the browser probe rendered `NAV_ICONS`, so the probe kept reporting a
     * fill that no user could see. Both sides read the same map now.
     */
    icon: NavIconPair
    forceNavigation?: boolean
    children?: NavItemChild[]
  }

  /**
   * ONE ICON PER DESTINATION, and the same one on both surfaces. The rail and
   * the mobile drawer render this list, so a Dashboard that is a house here
   * and a grid there would be two names for one place.
   */
  const mainNavItems: NavItemData[] = [
    { href: "/app", label: t("nav.dashboard"), icon: NAV_ICONS.dashboard },
    {
      href: "/app/products",
      label: t("nav.products"),
      icon: NAV_ICONS.products,
      children: [{ href: "/app/coupons", label: "Coupons" }],
    },
    { href: "/app/analytics", label: t("nav.analytics"), icon: NAV_ICONS.analytics },
    { href: "/app/orders", label: t("nav.sales"), icon: NAV_ICONS.orders },
    /**
     * THREE PLACES A CREATOR CAN PUBLISH, IN THE ORDER THEY MATTER.
     *
     * "Store Builder" used to sit here beside "Website" and "OnePage", and
     * between them they asked somebody to work out on their first visit which
     * of three things builds the page their own name points at. Two of the
     * three sounded like the answer.
     *
     * Creator Page is what storelib.com/u/<handle> actually is: a picture, a
     * bio, links, products, communities, a newsletter. Website is a site they
     * build. OnePage is a link in bio. Named for what they are, and grouped,
     * because they are the same kind of decision.
     */
    { href: "/creator-page", label: t("nav.creatorPage"), icon: NAV_ICONS.storeBuilder },
    { href: "/app/website-builder", label: t("nav.websiteBuilder"), icon: NAV_ICONS.websiteBuilder, forceNavigation: true },
    { href: "/app/onepage", label: t("nav.onepage"), icon: NAV_ICONS.onepage, forceNavigation: true },
    /*
      Storelib AI is NOT LISTED HERE ANY MORE.

      The AI moved into the theme editor, where it edits the sections somebody
      is already looking at — see components/website-builder/theme-chat.tsx.
      Two doors to "build my website with AI", each leading somewhere
      different, is a choice nobody can make correctly on their first visit.

      HIDDEN, NOT DELETED. Everything under /app/sites still works and still
      answers if you go there: the projects, the transcripts, the versions, the
      published sites. Removing the routes would take somebody's work with
      them, and that is not what "take it out of the menu" means. Putting the
      line back is what turns it on again.
    */
    { href: "/app/emails", label: t("nav.emails"), icon: NAV_ICONS.emails },
    { href: "/app/payouts", label: t("nav.payouts"), icon: NAV_ICONS.payouts },
  ]

  // Expandable groups (parent nav items with children).
  // Always collapsed on mount — user opens manually via the chevron. No
  // auto-expand based on pathname (we tried this and it made the default
  // state inconsistent between page loads).
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = useCallback((href: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  }, [])

  const profileDropdownItems = [
    { href: "/app/settings", label: t("nav.settings"), icon: Settings },
    { href: "/app/settings/billing", label: t("settings.billing"), icon: CreditCard },
    { href: "/help", label: "Help", icon: HelpCircle, target: "_blank" as const },
    { href: "/explore", label: "Explore", icon: Compass, target: "_blank" as const },
    { href: "/library", label: "Library", icon: Library },
  ]

  /**
   * THE AVATAR URL, UNTRANSFORMED.
   *
   * This used to swap "/object/public/" for "/render/image/public/" and append
   * width/height, which is Supabase's metered Image Transformation endpoint.
   * The project is at 106/100 of its allowance on a plan with a spend cap, so
   * that endpoint does not serve an image at all -- it fails.
   *
   * And the failure is invisible-by-design: the initials are painted UNDERNEATH
   * and the <img> lies on top with an onError that hides itself. A dead URL
   * therefore does not look broken, it looks like a user with no avatar. That
   * is the "AN" where a photo should be.
   *
   * The size argument is gone rather than ignored: every call site already sizes
   * with object-cover inside a fixed box, so CSS was doing the work regardless
   * and the parameter only ever bought the bill. tests/no-image-transforms
   * fails the build if a transform URL comes back anywhere.
   */
  const avatarSrc = toOriginalImageUrl(avatarUrl)

  const storeUrl = username || creatorSlug
  const userDisplayName = displayName || username || creatorSlug || "User"

  /*
    SubNavItem, NavItem and the imperative Collapsible used to be here.

    They were the DRAWER's rows — the desktop rail has rendered from
    sidebar-desktop-nav.tsx for a while, and the phone's menu now renders from
    sidebar-mobile-nav.tsx, so nothing was left calling them. The Collapsible
    that went with them measured `scrollHeight`, pinned a pixel height, forced
    a reflow and released the height again on transitionend, four layout
    flushes per toggle; both surfaces animate a `grid-template-rows` track
    instead, which needs no measurement and nothing to release.
  */
  const ProfileDropdown = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
        className={cn(
          "flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-all duration-200 ease-out cursor-pointer group",
          profileDropdownOpen ? "bg-neutral-100/80" : "hover:bg-neutral-100/70 active:bg-neutral-200/60",
        )}
      >
        <AppAvatar src={avatarSrc} name={userDisplayName} size={40} />
        <span className="flex-1 text-[14px] font-medium text-neutral-900 truncate">{userDisplayName}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-neutral-400 transition-transform duration-200 ease-out",
            profileDropdownOpen && "rotate-180",
          )}
        />
      </button>

      <div
        className={cn(
          "absolute left-0 right-0 top-full mt-1.5 z-50 origin-top",
          "transition-all ease-out",
          profileDropdownOpen
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-[0.97] -translate-y-1 pointer-events-none"
        )}
        style={{ transitionDuration: '200ms', transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        <div className="rounded-xl border border-neutral-200/70 bg-white p-1 shadow-lg shadow-black/5">
          {profileDropdownItems.map((item) => {
            const Icon = item.icon
            const isExplore = item.href === "/explore"
            return (
              <Link
                key={item.href}
                href={item.href}
                {...("target" in item ? { target: item.target, rel: "noopener noreferrer" } : {})}
                onClick={(e) => {
                  if (isExplore && isNativeApp()) {
                    e.preventDefault()
                    openExternal(EXPLORE_FULL_URL)
                  }
                  setProfileDropdownOpen(false)
                  onItemClick?.()
                }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span>{item.label}</span>
              </Link>
            )
          })}
          <button
            onClick={() => {
              setProfileDropdownOpen(false)
              setLanguageOpen(true)
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
          >
            <Globe className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>{t("settings.language")}</span>
          </button>
          <div className="my-1 h-px bg-neutral-100" />
          <button
            onClick={() => {
              setProfileDropdownOpen(false)
              handleSignOut()
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>{t("settings.signOut")}</span>
          </button>
        </div>
      </div>
    </div>
  )

  // Search modal state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<{ label: string; href: string; icon: any; category: string }[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const headerProfileRef = useRef<HTMLDivElement>(null)
  const [headerProfileOpen, setHeaderProfileOpen] = useState(false)

  // Search shortcut items (pill buttons in modal)
  const searchShortcuts = [
    { label: "Dashboard", href: "/app", icon: LayoutDashboard },
    { label: "Products", href: "/app/products", icon: Package },
    { label: "Orders", href: "/app/orders", icon: ShoppingCart },
    { label: "Analytics", href: "/app/analytics", icon: BarChart3 },
    { label: "Payouts", href: "/app/payouts", icon: Wallet },
    { label: "Settings", href: "/app/settings", icon: Settings },
    { label: "Emails", href: "/app/emails", icon: Mail },
    { label: "OnePage", href: "/app/onepage", icon: Link2 },
    { label: "Payments", href: "/app/settings/payments", icon: CreditCard },
    { label: "Billing", href: "/app/settings/billing", icon: CreditCard },
  ]

  // All searchable items
  const allSearchItems = [
    { label: "Dashboard", href: "/app", icon: LayoutDashboard, category: "Pages" },
    { label: "Products", href: "/app/products", icon: Package, category: "Pages" },
    { label: "New Product", href: "/app/products/new", icon: Package, category: "Pages" },
    { label: "Analytics", href: "/app/analytics", icon: BarChart3, category: "Pages" },
    { label: "Orders", href: "/app/orders", icon: ShoppingCart, category: "Pages" },
    /* A profile card, the same as the rail's own icon and for the same
       reason: a plain silhouette is the account menu, not a page. */
    { label: "Creator Page", href: "/creator-page", icon: ContactRound, category: "Pages" },
    { label: "Website", href: "/app/website-builder", icon: MonitorSmartphone, category: "Pages" },
    { label: "OnePage", href: "/app/onepage", icon: Link2, category: "Pages" },
    { label: "Emails", href: "/app/emails", icon: Mail, category: "Pages" },
    { label: "Payouts", href: "/app/payouts", icon: Wallet, category: "Pages" },
    { label: "Settings", href: "/app/settings", icon: Settings, category: "Settings" },
    { label: "Billing", href: "/app/settings/billing", icon: CreditCard, category: "Settings" },
    { label: "Payment Methods", href: "/app/settings/billing", icon: CreditCard, category: "Settings" },
    { label: "Profile Settings", href: "/app/settings", icon: Settings, category: "Settings" },
    { label: "Orders", href: "/app/orders", icon: ShoppingCart, category: "Data" },
    { label: "Customers", href: "/app/orders", icon: ShoppingCart, category: "Data" },
    { label: "Customer Emails", href: "/app/orders", icon: Mail, category: "Data" },
    { label: "Email Subscribers", href: "/app/emails", icon: Mail, category: "Data" },
    { label: "Send Email", href: "/app/emails", icon: Mail, category: "Data" },
    { label: "Email Campaigns", href: "/app/emails", icon: Mail, category: "Data" },
    { label: "Revenue", href: "/app/payouts", icon: Wallet, category: "Data" },
    { label: "Traffic", href: "/app/analytics", icon: BarChart3, category: "Data" },
    { label: "Transactions", href: "/app/payouts", icon: Wallet, category: "Data" },
    { label: "Refunds", href: "/app/orders", icon: ShoppingCart, category: "Data" },
    { label: "Coupons", href: "/app/products", icon: Package, category: "Data" },
    { label: "Digital Downloads", href: "/app/products", icon: Package, category: "Data" },
    { label: "Explore", href: "/explore", icon: Compass, category: "Other" },
    { label: "Library", href: "/library", icon: Library, category: "Other" },
    { label: "Help", href: "/help", icon: HelpCircle, category: "Other" },
    { label: "Upgrade to Pro", href: "/app/settings/billing/upgrade", icon: Zap, category: "Other" },
  ]

  // Search handler
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const q = query.toLowerCase()
    const results = allSearchItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.href.toLowerCase().includes(q)
    )
    setSearchResults(results)
  }, [])

  // Focus search input when modal opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    } else {
      setSearchQuery("")
      setSearchResults([])
    }
  }, [searchOpen])

  // Keyboard shortcut: Cmd/Ctrl+K opens search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [searchOpen])

  // Close header profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (headerProfileRef.current && !headerProfileRef.current.contains(event.target as Node)) {
        setHeaderProfileOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // The setup widget stays off the editors: store-builder, onepage, and the
  // product editor, whether it is a new product or /app/products/<id>.
  const inProductEditor = /^\/app\/products\/[^/]+/.test(pathname)
  const showSetupWidget = setupProgress &&
    setupProgress.completed < setupProgress.total &&
    !pathname.startsWith("/creator-page") &&
    !pathname.startsWith("/app/creator-page") &&
    !pathname.startsWith("/store-builder") &&
    !pathname.startsWith("/app/onepage") &&
    !inProductEditor

  const setupProgressPercent = setupProgress ? Math.round((setupProgress.completed / setupProgress.total) * 100) : 0

  /*
    SoonItem is gone with the drawer. It was a greyed-out row announcing a
    tool that does not exist yet, and it said so through a tooltip that
    appeared on `onMouseEnter` — an event a phone never sends. On the one
    surface it was rendered on it was an unexplained grey line.
  */

  /*
    Both navs used to be declared here, inside the component, and both were
    rebuilt from scratch on every render of this shell — see the note at the
    top of sidebar-desktop-nav.tsx for why that was the flashing rather than
    a matter of tidiness. The desktop rail moved out first; the phone's menu
    followed it into sidebar-mobile-nav.tsx, which is what lets a group
    animate open instead of being unmounted halfway through.
  */

  return (
    <>
      <style jsx global>{`
        .sidebar-nav {
          scrollbar-width: thin;
          scrollbar-color: transparent transparent;
        }
        .sidebar-nav:hover {
          scrollbar-color: rgba(0, 0, 0, 0.12) transparent;
        }
        .sidebar-nav::-webkit-scrollbar {
          width: 3px;
        }
        .sidebar-nav::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-nav::-webkit-scrollbar-thumb {
          background-color: transparent;
          border-radius: 999px;
        }
        .sidebar-nav:hover::-webkit-scrollbar-thumb {
          background-color: rgba(0, 0, 0, 0.12);
        }
        .sidebar-nav::-webkit-scrollbar-thumb:hover {
          background-color: rgba(0, 0, 0, 0.22);
        }
        /* Dark scrollbar for mobile sidebar */
        .sidebar-nav-dark:hover {
          scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
        }
        .sidebar-nav-dark:hover::-webkit-scrollbar-thumb {
          background-color: rgba(255, 255, 255, 0.15);
        }
        .sidebar-nav-dark::-webkit-scrollbar-thumb:hover {
          background-color: rgba(255, 255, 255, 0.25);
        }
      `}</style>

      {/* Desktop Header Bar — dark bar with concave bottom corners.
          pt-[env(safe-area-inset-top)] pushes the 58 px content row below
          the iOS/iPadOS status bar in Capacitor. In a browser env() = 0
          so the header stays exactly 58 px — no visual change. */}
      <header data-shell-chrome="" className="fixed top-0 left-0 right-0 z-50 hidden md:block pt-[env(safe-area-inset-top,_0px)]" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
        <div className="relative h-[58px] bg-[#131316] flex items-center px-5">
          {/* Left side: Profile dropdown */}
          <div ref={headerProfileRef} className="relative shrink-0">
            <button
              onClick={() => setHeaderProfileOpen(!headerProfileOpen)}
              className={cn(
                "flex items-center gap-2.5 rounded-full px-2.5 py-1.5 transition-all duration-200 ease-out",
                headerProfileOpen ? "bg-white/15" : "hover:bg-white/10"
              )}
            >
              <AppAvatar src={avatarSrc} name={userDisplayName} size={28} tone="dark" className="ring-1 ring-white/20" />
              <span className="text-[13px] font-medium text-white/90 max-w-[140px] truncate">
                {userDisplayName}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-white/50 transition-transform duration-200 ease-out",
                  headerProfileOpen && "rotate-180"
                )}
              />
            </button>

            {/* Header Profile Dropdown */}
            <div
              className={cn(
                "absolute left-0 top-full mt-2 z-[60] min-w-[200px] transition-all duration-200 ease-out origin-top-left",
                headerProfileOpen
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
              )}
            >
              <div className="rounded-xl border border-neutral-200/70 bg-white p-1 shadow-xl shadow-black/10">
                {profileDropdownItems.map((item) => {
                  const Icon = item.icon
                  const isHelp = item.href === "/help"
                  const isExploreItem = item.href === "/explore"
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      {...("target" in item ? { target: item.target, rel: "noopener noreferrer" } : {})}
                      onClick={(e) => {
                        if (isHelp && isNativeApp()) {
                          e.preventDefault()
                          openExternal(HELP_FULL_URL)
                        } else if (isExploreItem && isNativeApp()) {
                          e.preventDefault()
                          openExternal(EXPLORE_FULL_URL)
                        }
                        setHeaderProfileOpen(false)
                      }}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
                <button
                  onClick={() => {
                    setHeaderProfileOpen(false)
                    setLanguageOpen(true)
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
                >
                  <Globe className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span>{t("settings.language")}</span>
                </button>
                <div className="my-1 h-px bg-neutral-100" />
                <button
                  onClick={() => {
                    setHeaderProfileOpen(false)
                    handleSignOut()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span>{t("settings.signOut")}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Center: Search bar */}
          <div className="flex-1 flex justify-center px-6 relative" id="desktop-search-container">
            <button
              onClick={() => setSearchOpen(true)}
              className={cn(
                "flex items-center gap-2.5 w-full max-w-[480px] h-[36px] rounded-full bg-white/10 hover:bg-white/15 border border-white/10 px-4 transition-all cursor-text",
                searchOpen && "opacity-0 pointer-events-none"
              )}
            >
              <Search className="h-4 w-4 text-white/40 shrink-0" />
              <span className="text-[13px] text-white/40 flex-1 text-left">Search...</span>
              <kbd className="hidden lg:flex items-center gap-0.5 text-[11px] text-white/30 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                <span className="text-[10px]">⌘</span>K
              </kbd>
            </button>
          </div>

          {/* Right side: Nav icons + Storelib logo */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-1.5">
              <Link
                href="/explore"
                onClick={(e) => { if (isNativeApp()) { e.preventDefault(); openExternal(EXPLORE_FULL_URL) } }}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-all"
                title="Discover"
              >
                <Compass className="h-[19px] w-[19px]" strokeWidth={1.5} />
              </Link>
              <button
                onClick={openNotifications}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-all relative"
                title="Notifications"
              >
                <Bell className="h-[19px] w-[19px]" strokeWidth={1.5} />
                <NotificationBadge count={notificationCount} />
              </button>
              <Link
                href="/app/settings"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-all"
                title="Settings"
              >
                <Settings className="h-[19px] w-[19px]" strokeWidth={1.5} />
              </Link>
            </div>

            <div className="h-5 w-px bg-white/15" />

            <Link href="/app" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity shrink-0">
              <img
                src={STORELIB_LOGO}
                alt="Storelib"
                className="h-[27px] w-[27px] rounded-[4px]"
              />
              <span className="text-[15px] font-semibold text-white">Storelib</span>
            </Link>
          </div>
        </div>

        {/* Concave bottom corners - SVG curves on left and right */}
        <div className="relative h-3 pointer-events-none" style={{ marginTop: "-1px" }}>
          {/* Left concave corner */}
          <svg className="absolute left-0 top-0 h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path d="M12 0H0v12C0 5.373 5.373 0 12 0Z" fill="#131316" />
          </svg>
          {/* Right concave corner */}
          <svg className="absolute right-0 top-0 h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path d="M0 0h12v12C12 5.373 6.627 0 0 0Z" fill="#131316" />
          </svg>
        </div>
      </header>

      {/* Search Modal — morphs from search bar position */}
      <div
        className={cn(
          "fixed inset-0 z-[100] bg-black/20 hidden md:block transition-opacity duration-200",
          searchOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSearchOpen(false)}
      />
      <div
        className={cn(
          "fixed z-[101] hidden md:block left-1/2 -translate-x-1/2 w-full max-w-[560px] transition-all duration-250",
          searchOpen
            ? "top-[10px] opacity-100 scale-100 pointer-events-auto"
            : "top-[10px] opacity-0 scale-[0.97] -translate-y-1 pointer-events-none"
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-neutral-200/70 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100">
            <Search className="h-5 w-5 text-neutral-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search pages, settings, data..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="flex-1 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none bg-transparent"
            />
            <button
              onClick={() => setSearchOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 hover:bg-neutral-200 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-neutral-500" />
            </button>
          </div>

          {/* Default: Shortcut Pills */}
          {!searchQuery.trim() && searchOpen && (
            <div className="px-5 py-4">
              <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider mb-3">Quick Navigation</p>
              <div className="flex flex-wrap gap-2">
                {searchShortcuts.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.href}
                      onClick={() => {
                        setSearchOpen(false)
                        // /explore always opens in external browser on native
                        if (isNativeApp() && item.href === "/explore") {
                          openExternal(EXPLORE_FULL_URL)
                        } else if (!isNativePlatform() && (item.href.startsWith("/creator-page") || item.href.startsWith("/app/onepage"))) {
                          window.location.href = item.href
                        } else {
                          router.push(item.href)
                        }
                      }}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/60 text-[13px] font-medium text-neutral-700 hover:text-neutral-900 transition-all"
                    >
                      <Icon className="h-3.5 w-3.5 text-neutral-500" strokeWidth={1.5} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Search Results */}
          {searchQuery.trim() && searchOpen && (
            <div className="max-h-[340px] overflow-y-auto">
              {searchResults.length > 0 ? (
                <div className="py-2">
                  {Object.entries(
                    searchResults.reduce((acc, item) => {
                      if (!acc[item.category]) acc[item.category] = []
                      acc[item.category].push(item)
                      return acc
                    }, {} as Record<string, typeof searchResults>)
                  ).map(([category, items]) => (
                    <div key={category}>
                      <p className="px-5 py-1.5 text-[11px] font-medium text-neutral-400 uppercase tracking-wider">{category}</p>
                      {items.map((item) => {
                        const Icon = item.icon
                        return (
                          <button
                            key={item.href + item.label}
                            onClick={() => {
                              setSearchOpen(false)
                              // /explore always opens in external browser on native
                              if (isNativeApp() && item.href === "/explore") {
                                openExternal(EXPLORE_FULL_URL)
                              } else if (!isNativePlatform() && (item.href.startsWith("/creator-page") || item.href.startsWith("/app/onepage"))) {
                                window.location.href = item.href
                              } else {
                                router.push(item.href)
                              }
                            }}
                            className="flex items-center gap-3 w-full px-5 py-2.5 hover:bg-neutral-50 transition-colors text-left"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100">
                              <Icon className="h-4 w-4 text-neutral-600" strokeWidth={1.5} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-neutral-900 truncate">{item.label}</p>
                              <p className="text-[11px] text-neutral-400 truncate">{item.href}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-neutral-300 shrink-0" />
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center">
                  <p className="text-[13px] text-neutral-400">No results for &quot;{searchQuery}&quot;</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Header - Dark background, content below has outward rounded top corners.
          Header total height = 68px + safe-area-inset-top (same as main's pt offset).
          Padding inside the flex row so content sits flush below the status bar. */}
      <header data-shell-chrome="" className="fixed top-0 left-0 right-0 z-50 md:hidden bg-[#111111]"
        style={{ height: 'calc(68px + env(safe-area-inset-top, 0px))', touchAction: 'none', overscrollBehavior: 'none', willChange: 'transform', WebkitTransform: 'translateZ(0)', transform: 'translateZ(0)', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden' }}>
        <div className="flex h-[68px] items-center justify-between px-4 py-[10px]"
          style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}>
          {/*
            THE HAMBURGER IS NOT HERE ANY MORE.

            It sat in the top left corner, which on a 390px phone held at the
            bottom is the one place a thumb cannot go, and it opened a 260px
            drawer over a 390px screen. The menu is a pill at the bottom now —
            see components/app/sidebar-mobile-nav — so this row carries only
            what it is for: who you are, and what is waiting for you.
          */}
          {/* Who you are, and the store you are in. Its own component, holding
              its own open state, so opening the account sheet re-renders the
              trigger and the sheet and nothing else in this sidebar. */}
          <MobileAccountMenu
            avatarSrc={avatarSrc}
            userDisplayName={userDisplayName}
            settingsLabel={t("nav.settings")}
            billingLabel={t("settings.billing")}
            languageLabel={t("settings.language")}
            onOpening={closeMobileMenu}
            onLanguage={openLanguage}
            onSignOut={signOut}
          />

          {/* Right side: Explore, then Notifications */}
          <div className="flex items-center gap-0.5">
            {/*
              EXPLORE IS NOT ONE OF THIS PERSON'S PLACES.

              It sat in the bar at the foot of the screen beside Home, Orders
              and Products, which are the three pages of their own shop. It is
              the public site — somebody else's shops — and it leaves this
              shell entirely. Up here beside the bell it reads as what it is:
              a door out, rather than a fourth tab.
            */}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl text-white/90 hover:text-white hover:bg-white/10"
              aria-label="Explore"
              onClick={() => {
                if (isNativeApp()) openExternal(EXPLORE_FULL_URL)
                else window.location.href = "/explore"
              }}
            >
              <ExploreIcon size={20} strokeWidth={1.6} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl text-white/90 hover:text-white hover:bg-white/10 relative"
              onClick={openNotifications}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <NotificationBadge count={notificationCount} />
            </Button>
            {/* Home moved to the bar at the bottom. Two ways to the same
                page, one of them out of reach, is one too many. */}
          </div>
        </div>
      </header>


      {/* Notifications Modal */}
      <NotificationsHost
        ref={notificationsRef}
        stripeConnected={stripeConnected}
        stripeStatus={stripeStatus}
        onePagePublished={onePagePublished}
        onClosed={refreshDismissed}
      />

      {/*
        ── THE MENU, AND THE PILL THAT OPENS IT ─────────────────────────────
        What was here was a 260px drawer with a dimmed strip of page beside
        it, opened from the far corner of the screen. Both halves live in
        components/app/sidebar-mobile-nav now, at module scope, which is what
        lets a group animate open without being unmounted mid-transition.
      */}
      <MobileMenuPage
        open={mobileMenuOpen}
        items={mainNavItems}
        expandedGroups={expandedGroups}
        onToggle={toggleGroup}
        onNavigate={(href) => {
          startNavigationLoading(href)
        }}
        onForceNavigate={(href) => {
          startNavigationLoading(href)
          /* Leaves the /app router tree. In Capacitor a full reload would
             lose the session, which lives in Preferences, not in a cookie. */
          if (isNativePlatform()) router.push(href)
          else window.location.href = href
        }}
        onClose={() => setMobileMenuOpen(false)}
        upgradeTitle={t("nav.upgradeToPro")}
        upgradeSubtitle={t("nav.unlockBenefits")}
        storeUnpublishedNote={
          storeUrl && !storePublished ? "Store is unpublished. Go to Settings to publish." : undefined
        }
        setupSlot={
          setupProgress && setupProgress.completed < setupProgress.total && !pathname.startsWith("/app/emails") ? (
            <button
              onClick={() => {
                setMobileMenuOpen(false)
                if (pathname === "/app") {
                  document.getElementById("store-setup-section")?.scrollIntoView({ behavior: "smooth", block: "start" })
                } else {
                  router.push("/app")
                  setTimeout(() => {
                    document.getElementById("store-setup-section")?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }, 100)
                }
              }}
              className="mt-4 flex w-full items-center gap-3 rounded-[16px] border border-violet-100/70 bg-white px-4 py-3.5 text-left"
            >
              <div className="relative h-10 w-10 shrink-0">
                <SetupProgressCircle progress={setupProgressPercent} size={40} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-violet-600">{setupProgressPercent}%</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-[#1a1a2e]">Store setup</p>
                <p className="text-[12px] text-[#6b7280]">{setupProgress.completed} of {setupProgress.total} steps done</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
            </button>
          ) : null
        }
      />
      {/* OnePage is an editor with its own controls along the foot of the
          screen; see NO_PILL in sidebar-mobile-nav. */}
      {pillBelongsOn(pathname) ? (
      <MobileNavPill
        menuOpen={mobileMenuOpen}
        onToggleMenu={() => {
          setMobileMenuOpen((v) => !v)
        }}
        onCloseMenu={() => setMobileMenuOpen(false)}
        onNavigate={(href) => {
          startNavigationLoading(href)
          router.push(href)
        }}
        onPrefetch={(href) => {
          prefetchAppPage(router, href)
        }}
        icons={{
          home: NAV_ICONS.dashboard,
          orders: NAV_ICONS.orders,
          products: NAV_ICONS.products,
          analytics: NAV_ICONS.analytics,
          settings: NAV_ICONS_EXTRA.settings,
        }}
      />
      ) : null}

      {/* top and height mirror the desktop header: 58 px content row +
          env(safe-area-inset-top) padding. In a browser env() = 0 so
          this is identical to the previous top-[58px] / calc(100svh-58px). */}
      <aside
        data-shell-chrome=""
        className="fixed left-0 z-40 hidden w-[240px] flex-col border-r border-neutral-200/60 bg-white md:flex"
        style={{
          top: 'calc(58px + env(safe-area-inset-top, 0px))',
          height: 'calc(100svh - 58px - env(safe-area-inset-top, 0px))',
        }}
      >
        {/*
          THE DESKTOP NAV LIVES AT MODULE SCOPE — see sidebar-desktop-nav.tsx.

          It used to be declared inside this component, which made it a new
          component TYPE on every render, which made React unmount and rebuild
          every node in the sidebar whenever anything here changed. That is
          what the jumping and the flashing were.
        */}
        <DesktopSidebarContent
          items={mainNavItems}
          expandedGroups={expandedGroups}
          onToggle={toggleGroup}
          onNavigate={(href) => {
            /* The record this starts is what lights the clicked row at once
               (useShownPath, lib/ui/app-navigation). */
            startNavigationLoading(href)
          }}
          onForceNavigate={(href) => {
            startNavigationLoading(href)
            // These leave the /app router tree. In Capacitor a full reload
            // would lose the session, which lives in Preferences rather than
            // in a cookie.
            if (isNativePlatform()) router.push(href)
            else window.location.href = href
          }}
          onPrefetch={(href) => {
            prefetchAppPage(router, href)
          }}
          settingsLabel={t("nav.settings")}
          upgradeTitle={t("nav.upgradeToPro")}
          upgradeSubtitle={t("nav.unlockBenefits")}
          storeUnpublishedNote={
            storeUrl && !storePublished
              ? "Store is unpublished. Go to Settings to publish."
              : undefined
          }
        />
      </aside>

      {/* Floating Setup Progress Circle - hidden on mobile for settings and emails pages */}
      {showSetupWidget && !mobileMenuOpen && (
        <button
          onClick={() => {
            // Navigate to dashboard and smooth scroll to setup section
            if (pathname === "/app") {
              // Already on dashboard, just scroll
              const setupSection = document.getElementById("store-setup-section")
              setupSection?.scrollIntoView({ behavior: "smooth", block: "start" })
            } else {
              // Navigate to dashboard then scroll
              router.push("/app")
              // Wait for navigation and scroll
              setTimeout(() => {
                const setupSection = document.getElementById("store-setup-section")
                setupSection?.scrollIntoView({ behavior: "smooth", block: "start" })
              }, 100)
            }
          }}
          data-shell-chrome=""
          className={cn(
            // bottom-[calc(...)] keeps the button above the home-indicator on iPad.
          // In a browser env(safe-area-inset-bottom) = 0, so this equals bottom-6.
          "fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,_0px))] right-4 md:right-6 z-40 hidden md:flex items-center gap-2 bg-white rounded-full pl-2 pr-3 py-2 md:pl-2.5 md:pr-4 md:py-2.5 shadow-lg border border-neutral-200/70 transition-all duration-200 hover:shadow-xl hover:scale-105 active:scale-95",
            (pathname.startsWith("/app/settings") || pathname.startsWith("/app/emails") || pathname.startsWith("/app/payouts") || pathname.startsWith("/app/analytics")) && "!hidden"
          )}
        >
          <div className="relative shrink-0 w-8 h-8 md:w-[37px] md:h-[37px]">
            <div className="md:hidden">
              <SetupProgressCircle progress={setupProgressPercent} size={32} />
            </div>
            <div className="hidden md:block">
              <SetupProgressCircle progress={setupProgressPercent} size={37} />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[8px] md:text-[9px] font-bold text-violet-600">{setupProgressPercent}%</span>
            </div>
          </div>
          <span className="text-[11px] md:text-[12px] font-semibold text-neutral-700 whitespace-nowrap">Setup</span>
        </button>
      )}

      {/* Outside both account menus: each closes itself on the click that opens
          this, so it cannot be a child of either. */}
      <LanguageModal open={languageOpen} onOpenChange={setLanguageOpen} />
    </>
  )
}
