"use client"

import { useEffect, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { prefetchPlan } from "@/lib/nav/prefetch-policy"

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
  /* Not /app: whoever is on /login is signed out, so reading /app ahead only
     ever read the redirect back to /login and a second copy of this page. */
  "/login": ["/signup"],
}

/**
 * Prefetches likely next routes based on the current path.
 * Uses Next.js router.prefetch() which triggers RSC prefetching.
 * Deferred to requestIdleCallback to avoid blocking the main thread.
 */
/** A creator's website: any host that is not Storelib's own, a preview or a developer's machine. */
export function onCreatorSite(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "")
  const main = (process.env.NEXT_PUBLIC_SITES_HOST || "storelib.com").toLowerCase()
  if (!h || h === main || h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app")) return false
  return true
}

export function PrefetchLinks() {
  const router = useRouter()
  const pathname = usePathname()
  const prefetchedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    /* The same plan as every other read ahead (lib/nav/prefetch-policy.ts):
       nothing on Save-Data or 2g, only the likeliest on a slow phone or 3g,
       and never the page already on screen. */
    /* These are Storelib's own pages. On a creator's website (username.storelib.com or their own domain) "/" is
       their home, and /explore, /signup and /login there are only 404s fetched in the background. */
    if (onCreatorSite(window.location.hostname)) return
    const routes = (PREFETCH_MAP[pathname] ?? []).filter((route) => route !== pathname).slice(0, prefetchPlan().idleBudget)
    if (routes.length === 0) return

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
