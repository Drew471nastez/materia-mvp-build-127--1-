"use client"

import { Suspense, useEffect } from "react"
import { usePathname } from "next/navigation"
import { NavigationLoadingBar } from "./navigation-loading-bar"
import { LanguageProvider } from "@/lib/i18n"
import { PurchaseSyncProvider } from "@/components/checkout/purchase-sync-provider"

export function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Hide html-level scrollbar on /app pages
  useEffect(() => {
    document.documentElement.classList.add("app-layout")
    return () => {
      document.documentElement.classList.remove("app-layout")
    }
  }, [])

  // Reset the shared scroll container to the top on every navigation.
  // Without this, navigating from a scrolled page (e.g. dashboard) to a new
  // page (e.g. Upgrade to Pro) leaves the scroll position mid-way, making
  // elements appear to overlap under the fixed header.
  useEffect(() => {
    const scrollEl = document.querySelector(".app-content-scroll") as HTMLElement | null
    if (scrollEl) {
      scrollEl.scrollTop = 0
    }
  }, [pathname])

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

  // Track software keyboard height via VisualViewport API.
  // When the keyboard opens on iOS/Android (Capacitor or mobile browser):
  //   - vv.height shrinks by the keyboard height
  //   - vv.offsetTop may increase as iOS shifts the viewport up to reveal the focused input
  // We set --keyboard-inset-height so CSS can shrink the scroll container,
  // and call window.scrollTo(0,0) to counteract any iOS upward viewport shift
  // that would push content under the fixed app header.
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return

    const vv = window.visualViewport
    const root = document.documentElement

    function onViewportChange() {
      // Keyboard height = total window height minus visible-viewport height minus any scroll offset
      const kbHeight = Math.max(0, window.innerHeight - vv.offsetTop - vv.height)
      root.style.setProperty("--keyboard-inset-height", `${kbHeight}px`)

      // iOS WKWebView scrolls the visual viewport up when the keyboard opens so
      // the focused input stays in view. On /app pages html has overflow:hidden,
      // so document scroll is locked — but the visual-viewport offset can still
      // change, pushing content behind the fixed app header. Reset it.
      if (vv.offsetTop > 0) {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
      }
    }

    vv.addEventListener("resize", onViewportChange)
    vv.addEventListener("scroll", onViewportChange)

    return () => {
      vv.removeEventListener("resize", onViewportChange)
      vv.removeEventListener("scroll", onViewportChange)
      root.style.removeProperty("--keyboard-inset-height")
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
