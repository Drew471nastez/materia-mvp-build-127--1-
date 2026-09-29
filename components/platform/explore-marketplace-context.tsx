"use client"

import { createContext, useContext } from "react"

const ExploreMarketplaceContext = createContext(false)

export function ExploreMarketplaceProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <ExploreMarketplaceContext.Provider value={enabled}>{children}</ExploreMarketplaceContext.Provider>
}

export function useExploreMarketplaceEnabled(): boolean {
  return useContext(ExploreMarketplaceContext)
}
