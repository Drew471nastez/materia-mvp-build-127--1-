import type React from "react"

import { isBuyerHeaderLight } from "@/lib/platform/buyer-header-theme"
import { isExploreMarketplaceEnabled } from "@/lib/platform/explore-marketplace"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"

export async function PlatformSettingsRoot({ children }: { children: React.ReactNode }) {
  const [exploreMarketplace, buyerHeaderLight] = await Promise.all([isExploreMarketplaceEnabled(), isBuyerHeaderLight()])
  return (
    <PlatformSettingsProvider exploreMarketplace={exploreMarketplace} buyerHeaderLight={buyerHeaderLight}>
      {children}
    </PlatformSettingsProvider>
  )
}
