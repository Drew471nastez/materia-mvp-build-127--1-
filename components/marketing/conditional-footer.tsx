"use client"

import { usePathname } from "next/navigation"
import { MarketingFooter } from "@/components/marketing/footer"

export function ConditionalFooter() {
  const pathname = usePathname()

  // Seller pages (/u/ and /p/) have their own SellerFooter rendered in the page component
  // So we return null here to avoid duplicates
const isSellerPage =
  pathname.startsWith("/u/") ||
  pathname.startsWith("/p/") ||
  pathname.startsWith("/l/") // published OnePage route

  if (isSellerPage) return null

  // Everything else in marketing -> show platform footer
  return <MarketingFooter />
}
