"use client"

import { hasConsent } from "@/lib/consent/client"
import type React from "react"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import type { User } from "@supabase/supabase-js"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { extractUsernameFromHost, getCanonicalSiteUrl, isCustomDomain, isSellerPage } from "@/lib/url-helpers"
import { useBuyerHeaderLight, useExploreMarketplaceEnabled } from "@/components/platform/explore-marketplace-context"
import { BUYER_HEADER_DARK_BG, headerChrome, type HeaderChrome } from "@/lib/platform/header-chrome"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
/* The shell's own avatar: the photo, else the initials, else a plain
   person, and nothing drawn while a photo is on its way (which is what the
   header wants: this is the viewer's own picture and it is cached). */
import { AppAvatar } from "@/components/app/app-avatar"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BottomSheet } from "@/components/ui/bottom-sheet"

import { Heart, Library, Search, LayoutDashboard, Settings, LogOut, X, ChevronRight, LifeBuoy, Store, Share2, ArrowRight, User as UserIcon, Compass, Globe, MoreHorizontal, Check } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { LanguageModal } from "@/components/platform/language-modal"
import { readAuthSnapshot, writeAuthSnapshot, clearAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { hasSellerAccess, sellerAccessFrom, type SellerState } from "@/lib/account/seller-access"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { useSearchHandoff, useSearchHandoffState, WINDOW_SLACK } from "@/lib/explore/use-search-handoff"
import { useSearchCategories } from "@/lib/explore/search-categories"
import { SEARCH_FIELD_FOCUS, SEARCH_FIELD_SURFACE } from "@/lib/explore/search-field-look"
import { SearchCategoriesButton } from "@/components/explore/search-categories-button"
import { useBuyerTabsHere } from "@/lib/nav/use-buyer-tabs-where"
import { PlaceNavigator, forgetPlaces } from "@/components/nav/place-navigator"
import { needsDocumentLoad } from "@/lib/native-links"
import { addRecent, cleanTerm, clearRecent, DEBOUNCE_MS as QUICK_DEBOUNCE_MS, quickSearch, readRecent, removeRecent, topHits, viewAllHref, type QuickHit } from "@/lib/nav/quick-search"
import { HeaderSearchResults, SLIM_SCROLL, hasPanel, optionCount, optionId } from "@/components/platform/header-search-results"
import { useCommunitiesEnabled } from "@/lib/platform/use-flags"
import { showsProfileHeader } from "@/lib/profile/owner-pills"
import { profileShareUrl, shareProfile } from "@/lib/profile/share-profile"




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

/** Desktop header search results panel: same enter/leave as Categories, and the navigator's hairline and depth rather than a heavy default shadow. */
const SEARCH_MODAL_PANEL =
  "absolute top-full left-0 right-0 z-50 mt-2 max-h-[min(70vh,560px)] overflow-hidden overflow-y-auto overscroll-contain rounded-2xl bg-white " +
  "shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.05),0_6px_12px_-4px_rgba(15,23,42,0.06),0_22px_44px_-14px_rgba(15,23,42,0.22)] " +
  "origin-top transition-[opacity,scale,translate] motion-reduce:transition-none"
const SEARCH_MODAL_OPEN = HEADER_MENU_OPEN
const SEARCH_MODAL_LEAVING = HEADER_MENU_LEAVING
const SEARCH_BACKDROP =
  "fixed inset-0 z-[35] bg-[rgba(16,18,27,0.08)] transition-opacity motion-reduce:transition-none"
const SEARCH_BACKDROP_OPEN = "opacity-100 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] starting:opacity-0"
const SEARCH_BACKDROP_LEAVING =
  "pointer-events-none opacity-0 duration-150 ease-[cubic-bezier(0.4,0,1,1)]"

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
  maxHeight,
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
  /** The tallest it may be, when three quarters of the screen is not the right answer. */
  maxHeight?: string
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
      maxHeight={height ?? maxHeight ?? "min(74dvh, 720px)"}
      className="rounded-t-[24px]"
      scrollKey={contentKey ?? "default"}
      keepMounted={keepMounted}
      onClosed={onClosed}
    >
      {children}
    </BottomSheet>
  )
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   THE LOGO IS FIVE PERCENT SMALLER IN A HEADER, AND ONLY IN A HEADER
  ═══════════════════════════════════════════════════════════════════════════
  The owner asked for the mark to sit a little quieter in the bar. The sizes
  themselves change (not a CSS scale), so the picture is fetched at the size
  it is drawn. Latest pass: ~5% under 41.8 / 39.9 / 36.1. Footers and sign-in
  keep their sizes.
*/
export const HEADER_LOGO = { desktop: 39.71, marketingPhone: 37.91, phone: 34.3 } as const

/** A focus ring that reads on the black bar. */
const DARK_FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113]"

/** Where a header link goes, and the click that gets it there (canonical host, native shell). */
export type HeaderLink = (path: string) => { href: string; onClick: (e: React.MouseEvent<HTMLElement>) => void }

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
function GuestHeaderActions({
  withLogin,
  link,
  placeholder = false,
  chrome,
}: {
  withLogin: boolean
  link: HeaderLink
  placeholder?: boolean
  chrome: HeaderChrome
}) {
  return (
    <div
      data-guest-actions={withLogin ? "marketing" : "buyer"}
      data-placeholder={placeholder ? "" : undefined}
      aria-hidden={placeholder || undefined}
      inert={placeholder || undefined}
      className={cn("flex shrink-0 items-center", placeholder && "invisible")}
    >
      <span aria-hidden data-guest-divider="" className={cn("ml-1 h-6 w-px", chrome.guestDivider)} />
      {/* "Sell" alone on a tablet, where the bar has no room for three words; the name stays whole for a screen reader. */}
      <Link
        {...link("/sell")}
        data-guest-sell=""
        aria-label="Sell on Storelib"
        className={cn("ml-5 whitespace-nowrap rounded-md px-2 py-2 text-[15px] font-medium transition-colors", chrome.guestSell, chrome.focus)}
      >
        <span className="lg:hidden">Sell</span>
        <span className="hidden lg:inline">Sell on Storelib</span>
      </Link>
      {withLogin && (
        <Link
          {...link("/login")}
          data-guest-login=""
          className={cn("ml-6 inline-flex h-[42px] items-center whitespace-nowrap rounded-action border px-5 text-[15px] font-medium transition-colors", chrome.guestLogin, chrome.focus)}
        >
          Log in
        </Link>
      )}
      <Link
        {...link("/signup")}
        data-guest-signup=""
        className={cn(withLogin ? "ml-3" : "ml-6", "inline-flex h-[42px] items-center whitespace-nowrap rounded-action bg-violet-600 px-5 text-[15px] font-[550] text-white transition-colors hover:bg-violet-700", chrome.focus)}
      >
        Sign up
      </Link>
    </div>
  )
}

/**
 * One row of the phone's account sheet: a link (href and its click) or,
 * without an href, a button. In /app's own account sheet's language
 * (components/app/mobile-account-menu.tsx): a 48px row, an 18px icon in a
 * light grey, 15px words, a soft press and no chevron, so the two sheets
 * read as one product.
 */
const SHEET_ROW =
  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-neutral-800 transition-colors duration-100 active:bg-neutral-100 hover:bg-neutral-50 cursor-pointer outline-none focus-visible:bg-neutral-100 [-webkit-tap-highlight-color:transparent]"
const SHEET_ICON = "h-[18px] w-[18px] shrink-0"

