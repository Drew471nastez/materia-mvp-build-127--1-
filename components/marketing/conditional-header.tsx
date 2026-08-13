"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { MobileWebHeader } from "@/components/marketing/mobile-web-header"
import { extractUsernameFromHost, isCustomDomain } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { isNativeApp } from "@/lib/native-bridge"

/**
 * Paths that are always platform pages (never custom-domain seller pages).
 *
 * This has to be a list rather than "everything that isn't a seller path",
 * because /[sellername] is a real route: any single unknown segment is somebody's
 * storefront, and those deliberately carry no platform chrome. So a page missing
 * from here does not get a header — which is exactly what had happened to
 * /profile and to the pages below it. On the web that leaves you on a screen
 * with no search, no account menu and no way anywhere except the browser's own
 * back button. Anything the app adds under a fixed path belongs in this list.
 */
function isKnownPlatformPath(p: string): boolean {
  return (
    p.startsWith("/feed") ||
    // Your own account, and everything reached from it.
    p.startsWith("/profile") ||
    p.startsWith("/orders") ||
    p.startsWith("/offers") ||
    // Legal and static content, which is as much a platform page as any other.
    p.startsWith("/legal") ||
    p.startsWith("/help") ||
    // Category and collection listings.
    p.startsWith("/c/") ||
    p.startsWith("/w/") ||
    p.startsWith("/explore") ||
    // The results page. Without this the header is not drawn on it at all —
    // and the results page is reached FROM the header's own category menu and
    // its own search field, so arriving there would take both of them away.
    p.startsWith("/shop") ||
    p.startsWith("/features") ||
    p.startsWith("/creators") ||
    p.startsWith("/wishlist") ||
    p.startsWith("/cart") ||
    p.startsWith("/member/") ||
    p.startsWith("/purchases") ||
    p.startsWith("/sales") ||
    p.startsWith("/products/") ||
    p.startsWith("/settings") ||
    p.startsWith("/messages") ||
    p.startsWith("/dashboard") ||
    p.startsWith("/app") ||
    p.startsWith("/marketplace") ||
    p.startsWith("/blog") ||
    p.startsWith("/pricing") ||
    p.startsWith("/faq") ||
    p.startsWith("/privacy") ||
    p.startsWith("/terms") ||
    p.startsWith("/help") ||
    p.startsWith("/account-deletion")
  )
}

export function ConditionalHeader() {
  const pathname = usePathname()

  // Initialise synchronously so the header renders on the first paint for
  // known platform paths — avoids the blank-gap / "clipped header" flash.
  // "/" is intentionally excluded (ambiguous: could be a custom-domain home).
  // Seller paths (/u/ /p/ /l/) are excluded; host-based check below handles them.
  const [showPlatformHeader, setShowPlatformHeader] = useState(() =>
    isKnownPlatformPath(pathname)
  )

  useEffect(() => {
    // Inside the iOS/Android shell there is no web header at all. The app has
    // its own status bar and its own bottom navigation; a site header on top of
    // that is a second, redundant chrome that makes it read as a website in a
    // box rather than an app.
    //
    // This still runs, and still wins, but it is no longer what keeps the header
    // off the app's first painted frame — html.capacitor does that in CSS before
    // any JavaScript has had a chance to answer isNativeApp(). Leaving the check
    // here means the app also stops paying for the header's effects and queries.
    if (isNativeApp()) {
      setShowPlatformHeader(false)
      return
    }
    const host = window.location.host
    const isSubdomain = extractUsernameFromHost(host) !== null
    const isOnCustomDomain = isCustomDomain(host)

    // Never show platform header on custom domains
    if (isOnCustomDomain) {
      setShowPlatformHeader(false)
      return
    }

    const isSellerPath =
      pathname.startsWith("/u/") ||
      pathname.startsWith("/p/") ||
      pathname.startsWith("/l/")

    // Read search params from the live URL — avoids useSearchParams() which
    // triggers Next.js Suspense on every navigation, causing the header to flash.
    const searchParams = new URLSearchParams(window.location.search)

    // Discover mode: always show platform header (native app on seller/product pages)
    if ((isSubdomain || isSellerPath) && isDiscoverMode(pathname, searchParams, { isSubdomain })) {
      setShowPlatformHeader(true)
      return
    }

    const isSellerPage = isSubdomain || isSellerPath
    if (isSellerPage) {
      setShowPlatformHeader(false)
      return
    }

    setShowPlatformHeader(pathname === "/" || isKnownPlatformPath(pathname))
  }, [pathname])

  if (!showPlatformHeader) return null

  // Both headers are rendered; which one is visible is settled in CSS, on the
  // first painted frame, by the `capacitor` class the boot script puts on <html>
  // and by the viewport width. See app/globals.css.
  //
  // .platform-header-shell is display:contents everywhere except a mobile
  // browser, so it adds no box to the layout — it exists purely so the platform
  // header, which renders several siblings rather than one root, can be switched
  // off as a unit where MobileWebHeader takes over.
  //
  /**
   * NO SUSPENSE BOUNDARY, because there is nothing left to suspend on.
   *
   * PlatformHeaderClient used to call useSearchParams(), which required one —
   * and the fallback was a bare black bar with no logo, no search and no icons.
   * That is a reasonable placeholder for one hydration and a terrible one for
   * what actually happened: the header re-suspended on navigations and the
   * whole of it blanked and came back, which is the flash on pressing Vinde
   * acum. The boundary was doing exactly what it was told; what it was told was
   * the problem.
   *
   * The header now reads the query string off the address bar (see
   * lib/use-url-search-params.ts), so it never suspends, so there is no
   * fallback to show and no state in which the chrome is missing.
   */
  return (
    <>
      <MobileWebHeader />
      <div className="platform-header-shell">
        <PlatformHeaderClient />
      </div>
    </>
  )
}
