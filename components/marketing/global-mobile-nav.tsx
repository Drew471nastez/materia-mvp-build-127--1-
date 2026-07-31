"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { MobileBottomNav } from "@/components/explore/mobile-bottom-nav"
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

/** Routes that ship their own bottom bar, or where one would be in the way. */
function suppressed(pathname: string): boolean {
  return (
    pathname === "/" ||
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
  const [native, setNative] = useState(false)
  useEffect(() => {
    setNative(isNativeApp())
  }, [])

  // In the app the tab bar is the ONLY navigation — there's no header and no
  // browser back button — so it stays up even on checkout and auth screens.
  if (!native && suppressed(pathname)) return null
  if (native && (pathname === "/" || pathname.startsWith("/explore"))) return null

  const active = pathname.startsWith("/products/new")
    ? "sell"
    : pathname.startsWith("/messages")
      ? "inbox"
      : pathname.startsWith("/settings")
        ? "profile"
        : "home"

  return (
    <>
      {/* Reserves the bar's height so a page's last row isn't sat on. */}
      <div aria-hidden className="md:hidden" style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 62px)" }} />
      <div className="md:hidden fixed inset-x-0 bottom-0 z-[80]">
        <MobileBottomNav active={active as any} />
      </div>
    </>
  )
}
