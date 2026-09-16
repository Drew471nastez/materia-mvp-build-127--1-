import type React from "react"
import { Suspense } from "react"
import { cookies, headers } from "next/headers"
import { extractUsernameFromHost, isCustomDomain } from "@/lib/url-helpers"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { NavigationProgress } from "@/components/navigation/navigation-progress"

/**
 * Read on the server so the wishlist badge is in the FIRST PAINTED HTML.
 *
 * The count is mirrored into a cookie by the header itself (see
 * applyWishlistCount). Seeding React state from localStorage was not enough:
 * the server still rendered the badge as absent, so the page painted without it
 * and it appeared at hydration — the bubble arriving late. A cookie is the one
 * piece of per-visitor state the server can actually see.
 *
 * Never trusted for anything but drawing a number: it is written by the client,
 * so it is clamped and the real list is still fetched and still wins.
 */
async function readWishlistCount(): Promise<number> {
  try {
    const store = await cookies()
    const raw = store.get("storelib_wishlist_count")?.value
    const n = Number(raw)
    return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : 0
  } catch {
    // cookies() throws outside a request scope (static render) — no badge, which
    // is the same thing this rendered before.
    return 0
  }
}

/**
 * Is this request on the platform's own domain, rather than a seller subdomain
 * or a custom domain?
 *
 * Only the server can answer this at render time — the client has to wait for
 * an effect to read window.location — and it is what lets the homepage draw its
 * header in the first paint instead of after hydration.
 */
async function isPlatformDomain(): Promise<boolean> {
  try {
    const host = (await headers()).get("host") || ""
    if (!host) return false
    return extractUsernameFromHost(host) === null && !isCustomDomain(host)
  } catch {
    // Outside a request scope: fall back to the old behaviour, where the client
    // decides after mount.
    return false
  }
}

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initialWishlistCount = await readWishlistCount()
  const onPlatformDomain = await isPlatformDomain()
  return (
    <div className="flex min-h-svh flex-col marketing-flex-wrapper">
      {/* Preconnect to image CDN — saves ~200-400ms on first image request */}
      <link rel="preconnect" href="https://skgtqglupjcnfhfscink.supabase.co" />
      <link rel="dns-prefetch" href="https://skgtqglupjcnfhfscink.supabase.co" />
      <link rel="preconnect" href="https://cdn.sanity.io" />
      <BodyScrollRestorer />
      {/*
        Mounted in the layout because it has to outlive the navigation it is
        reporting on: it starts on the press, on the page being left, and
        finishes on the page arrived at.
      */}
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <ConditionalHeader initialWishlistCount={initialWishlistCount} onPlatformDomain={onPlatformDomain} />

      <main className="flex-1 [overflow-x:clip]">{children}</main>

      <Suspense fallback={null}>
        <ConditionalFooter />
      </Suspense>
    </div>
  )
}
