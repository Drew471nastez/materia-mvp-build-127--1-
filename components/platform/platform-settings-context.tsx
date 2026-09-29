"use client"

import { createContext, useContext } from "react"

type PlatformSettings = {
  exploreMarketplace: boolean
  buyerHeaderLight: boolean
}

const PlatformSettingsContext = createContext<PlatformSettings>({
  exploreMarketplace: false,
  buyerHeaderLight: false,
})

export function PlatformSettingsProvider({
  exploreMarketplace,
  buyerHeaderLight,
  children,
}: {
  exploreMarketplace: boolean
  buyerHeaderLight: boolean
  children: React.ReactNode
}) {
  return (
    <PlatformSettingsContext.Provider value={{ exploreMarketplace, buyerHeaderLight }}>
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
