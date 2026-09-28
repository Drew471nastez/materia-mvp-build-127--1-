"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState, Suspense } from "react"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { extractUsernameFromHost, isCustomDomain, isSellerPage } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"

/**
 * Shown while PlatformHeaderClient suspends (SSR streaming / initial hydration).
 * Same bg-black + sticky positioning as the real header so the layout doesn't shift.
 */
function HeaderPlaceholder() {
  // Height must match the real PlatformHeaderClient header so the layout
  // doesn't shift when React hydrates and swaps the fallback.
  // AND IT WAS FIVE PIXELS SHORT, which is a five pixel jump on every load.
  // Measured on production the phone header was 68px while this reserved 63,
  // so the page moved when the real header replaced it. The phone row is now
  // 11.3 + 42 + 10.3 + 1 = 64.6px, and the safe-area form is the same sum
  // with the inset in place of the 11.3px floor.
  // mobile:  max(64.6px, safe-area + 53.3px)
  // desktop: a 70.75px row (border-box, padding included) + 1px measured
  return (
    <div
      id="platform-header-root"
      className="sticky top-0 z-40 w-full bg-black"
      style={{ minHeight: 'max(64.6px, calc(env(safe-area-inset-top, 0px) + 53.3px))' }}
      aria-hidden
    />
  )
}

/**
 * Screens that carry their own chrome and must not get the platform's on top.
 * The creator page editor is a full-screen workspace with a bar of its own.
 */
function isOwnScreen(p: string): boolean {
  return p === "/creator-page" || p.startsWith("/creator-page/")
}

/** Paths that are always platform pages (never custom-domain seller pages). */
function isKnownPlatformPath(p: string): boolean {
  return (
    p.startsWith("/feed") ||
    p.startsWith("/explore") ||
    p.startsWith("/features") ||
    p.startsWith("/creators") ||
    p.startsWith("/wishlist") ||
    /* /library draws this header now: it used to have a sidebar of its own
       that doubled as its header on a phone. Without this it is not a known
       platform path, so the header would not render there at all. */
    p.startsWith("/library") ||
    /* THE BUYER'S PROFILE, /account and its subpages. It mounted this
       header exactly as /library does and still drew none, because it was
       not on this list. Not /account/continue, which is a redirect and never
       a page; and a word boundary, so /account-deletion stays its own entry. */
    ((p === "/account" || p.startsWith("/account/")) && !p.startsWith("/account/continue")) ||
    p.startsWith("/dashboard") ||
    p.startsWith("/app") ||
    p.startsWith("/marketplace") ||
    p.startsWith("/blog") ||
    p.startsWith("/pricing") ||
    p.startsWith("/faq") ||
    /* The Storelib Developer Hub. Not on this list, it drew with no header. */
    p.startsWith("/developers") ||
    p.startsWith("/privacy") ||
    p.startsWith("/terms") ||
    p.startsWith("/help") ||
    p.startsWith("/account-deletion")
  )
}

/**
 * THE PROFILE DRAWS ITS OWN TOP BAR ON A PHONE. "/account on phones: do not
 * render the black site header." The profile has a light bar of its own
 * there; on a computer it keeps this header, and the tab bar stays on the
 * phone either way (it is not part of this).
 *
 * Decided from the path, which the server knows, and hidden by the width in
 * CSS, which needs no script: so the first paint on a phone already has no
 * black band, and there is no frame in which it is drawn and then taken
 * away. The wrapper is `display: contents` from md up, so it is no box at
 * all there and the header's `position: sticky` still sticks to the page.
 */
export function hidesHeaderOnPhone(p: string): boolean {
  return p === "/account" || p.startsWith("/account/")
}

export function ConditionalHeader({
  initialWishlistCount = 0,
  onPlatformDomain = false,
}: {
  initialWishlistCount?: number
  /**
   * Whether this request arrived on the platform's OWN domain, decided on the
   * server from the Host header.
   *
   * "/" was excluded from the synchronous check below because it is genuinely
   * ambiguous on the client: a seller's custom domain also has a "/", and
   * showing platform chrome there would be wrong. So the header was not
   * rendered on the homepage at all until the effect ran, and the whole thing --
   * search, icons, avatar and the wishlist badge with it -- appeared after
   * hydration.
   *
   * The ambiguity is only on the CLIENT. The server has the Host header and
   * knows exactly which domain it is answering, so it answers here and the
   * homepage renders its header in the first paint like every other page. The
   * effect still runs and still has the last word.
   */
  onPlatformDomain?: boolean
}) {
  const pathname = usePathname()

  // Initialise synchronously so the header renders on the first paint for
  // known platform paths — avoids the blank-gap / "clipped header" flash.
  // "/" is intentionally excluded (ambiguous: could be a custom-domain home).
  // Seller paths (/u/ /p/ /l/) are excluded; host-based check below handles them.
  const [showPlatformHeader, setShowPlatformHeader] = useState(
    () => !isOwnScreen(pathname) && (isKnownPlatformPath(pathname) || (pathname === "/" && onPlatformDomain))
  )

  useEffect(() => {
    /*
      THE CREATOR PAGE EDITOR IS ITS OWN SCREEN. It has its own bar with the
      way back in it, and the platform header above that was a second black
      band on a phone, eating a quarter of the screen the page is supposed
      to fill. Decided first, before the host rules: it is true on every
      domain.
    */
    if (isOwnScreen(pathname)) {
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

    /**
     * `isSellerPage` rather than three startsWith calls, because a creator's
     * page is `/<handle>` now and a product is `/<handle>/<slug>`. Asking only
     * about the prefixes meant the marketing header came back over every
     * creator page the moment their address lost its `/u/`. The helper knows
     * both spellings and knows which first segments are the platform's.
     */
    const isSellerPath = isSellerPage(pathname)

    // Read search params from the live URL — avoids useSearchParams() which
    // triggers Next.js Suspense on every navigation, causing the header to flash.
    const searchParams = new URLSearchParams(window.location.search)

    // Discover mode: always show platform header (native app on seller/product pages)
    if ((isSubdomain || isSellerPath) && isDiscoverMode(pathname, searchParams, { isSubdomain })) {
      setShowPlatformHeader(true)
      return
    }

    /**
     * NOT `isSellerPage`. That is the name of the imported helper called a few
     * lines above, and a `const` of the same name shadows it for the WHOLE
     * block — so the call above it reads a binding that has not been
     * initialised yet and throws
     *
     *   ReferenceError: Cannot access 'a' before initialization
     *
     * on every render. This component is in the root layout, so that took out
     * every page on the site behind an error boundary, and it shipped because
     * `next build` is configured to ignore type errors and TypeScript is the
     * only thing that sees a use-before-declaration.
     */
    const onSellerSurface = isSubdomain || isSellerPath
    if (onSellerSurface) {
      setShowPlatformHeader(false)
      return
    }

    setShowPlatformHeader(pathname === "/" || isKnownPlatformPath(pathname))
  }, [pathname])

  if (!showPlatformHeader) return null

  // PlatformHeaderClient calls useSearchParams(), which requires a Suspense boundary
  // for SSR streaming (Next.js 16 build requirement).  The black-bar fallback keeps
  // the layout stable — no gap above content while the client hydrates.
  const header = (
    <Suspense fallback={<HeaderPlaceholder />}>
      <PlatformHeaderClient initialWishlistCount={initialWishlistCount} />
    </Suspense>
  )
  if (hidesHeaderOnPhone(pathname)) {
    return (
      <div data-header-phone="hidden" className="hidden md:contents">
        {header}
      </div>
    )
  }
  return header
}
