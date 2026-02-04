"use client"

import { Suspense } from "react"
import { NavigationLoadingBar } from "./navigation-loading-bar"
import { LanguageProvider } from "@/lib/i18n"

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <Suspense fallback={null}>
        <NavigationLoadingBar />
      </Suspense>
      {children}
    </LanguageProvider>
  )
}