function SheetRow({
  href,
  onClick,
  onDone,
  item,
  icon: Icon,
  label,
}: {
  href?: string
  onClick?: (e: React.MouseEvent<HTMLElement>) => void
  onDone: () => void
  item: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>
  label: string
}) {
  const inner = (
    <>
      <Icon aria-hidden className={cn(SHEET_ICON, "text-neutral-400")} strokeWidth={1.75} />
      <span className="min-w-0 truncate">{label}</span>
    </>
  )
  return href ? (
    <Link href={href} onClick={(e) => { onClick?.(e); onDone() }} data-account-item={item} className={SHEET_ROW}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onDone} data-account-item={item} className={SHEET_ROW}>
      {inner}
    </button>
  )
}

/** Log out, last in both phone sheets: the same row in red, under a rule. */
function SheetLogOut({ onPress }: { onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} data-account-item="log-out" className={cn(SHEET_ROW, "text-red-600 hover:bg-red-50/60 active:bg-red-50 focus-visible:bg-red-50")}>
      <LogOut aria-hidden className={SHEET_ICON} strokeWidth={1.75} />
      <span>Log out</span>
    </button>
  )
}

/**
 * LOG OUT, the one way: the session on this device, the navigator's list
 * (it was this person's: the next open asks again, as nobody) and the cached
 * photo go, then the app's welcome or the home page. The header's menus and a
 * community's own bar (components/community/member/account-menu.tsx) both
 * call it.
 */
export async function endStorelibSession(router: { push: (href: string) => void; refresh: () => void }) {
  const supabase = createClient()
  await supabase.auth.signOut({ scope: "local" })
  forgetPlaces()
  try { localStorage.removeItem("_sl_avatar") } catch {}
  if (isNativePlatform()) {
    window.location.replace("/welcome")
  } else {
    router.push("/")
    router.refresh()
  }
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   THE PHOTO OPENS THE ACCOUNT MENU, ON A COMPUTER
  ═══════════════════════════════════════════════════════════════════════════
  It was a plain link to /account. The owner asked for a menu instead, like
  the phone's account sheet and like /app's account dropdown, in this order:
  Dashboard for a seller or Start creating for anybody else (/sell decides
  what comes next), Profile (/account), Settings, Language (the one language
  picker the phone sheet opens too), Help, Discover (/explore), and Log out
  last, under a rule.

  It hangs from the photo's right edge and comes and goes the way the bar's
  other panels do: a transition on opacity, `scale` and `translate` from its
  `starting:` values, kept in the tree while it leaves, nothing moving under
  reduced motion. A second click on the photo, a click anywhere else, Escape
  (focus goes back to the photo) and a change of page close it. Arrow keys
  move between the rows.
*/
/**
 * ROWS A PLACE ADDS TO THE ACCOUNT MENU, ABOVE STORELIB'S OWN. A community's
 * bar (components/community/member/account-menu.tsx) puts "Invite people"
 * and "Saved posts" here (round 9), so its "..." stays this one menu rather
 * than a copy with two more rows. A row is a link (`href`) or an action
 * (`onSelect`); either closes the menu.
 */
export interface AccountExtraRow {
  item: string
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>
  href?: string
  onSelect?: () => void
}

const ACCOUNT_PANEL =
  "absolute right-0 top-full z-50 mt-2 w-[248px] origin-top-right rounded-xl bg-white p-1 text-left outline-none " +
  "shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_4px_-1px_rgba(15,23,42,0.06),0_16px_36px_-10px_rgba(15,23,42,0.2)] " +
  "transition-[opacity,scale,translate] motion-reduce:transition-none"
const ACCOUNT_ROW =
  "flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-left text-[14px] font-medium text-[#3f4652] outline-none transition-colors duration-100 hover:bg-[#f4f5f7] hover:text-[#1a1a2e] focus-visible:bg-[#f1f2f4] focus-visible:text-[#1a1a2e]"

export function DesktopAccountMenu({
  avatarUrl,
  name,
  username,
  seller,
  link,
  onLanguage,
  onLogout,
  dark = false,
  trigger = "photo",
  triggerClassName,
  extra,
}: {
  avatarUrl?: string
  name: string
  username?: string | null
  seller: boolean
  link: HeaderLink
  onLanguage: () => void
  onLogout: () => void
  /** The bar is the dark one: the ring around the photo sits on black. */
  dark?: boolean
  /**
   * What opens the menu: the photo (Storelib's header), or a quiet "..."
   * button (a community's own bar, round 7), which brings its own look in
   * `triggerClassName`. The menu itself is the same either way.
   */
  trigger?: "photo" | "more"
  triggerClassName?: string
  /** Rows of the place's own, above Storelib's (AccountExtraRow). */
  extra?: AccountExtraRow[]
}) {
  const pathname = usePathname()
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [present, setPresent] = useState(false)
  if (open && !present) setPresent(true)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (open || !present) return
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const t = window.setTimeout(() => setPresent(false), still ? 0 : 600)
    return () => window.clearTimeout(t)
  }, [open, present])
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      buttonRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener("pointerdown", away, true)
    document.addEventListener("keydown", onKey)
    menuRef.current?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener("pointerdown", away, true)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const go = (path: string) => {
    const { href, onClick } = link(path)
    return { href, onClick: (e: React.MouseEvent<HTMLElement>) => { onClick(e); setOpen(false) } }
  }
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return
    const rows = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    if (!rows.length) return
    e.preventDefault()
    const i = rows.indexOf(document.activeElement as HTMLElement)
    const next = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : e.key === "ArrowDown" ? (i + 1) % rows.length : i <= 0 ? rows.length - 1 : i - 1
    rows[next]?.focus()
  }
  const icon = "h-4 w-4 shrink-0 text-[#8a909b]"

  return (
    <div ref={wrapRef} className="relative shrink-0" data-header-account="">
      {trigger === "more" ? (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Your account"
          aria-haspopup="menu"
          aria-expanded={open}
          data-account-more=""
          data-state={open ? "open" : "closed"}
          className={triggerClassName}
        >
          <MoreHorizontal aria-hidden className="h-5 w-5" strokeWidth={2} />
        </button>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Your account"
          aria-haspopup="menu"
          aria-expanded={open}
          data-header-avatar=""
          className={cn(
            "flex h-[42px] w-[42px] shrink-0 cursor-pointer items-center justify-center rounded-full outline-none ring-offset-2 transition-shadow duration-150 ease-out hover:ring-2 focus-visible:ring-2 focus-visible:ring-violet-400",
            dark ? "ring-offset-[#0e0e10] hover:ring-white/30" : "ring-offset-white hover:ring-[#1a1a2e]/15",
            open && (dark ? "ring-2 ring-white/30" : "ring-2 ring-[#1a1a2e]/15"),
          )}
        >
          <AppAvatar src={avatarUrl} name={name.trim()} alt="" size={42} className="border border-gray-200" />
        </button>
      )}
      {present ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Your account"
          tabIndex={-1}
          data-account-menu=""
          data-state={open ? "open" : "closed"}
          inert={open ? undefined : true}
          onKeyDown={onMenuKey}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && e.propertyName === "opacity" && !open) setPresent(false)
          }}
          className={cn(ACCOUNT_PANEL, open ? HEADER_MENU_OPEN : HEADER_MENU_LEAVING)}
        >
          {/* Who is signed in: not a row, just the name over the handle. */}
          <div className="flex items-center gap-2.5 px-3 pb-2 pt-2.5" data-account-who="">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-[#1a1a2e]">{name}</span>
              {username ? <span className="block truncate text-[12.5px] text-[#6b7280]">@{username}</span> : null}
            </span>
          </div>
          <div className="mb-1 h-px bg-[#f0f1f3]" />
          {extra?.length ? (
            <>
              {extra.map((x) =>
                x.href ? (
                  <Link key={x.item} {...go(x.href)} role="menuitem" data-account-item={x.item} className={ACCOUNT_ROW}>
                    <x.icon aria-hidden className={icon} strokeWidth={1.75} />
                    {x.label}
                  </Link>
                ) : (
                  <button key={x.item} type="button" role="menuitem" data-account-item={x.item} onClick={() => { setOpen(false); x.onSelect?.() }} className={ACCOUNT_ROW}>
                    <x.icon aria-hidden className={icon} strokeWidth={1.75} />
                    {x.label}
                  </button>
                ),
              )}
              <div className="my-1 h-px bg-[#f0f1f3]" />
            </>
          ) : null}
          {seller ? (
            <Link {...go("/app")} role="menuitem" data-account-item="dashboard" className={ACCOUNT_ROW}>
              <LayoutDashboard aria-hidden className={icon} strokeWidth={1.75} />
              Dashboard
            </Link>
          ) : (
            <Link {...go("/sell")} role="menuitem" data-account-item="start-creating" className={ACCOUNT_ROW}>
              <Store aria-hidden className={icon} strokeWidth={1.75} />
              Start creating
            </Link>
          )}
          <Link {...go("/account")} role="menuitem" data-account-item="profile" className={ACCOUNT_ROW}>
            <UserIcon aria-hidden className={icon} strokeWidth={1.75} />
            Profile
          </Link>
          <Link {...go("/account/settings")} role="menuitem" data-account-item="settings" className={ACCOUNT_ROW}>
            <Settings aria-hidden className={icon} strokeWidth={1.75} />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            data-account-item="language"
            onClick={() => { setOpen(false); onLanguage() }}
            className={ACCOUNT_ROW}
          >
            <Globe aria-hidden className={icon} strokeWidth={1.75} />
            {t("settings.language")}
          </button>
          <Link {...go("/help")} role="menuitem" data-account-item="help" className={ACCOUNT_ROW}>
            <LifeBuoy aria-hidden className={icon} strokeWidth={1.75} />
            Help
          </Link>
          <Link {...go("/explore")} role="menuitem" data-account-item="discover" className={ACCOUNT_ROW}>
            <Compass aria-hidden className={icon} strokeWidth={1.75} />
            Discover
          </Link>
          <div className="my-1 h-px bg-[#f0f1f3]" />
          <button
            type="button"
            role="menuitem"
            data-account-item="log-out"
            onClick={() => { setOpen(false); onLogout() }}
            className={cn(ACCOUNT_ROW, "hover:bg-red-50 hover:text-red-600 focus-visible:bg-red-50 focus-visible:text-red-600")}
          >
            <LogOut aria-hidden className={cn(icon, "text-current")} strokeWidth={1.75} />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  )
}

