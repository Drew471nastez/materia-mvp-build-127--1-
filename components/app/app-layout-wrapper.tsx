"use client"

import { Suspense, useEffect } from "react"
import { NavigationLoadingBar } from "./navigation-loading-bar"
import { LanguageProvider } from "@/lib/i18n"

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  // Hide html-level scrollbar on /app pages
  useEffect(() => {
    document.documentElement.classList.add("app-layout")
    return () => {
      document.documentElement.classList.remove("app-layout")
    }
  }, [])

  return (
    <LanguageProvider>
      <Suspense fallback={null}>
        <NavigationLoadingBar />
      </Suspense>
      {children}
    </LanguageProvider>
  )
}
