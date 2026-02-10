"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { extractUsernameFromHost, isCustomDomain } from "@/lib/url-helpers"

export function ConditionalHeader() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [showPlatformHeader, setShowPlatformHeader] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return

    const host = typeof window !== "undefined" ? window.location.host : ""
    const isSubdomain = extractUsernameFromHost(host) !== null
    const isOnCustomDomain = isCustomDomain(host)

    // Custom domains should never show the platform header
    if (isOnCustomDomain) {
      setShowPlatformHeader(false)
      return
    }

    const discoverLayout = searchParams.get("layout") === "discover" || searchParams.has("recommended")
    const isSellerPath = pathname.startsWith("/u/") || pathname.startsWith("/p/") || pathname.startsWith("/l/")

    // allow platform header on discover-style product page layouts
    if ((isSubdomain || isSellerPath) && discoverLayout) {
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
      pathname.startsWith("/marketplace")

    setShowPlatformHeader(isPlatformPage)
  }, [pathname, searchParams, isHydrated])

  return showPlatformHeader ? <PlatformHeaderClient /> : null
}
