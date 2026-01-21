"use client"

import { usePathname } from "next/navigation"
import { MarketingFooter } from "@/components/marketing/footer"
import { extractUsernameFromHost } from "@/lib/url-helpers"

export function ConditionalFooter() {
  const pathname = usePathname()

  // Check if we're on a seller subdomain (e.g., username.storelib.com)
  const host = typeof window !== "undefined" ? window.location.host : ""
  const isSubdomain = extractUsernameFromHost(host) !== null

  // Seller pages (/u/, /p/, /l/) have their own SellerFooter rendered in the page component
  // Also hide on subdomain access. So we return null here to avoid duplicates
  const isSellerPage =
    isSubdomain ||
    pathname.startsWith("/u/") ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/l/") // published OnePage route

  if (isSellerPage) return null

  // Everything else in marketing -> show platform footer
  return <MarketingFooter />
}
