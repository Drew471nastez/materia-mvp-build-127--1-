"use client"

import { MiniMark } from "@/components/app/settings/integration-mark"
import { personName } from "@/lib/profile/display-name"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Settings,
  LogOut,
  CreditCard,
  ChevronDown,
  ChevronRight,
  Compass,
  Library,
  Bell,
  Sparkles,
  Store,
  Globe,
  HelpCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
// Sheet removed — mobile sidebar now uses pure CSS transitions for reliable close animation
import { AppAvatar } from "@/components/app/app-avatar"
import { AppTopCorners } from "@/components/app/app-top-corners"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { MobileAccountMenu } from "@/components/app/mobile-account-menu"
import { AccountFilm, FILM, pressHandlers, release } from "@/components/app/account-film"
import { BusinessSwitcher, type BusinessRow, type TeamStoreRow } from "@/components/app/business-switcher"
import { memberSees, type TeamPermission } from "@/lib/team/permissions"
import { DesktopSidebarContent, NAV_ICONS, NAV_ICONS_EXTRA, groupForRoute } from "@/components/app/sidebar-desktop-nav"
import type { NavIconPair } from "@/components/app/sidebar-desktop-nav"
import { MobileMenuPage, MobileNavPill, pillBelongsOn, useLockAppScroll } from "@/components/app/sidebar-mobile-nav"
/* The header draws it directly; the bar below does not carry it any more. */
import { CompassIcon as ExploreIcon } from "@solar-icons/react/linear/compass"

import { NotificationsModal, LiveNotificationBadge } from "./notifications-modal"
import { AppSearch, type AppSearchHandle } from "@/components/app/app-search"
import { useLanguage } from "@/lib/i18n"
import { AppLanguageModal } from "@/components/app/language-picker"
import { toOriginalImageUrl } from "@/lib/storage/image-url"
import { isNativeApp, nativeLogOut } from "@/lib/native-bridge"
import { openStorelibPage, warmStorelibPages } from "@/lib/navigation/cross-section"
import { prefetchHref } from "@/lib/nav/prefetch-policy"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { APP_PAGE_KEPT_MS, isPhoneShell, prefetchAppPage, useShownPath, useShownSearch } from "@/lib/ui/app-navigation"
import { STEP_ASIDE, STEP_ASIDE_MOTION, useFootBarUp } from "@/lib/ui/foot-bars"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { tt } from "@/lib/i18n/text"
import { APP_HELP_HREF } from "@/components/app/mobile-account-menu"
import dynamic from "next/dynamic"

/* Round 33: a community's own setup pill, loaded only on a community's pages (components/community/creator/setup-pill.tsx). */
const CommunitySetupPill = dynamic(() => import("@/components/community/creator/setup-pill").then((m) => m.CommunitySetupPill), { ssr: false })


// Progress circle component for setup widget
function SetupProgressCircle({ progress, size = 32, strokeWidth = 3 }: { progress: number; size?: number; strokeWidth?: number }) {
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
  /** The account's businesses for the switcher at the top of the account menu (app/app/layout.tsx). */
  businesses?: BusinessRow[]
  /** The platform switch for communities (lib/communities/flag.ts), read by the layout: the Community row shows only while it is on. */
  communitiesEnabled?: boolean
  /** Working in someone else's store as a team member (lib/team): only the rows their permissions open are drawn. */
  teamPermissions?: TeamPermission[] | null
  /** The stores this account is on as a team member, for the account menu's switcher. */
  teamStores?: TeamStoreRow[]
}

