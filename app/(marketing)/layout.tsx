import type React from "react"
import { Suspense } from "react"
import { cookies } from "next/headers"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"

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

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initialWishlistCount = await readWishlistCount()
  return (
    <div className="flex min-h-svh flex-col marketing-flex-wrapper">
      {/* Preconnect to image CDN — saves ~200-400ms on first image request */}
      <link rel="preconnect" href="https://skgtqglupjcnfhfscink.supabase.co" />
      <link rel="dns-prefetch" href="https://skgtqglupjcnfhfscink.supabase.co" />
      <link rel="preconnect" href="https://cdn.sanity.io" />
      <BodyScrollRestorer />
      <ConditionalHeader initialWishlistCount={initialWishlistCount} />

      <main className="flex-1 [overflow-x:clip]">{children}</main>

      <Suspense fallback={null}>
        <ConditionalFooter />
      </Suspense>
    </div>
  )
}
