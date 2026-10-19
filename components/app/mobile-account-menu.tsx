"use client"

import { publicHelpUrl } from "@/lib/help/paths"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, Compass, CreditCard, Globe, HelpCircle, Library, LogOut, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { BottomSheet, SHEET_OPEN_MS } from "@/components/ui/bottom-sheet"
import { AppAvatar, preloadAvatar } from "@/components/app/app-avatar"
import { prefetchAppPage } from "@/lib/ui/app-navigation"
import { isNativeApp } from "@/lib/native-bridge"
import { openStorelibPage } from "@/lib/navigation/cross-section"
import { BusinessSwitcher, SWITCHER_AVATAR, type BusinessRow, type TeamStoreRow } from "@/components/app/business-switcher"
import { AccountFilm, FILM, pressHandlers, release } from "@/components/app/account-film"
import { tt } from "@/lib/i18n/text"


/**
 * ===========================================================================
 *  THE ACCOUNT TRIGGER AND ITS SHEET, ON THEIR OWN
 * ===========================================================================
 * The open state used to live in AppSidebar, so every open and every close
 * re-rendered the whole sidebar: the desktop nav, the header, the pill, the
 * menu page, the notifications. Traced on a phone profile that was a 60 to
 * 90ms task on the tap that opens the sheet, in the same frame the sheet has
 * to start moving in. Here the state is local and the component is memoised,
 * so a tap re-renders a button and a sheet.
 *
 * Its own file so scripts/check-sheet-motion.mjs can open the real one over
 * a page the size of the dashboard and count what else renders.
 */
const NO_BUSINESSES: BusinessRow[] = []

/**
 * The Help Center at help.storelib.com, the one address both account menus
 * open, in a new tab: the real Help Center, with your account in its header.
 */
export const APP_HELP_HREF = publicHelpUrl()
const NO_TEAM_STORES: TeamStoreRow[] = []

