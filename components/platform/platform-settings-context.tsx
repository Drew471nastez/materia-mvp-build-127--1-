"use client"

import { createContext, useContext } from "react"

type PlatformSettings = {
  exploreMarketplace: boolean
  buyerHeaderLight: boolean
  /** /admin → System → Physical commerce (lib/platform/physical-commerce.ts). Off by default. */
  physicalCommerce: boolean
}

const PlatformSettingsContext = createContext<PlatformSettings>({
  exploreMarketplace: false,
  buyerHeaderLight: false,
  physicalCommerce: false,
})

export function PlatformSettingsProvider({
  exploreMarketplace,
  buyerHeaderLight,
  physicalCommerce = false,
  children,
}: {
  exploreMarketplace: boolean
  buyerHeaderLight: boolean
  physicalCommerce?: boolean
  children: React.ReactNode
}) {
  return (
    <PlatformSettingsContext.Provider value={{ exploreMarketplace, buyerHeaderLight, physicalCommerce }}>
      {children}
    </PlatformSettingsContext.Provider>
  )
}

export function useExploreMarketplaceEnabled(): boolean {
  return useContext(PlatformSettingsContext).exploreMarketplace
}

export function useBuyerHeaderLight(): boolean {
  return useContext(PlatformSettingsContext).buyerHeaderLight
}

/** Whether physical commerce is on for Storelib. For drawing only: every server route checks it again. */
export function usePhysicalCommerceEnabled(): boolean {
  return useContext(PlatformSettingsContext).physicalCommerce
}
