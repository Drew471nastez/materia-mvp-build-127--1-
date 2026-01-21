"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { extractUsernameFromHost } from "@/lib/url-helpers"

export function ConditionalHeader() {
  const pathname = usePathname()
  const [showPlatformHeader, setShowPlatformHeader] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return

    // Check if we're on a seller subdomain (e.g., username.storelib.com)
    const host = typeof window !== "undefined" ? window.location.host : ""
    const isSubdomain = extractUsernameFromHost(host) !== null

    // 🚫 Never show platform header on seller storefront pages (no exceptions)
    // This includes /u/, /p/, and /l/ paths, as well as subdomain access
    const isSellerPage = isSubdomain || pathname.startsWith("/u/") || pathname.startsWith("/p/") || pathname.startsWith("/l/")
    if (isSellerPage) {
      setShowPlatformHeader(false)
      return
    }

    // ✅ Show platform header only on actual platform pages
    // NOTE: Homepage ("/") has its own navigation in page.tsx, so we exclude it
    const isPlatformPage =
      pathname.startsWith("/feed") ||
      pathname.startsWith("/explore") ||
      pathname.startsWith("/creators") ||
      pathname.startsWith("/wishlist") ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/app") ||
      pathname.startsWith("/marketplace")

    setShowPlatformHeader(isPlatformPage)
  }, [pathname, isHydrated])

  return showPlatformHeader ? <PlatformHeaderClient /> : null
}
