import type React from "react"
import { redirect } from "next/navigation"
import { isExploreMarketplaceEnabled } from "@/lib/platform/explore-marketplace"

export default async function ExploreLayout({ children }: { children: React.ReactNode }) {
  const enabled = await isExploreMarketplaceEnabled()
  if (!enabled) redirect("/")
  return children
}
