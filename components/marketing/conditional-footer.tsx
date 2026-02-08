"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { MarketingFooter } from "@/components/marketing/footer"
import { extractUsernameFromHost } from "@/lib/url-helpers"

export function ConditionalFooter() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const host = typeof window !== "undefined" ? window.location.host : ""
  const isSubdomain = extractUsernameFromHost(host) !== null

  const discoverLayout = searchParams.get("layout") === "discover" || searchParams.has("recommended")
  const isSellerPath = pathname.startsWith("/u/") || pathname.startsWith("/p/") || pathname.startsWith("/l/")

  if ((isSubdomain || isSellerPath) && discoverLayout) {
    return <MarketingFooter />
  }

  const isSellerPage = isSubdomain || isSellerPath

  if (isSellerPage) return null

  return <MarketingFooter />
}
