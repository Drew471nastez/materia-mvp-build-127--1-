"use client"

import { usePathname, useSelectedLayoutSegment } from "next/navigation"
import { useEffect, useState, Suspense } from "react"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { extractUsernameFromHost, isCustomDomain, isSellerPage } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { BUYER_HEADER_DARK_BG, hasConcaveEdge } from "@/lib/platform/header-chrome"
import { isProfilePath } from "@/lib/profile/profile-redirect"

/**
 * Shown while PlatformHeaderClient suspends (SSR streaming / initial hydration).
 * Same surface + sticky positioning as the real header so the layout doesn't shift.
 */
function HeaderPlaceholder({ buyerHeaderLight = false, concave = false }: { buyerHeaderLight?: boolean; concave?: boolean }) {
  // Height must match the real PlatformHeaderClient header so the layout
  // doesn't shift when React hydrates and swaps the fallback.
  // AND IT WAS FIVE PIXELS SHORT, which is a five pixel jump on every load.
  // Measured on production the phone header was 68px while this reserved 63,
  // so the page moved when the real header replaced it. The phone row is now
  // 11.3 + 42 + 10.3 + 1 = 64.6px, and the safe-area form is the same sum
  // with the inset in place of the 11.3px floor.
  // mobile:  max(63.3px, safe-area + 52.65px) (round 61: 10.65 + 42 + 9.65 + 1)
  // desktop: a 70.75px row (border-box, padding included) + 1px measured
  return (
    <>
    <div
      id="platform-header-root"
      data-header-tone={buyerHeaderLight ? "light" : "dark"}
      className={buyerHeaderLight ? "sticky top-0 z-40 w-full bg-white" : "sticky top-0 z-40 w-full bg-[#16161a]"}
      style={{ minHeight: 'max(63.3px, calc(env(safe-area-inset-top, 0px) + 52.65px))' }}
      aria-hidden
    >
      {/* The band under the clock in this bar's colour, as the bar it stands in for says (platform-header-client). */}
      {buyerHeaderLight ? null : <style>{`:root{--native-band:${BUYER_HEADER_DARK_BG}}`}</style>}
    </div>
    {/* The same room under it in the app as the real bar leaves (platform-header-client), so the swap moves nothing. */}
    <div aria-hidden className="native-header-spacer" />
    {/* And the rounded edge the real header draws under itself on these pages, so its arrival moves nothing below. */}
    {concave ? (
      <div aria-hidden data-header-concave={buyerHeaderLight ? "light" : "dark"} className={buyerHeaderLight ? "relative z-30 -mb-px h-[20px] bg-white" : "relative z-30 -mb-px h-[20px] bg-[#16161a]"}>
        <div className="absolute inset-0 rounded-t-[20px] bg-white" />
      </div>
    ) : null}
    </>
  )
}

/**
 * Screens that carry their own chrome and must not get the platform's on top.
 * The creator page editor is a full-screen workspace with a bar of its own.
 * A community is somebody's own place: every page under /community/<slug>
 * draws the community's top bar instead (its picture, its name, whose it
 * is, a switcher back out to Explore), so Storelib's bar is never above it
 * (app/(marketing)/community/[slug]/layout.tsx). Bare /community is only a
 * redirect to Explore.
 *
 * A PERSON'S PROFILE, /@handle (and /member/<handle>, which it is rewritten
 * to), is a creator page without the products since round 12: "the creator
 * page's own top bar, hero, tabs and About, no Storelib header with
 * wishlist/library icons" (components/profile/member-profile-page.tsx). It
 * draws its own top bar, as a creator page does, so this header is not
 * drawn above it on any domain.
 */
function isOwnScreen(p: string): boolean {
  return p === "/creator-page" || p.startsWith("/creator-page/") || p.startsWith("/community/") || isProfilePath(p)
}

