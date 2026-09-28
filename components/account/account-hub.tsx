"use client"

/**
 * ===========================================================================
 *  THE BUYER'S PROFILE: WHO, THE TABS, AND THE PAGE UNDER THEM
 * ===========================================================================
 * /account opened straight into settings once; the owner asked for "the
 * account with multiple subpages there, such as settings, overview. Like a
 * profile, a user profile." Then, looking at it on an iPhone: "The profile
 * page should look much better, like an actual profile. The profile avatar
 * and things should be centre positioned, good clean", and "on the profile
 * page we don't need the black bar header to show, especially on mobile".
 *
 * So, top to bottom:
 *
 *   ON A PHONE, A LIGHT BAR of the profile's own in place of the black site
 *   header (which does not draw on /account on a phone): the page's name in
 *   the middle, under the status bar's safe area, on the page's own grey,
 *   with a hairline under it only once the page has scrolled under it. From
 *   768px up the site header is back and this bar is not drawn.
 *
 *   THE PERSON, CENTRED: the photo large, the name, @username, since when
 *   they have been on Storelib, and Edit profile under them.
 *
 *   THE TABS (lib/account/account-tabs.ts), centred, and the page itself.
 *
 * ONE PHOTO ON THE SCREEN. On Settings the big photo becomes the photo's
 * control (components/account/account-photo.tsx): a camera on its edge, a
 * press on it picks a picture, and Change photo and Remove take Edit
 * profile's place. Settings' own Profile card has only the name, so the
 * same face is never drawn twice. Nothing above the tabs changes size
 * between the two tabs, so the tabs never move.
 *
 * It lives in the layout (app/account/layout.tsx), so moving between
 * Overview and Settings keeps all of this exactly where it is and only the
 * page under the tabs changes.
 *
 * THE SWITCH IS /app SETTINGS' OWN (components/app/settings-form-new.tsx).
 * Each tab carries its own fill; the pressed tab's fades in and grows from
 * 96% on the spot while the old one fades where it is, and the words ease
 * from grey to ink, over 150ms on one ease out. The owner asked for that
 * calm switch there, and for no slide. The fill answers the press at once,
 * before the next page is even asked for. The page that arrives settles in
 * from 20% over 200ms, the same curve as the settings panel, so no frame is
 * ever empty under the tabs. Both tabs are separate routes, prefetched in
 * full, so the switch finds its page already here.
 */

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { secondaryDepth } from "@/components/ui/depth-button"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { ACCOUNT_GUTTER_LEFT, ACCOUNT_GUTTER_RIGHT, ACCOUNT_TABS, accountTabFor } from "@/lib/account/account-tabs"
import { AccountAvatar, useAccountPhoto } from "@/components/account/account-photo"
import { cn } from "@/lib/utils"

/** The tab's fill and colour: /app Settings' one short time and one plain ease out. */
const TAB_FADE_MS = 150
const TAB_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"
/** The page under the tabs settling in: /app Settings' panel (app/globals.css .settings-panel). */
const PANEL_MS = 200
const PANEL_FROM = 0.2

/** The phone bar's title on each tab. */
const BAR_TITLES: Record<(typeof ACCOUNT_TABS)[number]["key"], string> = { overview: "Profile", settings: "Settings" }

export interface AccountIdentity {
  /** Whose profile: a new photo is uploaded under this folder. */
  userId: string
  name: string
  username: string | null
  avatarUrl: string | null
  /** "March 2025", written on the server so the two renders agree. */
  memberSince: string
}

/**
 * THE PHONE'S BAR. A hairline only once something has scrolled under it: at
 * the top of the page there is nothing to separate it from.
 */
