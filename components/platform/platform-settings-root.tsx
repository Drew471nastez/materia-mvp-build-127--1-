import type React from "react"

import { isBuyerHeaderLight } from "@/lib/platform/buyer-header-theme"
import { isExploreMarketplaceEnabled } from "@/lib/platform/explore-marketplace"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"

export async function PlatformSettingsRoot({ children }: { children: React.ReactNode }) {
  const [exploreMarketplace, buyerHeaderLight, physicalCommerce] = await Promise.all([
    isExploreMarketplaceEnabled(),
    isBuyerHeaderLight(),
    isPhysicalCommerceEnabled(),
  ])
  return (
    <PlatformSettingsProvider exploreMarketplace={exploreMarketplace} buyerHeaderLight={buyerHeaderLight} physicalCommerce={physicalCommerce}>
      {children}
    </PlatformSettingsProvider>
  )
}