/** Paths that are always platform pages (never custom-domain seller pages). */
function isKnownPlatformPath(p: string): boolean {
  return (
    p.startsWith("/feed") ||
    p.startsWith("/explore") ||
    /* The theme store and each theme's page: Storelib's own, with Storelib's header (it drew none). */
    p === "/themes" ||
    p.startsWith("/themes/") ||
    p.startsWith("/features") ||
    p.startsWith("/creators") ||
    p.startsWith("/wishlist") ||
    /* /library draws this header now: it used to have a sidebar of its own
       that doubled as its header on a phone. Without this it is not a known
       platform path, so the header would not render there at all. */
    p.startsWith("/account/library") ||
    /* THE BUYER'S PROFILE, /account and its subpages. It mounted this
       header exactly as /library does and still drew none, because it was
       not on this list. Not /account/continue, which is a redirect and never
       a page; and a word boundary, so /account-deletion stays its own entry. */
    ((p === "/account" || p.startsWith("/account/")) && !p.startsWith("/account/continue")) ||
    p.startsWith("/dashboard") ||
    /* A RECEIPT, Storelib's page whoever sold it (app/receipt/layout.tsx):
       somebody who just bought in the app was left on it with no header,
       no tab bar and no way back (image 64). */
    p.startsWith("/receipt/") ||
    /* STORELIB COMMUNITIES. A platform path, so a creator called
       "communityx" stays a creator (the word boundary); but every page under
       /community/<slug> is its own screen with the community's own bar
       (isOwnScreen above), so the header itself is not drawn there. */
    p === "/community" ||
    p.startsWith("/community/") ||
    p.startsWith("/app") ||
    p.startsWith("/marketplace") ||
    p.startsWith("/blog") ||
    p.startsWith("/pricing") ||
    /* The comparison pages (lib/alternatives). */
    p === "/alternatives" ||
    p.startsWith("/alternatives/") ||
    /* The /sell/<use case> pages (lib/marketing/use-cases). Not /sell itself: that is the sign up door. */
    p.startsWith("/sell/") ||
    p.startsWith("/faq") ||
    /* The Storelib Developer Hub. Not on this list, it drew with no header. */
    p.startsWith("/developers") ||
    p.startsWith("/privacy") ||
    p.startsWith("/terms") ||
    p.startsWith("/help") ||
    p.startsWith("/account-deletion")
  )
}

/*
  NO RULE THAT HIDES THIS HEADER ON A PHONE ANY MORE. /account used to draw
  a light bar of its own there and this header was kept off it; the owner
  reversed that: "The profile page reached from Explore needs to have the
  header on it." So the profile carries the site header at every width,
  exactly as /library does, and the light bar it drew for itself is gone
  (components/account/account-hub.tsx). One header, never two stacked.
*/

export function ConditionalHeader({
  initialWishlistCount = 0,
  onPlatformDomain: hostSaysPlatform = false,
  platformHomeFromRoute = false,
  buyerHeaderLight = false,
}: {
  initialWishlistCount?: number
  buyerHeaderLight?: boolean
  /**
   * The marketing layout's answer to the same question, without reading the
   * Host header, so its pages can be static (the owner: marketing pages
   * served from the CDN).
   *
   * A page of that layout is drawn at "/" only when it is the layout's own
   * homepage, app/(marketing)/page.tsx, and the proxy draws that only on
   * Storelib's domain: "/" on a connected domain or a site's subdomain is
   * rewritten to the creator's page (/u, /w, /l, /site), and an unknown
   * domain is redirected to storelib.com. So "the segment under this layout
   * is its own page" is "this is storelib.com's homepage", and it is the
   * same for every visitor, which is what lets the HTML be cached. The
   * effect below still runs and still has the last word.
   */
  platformHomeFromRoute?: boolean
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
  /* null when the page under this layout is its own page.tsx (Next's page segment), "u" for /u/<name>, and so on. */
  const segmentBelow = useSelectedLayoutSegment()
  const onPlatformDomain = hostSaysPlatform || (platformHomeFromRoute && segmentBelow === null)

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
    <Suspense fallback={<HeaderPlaceholder buyerHeaderLight={buyerHeaderLight} concave={hasConcaveEdge(pathname)} />}>
      <PlatformHeaderClient initialWishlistCount={initialWishlistCount} buyerHeaderLight={buyerHeaderLight} />
    </Suspense>
  )
  return header
}
