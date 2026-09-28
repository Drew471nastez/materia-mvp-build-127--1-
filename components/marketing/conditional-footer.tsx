"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState, useSyncExternalStore } from "react"
import { MarketingFooter } from "@/components/marketing/footer"
import { readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { siteFooterFor } from "@/lib/nav/site-footer"
import { extractUsernameFromHost, isCustomDomain, isSellerPage } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { isNativeApp } from "@/lib/platform-utils"

/** Signed in, as the header last knew it: read synchronously, so a signed in visitor's Explore never draws the footer first. */
const readSignedIn = () => !!readAuthSnapshot()?.signedIn

export function ConditionalFooter() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const signedIn = useSyncExternalStore(subscribeAuthSnapshot, readSignedIn, () => false)
  const [showFooter, setShowFooter] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return

    const host = typeof window !== "undefined" ? window.location.host : ""
    const isSubdomain = extractUsernameFromHost(host) !== null
    const isOnCustomDomain = isCustomDomain(host)

    // Never show platform footer on custom domains - seller owns the entire experience
    if (isOnCustomDomain) {
      setShowFooter(false)
      return
    }

    /* Both spellings, via the one helper — see the note in
       conditional-header. `/<handle>` and `/<handle>/<slug>` are seller
       surfaces just as much as `/u/` and `/p/` were. */
    const isSellerPath = isSellerPage(pathname)

    // In Capacitor native apps, hide the black footer on seller pages,
    // product pages, and /explore for a clean native app experience.
    if (isNativeApp() && (isSubdomain || isSellerPath || pathname.startsWith("/explore"))) {
      setShowFooter(false)
      return
    }

    // On web with query-param discover layout: hide footer (existing behaviour)
    if ((isSubdomain || isSellerPath) && isDiscoverMode(pathname, searchParams, { isSubdomain })) {
      setShowFooter(false)
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
      setShowFooter(false)
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
      pathname.startsWith("/library") ||
      /* The buyer's profile and its subpages, for the same reason as the header. */
      ((pathname === "/account" || pathname.startsWith("/account/")) && !pathname.startsWith("/account/continue")) ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/app") ||
      pathname.startsWith("/marketplace") ||
      pathname.startsWith("/blog") ||
      /* The Storelib Developer Hub: without this it drew with no footer. */
      pathname.startsWith("/developers") ||
      pathname.startsWith("/pricing") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/terms") ||
      pathname.startsWith("/help") ||
      pathname.startsWith("/account-deletion")

    /* And of those, who keeps it: lib/nav/site-footer. Not the library or
       the account at any width, Explore only for somebody signed out. */
    setShowFooter(isPlatformPage && siteFooterFor(pathname, { signedIn }))
  }, [pathname, searchParams, isHydrated, signedIn])

  return showFooter ? <MarketingFooter /> : null
}
