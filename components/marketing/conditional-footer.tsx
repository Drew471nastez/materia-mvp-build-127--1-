"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { MarketingFooter } from "@/components/marketing/footer"
import { extractUsernameFromHost, isCustomDomain } from "@/lib/url-helpers"

export function ConditionalFooter() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const host = typeof window !== "undefined" ? window.location.host : ""
  const isSubdomain = extractUsernameFromHost(host) !== null
  const isOnCustomDomain = isCustomDomain(host)

  // Custom domains should never show the marketing footer
  if (isOnCustomDomain) return null

  const discoverLayout = searchParams.get("layout") === "discover" || searchParams.has("recommended")
  const isSellerPath = pathname.startsWith("/u/") || pathname.startsWith("/p/") || pathname.startsWith("/l/")

  if ((isSubdomain || isSellerPath) && discoverLayout) return null

  const isSellerPage = isSubdomain || isSellerPath

  if (isSellerPage) return null

  return <MarketingFooter />
}
