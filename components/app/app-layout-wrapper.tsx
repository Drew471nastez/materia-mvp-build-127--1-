"use client"

import { Suspense, useEffect } from "react"
import { NavigationLoadingBar } from "./navigation-loading-bar"
import { LanguageProvider } from "@/lib/i18n"
import { PurchaseSyncProvider } from "@/components/checkout/purchase-sync-provider"

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  // Hide html-level scrollbar on /app pages
  useEffect(() => {
    document.documentElement.classList.add("app-layout")
    return () => {
      document.documentElement.classList.remove("app-layout")
    }
  }, [])

  // Set --sat/--sab CSS custom properties for safe-area insets in Capacitor.
  // The CSS rule `html.capacitor { --sat: env(...) }` handles this declaratively,
  // but some WebView versions need the values set imperatively as well.
  useEffect(() => {
    const isNative =
      typeof window !== "undefined" &&
      !!(window as any).Capacitor?.isNativePlatform?.()
    if (!isNative) return
    const root = document.documentElement
    root.style.setProperty("--sat", "env(safe-area-inset-top)")
    root.style.setProperty("--sab", "env(safe-area-inset-bottom)")
    return () => {
      root.style.removeProperty("--sat")
      root.style.removeProperty("--sab")
    }
  }, [])

  return (
    <LanguageProvider>
      <Suspense fallback={null}>
        <NavigationLoadingBar />
      </Suspense>
      <PurchaseSyncProvider />
      {children}
    </LanguageProvider>
  )
}
