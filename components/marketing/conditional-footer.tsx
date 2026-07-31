"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { MarketingFooter } from "@/components/marketing/footer"
import { extractUsernameFromHost, isCustomDomain } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { isNativeApp } from "@/lib/platform-utils"

export function ConditionalFooter() {
  // No footer on the listing form. It's a long, focused task and ending it in a
  // sitemap invites people to wander off mid-listing.

  const pathname = usePathname()
  const searchParams = useSearchParams()
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

    const isSellerPath = pathname.startsWith("/u/") || pathname.startsWith("/p/") || pathname.startsWith("/l/")

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

    const isSellerPage = isSubdomain || isSellerPath

    if (isSellerPage) {
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
      pathname.startsWith("/cart") ||
      pathname.startsWith("/messages") ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/app") ||
      pathname.startsWith("/marketplace") ||
      pathname.startsWith("/blog") ||
      pathname.startsWith("/pricing") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/terms") ||
      pathname.startsWith("/help") ||
      pathname.startsWith("/account-deletion")

    setShowFooter(isPlatformPage)
  }, [pathname, searchParams, isHydrated])

  return showFooter && !pathname.startsWith("/products/new") && !pathname.startsWith("/settings") ? <MarketingFooter /> : null
}
