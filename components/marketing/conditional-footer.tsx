"use client"

import { useRoutePath } from "@/lib/navigation/route-path"

import { useSearchParams } from "next/navigation"
import { useEffect, useState, useSyncExternalStore } from "react"
import { MarketingFooter } from "@/components/marketing/footer"
import { ShopCompactFooter } from "@/components/marketing/shop-compact-footer"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { isExploreBrowsePage, siteFooterFor } from "@/lib/nav/site-footer"
import { extractUsernameFromHost, isCustomDomain, isSellerPage } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { isNativeApp } from "@/lib/platform-utils"

/** Signed in, as the header last knew it: read synchronously, so a signed in visitor's Explore never draws the footer first. */
const readSignedIn = () => !!readAuthSnapshot()?.signedIn

export function ConditionalFooter() {
  const pathname = useRoutePath()
  const searchParams = useSearchParams()
  const signedIn = useSyncExternalStore(subscribeAuthSnapshot, readSignedIn, () => false)
  const [footerMode, setFooterMode] = useState<"none" | "marketing" | "compact">("none")
  /* Explore on a computer ends the way a creator's page does (see the end of this component). */
  const [exploreDesktop, setExploreDesktop] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    setExploreDesktop(false)

    const host = typeof window !== "undefined" ? window.location.host : ""
    const isSubdomain = extractUsernameFromHost(host) !== null
    const isOnCustomDomain = isCustomDomain(host)

    // Never show platform footer on custom domains - seller owns the entire experience
    if (isOnCustomDomain) {
      setFooterMode("none")
      return
    }

    /* Both spellings, via the one helper — see the note in
       conditional-header. `/<handle>` and `/<handle>/<slug>` are seller
       surfaces just as much as `/u/` and `/p/` were. */
    const isSellerPath = isSellerPage(pathname)

    // In Capacitor native apps, hide the black footer on seller pages,
    // product pages, and /explore for a clean native app experience.
    if (isNativeApp() && (isSubdomain || isSellerPath || pathname.startsWith("/explore"))) {
      setFooterMode("none")
      return
    }

    // On web with query-param discover layout: hide footer (existing behaviour)
    if ((isSubdomain || isSellerPath) && isDiscoverMode(pathname, searchParams, { isSubdomain })) {
      setFooterMode("none")
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
      setFooterMode("none")
      return
    }

    /* Explore's browse pages, on the web: the creator page's footer from 1024px, whoever is looking (below). */
    setExploreDesktop(!isNativeApp() && isExploreBrowsePage(pathname))

    /* Signed-in Explore only: a thin link row instead of the black footer. */
    if (signedIn && !isNativeApp() && isExploreBrowsePage(pathname)) {
      setFooterMode("compact")
      return
    }

    const isPlatformPage =
      pathname === "/" ||
      pathname.startsWith("/feed") ||
      pathname.startsWith("/explore") ||
      pathname.startsWith("/features") ||
      pathname.startsWith("/creators") ||
      pathname.startsWith("/wishlist") ||
      /* Same reason as the header: the library is a platform page now. */
      pathname.startsWith("/account/library") ||
      /* The buyer's profile and its subpages, for the same reason as the header. */
      ((pathname === "/account" || pathname.startsWith("/account/")) && !pathname.startsWith("/account/continue")) ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/app") ||
      pathname.startsWith("/marketplace") ||
      pathname.startsWith("/blog") ||
      /* The Storelib Developer Hub: without this it drew with no footer. */
      pathname.startsWith("/developers") ||
      pathname.startsWith("/pricing") ||
      pathname === "/alternatives" ||
      pathname.startsWith("/alternatives/") ||
      pathname.startsWith("/sell/") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/terms") ||
      pathname.startsWith("/help") ||
      pathname.startsWith("/account-deletion") ||
      pathname.startsWith("/member")

    /* And of those, who keeps it: lib/nav/site-footer. Not the library or
       the account at any width, Explore only for somebody signed out. */
    setFooterMode(isPlatformPage && siteFooterFor(pathname, { signedIn }) ? "marketing" : "none")
  }, [pathname, searchParams, isHydrated, signedIn])

  const footer = footerMode === "marketing" ? <MarketingFooter /> : footerMode === "compact" ? <ShopCompactFooter /> : null
  /*
    EXPLORE ON A COMPUTER ENDS LIKE A CREATOR'S PAGE. The owner asked for
    the creator page's own footer here on large screens, exactly as it is:
    "Powered by Storelib" and Privacy Policy, Terms & Conditions, Cookie
    preferences on one white row (components/storefront/seller-footer.tsx,
    unthemed). From 1024px it replaces the black footer (signed out) and the
    link row (signed in); below that, phones and tablets keep what they had.
  */
  if (exploreDesktop) {
    return (
      <>
        {footer ? <div className="lg:hidden">{footer}</div> : null}
        <div className="hidden lg:block" data-explore-desktop-footer="">
          {/* As wide as the header above the page, not a creator page's 6xl (SellerFooter headerWidth). */}
          {/* Round AG: signed out on Explore, the mark leads to storelib.com, where Storelib is explained; Explore is where they already are. */}
          <SellerFooter headerWidth home={!signedIn} />
        </div>
      </>
    )
  }
  return footer
}