function PhoneBar({ title }: { title: string }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      setScrolled(window.scrollY > 2)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return (
    <div
      data-account-bar=""
      data-scrolled={scrolled ? "" : undefined}
      className="sticky top-0 z-30 bg-[#fafafa] md:hidden"
      style={{
        marginLeft: `calc(-1 * ${ACCOUNT_GUTTER_LEFT})`,
        marginRight: `calc(-1 * ${ACCOUNT_GUTTER_RIGHT})`,
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div className="flex h-[52px] items-center justify-center px-16">
        <p className="truncate text-[16px] font-semibold tracking-[-0.01em] text-[#1a1a2e]" data-account-bar-title="">
          {title}
        </p>
      </div>
      <span
        aria-hidden="true"
        data-account-bar-line=""
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[#e5e7eb] transition-opacity duration-150 motion-reduce:transition-none",
          scrolled ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  )
}

export function AccountHub({ identity, children }: { identity: AccountIdentity; children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const routeTab = accountTabFor(pathname)
  const shown = useShellAvatar(identity.avatarUrl)
  const photo = useAccountPhoto(identity.userId, () => router.refresh())

  /*
    THE PRESSED TAB, UNTIL ITS PAGE ARRIVES. The route only changes when
    the next page is ready, and a tab that waits for that to light up feels
    like a tab that did not hear the press. Any change of address clears
    it: the page it asked for, or another one (Back, a link).
  */
  const [pressed, setPressed] = useState<number | null>(null)
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    setPressed(null)
  }
  const active = pressed ?? routeTab

  /*
    THE PAGE SETTLES IN, IN THE FRAME IT ARRIVES. A layout effect runs
    after React has put the new page in and before the browser paints it,
    so the first frame of it is already at 20%. Never on the first paint of
    the profile, and not at all when less motion is asked for.
  */
  const panel = useRef<HTMLDivElement>(null)
  const shownPath = useRef(pathname)
  useLayoutEffect(() => {
    if (shownPath.current === pathname) return
    shownPath.current = pathname
    const el = panel.current
    if (!el || typeof el.animate !== "function") return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.animate([{ opacity: PANEL_FROM }, { opacity: 1 }], { duration: PANEL_MS, easing: TAB_EASE })
  }, [pathname])

  const settings = ACCOUNT_TABS.findIndex((t) => t.key === "settings")
  /* The tab that is lit: the slot under the name changes with the press, as the tab's fill does. */
  const onSettings = active === settings
  /* The photo's controls only work on the page that is actually here. */
  const editing = routeTab === settings
  const hasPhoto = !!(photo.preview || shown)
  const fade = { transitionDuration: `${TAB_FADE_MS}ms`, transitionTimingFunction: TAB_EASE }

  return (
    <div data-account-hub="">
      <PhoneBar title={BAR_TITLES[ACCOUNT_TABS[routeTab]?.key ?? "overview"]} />

      <header data-account-profile="" className="flex flex-col items-center pt-3 text-center md:pt-0">
        <AccountAvatar src={shown} name={identity.name} photo={photo} editable={editing} size={112} className="h-24 w-24 md:h-28 md:w-28" />
        <h1
          className="mt-3.5 line-clamp-2 max-w-full text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-[#1a1a2e] [overflow-wrap:anywhere] md:mt-4 md:text-[26px]"
          data-account-display-name=""
        >
          {identity.name || "Your profile"}
        </h1>
        {identity.username ? (
          <p className="mt-1 max-w-full truncate text-[14px] leading-[1.45] text-[#4b5563]" data-account-username="">
            @{identity.username}
          </p>
        ) : null}
        <p className={cn("text-[13px] leading-[1.45] text-[#6b7280]", identity.username ? "mt-0.5" : "mt-1")} data-account-member-since="">
          Member since {identity.memberSince}
        </p>

        {/*
          ONE SLOT, TWO SETS OF BUTTONS. Edit profile on Overview; on
          Settings, where it would go nowhere, Change photo and Remove. Both
          sit in the same grid cell and fade where they are, so the slot is
          the size of the larger and nothing under it moves.
        */}
        <div className="mt-4 grid place-items-center" data-account-actions="">
          <Link
            href="/account/settings"
            prefetch={true}
            onClick={() => setPressed(settings)}
            aria-hidden={onSettings || undefined}
            tabIndex={onSettings ? -1 : undefined}
            data-account-edit=""
            style={fade}
            className={cn(
              secondaryDepth,
              "[grid-area:1/1] h-10 min-w-[140px] rounded-xl px-5 text-[14px] transition-[opacity,visibility] motion-reduce:transition-none",
              onSettings && "pointer-events-none invisible opacity-0",
            )}
          >
            Edit profile
          </Link>
          <div
            aria-hidden={!onSettings || undefined}
            data-account-photo-actions=""
            style={fade}
            className={cn(
              "[grid-area:1/1] flex items-center gap-1 transition-[opacity,visibility] motion-reduce:transition-none",
              !onSettings && "pointer-events-none invisible opacity-0",
            )}
          >
            <button
              type="button"
              onClick={photo.pick}
              disabled={!!photo.busy || !editing}
              tabIndex={onSettings ? undefined : -1}
              data-photo-change=""
              className={cn(secondaryDepth, "h-10 rounded-xl px-4 text-[14px]")}
            >
              {hasPhoto ? "Change photo" : "Add photo"}
            </button>
            {hasPhoto ? (
              <button
                type="button"
                onClick={() => void photo.remove()}
                disabled={!!photo.busy || !editing}
                tabIndex={onSettings ? undefined : -1}
                data-photo-remove=""
                className="h-10 rounded-xl px-3 text-[14px] font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e] disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {photo.busy === "upload" ? "Uploading your photo" : photo.busy === "remove" ? "Removing your photo" : ""}
        </p>
        {photo.error ? (
          <p role="alert" className="mt-2 max-w-[320px] text-[12px] leading-[1.45] text-[#b42318]" data-account-photo-error="">
            {photo.error}
          </p>
        ) : null}
        {/* The picker is Settings' only: Overview has nothing to type or choose. */}
        {editing ? photo.input : null}
      </header>

      <nav aria-label="Profile" data-account-tabs="" className="mt-5 flex justify-center md:mt-6">
        <div className="relative flex w-fit items-center gap-1">
          {ACCOUNT_TABS.map((tab, i) => {
            const on = active === i
            return (
              <Link
                key={tab.key}
                href={tab.href}
                prefetch={true}
                aria-current={on ? "page" : undefined}
                data-account-tab={tab.key}
                onClick={(e) => {
                  /* The page you are on: nothing to go to. */
                  if (i === routeTab && pressed === null) {
                    e.preventDefault()
                    return
                  }
                  setPressed(i)
                }}
                style={fade}
                className={cn(
                  "relative inline-flex h-10 min-w-[104px] cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-full px-4 text-[14px] font-medium outline-none",
                  "transition-[color,scale] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 [-webkit-tap-highlight-color:transparent]",
                  "focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25",
                  on ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#374151]",
                )}
              >
                {/* This tab's own fill: it fades in where it is, never slides over from the other tab. */}
                <span
                  aria-hidden="true"
                  data-account-tab-fill=""
                  style={fade}
                  className={cn(
                    "pointer-events-none absolute -inset-px rounded-full border border-[#d1d5db] bg-[#f3f4f6] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[opacity,scale] motion-reduce:transition-none",
                    on ? "scale-100 opacity-100" : "scale-[0.96] opacity-0",
                  )}
                />
                <span className="relative">{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      <div ref={panel} className="mt-5 md:mt-6" data-account-panel={ACCOUNT_TABS[routeTab]?.key ?? "overview"}>
        {children}
      </div>
    </div>
  )
}
