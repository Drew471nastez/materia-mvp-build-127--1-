"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"

export function ConditionalHeader() {
  const pathname = usePathname()
  const [showPlatformHeader, setShowPlatformHeader] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return

    // 🚫 Never show platform header on seller storefront pages (no exceptions)
    const isSellerPage = pathname.startsWith("/u/") || pathname.startsWith("/p/")
    if (isSellerPage) {
      setShowPlatformHeader(false)
      return
    }

    // ✅ Show platform header only on actual platform pages
    const isPlatformPage =
      pathname === "/" ||
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
