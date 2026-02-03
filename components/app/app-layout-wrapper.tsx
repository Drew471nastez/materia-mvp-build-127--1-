"use client"

import { Suspense } from "react"
import { NavigationLoadingBar } from "./navigation-loading-bar"

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <NavigationLoadingBar />
      </Suspense>
      {children}
    </>
  )
}
