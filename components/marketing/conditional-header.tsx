"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState, Suspense } from "react"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { extractUsernameFromHost, isCustomDomain } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"

/**
 * Shown while PlatformHeaderClient suspends (SSR streaming / initial hydration).
 * Same bg-black + sticky positioning as the real header so the layout doesn't shift.
 */
function HeaderPlaceholder() {
  return (
    <div
      id="platform-header-root"
      className="sticky top-0 z-40 w-full bg-black"
      style={{ minHeight: "57px" }}
      aria-hidden
    />
  )
}

/** Paths that are always platform pages (never custom-domain seller pages). */
function isKnownPlatformPath(p: string): boolean {
  return (
    p.startsWith("/feed") ||
    p.startsWith("/explore") ||
    p.startsWith("/features") ||
    p.startsWith("/creators") ||
    p.startsWith("/wishlist") ||
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

  // PlatformHeaderClient calls useSearchParams(), which requires a Suspense boundary
  // for SSR streaming (Next.js 16 build requirement).  The black-bar fallback keeps
  // the layout stable — no gap above content while the client hydrates.
  return (
    <Suspense fallback={<HeaderPlaceholder />}>
      <PlatformHeaderClient />
    </Suspense>
  )
}
