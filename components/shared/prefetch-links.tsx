"use client"

import { useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"

/**
 * Route prefetch map: for each current route, prefetch these next likely routes.
 * This ensures instant navigation to common user flows.
 */
const PREFETCH_MAP: Record<string, string[]> = {
  "/": ["/explore", "/signup", "/login"],
  "/explore": ["/explore/design", "/explore/development", "/explore/ai"],
  "/app": ["/app/products", "/app/analytics", "/app/orders/sales", "/app/settings"],
  "/app/products": ["/app/products/new"],
  "/app/analytics": ["/app/orders/sales"],
  "/app/orders/sales": ["/app/analytics"],
  // Settings → Billing is the slowest hop in the dashboard: billing is a server
  // component that talks to Stripe, so its RSC payload is the one most worth
  // having in hand before the click rather than after it.
  "/app/settings": ["/app/settings/billing"],
  "/app/settings/billing": ["/app/settings/billing/upgrade"],
  "/account/library": ["/account/library", "/account/library/wishlist"],
  "/signup": ["/login"],
  "/login": ["/signup", "/app"],
}

/**
 * Prefetches likely next routes based on the current path.
 * Uses Next.js router.prefetch() which triggers RSC prefetching.
 * Deferred to requestIdleCallback to avoid blocking the main thread.
 */
export function PrefetchLinks() {
  const router = useRouter()
  const pathname = usePathname()
  const prefetchedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const routes = PREFETCH_MAP[pathname]
    if (!routes) return

    const prefetch = () => {
      for (const route of routes) {
        if (!prefetchedRef.current.has(route)) {
          prefetchedRef.current.add(route)
          router.prefetch(route)
          /* From Home, Analytics' numbers too, kept for the page (lib/analytics/report-cache). */
          if (route === "/app/analytics") import("@/lib/analytics/report-cache").then((m) => m.warmAnalytics()).catch(() => {})
        }
      }
    }

    // Defer prefetching to avoid blocking page render
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(prefetch, { timeout: 3000 })
      return () => window.cancelIdleCallback(handle)
    }

    const timeout = setTimeout(prefetch, 1000)
    return () => clearTimeout(timeout)
  }, [pathname, router])

  return null
}