/*
  THE PHONE'S ACCOUNT SHEET, as a piece of its own, so a community's own bar
  (components/community/member/account-menu.tsx) opens exactly this sheet
  rather than a copy of it: the same rows in the same order, the same look.
*/
export function AccountSheet({
  open,
  onClose,
  keepMounted = false,
  avatarUrl,
  name,
  username,
  seller,
  link,
  onLanguage,
  onLogout,
  extra,
}: {
  open: boolean
  onClose: () => void
  keepMounted?: boolean
  avatarUrl?: string
  name: string
  username?: string | null
  seller: boolean
  link: HeaderLink
  onLanguage: () => void
  onLogout: () => void
  /** Rows of the place's own, above Storelib's (AccountExtraRow). */
  extra?: AccountExtraRow[]
}) {
  const { t } = useLocale()
  return (
    <MobileBottomSheet
      isOpen={open}
      onClose={onClose}
      keepMounted={keepMounted}
      fill
      maxHeight="min(88dvh, 720px)"
    >
      <div className="flex min-h-0 flex-1 flex-col px-3" data-account-sheet-body="">
        <div className="flex min-h-[52px] shrink-0 items-center gap-3 rounded-xl px-3 py-2" data-account-who="">
          <AppAvatar src={avatarUrl} name={name.trim()} alt="" size={32} className="shrink-0 ring-1 ring-neutral-200" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-neutral-900">{name}</span>
            {username ? <span className="block truncate text-[13px] text-neutral-500">@{username}</span> : null}
          </span>
        </div>
        <div aria-hidden className="my-1.5 h-px shrink-0 bg-neutral-100" />

        {/*
          THE SAME ROWS AS THE COMPUTER'S MENU (DesktopAccountMenu), in the
          owner's order: Dashboard for a seller or Start creating for anybody
          else, Profile, Settings, Language, Help, Discover, and Log out last.
          No My Library: the library lives inside the profile (/account).
        */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-account-sheet="">
          {extra?.length ? (
            <>
              {extra.map((x) =>
                x.href ? (
                  <SheetRow key={x.item} {...link(x.href)} onDone={onClose} item={x.item} icon={x.icon} label={x.label} />
                ) : (
                  <SheetRow key={x.item} onDone={() => { onClose(); x.onSelect?.() }} item={x.item} icon={x.icon} label={x.label} />
                ),
              )}
              <div aria-hidden className="my-1.5 h-px bg-neutral-100" data-account-extra-rule="" />
            </>
          ) : null}
          {seller ? (
            <SheetRow {...link("/app")} onDone={onClose} item="dashboard" icon={LayoutDashboard} label="Dashboard" />
          ) : (
            <SheetRow {...link("/sell")} onDone={onClose} item="start-creating" icon={Store} label="Start creating" />
          )}
          <SheetRow {...link("/account")} onDone={onClose} item="profile" icon={UserIcon} label="Profile" />
          <SheetRow {...link("/account/settings")} onDone={onClose} item="settings" icon={Settings} label="Settings" />
          <SheetRow onDone={() => { onClose(); onLanguage() }} item="language" icon={Globe} label={t("settings.language")} />
          <SheetRow {...link("/help")} onDone={onClose} item="help" icon={LifeBuoy} label="Help" />
          <SheetRow {...link("/explore")} onDone={onClose} item="discover" icon={Compass} label="Discover" />
        </div>

        <div aria-hidden className="my-1.5 h-px shrink-0 bg-neutral-100" />
        <div className="shrink-0" data-account-sheet-foot="">
          <SheetLogOut onPress={onLogout} />
        </div>
      </div>
    </MobileBottomSheet>
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
/**
 * THE COUNT IS INK, NOT RED (round 8): Storelib's #1a1a2e with white
 * figures, on the heart and on the bell, here and in a community's bar. A
 * red bubble shouted on every page for a wishlist and an inbox, which are
 * news, not alarms. On the dark bar the same bubble would vanish into the
 * black, so there it turns round: white with ink figures.
 */
export const COUNT_BADGE_TONE = "bg-[#1a1a2e] text-white [[data-header-tone=dark]_&]:bg-white [[data-header-tone=dark]_&]:text-[#1a1a2e]"

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
        "box-border flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px]",
        COUNT_BADGE_TONE,
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

export function PlatformHeaderClient({
  initialWishlistCount = 0,
  buyerHeaderLight: buyerHeaderLightProp,
}: {
  initialWishlistCount?: number
  buyerHeaderLight?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { t } = useLocale()
  const exploreMarketplaceOn = useExploreMarketplaceEnabled()
  const buyerHeaderLight = buyerHeaderLightProp ?? useBuyerHeaderLight()
  const chrome = useMemo(() => headerChrome(buyerHeaderLight), [buyerHeaderLight])
  const buyerLogoHref = exploreMarketplaceOn ? "/explore" : "/"

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
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [searchModalPresent, setSearchModalPresent] = useState(false)
  if (searchModalOpen && !searchModalPresent) setSearchModalPresent(true)
  useEffect(() => {
    if (searchModalOpen || !searchModalPresent) return
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const t = window.setTimeout(() => setSearchModalPresent(false), still ? 0 : 200)
    return () => window.clearTimeout(t)
  }, [searchModalOpen, searchModalPresent])
  /**
   * ONLY A PERSON OPENS SEARCH. `onFocus` alone also fires when the browser
   * puts the focus back in this field by itself: closing a sheet, restoring
   * a page from the back/forward cache, a .focus() somewhere else that runs
   * while this field happens to be the last focused thing. On a community
   * page that meant the search panel appearing over the composer somebody
   * was writing in, with its Post button behind it. The field is only
   * treated as opened when the focus follows a tap or a key on the field
   * itself, which is every real way in and none of the accidental ones.
   */
  const searchIntent = useRef(0)
  const markSearchIntent = useCallback(() => {
    searchIntent.current = Date.now()
  }, [])
  const onSearchFocus = useCallback(() => {
    if (Date.now() - searchIntent.current < 700) setSearchModalOpen(true)
  }, [])
  const closeSearchModal = useCallback(() => {
    setSearchModalOpen(false)
    searchInputRef.current?.blur()
  }, [])
  useEffect(() => {
    if (!searchModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      closeSearchModal()
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      if (
        target.closest("[data-header-search-field]") ||
        target.closest("[data-header-search-modal]") ||
        target.closest("[data-app-sheet]") ||
        target.closest("[data-mobile-bottom-sheet]") ||
        target.closest("[data-mobile-top-sheet]")
      ) {
        return
      }
      closeSearchModal()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [searchModalOpen, closeSearchModal])
  const [searchResults, setSearchResults] = useState<QuickHit[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false)
  /* The "..." sheet of the phone's profile bar, and what its Share profile row last did (see PROFILE BAR below). */
  const [profileBarOpen, setProfileBarOpen] = useState(false)
  const [shareNote, setShareNote] = useState<"copied" | "failed" | null>(null)
  /* Below 768px, where the header opens sheets rather than dropdowns. */
  const belowMd = useBelowMd()
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
    closeSearchModal()
    setMobileMenuOpen(false)
    setMobileProfileOpen(false)
    setProfileBarOpen(false)
  }, [pathname, closeSearchModal])

  /*
    ═══════════════════════════════════════════════════════════════════════
     A RESULTS LIST, NOT A CATEGORIES MENU
    ═══════════════════════════════════════════════════════════════════════
    The field used to open a box of category pills over "Start typing to
    search products" (image 52), and a word gave products only. Now a word
    asks the phone's search questions (lib/nav/quick-search quickSearch: the
    products that say it or whose creator is called it, and, while the
    communities switch is on, the public communities that say it, from
    Storelib's own server) and shows the five most relevant together
    (topHits), then View all. With nothing typed it offers the recent
    searches on this device, and with none of those it draws no panel at
    all. Categories are the grid icon at the end of the field.

    Answers come back in any order; only the newest word's is kept.
  */
  const communitiesOn = useCommunitiesEnabled()
  const searchSeq = useRef(0)
  const [recents, setRecents] = useState<string[]>([])
  const [activeOption, setActiveOption] = useState(-1)
  const runSearch = useCallback(
    (value: string) => {
      const seq = ++searchSeq.current
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      const term = cleanTerm(value)
      if (!term) {
        setSearchResults([])
        setSearchLoading(false)
        return
      }
      setSearchLoading(true)
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const answer = await quickSearch(createClient(), term, { communities: communitiesOn, creators: false })
          if (seq !== searchSeq.current) return
          setSearchResults(topHits(answer))
        } catch (err) {
          console.error("Search error:", err)
        } finally {
          if (seq === searchSeq.current) setSearchLoading(false)
        }
      }, QUICK_DEBOUNCE_MS)
    },
    [communitiesOn],
  )
  const handleSearchChange = useCallback(
    (value: string) => {
      setQuery(value)
      setActiveOption(-1)
      /* Typing is as plain an intent as a tap: somebody who arrived in the field with Tab still sees their results. */
      setSearchModalOpen(true)
      runSearch(value)
    },
    [runSearch],
  )
  /* The recent searches, read when the panel opens (they live in this device's storage, behind Preferences). */
  useEffect(() => {
    if (searchModalOpen) setRecents(readRecent())
    else setActiveOption(-1)
  }, [searchModalOpen])
  /* Explore's mode, so View all stays in communities when that is what is being browsed. */
  const searchMode: "products" | "communities" = pathname.startsWith("/explore") && searchParams.get("type") === "communities" ? "communities" : "products"

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


  const wishlistHref = useMemo(() => {
    return user ? "/account/library/wishlist" : "/wishlist"
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
    setMobileProfileOpen(false)
    setCachedAvatarUrl(null)
    await endStorelibSession(router)
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
  const isExploreSurface =
    exploreMarketplaceOn && (pathname === "/explore" || pathname.startsWith("/explore/") || pathname === "/wishlist")
  /*
    NO HEART ON EXPLORE. "Remove the wishlist icon from the Storelib header
    on /explore (desktop and phone)": the marketplace's bar is the search,
    the library, the bell and the photo. The wishlist is still one tap away
    in the account (Library, then Wishlist), and the other pages that share
    this bar (a product, a creator's page) keep their heart.
  */
  /*
    AND NO HEART OVER THE LIBRARY. "On the web, the library pages
    (/account/library/**) show no wishlist icon in the header either": the
    wishlist is one of the library's own pills there, so the heart was a
    second door to the page under it.
  */
  const isLibraryPages = pathname === "/account/library" || pathname.startsWith("/account/library/")
  const showWishlistIcon = !isExploreSurface && !isLibraryPages
  /*
    ═══════════════════════════════════════════════════════════════════════
     IN THE APP THE HEADER HAS NO LIBRARY AND NO HEART
    ═══════════════════════════════════════════════════════════════════════
    "The Storelib header in the app: no library icon and no wishlist icon"
    (image 61, a product page in the iPhone app). The app's tab bar carries
    the library, and the wishlist is a pill inside it. Hidden by the
    `capacitor` class the head script puts on <html> before the first paint
    (app/layout.tsx), not by asking the bridge in a render, so the server's
    HTML, the first frame and hydration all agree and nothing blinks out.
  */
  const appHidden = "[html.capacitor_&]:hidden"
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
  const isOwnPages = pathname === "/account/library" || pathname.startsWith("/account/library/") || pathname === "/account" || pathname.startsWith("/account/")
  /*
    ═══════════════════════════════════════════════════════════════════════
     PROFILE BAR: ON A PHONE, YOUR PROFILE GETS A PLAIN BAR
    ═══════════════════════════════════════════════════════════════════════
    "On phones only, on /account (and /account/* pages that show the
    profile), the Storelib header turns into a simple bar": the logo at the
    left and a "..." at the right, nothing else (image 43). No navigator,
    no heart, no bell, no photo: the profile under it is the photo, and the
    tab bar at the foot still goes everywhere else. The "..." opens a sheet
    with Share profile (the phone's share sheet, else the link copied),
    Settings, Language, Help and Log out.

    Exactly the pages that draw the profile's header (lib/profile/
    owner-pills.ts showsProfileHeader: Activity and Communities); Settings
    and the library keep the usual bar. Below 768px only, by the same
    md:hidden the rest of the phone row uses, so a computer's bar is the bar
    it always was.
  */
  const profileBar = showsProfileHeader(pathname)
  useEffect(() => {
    if (!shareNote) return
    const t = window.setTimeout(() => setShareNote(null), 2200)
    return () => window.clearTimeout(t)
  }, [shareNote])
  const onShareProfile = () => {
    const url = profileShareUrl(window.location.origin, profile?.username) ?? `${window.location.origin}/account`
    /* Asked for inside the press: a browser opens its share sheet only for one. */
    void shareProfile({ url, name: displayName || null }).then((outcome) => {
      if (outcome === "copied" || outcome === "failed") setShareNote(outcome)
      if (outcome !== "failed") setProfileBarOpen(false)
    })
  }
  /*
    AND NEITHER DOES A COMMUNITY. The strip is `fixed` at the foot of the
    header and the community's own tab row is `sticky` at the same offset
    (components/community/member/shell-frame, --community-top), so on a phone
    the marketplace search was laid straight over the community's spaces: the
    nav underneath could not be read or tapped. It was the wrong search there
    anyway, the way it was on the library. A community searches its own posts
    and members from inside itself.

    Every /community address is one: /community on its own only redirects to
    Explore, so the public page, /about, /join and the whole member area are
    covered. The word boundary keeps a creator called "communityx" a creator,
    as it does in components/marketing/conditional-header.
  */
  const isCommunityRoute = pathname === "/community" || pathname.startsWith("/community/")
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
  /* Explore's hero menu, published while the hero is on the page; null everywhere else (lib/explore/search-categories). */
  const deskCategories = useSearchCategories()
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
  // Same-layout routes (/explore, /u/, /p/, /l/, the library, /wishlist) use
  // router.push to keep client-side navigation and preserve the auth session.
  // One list with the app's link guard (lib/native-links.ts needsDocumentLoad),
  // which says why the library is no longer on it.
  const isCrossLayoutPath = needsDocumentLoad

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

  const onCanonicalNav = useCallback(
    (e: React.MouseEvent<HTMLElement>, targetPath: string) => {
      if (targetPath !== pathname) startNavigationLoading()
      // When on a seller subdomain (e.g. sellername.storelib.com), ALL navigation
      // to non-seller routes (/library, /app, /explore, /signup, etc.) MUST use
      // the canonical storelib.com URL. Relative paths would land on
      // sellername.storelib.com/account/library which doesn't exist and blocks the UI.
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

  /* ── The search's rows: where each goes, and the keys that move through them ── */
  const searchListId = (phone: boolean) => (phone ? "header-search-phone" : "header-search")
  const panelShown = searchModalOpen && hasPanel(query, recents)
  const pickHit = (hit: QuickHit) => {
    setRecents(addRecent(query))
    navigateReliably(hit.href)
    closeSearchModal()
  }
  const viewAllResults = (word: string = query) => {
    if (!word.trim()) return
    setRecents(addRecent(word))
    navigateReliably(viewAllHref(word, searchMode))
    closeSearchModal()
  }
  const pickRecent = (word: string) => {
    setQuery(word)
    setActiveOption(-1)
    runSearch(word)
    searchInputRef.current?.focus({ preventScroll: true })
  }
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    markSearchIntent()
    const count = optionCount(query, searchResults, recents)
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!searchModalOpen) setSearchModalOpen(true)
      if (!count) return
      e.preventDefault()
      setActiveOption((i) => (e.key === "ArrowDown" ? (i + 1 >= count ? 0 : i + 1) : i <= 0 ? count - 1 : i - 1))
      return
    }
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return
    e.preventDefault()
    const word = query.trim()
    if (!word) {
      if (activeOption >= 0 && recents[activeOption]) pickRecent(recents[activeOption])
      return
    }
    if (activeOption >= 0 && activeOption < searchResults.length) pickHit(searchResults[activeOption])
    else viewAllResults()
  }
  const searchResultsBody = (phone: boolean) => (
    <HeaderSearchResults
      query={query}
      hits={searchResults}
      loading={searchLoading}
      recents={recents}
      active={activeOption}
      idPrefix={searchListId(phone)}
      onHover={setActiveOption}
      onPick={pickHit}
      onViewAll={() => viewAllResults()}
      onRecent={pickRecent}
      onRemoveRecent={(r) => setRecents(removeRecent(r))}
      onClearRecent={() => setRecents(clearRecent())}
      phone={phone}
    />
  )
  const comboboxProps = (phone: boolean) => ({
    role: "combobox" as const,
    "aria-expanded": panelShown,
    "aria-controls": panelShown ? `${searchListId(phone)}-list` : undefined,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant": panelShown && activeOption >= 0 ? optionId(searchListId(phone), activeOption) : undefined,
  })

  /*
    DASHBOARD, FOR AN ACCOUNT WITH SELLER ACCESS ONLY. A buyer sees no
    Dashboard and no Start selling beside their photo; their way to selling
    is Become a seller in the account menu and the phone sheet. Not a filled
    purple button any more (round 8): Storelib's secondary button, white
    with a hairline, a one pixel soft shadow and ink text, so the bar's one
    loud thing is not a way out of the marketplace. The shared
    `rounded-action` corner stays.
  */
  const sellerDashboardButton = hasCompletedSellerOnboarding ? (
    <Link
      {...headerLink("/app")}
      data-header-dashboard=""
      className={cn(
        "inline-flex h-[42px] items-center whitespace-nowrap rounded-action border border-[#e2e4e8] bg-white px-5 text-[15px] font-[550] text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,18,27,0.05)] transition-[background-color,border-color] duration-150 hover:border-[#d4d7dd] hover:bg-[#f8f9fa] active:bg-[#f3f4f6]",
        chrome.focus,
      )}
    >
      {t("dashboard")}
    </Link>
  ) : null

  /* The photo's menu on a computer (DesktopAccountMenu above): Dashboard or Start creating, Profile, Settings, Language, Help, Discover, Log out. */
  const desktopAccountMenu = user ? (
    <DesktopAccountMenu
      avatarUrl={avatarUrl}
      name={displayName || ""}
      username={profile?.username}
      seller={hasCompletedSellerOnboarding}
      link={headerLink}
      onLanguage={() => setLanguageOpen(true)}
      onLogout={handleLogout}
      dark={!buyerHeaderLight}
    />
  ) : null

  return (
    <>
      <div
        ref={headerRootRef}
        id="platform-header-root"
        data-header-tone={buyerHeaderLight ? "light" : "dark"}
        className={cn(chrome.root, isSellerOrProductPage ? "relative" : "sticky top-0")}
      >
        {/* A DARK BAR SAYS SO TO THE BAND. The strip under the clock, the
            browser's bar and the status bar's text all read --native-band
            (app/globals.css), white by default. This bar is the one buyer
            surface that can be dark (the admin's toggle), so while it is
            drawn the band is its colour, from the server's HTML on. */}
        {buyerHeaderLight ? null : <style>{`:root{--native-band:${BUYER_HEADER_DARK_BG}}`}</style>}
    <header className={cn(chrome.header, !(isNativePlatform() && isSellerOrProductPage) && chrome.headerBorder)}>
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
                  <span className={chrome.wordmark}>Storelib</span>
                </Link>

                {/* Center - Nav Links (show for all users). On a tablet they
                    close up and Home goes (the logo is Home), so the owner's
                    four on the right still fit beside them at 768px. */}
                <nav className="flex items-center gap-1 lg:gap-2">
                  {[
                    { href: "/", label: "Home", active: pathname === '/', wide: true },
                    ...(exploreMarketplaceOn
                      ? [{ href: "/explore", label: "Discover", active: pathname.startsWith("/explore") }]
                      : []),
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
                        item.active ? chrome.navActive : chrome.navIdle,
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
                    <GuestHeaderActions withLogin link={headerLink} placeholder chrome={chrome} />
                  ) : user ? (
                    <>
                      {exploreMarketplaceOn ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              {...headerLink("/explore")}
                              className={cn("flex h-[42px] w-[42px] items-center justify-center rounded-full transition cursor-pointer", chrome.iconBtn)}
                              aria-label="Discover"
                            >
                              <Compass className="h-[22px] w-[22px]" />
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                            Discover
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            {...headerLink("/account/library")}
                            /* From lg: on a tablet the photo's menu has My Library. */
                            className={cn("hidden lg:flex h-[42px] w-[42px] items-center justify-center rounded-full transition cursor-pointer", chrome.iconBtn)}
                            aria-label={t("library")}
                          >
                            <Library className="h-[22px] w-[22px]" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent className="bg-neutral-900 text-white text-xs px-2 py-1" sideOffset={8}>
                          My Library
                        </TooltipContent>
                      </Tooltip>
                      {/* The person's notifications (components/notifications/notification-bell.tsx), signed in only. */}
                      <NotificationBell className={chrome.iconBtn} />
                      {sellerDashboardButton}
                      {desktopAccountMenu}
                    </>
                  ) : (
                    <GuestHeaderActions withLogin link={headerLink} chrome={chrome} />
                  )}
                </div>
              </div>

              {/* Mobile Homepage/Marketing Header - Logo left, hamburger right.
                  min-h-[42px]: the row keeps a stable tap height even when the
                  mark is drawn smaller than the old 42px logo. */}
              <div className="md:hidden flex min-h-[42px] items-center justify-between w-full">
                {/* Left - Logo */}
                <div className="flex items-center gap-0">
                  <Link href="/" onClick={(e) => { e.preventDefault(); if (isNativePlatform()) { router.push("/") } else { window.location.href = "/" } }} className="shrink-0 flex items-center gap-1.5">
                    <StorelibLogo size={HEADER_LOGO.marketingPhone} priority />
                    <span className={chrome.wordmarkPhone}>Storelib</span>
                  </Link>
                </div>

                {/* Right - Only hamburger (glassmorphism) with animation */}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  /* A 40px disc is under the 44px a thumb reliably hits, and this one sits in the corner of the screen where a hand is least accurate. The pseudo-element extends the TOUCH target 8px in every direction without moving the disc, so a near miss still opens the menu. `touch-manipulation` drops the browser's double-tap-to-zoom wait, which is the other half of "it sometimes does not register". */
                  className={cn("relative flex h-10 w-10 touch-manipulation items-center justify-center rounded-full transition cursor-pointer before:absolute before:-inset-2 before:content-['']", chrome.menuBtn, chrome.hamburger)}
                  aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                >
                  <AnimatedHamburger isOpen={mobileMenuOpen} />
                </button>
              </div>
            </>
          ) : (
            <>
              {/*
                THE NAVIGATOR AND THE LOGO. On a computer the three lines sit
                right of the logo (round 4: the logo is where the eye lands
                first and the lines read as the menu that belongs to it). On
                a phone they are back LEFT of the logo, where they were and
                where a thumb looks for a menu (round 6). They open the
                navigator (components/nav/place-navigator.tsx): one recent
                list of my courses, digital products and communities, then
                Discover communities, Explore, and Dashboard or Start
                creating. The same component sits right of a community's
                name in its own top bar. Categories are browsed on Explore
                itself.

                One navigator for the phone row and the computer row, so the
                phone keeps one sheet. The order is the order in the page,
                not a CSS reorder, so focus goes where the eye does at both
                widths: the computer's logo (hidden on a phone), the lines,
                then the phone's logo (hidden on a computer). On a phone the
                group is pulled 8px into the bar's padding, so the lines
                start where the old icon's did and the logo follows with the
                button's own air as the gap; on a computer the lines keep
                4px from the wordmark. The profile bar draws no lines on a
                phone, so there the logo keeps its own place at the edge.
              */}
              <div className={cn("flex shrink-0 items-center gap-1", profileBar ? "max-md:gap-0" : "max-md:-ml-2 max-md:gap-0.5")} data-header-left="">
                {/* Logo with Storelib text - links to /explore */}
                <Link href={buyerLogoHref} onClick={(e) => onCanonicalNav(e, buyerLogoHref)} className="shrink-0 hidden md:flex items-center gap-2" data-header-logo="desk">
                  <StorelibLogo size={HEADER_LOGO.desktop} priority />
                  <span className={chrome.wordmark}>Storelib</span>
                </Link>
                <PlaceNavigator
                  current={{ kind: "storelib" }}
                  onNavigate={(e, href) => onCanonicalNav(e, href)}
                  /* On a phone the slack runs left to the screen's edge and up and down, where a thumb undershoots; not right, where the logo is a target of its own. A computer's pointer needs none. On a phone's profile bar it is not drawn (PROFILE BAR above). */
                  className={cn("z-10 before:absolute before:-left-3 before:-top-2 before:-bottom-2 before:right-0 before:content-[''] md:before:content-none", chrome.navigator, profileBar && "max-md:hidden")}
                />
                <Link href={buyerLogoHref} onClick={(e) => onCanonicalNav(e, buyerLogoHref)} className="shrink-0 flex items-center gap-1.5 md:hidden" data-header-logo="phone">
                  <StorelibLogo size={HEADER_LOGO.phone} priority />
                  <span className={chrome.wordmarkPhone}>Storelib</span>
                </Link>
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
            {/*
              THE HERO'S FIELD, IN THE BAR. Not a pill any more: the same
              10px corner, hairline, depth and focus as Explore's own field
              (lib/explore/search-field-look), on white whatever the bar's
              colour, 44px tall so the bar keeps its height. Where the page
              offers a categories menu (Explore, once its field has gone),
              the same grid icon sits at the right end and opens the same
              menu; pressing it closes the search results first, so the two
              never stack. The phone's header keeps its search icon.
            */}
            <div className="relative w-full" data-header-search-field="">
              <Search className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 pointer-events-none z-10 text-neutral-400" />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={onSearchFocus}
                onPointerDown={markSearchIntent}
                onKeyDown={onSearchKey}
                {...comboboxProps(false)}
                aria-label={t("search_placeholder")}
                placeholder={t("search_placeholder")}
                className={cn(
                  "h-11 w-full pl-11 text-[15px] md:text-[15px] text-neutral-900 placeholder:text-neutral-400",
                  SEARCH_FIELD_SURFACE,
                  SEARCH_FIELD_FOCUS,
                  "focus-visible:border-neutral-300 focus-visible:ring-0 focus-visible:ring-offset-0",
                  deskCategories ? (query ? "pr-[92px]" : "pr-[52px]") : query ? "pr-12" : "pr-4",
                )}
              />
              <div className="absolute inset-y-0 right-1 z-10 flex items-center gap-1" data-header-search-tail="">
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      handleSearchChange("")
                      searchInputRef.current?.focus()
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-[8px] cursor-pointer text-neutral-400 hover:text-neutral-700 outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {deskCategories ? (
                  <div
                    className="flex items-center gap-1"
                    onPointerDownCapture={() => {
                      if (searchModalOpen) closeSearchModal()
                    }}
                  >
                    <span aria-hidden className="h-5 w-px shrink-0 bg-neutral-200" />
                    {/* Drawn again when the field leaves, so a menu open from it closes with it. */}
                    <SearchCategoriesButton key={shown ? "shown" : "hidden"} categories={deskCategories} size="header" />
                  </div>
                ) : null}
              </div>
            </div>

            {/* Search Modal Dropdown */}
            {searchModalPresent && (
              <>
                {/*
                  THE HARSH RECTANGLE OVER THE FIELD WAS THIS SCRIM. It is
                  `fixed inset-0`, meant to dim the page behind the results,
                  but it was drawn inside the field's wrapper, and that wrapper
                  carries a `translate` (the fade in when the field arrives in
                  the bar). Any `translate` other than none makes an element
                  the containing block of its fixed children, so "the whole
                  window" became "the wrapper": a 576 by 42px black/10 box with
                  square corners laid over the rounded field the moment it took
                  focus (measured on storelib.com). It is portalled to the body
                  now, under the bar (z 35 against the bar's 40), so it is the
                  window, and the field keeps only its own soft focus state:
                  a slightly darker hairline and a deeper shadow (lib/explore/
                  search-field-look, the hero field's own).
                */}
                {typeof document !== "undefined"
                  ? createPortal(
                      <div
                        aria-hidden
                        data-header-search-scrim=""
                        className={cn(
                          SEARCH_BACKDROP,
                          panelShown ? SEARCH_BACKDROP_OPEN : SEARCH_BACKDROP_LEAVING,
                        )}
                        onClick={() => closeSearchModal()}
                      />,
                      document.body,
                    )
                  : null}
                <div
                  data-header-search-modal=""
                  data-state={panelShown ? "open" : "closed"}
                  inert={panelShown ? undefined : true}
                  onTransitionEnd={(e) => {
                    if (e.target === e.currentTarget && e.propertyName === "opacity" && !searchModalOpen) {
                      setSearchModalPresent(false)
                    }
                  }}
                  className={cn(SEARCH_MODAL_PANEL, SLIM_SCROLL, panelShown ? SEARCH_MODAL_OPEN : SEARCH_MODAL_LEAVING)}
                >
                  {searchResultsBody(false)}
                </div>
              </>
            )}
          </div>
            )
          })()}

          {/* Mobile Header for Non-Homepage pages: the logo and the navigator are in the left group above; this row is the icons at the right. */}
          {profileBar ? (
            /* The profile's plain bar on a phone: only the "..." at the right (PROFILE BAR above). */
            <div className="md:hidden flex items-center justify-end flex-1" data-header-profile-bar="">
              <button
                type="button"
                onClick={() => setProfileBarOpen(true)}
                aria-label="More"
                aria-haspopup="dialog"
                aria-expanded={profileBarOpen}
                data-header-profile-more=""
                className={cn("relative flex h-[42px] w-[42px] touch-manipulation items-center justify-center rounded-full transition-[background-color,scale] duration-150 active:scale-[0.94] cursor-pointer [-webkit-tap-highlight-color:transparent] before:absolute before:-inset-1 before:content-['']", chrome.iconBtn)}
              >
                <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : (
          <div className="md:hidden flex items-center justify-end flex-1">
            {/* Right - Mobile Icons */}
            <div className="flex items-center gap-1">
              {/* Library - only show when logged in and the tab bar is not there
                  to carry it; h-[42px] w-[42px] = 44px tap target */}
              {user && !tabsHere && (
                <Link
                  href={getCanonicalOrRelativePath("/account/library")} onClick={(e) => { onCanonicalNav(e, "/account/library"); setMobileProfileOpen(false) }}
                  data-header-library=""
                  className={cn("flex h-[42px] w-[42px] items-center justify-center rounded-full transition cursor-pointer", chrome.iconBtn, appHidden)}
                  aria-label="Library"
                >
                  <Library className="h-5 w-5" />
                </Link>
              )}

              {/* Wishlist: h-[42px] w-[42px] = 44px tap target. Not on Explore (round 8, see NO HEART ON EXPLORE). */}
              {showWishlistIcon && (
              <Link
                href={getCanonicalOrRelativePath(wishlistHref)} onClick={(e) => onCanonicalNav(e, wishlistHref)}
                data-header-wishlist=""
                className={cn("relative flex h-[42px] w-[42px] items-center justify-center rounded-full transition cursor-pointer", chrome.iconBtn, appHidden)}
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
              )}

              {/* The person's notifications: a full screen sheet on a phone. */}
              {user ? <NotificationBell className={chrome.iconBtn} /> : null}

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
          )}

          {/*
            THE RIGHT OF THE BAR ON A COMPUTER. The wishlist and the library
            are here for everybody, as they were. After them, a guest gets the
            owner's row (a rule, Sell on Storelib, Sign up; no Log in on these
            pages), a signed in buyer gets nothing more than their photo, and
            a seller gets Dashboard beside it. No Start selling and no second
            Library button: the icon beside it already is one.
          */}
          <div className="hidden md:flex items-center gap-2.5 shrink-0">
                {/* Wishlist, not on Explore (NO HEART ON EXPLORE). */}
                {showWishlistIcon && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={getCanonicalOrRelativePath(wishlistHref)} onClick={(e) => onCanonicalNav(e, wishlistHref)}
                      data-header-wishlist=""
                      className={cn("relative flex h-[42px] w-[42px] items-center justify-center rounded-full transition cursor-pointer", chrome.iconBtn, appHidden)}
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
                )}

                {/* Library */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={getCanonicalOrRelativePath("/account/library")} onClick={(e) => onCanonicalNav(e, "/account/library")}
                      data-header-library=""
                      className={cn("hidden sm:flex h-[42px] w-[42px] items-center justify-center rounded-full transition cursor-pointer", chrome.iconBtn, appHidden)}
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
                  <GuestHeaderActions withLogin={false} link={headerLink} placeholder chrome={chrome} />
                ) : user ? (
                  <>
                    <NotificationBell className={chrome.iconBtn} />
                    {sellerDashboardButton}
                    {desktopAccountMenu}
                  </>
                ) : (
                  <GuestHeaderActions withLogin={false} link={headerLink} chrome={chrome} />
                )}
          </div>
          </>
          )}

        </div>

        {/* Mobile Search Bar Trigger is now rendered below in white UI section */}


        {/* Mobile & Desktop Categories are now rendered below in white UI section */}
      </div>

      {/*
        THE MARKETING PAGES' PHONE MENU (the hamburger at the right of their
        row). Explore and the pages that share its header have the navigator
        at the left instead, which brings its own sheet, so this one is only
        ever opened, and only ever kept, on the marketing pages.

        BUILT AHEAD AND KEPT, on a phone. "The animation when I open it needs
        to be smooth and clean." Kept, it waits below the screen on its own
        layer and the tap only slides it up, as the account sheet and the
        app's sheets do (components/ui/bottom-sheet.tsx).
      */}
      <MobileBottomSheet
        isOpen={mobileMenuOpen && isMarketingNavRoute}
        onClose={() => setMobileMenuOpen(false)}
        keepMounted={belowMd && isMarketingNavRoute}
      >
        {isMarketingNavRoute && (
        <div className="px-4 pb-6">
          {/* A guest: the owner's three, Sign up, Discover, Sell on Storelib (image 23). */}
          {!user && (
            <div className="px-1 pt-3 pb-2 border-b border-[#eef0f2]">
              <GuestSheetActions second={exploreMarketplaceOn ? "discover" : "login"} link={headerLink} onDone={() => setMobileMenuOpen(false)} />
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
                {exploreMarketplaceOn ? (
                  <Link
                    {...headerLink("/explore")}
                    onClick={(e) => { onCanonicalNav(e, "/explore"); setMobileMenuOpen(false) }}
                    className={cn(SHEET_BUTTON, "gap-3 border border-[#d0d4db] bg-white font-medium text-[#1a1a2e] hover:bg-[#f7f7f9] active:bg-[#f1f2f4]")}
                  >
                    <Compass aria-hidden className="h-5 w-5" strokeWidth={1.9} />
                    Discover
                  </Link>
                ) : null}
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
                {exploreMarketplaceOn ? (
                  <Link
                    href="/explore"
                    onClick={(e) => { onCanonicalNav(e, "/explore"); setMobileMenuOpen(false) }}
                    className="flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-medium text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <span>Discover</span>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </Link>
                ) : null}
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
        )}
      </MobileBottomSheet>

      {/*
        THE PROFILE BAR'S SHEET (PROFILE BAR above): Share profile, Settings,
        Language, Help, and Log out last under a rule, in the account sheet's
        own rows. Only on the pages that draw the bar, on a phone.
      */}
      {profileBar ? (
        <MobileBottomSheet isOpen={profileBarOpen} onClose={() => setProfileBarOpen(false)}>
          <div className="px-3 pb-3">
            <div data-profile-bar-sheet="">
              <SheetRow onDone={onShareProfile} item="share-profile" icon={Share2} label="Share profile" />
              <SheetRow {...headerLink("/account/settings?section=account")} onDone={() => setProfileBarOpen(false)} item="settings" icon={Settings} label="Settings" />
              <SheetRow onDone={() => { setProfileBarOpen(false); setLanguageOpen(true) }} item="language" icon={Globe} label={t("settings.language")} />
              <SheetRow {...headerLink("/help")} onDone={() => setProfileBarOpen(false)} item="help" icon={LifeBuoy} label="Help" />
            </div>
            {user ? (
              <>
                <div aria-hidden className="my-1.5 h-px bg-neutral-100" />
                <SheetLogOut onPress={() => { setProfileBarOpen(false); void handleLogout() }} />
              </>
            ) : null}
          </div>
        </MobileBottomSheet>
      ) : null}
      {/* What Share profile did when it was not the phone's own sheet: a short line over the tab bar, gone by itself. Portalled to the body, so it is placed against the window and not the header. */}
      {profileBar && shareNote && typeof document !== "undefined" ? createPortal(
        <div
          role="status"
          data-profile-share-note={shareNote}
          className="md:hidden fixed inset-x-0 z-[60] flex justify-center px-4 pointer-events-none transition-[opacity,translate] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] starting:opacity-0 starting:translate-y-1 motion-reduce:transition-none"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)" }}
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-[#1a1a2e] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_8px_24px_-8px_rgba(15,23,42,0.45)]">
            {shareNote === "copied" ? <Check className="h-4 w-4" aria-hidden /> : null}
            {shareNote === "copied" ? "Link copied" : "Could not copy the link"}
          </span>
        </div>,
        document.body,
      ) : null}

      {/*
        The account sheet, the one a signed in visitor opens from their photo.
        It is a menu with nothing typed into it and nothing that changes
        between opens, so it is built while the page is idle and kept, as the
        app's own account sheet is (components/app/mobile-account-menu.tsx):
        the tap that opens it only slides it up. On a phone only, where the
        header draws the button that opens it.

        LOG OUT IS ALWAYS ON SCREEN. It used to be the last row of one
        scrolling column inside a sheet capped at three quarters of the
        screen: on an iPhone SE (568 or 667 tall) the column was taller than
        the cap and Log out sat under the fold, or under the home indicator.
        Now the sheet is three parts in a column (`fill`): who is signed in
        at the top, the rows in the middle, which alone may scroll, and Log
        out at the foot, which never shrinks. The sheet may take up to 88% of
        the screen, enough for every row on the smallest phone, and its own
        padding already clears the home indicator
        (max(env(safe-area-inset-bottom), 12px)), in a browser and in the
        Capacitor app alike. Measured at 320x568, 375x667, 390x844 and
        430x932 by scripts/check-place-navigator.mjs.

        THE TOP IS /app's. The person in a rounded row (a 32px photo with a
        hairline ring, the name, their @handle under it) and a one pixel rule
        under it, the way /app's account sheet opens with its business row,
        so the two sheets feel like one product.
      */}
      <AccountSheet
        open={mobileProfileOpen}
        onClose={() => setMobileProfileOpen(false)}
        keepMounted={!!user && belowMd}
        avatarUrl={avatarUrl}
        name={displayName || ""}
        username={profile?.username}
        seller={hasCompletedSellerOnboarding}
        link={headerLink}
        onLanguage={() => setLanguageOpen(true)}
        onLogout={handleLogout}
      />

      {/* Rendered outside both menus on purpose: each closes itself on the
          click that opens this, so it cannot be a child of either. */}
      <LanguageModal open={languageOpen} onOpenChange={setLanguageOpen} />
    </header>
      </div>
      {/* The fixed bar's room in the app, in the flow under it (app/globals.css .native-header-spacer): every layout that draws this header gets it, not only the marketing one. */}
      <div aria-hidden className="native-header-spacer" data-native-header-spacer="" />

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
          never on the library, the account or inside a community. */}
      {searchInHeader && !tabsHere && !isOwnPages && !isCommunityRoute && (pathname !== "/" && !pathname.startsWith("/features") && !pathname.startsWith("/blog") && !pathname.startsWith("/pricing") && !isFaqRoute && !isDevelopersRoute && !isSellerOrProductPage) && (
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
              <div className="relative flex-1 min-w-0" data-header-search-field="">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  value={query}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={onSearchFocus}
                  onPointerDown={markSearchIntent}
                  onKeyDown={onSearchKey}
                  {...comboboxProps(true)}
                  placeholder={t("search_placeholder")}
                  aria-label={t("search_placeholder")}
                  className="h-10 w-full rounded-[10px] border-neutral-200 bg-neutral-100 pl-9 pr-9 text-sm text-neutral-900 placeholder:text-neutral-500 focus-visible:ring-0 focus-visible:border-neutral-300"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => handleSearchChange("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {/* The way out, since there is no scrim to tap any more. */}
              {searchModalPresent && (
                <button
                  type="button"
                  onClick={() => {
                    closeSearchModal()
                    setQuery("")
                    searchSeq.current++
                    setSearchResults([])
                    setSearchLoading(false)
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
          {searchModalPresent && (
            <div
              data-header-search-modal=""
              data-state={panelShown ? "open" : "closed"}
              inert={panelShown ? undefined : true}
              onTransitionEnd={(e) => {
                if (e.target === e.currentTarget && e.propertyName === "opacity" && !searchModalOpen) {
                  setSearchModalPresent(false)
                }
              }}
              className={cn(
                "absolute inset-x-0 top-full overflow-y-auto overscroll-contain border-b border-neutral-200 bg-white px-2.5 pb-2 pt-1 shadow-[0_12px_28px_-18px_rgba(15,23,42,0.45)] origin-top transition-[opacity,translate] motion-reduce:transition-none",
                SLIM_SCROLL,
                panelShown
                  ? "opacity-100 translate-y-0 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  : "pointer-events-none opacity-0 -translate-y-1 duration-150 ease-[cubic-bezier(0.4,0,1,1)]",
              )}
              style={{ maxHeight: `calc(var(--vv-h, 100dvh) - ${headerH + 56}px)` }}
            >
          {searchResultsBody(true)}
            </div>
          )}
        </div>
      )}

      {/* Concave bottom edge — black background with rounded white overlay creates concave corners.
          Skipped on the FAQ page, whose hero is black too, and on any page that already
          renders the white strip above, to avoid two black bars. */}
      {!isFaqRoute && (pathname === "/" || pathname.startsWith("/features") || pathname.startsWith("/blog") || pathname.startsWith("/pricing") || isDevelopersRoute) && (
        <div className={cn("relative z-30 h-[20px] -mb-px", chrome.concaveBg)}>
          <div className="absolute inset-0 bg-white rounded-t-[20px]" />
        </div>
      )}
    </>
  )
}
