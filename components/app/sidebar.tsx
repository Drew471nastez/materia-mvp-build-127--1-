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
  Menu,
  Link2,
  HelpCircle,
  Zap,
  ChevronDown,
  ChevronRight,
  Compass,
  Library,
  Bell,
  Home,
  Wallet,
  X,
  Sparkles,
  Store,
  MonitorSmartphone,
  Search,
  Globe,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
// Sheet removed — mobile sidebar now uses pure CSS transitions for reliable close animation
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DesktopSidebarContent, NAV_ICONS } from "@/components/app/sidebar-desktop-nav"
import type { NavIconPair } from "@/components/app/sidebar-desktop-nav"

// Imperative height/opacity animation that handles rapid toggles safely.
//
// Why imperative instead of React style-driven transitions:
//   - `transition: height` is the only primitive that smoothly retargets when
//     interrupted (keyframes restart; `style={{height}}` in JSX can miss the
//     start frame if React commits the new value before the browser records
//     the old one).
//   - By writing styles directly in a layout effect and forcing a reflow
//     between the "start" and "end" assignments, we guarantee the browser
//     records both values and runs the transition every time — including on
//     rapid open/close/open clicks.
//   - After an open transition we set `height: auto` so content can reflow
//     naturally (e.g. i18n label length changes) without being pinned.
//   - The very first layout pass applies steady state with no transition, so
//     a collapsed group doesn't play a fake close animation on mount.
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const didInitRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    const DURATION = 360
    const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
    const TRANSITION = `height ${DURATION}ms ${EASE}, opacity ${DURATION}ms ${EASE}`

    // Initial paint — snap to steady state, no animation.
    if (!didInitRef.current) {
      didInitRef.current = true
      outer.style.transition = "none"
      outer.style.overflow = "hidden"
      outer.style.willChange = "height, opacity"
      outer.style.height = open ? "auto" : "0px"
      outer.style.opacity = open ? "1" : "0"
      return
    }

    // Cancel any queued post-transition cleanup from a prior run.
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    // Capture current (possibly mid-transition) height as the animation start.
    const startHeight = outer.getBoundingClientRect().height
    const endHeight = open ? inner.scrollHeight : 0

    // Pause the current transition and pin the start frame to an explicit px
    // so the next assignment has something to transition FROM. Force a reflow
    // between the two writes so the browser records the old value.
    outer.style.transition = "none"
    outer.style.height = `${startHeight}px`
    outer.style.opacity = outer.style.opacity || (open ? "0" : "1")
    // Force reflow
    void outer.offsetHeight

    // Apply the transition and the new target.
    outer.style.transition = TRANSITION
    outer.style.height = `${endHeight}px`
    outer.style.opacity = open ? "1" : "0"

    // When the height transition finishes AND we ended in the open state,
    // release the pinned height so content can grow/shrink naturally.
    const handleEnd = (e: TransitionEvent) => {
      if (e.target !== outer || e.propertyName !== "height") return
      outer.removeEventListener("transitionend", handleEnd)
      if (open) {
        outer.style.transition = "none"
        outer.style.height = "auto"
        // One RAF to let the style settle, then restore transition for next toggle.
        rafRef.current = requestAnimationFrame(() => {
          outer.style.transition = TRANSITION
          rafRef.current = null
        })
      }
    }
    outer.addEventListener("transitionend", handleEnd)
    return () => {
      outer.removeEventListener("transitionend", handleEnd)
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [open, children])

  return (
    <div ref={outerRef} aria-hidden={!open}>
      <div ref={innerRef}>{children}</div>
    </div>
  )
}
import { NotificationsModal, NotificationBadge } from "./notifications-modal"
import { useLanguage } from "@/lib/i18n"
import { LanguageModal } from "@/components/platform/language-modal"
import { toOriginalImageUrl } from "@/lib/storage/image-url"
import { isNativeApp, nativeLogOut, openExternal } from "@/lib/native-bridge"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"

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
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const [mobileProfileDropdownOpen, setMobileProfileDropdownOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([])
  // Optimistic active-link state: the clicked href lights up immediately, even
  // before the new page finishes loading. Cleared as soon as pathname catches
  // up. Makes sidebar clicks feel instant instead of waiting on the route.
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const mobileDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMobileMenuOpen(false)
    setProfileDropdownOpen(false)
    setMobileProfileDropdownOpen(false)
    setHeaderProfileOpen(false)
    setSearchOpen(false)
    // Pathname changed — the optimistic active state has served its purpose.
    setPendingHref(null)
  }, [pathname])

  // Load dismissed notifications from localStorage
  useEffect(() => {
    setDismissedNotifications(getDismissedNotifications())
  }, [])

  // Re-check dismissed notifications when notifications modal closes
  useEffect(() => {
    if (!notificationsOpen) {
      setDismissedNotifications(getDismissedNotifications())
    }
  }, [notificationsOpen])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false)
      }
      if (mobileDropdownRef.current && !mobileDropdownRef.current.contains(event.target as Node)) {
        setMobileProfileDropdownOpen(false)
      }
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
    { href: "/creator-page", label: t("nav.creatorPage"), icon: NAV_ICONS.storeBuilder, forceNavigation: true },
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
  const userInitials = userDisplayName.slice(0, 2).toUpperCase()

  // Sub-item for expandable groups (e.g. Coupons under Products).
  // No icon, indented, violet accent when active — matches the nested-nav
  // pattern (parent → child sub-rows) seen in Linktree/Shopify admin.
  const SubNavItem = ({ child, onClick }: { child: NavItemChild; onClick?: () => void }) => {
    const realActive = pathname === child.href || pathname.startsWith(child.href)
    const isActive = realActive || pendingHref === child.href
    const isPending = !realActive && pendingHref === child.href

    const handleClick = () => {
      if (!realActive) {
        setPendingHref(child.href)
        startNavigationLoading()
      }
      onClick?.()
    }

    const handlePrefetch = () => {
      if (!realActive) {
        try { router.prefetch(child.href) } catch {}
      }
    }

    return (
      <Link
        href={child.href}
        onClick={handleClick}
        onMouseEnter={handlePrefetch}
        onFocus={handlePrefetch}
        className={cn(
          "flex items-center rounded-[8px] px-3 py-1.5 text-[13.5px] font-medium cursor-pointer transition-[background-color,color,opacity] duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] active:opacity-80",
          isActive
            ? "bg-neutral-200 text-neutral-900"
            : "text-neutral-500 hover:bg-neutral-100/70 hover:text-neutral-900",
          isPending && "opacity-90",
        )}
      >
        <span>{child.label}</span>
      </Link>
    )
  }

  // Light NavItem for desktop sidebar
  const NavItem = ({ item, onClick }: { item: NavItemData; onClick?: () => void }) => {
    const realActive = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href))
    // Optimistic active state: treat the link as active the moment the user
    // clicks it, so the highlight appears instantly — before the server
    // response, before the page re-renders. Cleared when pathname catches up.
    const isActive = realActive || pendingHref === item.href
    /*
      THE PAIR RESOLVES HERE, from the row's own active state.

      `item.icon` is a { line, fill } pair now, not a component. Picking the
      variant at this point means the mobile drawer fills the row you are on
      exactly as the desktop rail does — the two surfaces render the same list
      and should not disagree about what the current page looks like.
    */
    const Icon = isActive ? item.icon.fill : item.icon.line
    const isPending = !realActive && pendingHref === item.href

    const hasChildren = !!item.children && item.children.length > 0
    const expanded = hasChildren && expandedGroups.has(item.href)

    const baseClassName = cn(
      "flex items-center gap-3 rounded-[8px] px-3 py-1.5 text-[14px] font-medium text-left cursor-pointer transition-[background-color,color,opacity] duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] active:opacity-80",
      isActive
        ? "bg-neutral-200 text-neutral-900"
        : "text-neutral-600 hover:bg-neutral-100/70 hover:text-neutral-900 active:bg-neutral-200/80",
      isPending && "opacity-90",
    )

    const handleClick = () => {
      if (!realActive) {
        setPendingHref(item.href)
        startNavigationLoading()
      }
      onClick?.()
    }

    // Prefetch on hover/focus — warms the route cache so the click feels
    // instant. Next.js <Link> already prefetches on viewport in prod, but
    // hover prefetch closes the remaining gap for long lists.
    const handlePrefetch = () => {
      if (!item.forceNavigation && !realActive) {
        try { router.prefetch(item.href) } catch {}
      }
    }

    // Use button for force navigation to ensure reliable click handling
    if (item.forceNavigation) {
      return (
        <button
          onClick={() => {
            handleClick()
            // In Capacitor, router.push preserves auth session (no full reload)
            // On web, force full reload for reliable cross-layout navigation
            if (isNativePlatform()) {
              router.push(item.href)
            } else {
              window.location.href = item.href
            }
          }}
          className={cn(baseClassName, "w-full")}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          <span>{item.label}</span>
        </button>
      )
    }

    if (hasChildren) {
      // grid-template-rows 0fr → 1fr animates true auto-height smoothly at 60fps,
      // no content measurement needed and no late clipping when children change.
      return (
        <div>
          <div className="flex items-center gap-1">
            <Link
              href={item.href}
              onClick={handleClick}
              onMouseEnter={handlePrefetch}
              onFocus={handlePrefetch}
              className={cn(baseClassName, "flex-1 min-w-0")}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                toggleGroup(item.href)
              }}
              aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
              aria-expanded={expanded}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-neutral-400 hover:bg-neutral-100/70 hover:text-neutral-700 transition-[background-color,color] duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] cursor-pointer"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 will-change-transform",
                  expanded ? "rotate-180" : "rotate-0"
                )}
                strokeWidth={1.8}
                style={{
                  transformOrigin: "center",
                  transition: expanded
                    ? "transform 440ms cubic-bezier(0.16, 1, 0.3, 1)"
                    : "transform 320ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </button>
          </div>
          <Collapsible open={expanded}>
            <div className="pt-1 pl-3 ml-[21px] border-l border-neutral-200 space-y-[2px]">
              {item.children!.map((child) => (
                <SubNavItem key={child.href} child={child} onClick={onClick} />
              ))}
            </div>
          </Collapsible>
        </div>
      )
    }

    return (
      <Link
        href={item.href}
        onClick={handleClick}
        onMouseEnter={handlePrefetch}
        onFocus={handlePrefetch}
        className={cn(baseClassName, "w-full")}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span>{item.label}</span>
      </Link>
    )
  }

  // Dark NavItem for mobile sidebar (matches dark header)
  const MobileNavItem = ({ item, onClick }: { item: (typeof mainNavItems)[0]; onClick?: () => void }) => {
    const realActive = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href))
    const isActive = realActive || pendingHref === item.href
    /*
      THE PAIR RESOLVES HERE, from the row's own active state.

      `item.icon` is a { line, fill } pair now, not a component. Picking the
      variant at this point means the mobile drawer fills the row you are on
      exactly as the desktop rail does — the two surfaces render the same list
      and should not disagree about what the current page looks like.
    */
    const Icon = isActive ? item.icon.fill : item.icon.line
    const isPending = !realActive && pendingHref === item.href

    const baseClassName = cn(
      "flex items-center gap-3 rounded-[8px] px-3 py-1.5 text-[14px] font-medium w-full text-left cursor-pointer transition-[background-color,color,opacity] duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] active:opacity-80",
      isActive
        ? "bg-white/15 text-white"
        : "text-white/70 hover:bg-white/10 hover:text-white active:bg-white/15",
      isPending && "opacity-90",
    )

    const handleClick = () => {
      if (!realActive) {
        setPendingHref(item.href)
        startNavigationLoading()
      }
      onClick?.()
    }

    const handlePrefetch = () => {
      if (!item.forceNavigation && !realActive) {
        try { router.prefetch(item.href) } catch {}
      }
    }

    // Use button for force navigation to ensure reliable click handling
    if (item.forceNavigation) {
      return (
        <button
          onClick={() => {
            handleClick()
            // In Capacitor, router.push preserves auth session (no full reload)
            // On web, force full reload for reliable cross-layout navigation
            if (isNativePlatform()) {
              router.push(item.href)
            } else {
              window.location.href = item.href
            }
          }}
          className={baseClassName}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          <span>{item.label}</span>
        </button>
      )
    }

    return (
      <Link
        href={item.href}
        onClick={handleClick}
        onMouseEnter={handlePrefetch}
        onFocus={handlePrefetch}
        className={baseClassName}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span>{item.label}</span>
      </Link>
    )
  }

  const ProfileDropdown = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
        className={cn(
          "flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-all duration-200 ease-out cursor-pointer group",
          profileDropdownOpen ? "bg-neutral-100/80" : "hover:bg-neutral-100/70 active:bg-neutral-200/60",
        )}
      >
        <div
          className="relative h-10 w-10 shrink-0 rounded-full overflow-hidden"
          style={{
            transform: 'translateZ(0)',
            willChange: 'contents',
            contain: 'layout paint',
            isolation: 'isolate',
          }}
        >
          {/* Always render fallback behind */}
          <div className="absolute inset-0 bg-neutral-200 flex items-center justify-center text-neutral-600 text-sm font-medium">
            {userInitials}
          </div>
          {/* Image on top when available */}
          {avatarUrl && (
            <img
              src={avatarSrc}
              alt={userDisplayName}
              width={40}
              height={40}
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
              decoding="async"
              style={{ backfaceVisibility: 'hidden' }}
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          )}
        </div>
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
    { label: "Creator Page", href: "/creator-page", icon: Store, category: "Pages" },
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

  // Check if we should show setup widget (hide on store-builder, onepage, and new product page)
  const showSetupWidget = setupProgress &&
    setupProgress.completed < setupProgress.total &&
    !pathname.startsWith("/creator-page") &&
    !pathname.startsWith("/store-builder") &&
    !pathname.startsWith("/app/onepage") &&
    !pathname.startsWith("/app/products/new")

  const setupProgressPercent = setupProgress ? Math.round((setupProgress.completed / setupProgress.total) * 100) : 0

  // ── Portal tooltip for "Coming soon" items ─────────────────────────────────
  // Renders outside any overflow-clipping ancestor via createPortal so the
  // tooltip is never cut off by the sidebar scroll container.
  const SoonItem = ({ onClose }: { onClose?: () => void }) => {
    const [show, setShow] = useState(false)
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
    const rowRef = useRef<HTMLSpanElement>(null)

    const handleEnter = () => {
      if (rowRef.current) {
        const rect = rowRef.current.getBoundingClientRect()
        setTooltipPos({ x: rect.right + 10, y: rect.top + rect.height / 2 })
      }
      setShow(true)
    }

    return (
      <span
        ref={rowRef}
        className="flex items-center gap-3 rounded-[8px] px-3 py-1.5 text-[14px] font-medium text-neutral-400 cursor-default select-none"
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        <Link2 className="h-[18px] w-[18px] shrink-0" strokeWidth={1.5} />
        <span>Link shortener</span>
        {show && typeof document !== "undefined" && createPortal(
          <div
            style={{
              position: "fixed",
              left: tooltipPos.x,
              top: tooltipPos.y,
              transform: "translateY(-50%)",
              zIndex: 99999,
              pointerEvents: "none",
            }}
            className="px-2.5 py-1.5 bg-neutral-900 text-white text-xs font-medium rounded-lg whitespace-nowrap shadow-lg"
          >
            Coming soon
            <div className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] border-b-[5px] border-r-[5px] border-t-transparent border-b-transparent border-r-neutral-900" />
          </div>,
          document.body
        )}
      </span>
    )
  }

  /*
    The desktop sidebar's content used to be declared here, inside the
    component — see the note at the top of sidebar-desktop-nav.tsx for why
    that was the cause of the flashing rather than a matter of tidiness.
    The mobile drawer below is deliberately untouched: it is a different
    surface with a dark theme, and this change was scoped to the desktop rail.
  */

  // Mobile sidebar content with white UI theme (positioned below dark header)
  const MobileSidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="flex h-full flex-col bg-white">
      <nav className="sidebar-nav flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-0.5">
          {mainNavItems.map((item) => (
            <NavItem key={item.href} item={item} onClick={onItemClick} />
          ))}
        </div>

        {/* Tools category */}
        <div className="mt-5">
          <p className="px-3 mb-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Tools</p>
          <div className="space-y-0.5">
            <SoonItem />
          </div>
        </div>

        {storeUrl && !storePublished && (
          <div className="mt-4 rounded-[10px] bg-amber-50/80 border border-amber-100/80 px-3 py-2.5">
            <p className="text-[12px] text-amber-700">Store is unpublished. Go to Settings to publish.</p>
          </div>
        )}

        {/* Setup Progress Section for Mobile sidebar - always shown when incomplete */}
        {setupProgress && setupProgress.completed < setupProgress.total && !pathname.startsWith("/app/emails") && (
          <button
            onClick={() => {
              onItemClick?.()
              if (pathname === "/app") {
                const setupSection = document.getElementById("store-setup-section")
                setupSection?.scrollIntoView({ behavior: "smooth", block: "start" })
              } else {
                router.push("/app")
                setTimeout(() => {
                  const setupSection = document.getElementById("store-setup-section")
                  setupSection?.scrollIntoView({ behavior: "smooth", block: "start" })
                }, 100)
              }
            }}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-100/60 p-3 text-left transition-all hover:from-violet-100/80 hover:to-purple-100/80"
          >
            <div className="flex items-center gap-3">
              <div className="relative shrink-0 w-10 h-10">
                <SetupProgressCircle progress={setupProgressPercent} size={40} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-violet-600">{setupProgressPercent}%</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-neutral-900">Store Setup</p>
                <p className="text-[11px] text-neutral-500">{setupProgress.completed} of {setupProgress.total} steps complete</p>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
            </div>
          </button>
        )}
      </nav>

      <div className="px-3 pb-3">
        <Link
          href="/app/settings/billing/upgrade"
          onClick={onItemClick}
          className="group flex items-center justify-between rounded-xl bg-gradient-to-r from-violet-50/80 to-purple-50/80 border border-violet-100/60 px-3.5 py-3 transition-[background-color,border-color] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)] hover:from-violet-100/80 hover:to-purple-100/80 hover:border-violet-200/70"
        >
          <div>
            <p className="text-[13px] font-semibold text-neutral-900">{t("nav.upgradeToPro")}</p>
            <p className="text-[11px] text-neutral-600">{t("nav.unlockBenefits")}</p>
          </div>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 group-hover:bg-gray-200 transition-colors duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)]">
            <Zap className="h-3.5 w-3.5 text-violet-500 fill-violet-500" strokeWidth={2} />
          </div>
        </Link>
      </div>

      {/* pt keeps existing 15px spacing; pb adds safe-area bottom so the branding
          bar clears the iOS home indicator / Android gesture nav in Capacitor.
          env() = 0px in browsers — no visual change there. */}
      <div className="border-t border-neutral-200/50 px-4 pt-[15px] pb-[calc(15px+env(safe-area-inset-bottom,_0px))]">
        <div className="flex items-center justify-between">
          <Link
            href="/explore"
            onClick={(e) => {
              if (isNativeApp()) { e.preventDefault(); openExternal(EXPLORE_FULL_URL) }
              onItemClick?.()
            }}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img
              src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"
              alt="Storelib"
              className="h-[30px] w-[30px] rounded-[4px]"
            />
            <span className="text-[17px] font-semibold text-neutral-900">Storelib</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <Link
              href="/explore"
              onClick={(e) => {
                if (isNativeApp()) { e.preventDefault(); openExternal(EXPLORE_FULL_URL) }
                onItemClick?.()
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors cursor-pointer"
            >
              <Compass className="h-[19px] w-[19px]" strokeWidth={1.5} />
            </Link>
            <Link
              href="/app/settings"
              onClick={onItemClick}
              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors cursor-pointer"
            >
              <Settings className="h-[19px] w-[19px]" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )

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
      <header className="fixed top-0 left-0 right-0 z-50 hidden md:block pt-[env(safe-area-inset-top,_0px)]" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
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
              <div
                className="relative h-7 w-7 shrink-0 rounded-full ring-1 ring-white/20 overflow-hidden"
                style={{
                  transform: 'translateZ(0)',
                  willChange: 'contents',
                  contain: 'layout paint',
                  isolation: 'isolate',
                }}
              >
                <div className="absolute inset-0 bg-neutral-700 flex items-center justify-center text-white text-[10px] font-medium">
                  {userInitials}
                </div>
                {avatarUrl && (
                  <img
                    src={avatarSrc}
                    alt={userDisplayName}
                    width={28}
                    height={28}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="eager"
                    decoding="async"
                    style={{ backfaceVisibility: 'hidden' }}
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                )}
              </div>
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
                onClick={() => setNotificationsOpen(true)}
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
                src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"
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
      <header className="fixed top-0 left-0 right-0 z-50 md:hidden bg-[#111111]"
        style={{ height: 'calc(68px + env(safe-area-inset-top, 0px))', touchAction: 'none', overscrollBehavior: 'none', willChange: 'transform', WebkitTransform: 'translateZ(0)', transform: 'translateZ(0)', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden' }}>
        <div className="flex h-[68px] items-center justify-between px-4 py-[10px]"
          style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}>
          {/* Left side: Hamburger */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl text-white/90 hover:text-white hover:bg-white/10 transition-all duration-200 ease-out active:scale-95"
              onClick={() => {
                if (mobileProfileDropdownOpen) {
                  setMobileProfileDropdownOpen(false)
                }
                setMobileMenuOpen(!mobileMenuOpen)
              }}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              <div className="relative w-5 h-5 flex items-center justify-center">
                <span
                  className={cn(
                    "absolute h-[2px] w-5 bg-current rounded-full transition-all duration-300 ease-out",
                    mobileMenuOpen ? "rotate-45 top-[9px]" : "rotate-0 top-[4px]"
                  )}
                />
                <span
                  className={cn(
                    "absolute h-[2px] w-5 bg-current rounded-full top-[9px] transition-all duration-300 ease-out",
                    mobileMenuOpen ? "opacity-0 scale-x-0" : "opacity-100 scale-x-100"
                  )}
                />
                <span
                  className={cn(
                    "absolute h-[2px] w-5 bg-current rounded-full transition-all duration-300 ease-out",
                    mobileMenuOpen ? "-rotate-45 top-[9px]" : "rotate-0 top-[14px]"
                  )}
                />
              </div>
            </Button>
          </div>

          {/* Profile - positioned left near hamburger */}
          <div ref={mobileDropdownRef} className="relative flex-1 ml-1 z-[60]">
            <button
              onClick={() => {
                if (mobileMenuOpen) {
                  setMobileMenuOpen(false)
                }
                setMobileProfileDropdownOpen(!mobileProfileDropdownOpen)
              }}
              className={cn(
                "flex items-center gap-2 w-fit justify-start rounded-xl px-2 py-1.5 transition-all duration-200 ease-out",
                mobileProfileDropdownOpen ? "bg-white/15" : "hover:bg-white/10"
              )}
            >
              <div
                className="relative h-6 w-6 shrink-0 rounded-full ring-1 ring-white/20 overflow-hidden"
                style={{
                  transform: 'translateZ(0)',
                  willChange: 'contents',
                  contain: 'layout paint',
                  isolation: 'isolate',
                }}
              >
                {/* Always render fallback behind */}
                <div className="absolute inset-0 bg-neutral-700 flex items-center justify-center text-white text-[10px] font-medium">
                  {userInitials}
                </div>
                {/* Image on top when available */}
                {avatarUrl && (
                  <img
                    src={avatarSrc}
                    alt={userDisplayName}
                    width={24}
                    height={24}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="eager"
                    decoding="async"
                    style={{ backfaceVisibility: 'hidden' }}
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                )}
              </div>
              <span className="text-[13px] font-medium text-white/90 max-w-[120px] truncate">
                {userDisplayName}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-white/50 transition-transform duration-200 ease-out",
                  mobileProfileDropdownOpen && "rotate-180"
                )}
              />
            </button>

            {/*
              THE ACCOUNT MENU IS A SHEET, NOT A DROPDOWN.

              A 200px card hanging off the avatar is a desktop shape: on a
              phone it opens under the thumb that pressed it, covers the page
              it belongs to, and has nothing to grab. A sheet comes from the
              bottom, where the hand is, and can be pushed back down.

              The drag is in components/ui/bottom-sheet — the sheet follows
              the finger every frame, a flick closes it, and the listeners are
              native because React registers touchmove passively and a sheet
              that cannot refuse the page's scroll slides against it.
            */}
          </div>

          {/* Right side: Notifications + Home */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl text-white/90 hover:text-white hover:bg-white/10 relative"
              onClick={() => setNotificationsOpen(true)}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <NotificationBadge count={notificationCount} />
            </Button>
            <Link href="/app">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-xl text-white/90 hover:text-white hover:bg-white/10"
                aria-label="Home"
              >
                <Home className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <BottomSheet
        isOpen={mobileProfileDropdownOpen}
        onClose={() => setMobileProfileDropdownOpen(false)}
        label="Account"
      >
        <div className="px-3 pb-3">
          <div className="flex items-center gap-3 px-2 pb-3 pt-1">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-neutral-200">
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 text-[13px] font-medium text-neutral-500">
                {userInitials}
              </div>
              {avatarUrl && (
                <img src={avatarSrc} alt={userDisplayName} className="absolute inset-0 h-full w-full object-cover" loading="eager" decoding="async" />
              )}
            </div>
            <span className="truncate text-[15px] font-semibold text-neutral-900">{userDisplayName}</span>
          </div>

          {profileDropdownItems.map((item) => {
            const Icon = item.icon
            const isExplore = item.href === "/explore"
            const isHelp = item.href === "/help"
            return (
              <Link
                key={item.href}
                href={item.href}
                {...("target" in item ? { target: item.target, rel: "noopener noreferrer" } : {})}
                onClick={(e) => {
                  if (isHelp && isNativeApp()) {
                    e.preventDefault()
                    openExternal(HELP_FULL_URL)
                  } else if (isExplore && isNativeApp()) {
                    e.preventDefault()
                    openExternal(EXPLORE_FULL_URL)
                  }
                  setMobileProfileDropdownOpen(false)
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-neutral-800 active:bg-neutral-100"
              >
                <Icon className="h-[18px] w-[18px] shrink-0 text-neutral-400" strokeWidth={1.75} />
                <span>{item.label}</span>
              </Link>
            )
          })}
          <button
            onClick={() => {
              setMobileProfileDropdownOpen(false)
              setLanguageOpen(true)
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-neutral-800 active:bg-neutral-100"
          >
            <Globe className="h-[18px] w-[18px] shrink-0 text-neutral-400" strokeWidth={1.75} />
            <span>{t("settings.language")}</span>
          </button>

          <div className="my-1.5 h-px bg-neutral-100" />

          <button
            onClick={() => {
              setMobileProfileDropdownOpen(false)
              handleSignOut()
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-red-600 active:bg-red-50"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            <span>Logout</span>
          </button>
        </div>
      </BottomSheet>

      {/* Notifications Modal */}
      <NotificationsModal
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        stripeConnected={stripeConnected}
        stripeStatus={stripeStatus}
        onePagePublished={onePagePublished}
      />

      {/* Custom Mobile Sidebar — pure CSS transitions for smooth open AND close */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden bg-black/50",
          mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        style={{
          top: 'calc(68px + env(safe-area-inset-top))',
          transitionProperty: 'opacity',
          transitionDuration: '300ms',
          transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />
      <div
        className="fixed z-50 md:hidden w-[260px] max-w-[85vw] bg-white shadow-xl border-r border-neutral-200/50"
        style={{
          top: 'calc(68px + env(safe-area-inset-top))',
          bottom: 0,
          left: 0,
          transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
          transitionProperty: 'transform',
          transitionDuration: '300ms',
          transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation Menu"
      >
        <MobileSidebarContent onItemClick={() => setMobileMenuOpen(false)} />
      </div>

      {/* top and height mirror the desktop header: 58 px content row +
          env(safe-area-inset-top) padding. In a browser env() = 0 so
          this is identical to the previous top-[58px] / calc(100svh-58px). */}
      <aside
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
            // Optimistic only — it ADDS a highlight the moment a row is
            // clicked and never takes one away, so the active state never
            // blinks off mid-navigation. Which page is active is still
            // decided by the pathname, in isRouteActive.
            setPendingHref(href)
            startNavigationLoading()
          }}
          onForceNavigate={(href) => {
            setPendingHref(href)
            startNavigationLoading()
            // These leave the /app router tree. In Capacitor a full reload
            // would lose the session, which lives in Preferences rather than
            // in a cookie.
            if (isNativePlatform()) router.push(href)
            else window.location.href = href
          }}
          onPrefetch={(href) => {
            try { router.prefetch(href) } catch {}
          }}
          toolsLabel="Tools"
          communitiesLabel="Communities"
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
