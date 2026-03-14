"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { extractUsernameFromHost, isCustomDomain } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"

export function ConditionalHeader() {
  const pathname = usePathname()
  const [showPlatformHeader, setShowPlatformHeader] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return

    const host = window.location.host
    const isSubdomain = extractUsernameFromHost(host) !== null
    const isOnCustomDomain = isCustomDomain(host)

    // Never show platform header on custom domains - seller owns the entire experience
    if (isOnCustomDomain) {
      setShowPlatformHeader(false)
      return
    }

    const isSellerPath = pathname.startsWith("/u/") || pathname.startsWith("/p/") || pathname.startsWith("/l/")

    // Read search params from the live URL — avoids useSearchParams() which triggers
    // Next.js Suspense on every navigation, causing the header to flash/disappear.
    const searchParams = new URLSearchParams(window.location.search)

    // Discover mode: Capacitor app on discover routes / subdomain OR query-param based
    // Always show platform header in discover mode (covers seller/product pages in app)
    if ((isSubdomain || isSellerPath) && isDiscoverMode(pathname, searchParams, { isSubdomain })) {
      setShowPlatformHeader(true)
      return
    }

    const isSellerPage = isSubdomain || isSellerPath
    if (isSellerPage) {
      setShowPlatformHeader(false)
      return
    }

    const isPlatformPage =
      pathname === "/" ||
      pathname.startsWith("/feed") ||
      pathname.startsWith("/explore") ||
      pathname.startsWith("/features") ||
      pathname.startsWith("/creators") ||
      pathname.startsWith("/wishlist") ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/app") ||
      pathname.startsWith("/marketplace") ||
      pathname.startsWith("/blog") ||
      pathname.startsWith("/pricing") ||
      pathname.startsWith("/faq") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/terms") ||
      pathname.startsWith("/help") ||
      pathname.startsWith("/account-deletion")

    setShowPlatformHeader(isPlatformPage)
  }, [pathname, isHydrated])

  return showPlatformHeader ? <PlatformHeaderClient /> : null
}