type NotificationsHandle = { open: () => void; toggle: () => void }

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
}>(function NotificationsHost({ stripeConnected, stripeStatus, onePagePublished }, ref) {
  const [open, setOpen] = useState(false)
  useImperativeHandle(ref, () => ({ open: () => setOpen(true), toggle: () => setOpen((o) => !o) }), [])
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

/*
  A COMMUNITY'S SETTINGS keep their Save in a bar stuck to the bottom of the
  page (components/community/creator/settings-section), right where the Setup
  pill floats, which covered the button. Hidden there like on Settings.
*/
/** When Settings was last fetched ahead on a phone (see the warm-up in the shell below). */
let settingsWarmedAt = 0

const COMMUNITY_SETTINGS_PATH = /^\/app\/community\/[^/]+\/settings(\/|$)/

export function AppSidebar({ creatorSlug, username, storePublished, avatarUrl, displayName, stripeConnected = false, stripeStatus = "not_connected", onePagePublished = false, setupProgress, businesses = [], communitiesEnabled = false, teamPermissions = null, teamStores = [] }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()
  /* Explore, read ahead while the dashboard is idle, so leaving for it lands at once (lib/navigation/cross-section.ts). */
  useEffect(() => warmStorelibPages(router), [router])
  /**
   * The language picker, opened from either account menu in this sidebar.
   *
   * It sets both providers, LanguageProvider (this sidebar's words, so they
   * change at once) and LocaleProvider, which share ONE localStorage key
   * ("storelib_language"): components/app/language-picker.
   */
  const [languageOpen, setLanguageOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  useLockAppScroll(mobileMenuOpen)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  /* The bell opens the host below by ref: its open state is the host's, so
     opening notifications does not re-render this whole sidebar. */
  const notificationsRef = useRef<NotificationsHandle>(null)
  /* A second press on the bell closes what the first one opened. */
  const openNotifications = useCallback(() => notificationsRef.current?.toggle(), [])
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
  }, [pathname])

  /*
    THE ONEPAGE EDITOR IS FETCHED BEFORE THE PRESS, ON A PHONE TOO. It is the
    heaviest page in /app (about 215KB of its own code, gzipped, on top of
    the shell's), and on a phone nothing fetched it ahead: the rail's hover
    does on a computer, but the menu's row and Home's card only warm it as
    the finger lands, so the first press waited for the server and then for
    the code, and the spinner came up. Once the shell is idle, a creator who
    has a OnePage has it fetched whole (prefetchAppPage), code included, and
    again when the app comes back after longer than the router keeps it.
  */
  /*
    Settings fetched whole a moment after each page settles, so it opens
    already filled instead of empty with its sections arriving after. On a
    phone (data and battery) at most once every few minutes, which is about
    as long as the router keeps it.
  */
  useEffect(() => {
    if (pathname.startsWith("/app/settings")) return
    if (isPhoneShell() && Date.now() - settingsWarmedAt < 4 * 60_000) return
    const t = window.setTimeout(() => {
      settingsWarmedAt = Date.now()
      prefetchAppPage(router, "/app/settings")
    }, isPhoneShell() ? 2000 : 1500)
    return () => window.clearTimeout(t)
  }, [pathname, router])

  useEffect(() => {
    if (!onePagePublished || !isPhoneShell()) return
    let warmedAt = 0
    const warm = () => {
      if (window.location.pathname.startsWith("/app/onepage")) return
      warmedAt = Date.now()
      prefetchAppPage(router, "/app/onepage")
    }
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const idle = w.requestIdleCallback ? w.requestIdleCallback(warm, { timeout: 5000 }) : window.setTimeout(warm, 2500)
    const onVisible = () => {
      if (document.visibilityState === "visible" && warmedAt && Date.now() - warmedAt > APP_PAGE_KEPT_MS) warm()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      if (w.cancelIdleCallback) w.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
      document.removeEventListener("visibilitychange", onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onePagePublished])

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

  /* The count on each bell is its own component (LiveNotificationBadge): it
     reads what is unread from the store the panel writes to, so "Mark all as
     read" empties it at once, and a new count draws the badge, not this
     sidebar. */
  const badgeProps = { stripeConnected, stripeStatus, onePagePublished }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: "local" })
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
  const physicalCommerce = usePhysicalCommerceEnabled()
  /* COMMUNITY, after Products, only while the platform switch is on (the layout reads it). Off, the row is not there at all. */
  const communityItem: NavItemData[] = communitiesEnabled ? [{ href: "/app/community", label: tt("Community"), icon: NAV_ICONS_EXTRA.community }] : []
  const mainNavItems: NavItemData[] = [
    { href: "/app", label: t("nav.dashboard"), icon: NAV_ICONS.dashboard },
    {
      href: "/app/products",
      label: t("nav.products"),
      icon: NAV_ICONS.products,
      children: [
        { href: "/app/coupons", label: tt("Coupons") },
        { href: "/app/reviews", label: tt("Reviews") },
        /* No Memberships row: memberships are communities now (Community, below, while the switch is on). A creator's existing ones still open at /app/memberships. */
      ],
    },
    ...communityItem,
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
    /* A page in the shell like the others, so the router brings it: a whole
       document load was the spinner, a blank frame, then the page. */
    { href: "/app/website-builder", label: t("nav.websiteBuilder"), icon: NAV_ICONS.websiteBuilder },
    /*
      THE ONEPAGE ROW IS AN ORDINARY /app PAGE TOO. It still loaded the
      editor as a whole new document (forceNavigation, window.location),
      a leftover of when the editor was outside the /app tree: the old
      page, then the cold start's black frame and spinner, then the editor,
      three arrivals for one press, and a press that did nothing the
      router could see or undo (scripts/check-onepage-open.mjs films it).
      Home's OnePage card already went by the router; the row does now.
    */
    { href: "/app/onepage", label: t("nav.onepage"), icon: NAV_ICONS.onepage },
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
  /* Collections under Products, first, for every shop (Shopify's Products › Collections); stock beside them only while physical commerce is on in /admin. */
  mainNavItems.find((item) => item.href === "/app/products")?.children?.unshift(
    ...(physicalCommerce ? [{ href: "/app/inventory", label: tt("Inventory") }] : []),
    { href: "/app/products/collections", label: tt("Collections") },
    /* Size charts beside Collections, the store's tables a product page opens from Size guide (app/app/products/size-charts); physical products only. */
    ...(physicalCommerce ? [{ href: "/app/products/size-charts", label: tt("Size charts") }] : []),
  )
  mainNavItems.find((item) => item.href === "/app/products")?.children?.push({ href: "/app/files", label: tt("Files") })
  /* Upsells and bundles beside Coupons, for every shop: they apply in the basket checkout of downloads and the cart checkout of things that ship alike (app/app/offers). */
  mainNavItems.find((item) => item.href === "/app/products")?.children?.splice(mainNavItems.find((item) => item.href === "/app/products")!.children!.findIndex((c) => c.href === "/app/coupons") + 1, 0, { href: "/app/offers", label: tt("Upsells and bundles") })

  /*
    INTEGRATIONS, ALWAYS THERE. A row to the Integrations page
    (/app/integrations), where every integration is found, installed and
    managed; under it, the store's installed ones, each with its own small
    logo, each to its own page there. Read once per visit to the shell and
    again when the tab comes back into view, so installing one shows up
    without a reload.
  */
  const installedIntegrations = useInstalledIntegrations()
  {
    const at = mainNavItems.findIndex((item) => item.href === "/app/emails")
    mainNavItems.splice(at < 0 ? mainNavItems.length : at + 1, 0, {
      href: "/app/integrations",
      label: tt("Integrations"),
      icon: NAV_ICONS_EXTRA.integrations,
      ...(installedIntegrations.length > 0
        ? {
            children: installedIntegrations.map((i) => ({
              href: `/app/integrations?integration=${encodeURIComponent(i.id)}`,
              label: i.needsAttention ? tt("{name} (needs attention)", { name: i.name }) : i.name,
              thumb: <MiniMark item={{ id: i.id, name: i.name, logo: i.logo ?? null }} />,
            })),
          }
        : {}),
    })
  }

  /*
    A TEAM MEMBER SEES WHAT THEIR PERMISSIONS OPEN, AND NOTHING ELSE. The rows
    they were not given are not drawn (lib/team/permissions memberSees); the
    pages behind them say so too (components/app/team-bar), and the server
    refuses their routes either way (lib/team/server requireTeamPermission).
    A row under one they were not given (Coupons under Products, for someone
    with Marketing alone) moves up to a row of its own, so it can be reached.
  */
  const navItems: NavItemData[] = teamPermissions
    ? mainNavItems.flatMap((item): NavItemData[] => {
        const children = item.children?.filter((c) => memberSees(teamPermissions, c.href))
        if (memberSees(teamPermissions, item.href)) return [children ? { ...item, children } : item]
        const { icon } = item
        return (children ?? []).map(({ href, label }) => ({ href, label, icon }))
      })
    : mainNavItems

  // Expandable groups (parent nav items with children).
  /*
    THE OPEN GROUP FOLLOWS THE PAGE (round AK). The owner: opening Products
    opens its list, going to Analytics closes it again, without folding
    anything by hand. The group whose row or one of whose rows is the page
    being shown (or being opened, on the click: useShownPath) is the open
    one, and every other group closes. It is read from the address, so a
    refresh or a link straight to /app/coupons opens Products the same way,
    on the server's first frame too. The chevron still opens or closes a
    group by hand until the next page.
  */
  const shownPath = useShownPath()
  const shownSearch = useShownSearch()
  const routeGroup = groupForRoute(navItems, shownPath, shownSearch)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(routeGroup ? [routeGroup] : []))
  /* Set while rendering, not in an effect: an effect would draw one frame with the old group open, then fold it. */
  const [groupFor, setGroupFor] = useState<string | null>(routeGroup)
  if (groupFor !== routeGroup) {
    setGroupFor(routeGroup)
    setExpandedGroups(new Set(routeGroup ? [routeGroup] : []))
  }
  const toggleGroup = useCallback((href: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  }, [])

  /* The account menu's own pages (Billing; Settings is the rail's), fetched whole under
     the pointer the way the rail's rows are (prefetchAppPage): a plain Link's
     prefetch of a page with no loading boundary brings almost nothing, so the
     click waited for the server. */
  const warmAccountPage = (href: string) => {
    if (href.startsWith("/app/")) prefetchAppPage(router, href)
  }

  /*
   * The desktop account menu's rows. No Settings: this dropdown only exists
   * from md up, where the rail beside the page already has a Settings row
   * (and the bar a gear), so a third way to the same page was a line of the
   * menu spent on nothing. The phone's sheet keeps it (mobile-account-menu).
   *
   * HELP IS BACK, AS A PAGE IN THE APP (round K). It used to open the public
   * /help in a new tab, which is why it left. Now it is /app/help, the same
   * Help Center inside this shell, with a back arrow to the page the menu was
   * opened on. It is its own row after Language, right above Sign Out
   * (APP_HELP_HREF below): the places you go come first, then the two rows
   * about you and the app (Language, Help), then leaving.
   */
  const profileDropdownItems = [
    { href: "/app/settings/billing", label: t("settings.billing"), icon: CreditCard },
    { href: "/explore", label: tt("Explore"), icon: Compass, target: "_blank" as const },
    { href: "/account/library", label: tt("Library"), icon: Library },
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
  /* The profile's photo, or the one Settings has just saved or removed
     (lib/account/avatar-store), so the header changes with Settings at once. */
  const avatarSrc = toOriginalImageUrl(useShellAvatar(avatarUrl))

  const storeUrl = username || creatorSlug
  const userDisplayName = personName({ name: displayName, username, slug: creatorSlug })

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
                prefetch={false}
                {...("target" in item ? { target: item.target, rel: "noopener noreferrer" } : {})}
                onMouseEnter={() => warmAccountPage(item.href)}
                onFocus={() => warmAccountPage(item.href)}
                onClick={(e) => {
                  if (isExplore && isNativeApp()) {
                    e.preventDefault()
                    openStorelibPage(router, "/explore")
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

  /* The search is its own component (components/app/app-search.tsx) with its
     own open state, so a key typed in it does not render this whole sidebar
     again. The handle stays wired for opening it from elsewhere; on a phone
     nothing does, because the bar up there carries no search button. */
  const searchRef = useRef<AppSearchHandle>(null)
  const headerProfileRef = useRef<HTMLDivElement>(null)
  const [headerProfileOpen, setHeaderProfileOpen] = useState(false)

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
  // Products › Collections and Size charts are lists under the same address, not an editor.
  const inProductEditor = /^\/app\/products\/(?!(collections|size-charts)(\/|$))[^/]+/.test(pathname)
  /*
    ROUND 33: on a community's own pages the store's "Setup 71%" was counting the store, not the community open under
    it. There the pill is the community's (CommunitySetupPill below, its own list) and the store's steps wait.
  */
  const inCommunity = /^\/app\/community\/(?!new(\/|$))[^/]+/.test(pathname)
  const showSetupWidget = setupProgress &&
    !inCommunity &&
    setupProgress.completed < setupProgress.total &&
    !pathname.startsWith("/creator-page") &&
    !pathname.startsWith("/app/creator-page") &&
    !pathname.startsWith("/store-builder") &&
    !pathname.startsWith("/app/onepage") &&
    !inProductEditor

  const setupProgressPercent = setupProgress ? Math.round((setupProgress.completed / setupProgress.total) * 100) : 0
  /* Round 27: while a page's bottom bar (Cancel, Save, Back, Next) is on screen, both setup pills step aside (lib/ui/foot-bars.ts). */
  const footUp = useFootBarUp()

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
        /* The rail's scrollbar is in app/globals.css (round AK: it needs @property). */
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
              {...pressHandlers}
              onClick={(e) => {
                release(e)
                setHeaderProfileOpen(!headerProfileOpen)
              }}
              data-open={headerProfileOpen ? "" : undefined}
              className="group/acct relative isolate flex items-center gap-2.5 rounded-full px-2.5 py-1.5 [-webkit-tap-highlight-color:transparent]"
            >
              {/* A soft grey pill behind the name on hover, pressed and open: a film on opacity alone (components/app/account-film). */}
              <AccountFilm shades={FILM.desktop} open={headerProfileOpen} />
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
                "absolute left-0 top-full mt-2 z-[60] min-w-[248px] transition-all duration-200 ease-out origin-top-left",
                headerProfileOpen
                  ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
              )}
            >
              <div className="rounded-xl border border-neutral-200/70 bg-white p-1 shadow-xl shadow-black/10">
                {/* The business you are in first, one row that opens to the other and New business. */}
                {(businesses.length > 0 || teamStores.length > 0) && (
                  <>
                    <BusinessSwitcher businesses={businesses} teamStores={teamStores} variant="dropdown" currentAvatar={avatarSrc} open={headerProfileOpen} onNavigate={() => setHeaderProfileOpen(false)} />
                    <div className="my-1 h-px bg-neutral-100" />
                  </>
                )}
                {profileDropdownItems.map((item) => {
                  const Icon = item.icon
                  const isExploreItem = item.href === "/explore"
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      {...("target" in item ? { target: item.target, rel: "noopener noreferrer" } : {})}
                      onMouseEnter={() => warmAccountPage(item.href)}
                      onFocus={() => warmAccountPage(item.href)}
                      onClick={(e) => {
                        if (isExploreItem && isNativeApp()) {
                          e.preventDefault()
                          openStorelibPage(router, "/explore")
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
                <a
                  href={APP_HELP_HREF}
                  target="_blank"
                  rel="noopener"
                  onClick={() => setHeaderProfileOpen(false)}
                  data-account-help=""
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
                >
                  <HelpCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span>{tt("Help")}</span>
                </a>
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

          {/* Center: the search bar, which opens the search over the page. */}
          <div className="flex-1 flex justify-center px-6 relative" id="desktop-search-container">
            <AppSearch ref={searchRef} communitiesEnabled={communitiesEnabled} />
          </div>

          {/* Right side: Nav icons + Storelib logo */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-1.5">
              <Link
                href="/explore"
                onClick={(e) => { if (isNativeApp()) { e.preventDefault(); openStorelibPage(router, "/explore") } }}
                onMouseEnter={() => prefetchHref(router, "/explore", "hover")}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-all"
                title={tt("Discover")}
              >
                <Compass className="h-[19px] w-[19px]" strokeWidth={1.5} />
              </Link>
              <button
                onClick={openNotifications}
                data-notifications-trigger=""
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-all relative"
                title={tt("Notifications")}
              >
                <Bell className="h-[19px] w-[19px]" strokeWidth={1.5} />
                <LiveNotificationBadge {...badgeProps} />
              </button>
              <Link
                href="/app/settings"
                prefetch={false}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-all"
                title={tt("Settings")}
              >
                <Settings className="h-[19px] w-[19px]" strokeWidth={1.5} />
              </Link>
            </div>

            <div className="h-5 w-px bg-white/15" />

            <Link href="/app" prefetch={false} className="flex items-center gap-2.5 hover:opacity-90 transition-opacity shrink-0">
              {/* 5% UNDER THE 27PX IT WAS, as in every header. components/app/shell-header-still.tsx draws the same number. */}
              <StorelibLogo size={25.65} priority />
              <span className="text-[15px] font-semibold text-white">Storelib</span>
            </Link>
          </div>
        </div>

        {/* The rounded corners where the page meets the bar, the same ones the
            phone's header draws (components/app/app-top-corners.tsx), from one
            radius and one overlap in app/globals.css. Hung from the bar rather
            than stacked under it in the flow, so the header's box ends with the
            bar and the band under it no longer takes presses meant for the page. */}
        <AppTopCorners className="text-[#131316]" />
      </header>

      {/*
        ── THE MENU, AND THE PILL THAT OPENS IT ─────────────────────────────
        What was here was a 260px drawer with a dimmed strip of page beside
        it, opened from the far corner of the screen. Both halves live in
        components/app/sidebar-mobile-nav now, at module scope, which is what
        lets a group animate open without being unmounted mid-transition.

        BEFORE THE PHONE HEADER, ON PURPOSE. The menu and the header share
        z 50 (MobileMenuPage), so this order is what draws the header and its
        rounded corners over the menu's top, while the 50 itself puts the
        menu over Settings as a page (49) under it. The pill is after both.
      */}
      <MobileMenuPage
        open={mobileMenuOpen}
        items={navItems}
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
          storeUrl && !storePublished ? tt("Store is unpublished. Go to Settings to publish.") : undefined
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
                <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Store setup")}</p>
                <p className="text-[12px] text-[#6b7280]">{tt("{completed} of {total} steps done", { completed: setupProgress.completed, total: setupProgress.total })}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
            </button>
          ) : null
        }
      />

      {/* Mobile Header - Dark background, with the page's rounded top corners hanging from it.
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
            businesses={businesses}
            teamStores={teamStores}
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
              SEARCH IS NOT UP HERE ANY MORE.

              It was a magnifying glass beside Explore that opened the search
              over the whole screen. On a phone this row is for who you are and
              what is waiting for you, and a third icon crowded both. The search
              still lives in the middle of the header on a computer, where there
              is room for the bar itself rather than a button standing in for it.
            */}
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
              aria-label={tt("Explore")}
              onClick={() => {
                /* The same document either way (lib/navigation/cross-section.ts). */
                openStorelibPage(router, "/explore")
              }}
            >
              <ExploreIcon size={20} strokeWidth={1.6} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl text-white/90 hover:text-white hover:bg-white/10 relative"
              onClick={openNotifications}
              data-notifications-trigger=""
              aria-label={tt("Notifications")}
            >
              <Bell className="h-5 w-5" />
              <LiveNotificationBadge {...badgeProps} />
            </Button>
            {/* Home moved to the bar at the bottom. Two ways to the same
                page, one of them out of reach, is one too many. */}
          </div>
        </div>
        {/* The desktop bar's rounded corners at the same size: the page meets
            this bar the way it meets that one, on every page, with or without
            a strip at its top, scrolled or not. */}
        <AppTopCorners className="text-[#111111]" />
      </header>


      {/* Notifications Modal */}
      <NotificationsHost
        ref={notificationsRef}
        stripeConnected={stripeConnected}
        stripeStatus={stripeStatus}
        onePagePublished={onePagePublished}
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
        onPrefetch={(href, phone) => {
          /* Asked again whenever a router.refresh() drops it (lib/ui/app-navigation KEPT WARM THROUGH A REFRESH), on a
             phone, where the bar is the way around. On a computer it is hidden: the page alone, once (round 48). */
          prefetchAppPage(router, href, phone ? { keepWarm: true } : { pageOnly: true })
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
      {/*
        ITS WIDTH IS THE ONE THING THAT ANIMATES (round 29), on the curve the
        page's padding beside it uses (--rail-ms and --rail-ease, app/globals.css),
        so the two edges never part (scripts/check-sidebar-round31 measures
        them on every frame). What happens to the rows inside while it moves
        is in the same place in globals.css.

        The collapse toggle is a row at the sidebar's foot, above the Upgrade
        card (round 31, components/app/sidebar-desktop-nav), so nothing hangs
        over the border any more and the layer filling the aside clips.
      */}
      <aside
        id="app-rail"
        data-shell-chrome=""
        data-rail-aside=""
        className="fixed left-0 z-40 hidden w-[var(--app-rail-w,240px)] border-r border-neutral-200/60 bg-white transition-[width] duration-(--rail-ms) ease-(--rail-ease) motion-reduce:transition-none md:block"
        style={{
          top: 'calc(58px + env(safe-area-inset-top, 0px))',
          height: 'calc(100svh - 58px - env(safe-area-inset-top, 0px))',
        }}
      >
        {/*
          overflow-clip, not overflow-hidden (round 32): hidden still makes
          a scroll box that focus or a script can push sideways while the
          sidebar is 63px wide. clip makes no scroll box at all.
        */}
        <div className="absolute inset-0 overflow-clip">
        {/*
          THE DESKTOP NAV LIVES AT MODULE SCOPE — see sidebar-desktop-nav.tsx.

          It used to be declared inside this component, which made it a new
          component TYPE on every render, which made React unmount and rebuild
          every node in the sidebar whenever anything here changed. That is
          what the jumping and the flashing were.
        */}
        <DesktopSidebarContent
          items={navItems}
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
              ? tt("Store is unpublished. Go to Settings to publish.")
              : undefined
          }
        />
        </div>
      </aside>

      {/*
        THE SETUP PILL, BOTTOM RIGHT, DESKTOP ONLY (a phone has the Store
        setup card in its menu, setupSlot above). Hidden over Settings,
        Emails, Payouts and Analytics, where it sat on the page's own
        controls.

        SMALLER AND QUIETER. The owner: "The sticky setup thing in the bottom
        right of the screen, make it a little bit smaller, more subtle, not
        that fat." It was 57px tall: a 37px ring with the percentage in 9px
        bold inside it, padding all round, shadow-lg under it, and a 5% jump
        in size under the pointer, so the one thing floating over every page
        was also the loudest. Now it is a 32px pill: a 20px ring on its own,
        then "Setup" and the percentage as one line of 12.5px text, the
        number in the ring's violet so the two still read together. A
        hairline border and a small soft shadow lift it off the page the way
        the app's cards are lifted, not more. Under the pointer it only goes
        a step greyer, like the depth buttons (components/ui/depth-button);
        no scale, so nothing on screen moves on its own. The percentage left
        the ring because at this size a number inside it would be 7px, which
        nobody reads.

        Same place, same press: to the dashboard's setup section, scrolling
        there if the dashboard is already open.
      */}
      {showSetupWidget && !mobileMenuOpen && (
        <button
          type="button"
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
          data-setup-pill=""
          data-away={footUp ? "" : undefined}
          aria-label={tt("Store setup, {setupProgressPercent}% done", { setupProgressPercent })}
          className={cn(
            // bottom-[calc(...)] keeps the button above the home-indicator on iPad.
            // In a browser env(safe-area-inset-bottom) = 0, so this equals bottom-6.
            "fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,_0px))] right-4 md:right-6 z-40 hidden md:flex h-8 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white pl-1.5 pr-3 text-[12.5px] leading-none",
            "shadow-[0_1px_2px_rgba(15,23,42,0.05),0_2px_8px_rgba(15,23,42,0.06)] hover:bg-[#f7f7f8] active:bg-[#f1f2f4]",
            STEP_ASIDE_MOTION,
            footUp && STEP_ASIDE,
            "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6] [-webkit-tap-highlight-color:transparent]",
            (pathname.startsWith("/app/settings") || pathname.startsWith("/app/emails") || pathname.startsWith("/app/payouts") || pathname.startsWith("/app/analytics") || COMMUNITY_SETTINGS_PATH.test(pathname)) && "!hidden"
          )}
        >
          <SetupProgressCircle progress={setupProgressPercent} size={20} strokeWidth={2.5} />
          <span className="font-medium text-[#374151] whitespace-nowrap">{tt("Setup")}</span>
          <span className="font-medium tabular-nums text-violet-600">{setupProgressPercent}%</span>
        </button>
      )}

      {inCommunity && !mobileMenuOpen ? <CommunitySetupPill pathname={pathname} hidden={COMMUNITY_SETTINGS_PATH.test(pathname)} away={footUp} /> : null}

      {/* Outside both account menus: each closes itself on the click that opens
          this, so it cannot be a child of either. */}
      <AppLanguageModal open={languageOpen} onOpenChange={setLanguageOpen} />
    </>
  )
}

/** The store's installed integrations for the sidebar (app/api/store/integrations/installed). Empty until read, and on any failure. */
type InstalledIntegration = { id: string; name: string; logo?: string | null; needsAttention: boolean }
/* The last list read, kept for the visit: the sidebar draws again on every page, and the row should not empty and refill each time. */
let installedHeld: InstalledIntegration[] = []
/*
  A RETURN TO THE TAB ASKS AGAIN AT MOST ONCE A MINUTE (round 48). Every
  switch back to the browser tab asked the server for the list, which is a
  signed in request with its own database reads, for a row that changes only
  when an integration is installed. An install in this tab still says so at
  once (storelib:integrations-changed); one made elsewhere shows within a
  minute of coming back.
*/
const INSTALLED_AGAIN_MS = 60_000
let installedReadAt = 0
function useInstalledIntegrations(): InstalledIntegration[] {
  const [list, setList] = useState<InstalledIntegration[]>(installedHeld)
  useEffect(() => {
    let live = true
    const read = () => {
      installedReadAt = Date.now()
      fetch("/api/store/integrations/installed", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { installed?: InstalledIntegration[] } | null) => {
          if (d && Array.isArray(d.installed)) installedHeld = d.installed
          if (live && d && Array.isArray(d.installed)) setList(d.installed)
        })
        .catch(() => {})
    }
    read()
    const onShow = () => {
      if (document.visibilityState === "visible" && Date.now() - installedReadAt >= INSTALLED_AGAIN_MS) read()
    }
    window.addEventListener("storelib:integrations-changed", read)
    document.addEventListener("visibilitychange", onShow)
    return () => {
      live = false
      window.removeEventListener("storelib:integrations-changed", read)
      document.removeEventListener("visibilitychange", onShow)
    }
  }, [])
  return list
}
