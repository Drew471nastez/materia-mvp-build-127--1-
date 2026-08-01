"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { MobileBottomNav } from "@/components/explore/mobile-bottom-nav"
import { MobileSearchOverlay } from "@/components/explore/mobile-search-overlay"
import { triggerHaptic } from "@/lib/native-bridge"
import { isNativeApp } from "@/lib/native-bridge"

/**
 * The bottom navigation, on every page — not just the feed.
 *
 * It used to live inside MobileFeed alone, so it vanished the moment you opened
 * a listing, your settings or the sell form. On a phone (and especially inside
 * the app, where there is no browser chrome to fall back on) that leaves you
 * with no way back except the OS gesture. A tab bar that disappears isn't a tab
 * bar.
 *
 * The feed still renders its own — it's a full-screen fixed overlay with its own
 * stacking context and its own search handler — so this one steps aside there
 * rather than stacking two.
 */

/**
 * A conversation is a screen, not a tab.
 *
 * Every chat app on a phone drops its tab bar when you open a thread, and for
 * two reasons that are both visible here. It is dead furniture — you came to
 * read and to type, and the way out is the back arrow already in the header —
 * and it is in the way: the composer has to sit on the bottom edge of the
 * screen, so a bar under it is a white band between the input and the keyboard
 * that goes nowhere. Its spacer is the empty space below the composer, and the
 * bar itself is the thing that ends up wedged against an open keyboard.
 *
 * The inbox keeps it. /messages is a list you browse, and browsing is exactly
 * what tabs are for.
 */
function isConversation(pathname: string): boolean {
  return pathname.startsWith("/messages/") && pathname.length > "/messages/".length
}

/** Routes that ship their own bottom bar, or where one would be in the way. */
function suppressed(pathname: string): boolean {
  return (
    pathname === "/" ||
    isConversation(pathname) ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    // Seller dashboard has its own navigation entirely.
    pathname.startsWith("/app")
  )
}

export function GlobalMobileNav() {
  const pathname = usePathname()
  // Read after mount: Capacitor isn't on `window` during SSR, and guessing would
  // mean rendering the wrong navigation for a frame.
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)
  const [native, setNative] = useState(false)

  // Categories always resolve on the feed — that's where results live.
  const onCategory = useCallback(
    (id: string) => router.push(id === "all" ? "/" : `/?category=${id}`),
    [router],
  )

  useEffect(() => {
    setNative(isNativeApp())
  }, [])

  // In the app the tab bar is the ONLY navigation — there's no header and no
  // browser back button — so it stays up even on checkout and auth screens.
  const hideBar = native
    ? pathname === "/" || pathname.startsWith("/explore") || isConversation(pathname)
    : suppressed(pathname)
  if (hideBar) return null

  const active = pathname.startsWith("/products/new")
    ? "sell"
    : pathname.startsWith("/messages")
      ? "inbox"
      : // Settings is reached FROM the profile and is still part of it, so both
        // paths light the same tab rather than dropping the highlight to Home.
        pathname.startsWith("/profile") || pathname.startsWith("/settings")
        ? "profile"
        : "home"

  return (
    <>
      {/* Reserves the bar's height so a page's last row isn't sat on. */}
      {/* Stands in for the fixed bar below, so a page's last row isn't sat on.
          It has to track the bar's real height: the tabs grew to fill their
          columns (54px plus the row's padding and the top border), and a
          spacer left behind would put every page a few pixels under it. */}
      <div aria-hidden className="md:hidden" style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 63px)" }} />
      <div className="md:hidden fixed inset-x-0 bottom-0 z-[80]">
        <MobileBottomNav active={active as any} onSearch={() => {
          void triggerHaptic("light")
          setSearchOpen(true)
        }} />
      </div>

      {/* The overlay lives HERE, with the bar that is on every page. It had no
          handler outside the feed, so the search tab was a dead button
          everywhere else — it opened nothing at all on the sell form, messages
          or settings. One overlay owned by the bar means search behaves the same
          on every screen. */}
      <MobileSearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectCategory={onCategory}
        initialQuery=""
      />
    </>
  )
}