export const MobileAccountMenu = memo(function MobileAccountMenu({
  businesses = NO_BUSINESSES,
  teamStores = NO_TEAM_STORES,
  avatarSrc,
  userDisplayName,
  settingsLabel,
  billingLabel,
  languageLabel,
  onOpening,
  onLanguage,
  onSignOut,
}: {
  /** Every business of the login (up to lib/businesses/rules MAX_BUSINESSES), else this one alone: the switcher at the top of the sheet. */
  businesses?: BusinessRow[]
  /** The stores this login is on as a team member, under its businesses (lib/team). */
  teamStores?: TeamStoreRow[]
  avatarSrc: string | undefined
  userDisplayName: string
  settingsLabel: string
  billingLabel: string
  languageLabel: string
  onOpening: () => void
  onLanguage: () => void
  onSignOut: () => void
}) {
  const [mobileProfileDropdownOpen, setMobileProfileDropdownOpen] = useState(false)
  const closeMobileProfile = useCallback(() => setMobileProfileDropdownOpen(false), [])
  const pathname = usePathname()
  /* A page change closes it, as it closed everything else in the sidebar. */
  useEffect(() => { setMobileProfileDropdownOpen(false) }, [pathname])
  /*
   * NOTHING BUT THE SLIDE ON THE FIRST FRAMES. The photo in the sheet is a
   * different file from the one in the header (32px in the businesses' row,
   * or 40px for an account alone, not 24px): it is fetched and decoded while
   * the page is idle, and again on the press before the tap lands if it has
   * not been yet, so the sheet never decodes an image while it moves. The
   * sheet's links do not prefetch as they appear (five router requests
   * answered in the middle of the slide); the two pages in this app are
   * fetched once the sheet is up.
   */
  const sheetAvatar = businesses.length > 0 ? SWITCHER_AVATAR.sheet : 40
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (f: () => void) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => preloadAvatar(avatarSrc, sheetAvatar))
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(() => preloadAvatar(avatarSrc, sheetAvatar), 1200)
    return () => window.clearTimeout(t)
  }, [avatarSrc, sheetAvatar])
  const router = useRouter()
  /*
    SETTINGS IS THERE BEFORE IT IS PRESSED (round V). Fetched whole a moment
    after each page settles, so the press opens a page that is already
    filled rather than one that fills in. The router keeps it five minutes
    (next.config staleTimes); asking again within them costs nothing.
  */
  useEffect(() => {
    if (pathname?.startsWith("/app/settings")) return
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const go = () => prefetchAppPage(router, "/app/settings")
    const t = window.setTimeout(() => {
      if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2000 })
      else go()
    }, 1500)
    return () => window.clearTimeout(t)
  }, [pathname, router])
  useEffect(() => {
    if (!mobileProfileDropdownOpen) return
    const t = window.setTimeout(() => {
      prefetchAppPage(router, "/app/settings")
      prefetchAppPage(router, "/app/settings/billing")
    }, SHEET_OPEN_MS + 60)
    return () => window.clearTimeout(t)
  }, [mobileProfileDropdownOpen, router])
  /*
   * Settings stays here, on a phone, where no rail sits beside the page to
   * hold it; the desktop dropdown leaves it to the rail
   * (components/app/sidebar.tsx), which already has a Settings row. Help is
   * its own row after Language, right above Log out, at both sizes: it opens
   * APP_HELP_HREF, the Help Center at help.storelib.com, in a new tab.
   */
  const items = useMemo(() => [
    { href: "/app/settings", label: settingsLabel, icon: Settings },
    { href: "/app/settings/billing", label: billingLabel, icon: CreditCard },
    { href: "/explore", label: tt("Explore"), icon: Compass, target: "_blank" as const },
    { href: "/account/library", label: tt("Library"), icon: Library },
  ], [settingsLabel, billingLabel])

  return (
    <>
    <div className="relative flex-1 z-[60]">
      <button
        id="account-trigger"
        {...pressHandlers}
        onPointerDown={(e) => {
          pressHandlers.onPointerDown(e)
          preloadAvatar(avatarSrc, sheetAvatar)
        }}
        onClick={(e) => {
          release(e)
          onOpening()
          setMobileProfileDropdownOpen((v) => !v)
        }}
        aria-haspopup="dialog"
        /* data-open, not aria-expanded: an aria-expanded that changes is a
           change under a :has() in the site builder's CSS, and Chromium
           answers it by restyling the whole document on the tap
           (scripts/check-app-sheets-frames.mjs). A button that opens a modal
           dialog does not need it: focus moves into the dialog. */
        data-open={mobileProfileDropdownOpen ? "" : undefined}
        className="group/acct relative isolate flex w-fit items-center justify-start gap-2 rounded-xl px-2 py-1.5 [-webkit-tap-highlight-color:transparent]"
      >
        {/* The grey behind the name: a film on opacity alone, so it fades even in the frame the sheet is put together (components/app/account-film). */}
        <AccountFilm shades={FILM.phone} open={mobileProfileDropdownOpen} />
        <AppAvatar src={avatarSrc} name={userDisplayName} size={24} tone="dark" className="ring-1 ring-white/20" />
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

        The drag is in components/ui/bottom-sheet: the sheet follows
        the finger every frame, a flick closes it, and the listeners are
        native because React registers touchmove passively and a sheet
        that cannot refuse the page's scroll slides against it.
      */}
    </div>
    {/* Kept: built while the page is idle, so the tap only slides it up. */}
    <BottomSheet
      isOpen={mobileProfileDropdownOpen}
      onClose={closeMobileProfile}
      label={tt("Account")}
      hideFrom="md"
      keepMounted
    >
      <div className="px-3 pb-3">
        {/* With the businesses known, they head the sheet (the current one checked); before, the account alone. */}
        {businesses.length > 0 || teamStores.length > 0 ? (
          <>
            <BusinessSwitcher businesses={businesses} teamStores={teamStores} variant="sheet" currentAvatar={avatarSrc} open={mobileProfileDropdownOpen} onNavigate={closeMobileProfile} />
            <div className="my-1.5 h-px bg-neutral-100" />
          </>
        ) : (
          <div className="flex items-center gap-3 px-2 pb-3 pt-1">
            <AppAvatar src={avatarSrc} name={userDisplayName} size={40} className="ring-1 ring-neutral-200" />
            <span className="truncate text-[15px] font-semibold text-neutral-900">{userDisplayName}</span>
          </div>
        )}

        {items.map((item) => {
          const Icon = item.icon
          const isExplore = item.href === "/explore"
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              {...("target" in item ? { target: item.target, rel: "noopener noreferrer" } : {})}
              onClick={(e) => {
                if (isExplore && isNativeApp()) {
                  e.preventDefault()
                  openStorelibPage(router, "/explore")
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
            onLanguage()
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-neutral-800 active:bg-neutral-100"
        >
          <Globe className="h-[18px] w-[18px] shrink-0 text-neutral-400" strokeWidth={1.75} />
          <span>{languageLabel}</span>
        </button>
        <a
          href={APP_HELP_HREF}
          target="_blank"
          rel="noopener"
          onClick={() => setMobileProfileDropdownOpen(false)}
          data-account-help=""
          className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-neutral-800 active:bg-neutral-100"
        >
          <HelpCircle className="h-[18px] w-[18px] shrink-0 text-neutral-400" strokeWidth={1.75} />
          <span>{tt("Help")}</span>
        </a>

        <div className="my-1.5 h-px bg-neutral-100" />

        <button
          onClick={() => {
            setMobileProfileDropdownOpen(false)
            onSignOut()
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-red-600 active:bg-red-50"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
          <span>{tt("Logout")}</span>
        </button>
      </div>
    </BottomSheet>
    </>
  )
})
