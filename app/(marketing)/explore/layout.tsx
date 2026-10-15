import type React from "react"
import { redirect } from "next/navigation"
import { isExploreMarketplaceEnabled } from "@/lib/platform/explore-marketplace"

/*
  EXPLORE STAYS RENDERED PER REQUEST. It was, only because the marketing
  layout read the request; that layout reads nothing now (the owner:
  marketing pages served from the CDN), and /explore/search would have
  turned static: its screen reads useSearchParams under a Suspense, so the
  built HTML would be that Suspense's empty fallback instead of the search
  screen, and the flag check below would be decided at build time. The
  other Explore pages read the visitor (their catalogue cookie, who is
  signed in) and are dynamic on their own.
*/
export const dynamic = "force-dynamic"

export default async function ExploreLayout({ children }: { children: React.ReactNode }) {
  const enabled = await isExploreMarketplaceEnabled()
  if (!enabled) redirect("/")
  return children
}
