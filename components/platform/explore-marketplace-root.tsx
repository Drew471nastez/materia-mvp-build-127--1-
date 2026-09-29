import type React from "react"

import { isExploreMarketplaceEnabled } from "@/lib/platform/explore-marketplace"
import { ExploreMarketplaceProvider } from "@/components/platform/explore-marketplace-context"

/** Server wrapper: one read per request, shared by header and buyer tab bar. */
export async function ExploreMarketplaceRoot({ children }: { children: React.ReactNode }) {
  const enabled = await isExploreMarketplaceEnabled()
  return <ExploreMarketplaceProvider enabled={enabled}>{children}</ExploreMarketplaceProvider>
}
