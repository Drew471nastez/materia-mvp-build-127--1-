"use client"

/**
 * ===========================================================================
 *  THE BUYER'S PROFILE: WHO, THE TABS, AND THE PAGE UNDER THEM
 * ===========================================================================
 * /account opened straight into settings: a photo to change and a name to
 * type over. "It should not be direct account settings. It needs to be the
 * account with multiple subpages there, such as settings, overview. Like a
 * profile, a user profile."
 *
 * So the top of every /account page is the person: their photo, their name,
 * their @username when they have one, and since when they have been on
 * Storelib. Under it, the profile's pages as pill tabs (lib/account/
 * account-tabs.ts), and under those the page itself.
 *
 * It lives in the layout (app/account/layout.tsx), so moving between
 * Overview and Settings keeps the header and the tabs exactly where they
 * are and only the page under them changes: nothing above the fold moves.
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
import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { AppAvatar } from "@/components/app/app-avatar"
import { secondaryDepth } from "@/components/ui/depth-button"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { ACCOUNT_TABS, accountTabFor } from "@/lib/account/account-tabs"
import { cn } from "@/lib/utils"

/** The tab's fill and colour: /app Settings' one short time and one plain ease out. */
const TAB_FADE_MS = 150
const TAB_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"
/** The page under the tabs settling in: /app Settings' panel (app/globals.css .settings-panel). */
const PANEL_MS = 200
const PANEL_FROM = 0.2

export interface AccountIdentity {
  name: string
  username: string | null
  avatarUrl: string | null
  /** "March 2025", written on the server so the two renders agree. */
  memberSince: string
}

export function AccountHub({ identity, children }: { identity: AccountIdentity; children: ReactNode }) {
  const pathname = usePathname()
  const routeTab = accountTabFor(pathname)
  const photo = useShellAvatar(identity.avatarUrl)

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
  const onSettings = active === settings

  return (
    <div data-account-hub="">
      <header data-account-profile="" className="flex items-center gap-3.5 sm:gap-5">
        <AppAvatar
          src={photo}
          name={identity.name || "You"}
          alt=""
          size={80}
          sizedByClass
          className="h-16 w-16 shrink-0 sm:h-20 sm:w-20"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[21px] font-bold leading-[1.2] tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]" data-account-display-name="">
            {identity.name || "Your profile"}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] leading-[1.45] text-[#6b7280] sm:text-[14px]">
            {identity.username ? (
              <>
                <span className="max-w-full basis-full truncate sm:basis-auto" data-account-username="">
                  @{identity.username}
                </span>
                <span aria-hidden="true" className="hidden sm:inline">
                  ·
                </span>
              </>
            ) : null}
            <span data-account-member-since="">Member since {identity.memberSince}</span>
          </p>
        </div>
      </header>

      <div className="mt-5 flex items-center justify-between gap-3 sm:mt-6">
        <nav aria-label="Profile" data-account-tabs="">
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
                  style={{ transitionDuration: `${TAB_FADE_MS}ms`, transitionTimingFunction: TAB_EASE }}
                  className={cn(
                    "relative inline-flex h-10 cursor-pointer select-none items-center whitespace-nowrap rounded-full px-4 text-[14px] font-medium outline-none",
                    "transition-[color,scale] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 [-webkit-tap-highlight-color:transparent]",
                    "focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25",
                    on ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#374151]",
                  )}
                >
                  {/* This tab's own fill: it fades in where it is, never slides over from the other tab. */}
                  <span
                    aria-hidden="true"
                    data-account-tab-fill=""
                    style={{ transitionDuration: `${TAB_FADE_MS}ms`, transitionTimingFunction: TAB_EASE }}
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
        {/*
          EDIT PROFILE IS SETTINGS, at the end of the tabs' row. Beside the
          name it pushed "Member since" onto a third line on a phone. On
          Settings it has nothing left to do, so it goes, but it keeps its
          room: nothing on the row moves.
        */}
        <Link
          href="/account/settings"
          prefetch={true}
          onClick={() => setPressed(settings)}
          aria-hidden={onSettings || undefined}
          tabIndex={onSettings ? -1 : undefined}
          data-account-edit=""
          style={{ transitionDuration: `${TAB_FADE_MS}ms`, transitionTimingFunction: TAB_EASE }}
          className={cn(
            secondaryDepth,
            "h-10 rounded-xl px-3.5 text-[13px] transition-[opacity,visibility] motion-reduce:transition-none sm:px-4 sm:text-[14px]",
            onSettings && "pointer-events-none invisible opacity-0",
          )}
        >
          Edit profile
        </Link>
      </div>

      <div ref={panel} className="mt-5 sm:mt-6" data-account-panel={ACCOUNT_TABS[routeTab]?.key ?? "overview"}>
        {children}
      </div>
    </div>
  )
}
