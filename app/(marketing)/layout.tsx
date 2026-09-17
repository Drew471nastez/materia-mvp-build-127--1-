import type React from "react"
import { Suspense } from "react"
import { cookies, headers } from "next/headers"
import { extractUsernameFromHost, isCustomDomain } from "@/lib/url-helpers"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { LanguageProvider } from "@/lib/i18n/context"
import { RouteLoadingBar } from "@/components/navigation/route-loading-bar"

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
    /*
      ═══════════════════════════════════════════════════════════════════════
       THE LANGUAGE CONTEXT BELONGS TO THIS TREE TOO
      ═══════════════════════════════════════════════════════════════════════
      It was mounted only in components/app/app-layout-wrapper, so it existed
      under /app and nowhere else. Explore then started calling useLanguage —
      it puts `?lang=` on the URLs it hands out and reads one back, so a link
      opens in the language it was shared from — and threw on every render:

          Error: useLanguage must be used within a LanguageProvider

      which the route's error boundary caught, so storelib.com/explore served
      "Something went wrong while loading the explore page" to everyone. Found
      by driving the deployed page rather than by a build, because the build is
      green either way: this is a runtime context, and nothing type-checks that
      a hook's provider is above it.

      The provider is safe to put here. It reads localStorage and
      navigator.language and holds a string; there is no fetch in it, nothing
      authenticated, and no server work.
    */
    <LanguageProvider>
    <div className="flex min-h-svh flex-col marketing-flex-wrapper">
      {/* Preconnect to image CDN — saves ~200-400ms on first image request */}
      <link rel="preconnect" href="https://skgtqglupjcnfhfscink.supabase.co" />
      <link rel="dns-prefetch" href="https://skgtqglupjcnfhfscink.supabase.co" />
      <link rel="preconnect" href="https://cdn.sanity.io" />
      <BodyScrollRestorer />
      {/* Nothing until a navigation has been slow for 220ms; see the
          component for why it cannot block and cannot get stuck. */}
      <RouteLoadingBar />
      <ConditionalHeader initialWishlistCount={initialWishlistCount} onPlatformDomain={onPlatformDomain} />

      {/*
        ═══════════════════════════════════════════════════════════════════
         NO PAINT CONTAINMENT AROUND ELEVEN THOUSAND PIXELS
        ═══════════════════════════════════════════════════════════════════
        This carried `overflow-x: clip`, which is redundant: <html> already
        sets `overflow-x: hidden`, so anything too wide is clipped at the
        window and cannot produce a sideways scrollbar. What the extra rule
        did add was a containment box wrapped around the entire page, and on
        /explore that page is about eleven thousand pixels tall on a phone.

        The reported symptom is footer links, a category pill and product
        cards all painted into the same band of screen, which is not a
        layout overlap — every measurement of this page says main's bottom
        edge and the footer's top edge are the same number to the pixel.
        Three parts of a very tall document drawn on top of each other is
        iOS reusing the wrong tiles, and a containment box that size is one
        of the things that provokes it.

        `overflow-x: clip` also leaves VERTICAL overflow visible, so it was
        the one mechanism by which anything inside main could paint over the
        footer at all. Both reasons point the same way.
      */}
      <main className="flex-1">{children}</main>

      {/*
        And the footer gets its own stacking context, so it is composited as
        itself rather than as part of whatever is above it. It also arrives
        after hydration — see conditional-footer — which means it is inserted
        into a document the browser has already painted.
      */}
      <div className="relative isolate">
        <Suspense fallback={null}>
          <ConditionalFooter />
        </Suspense>
      </div>
    </div>
    </LanguageProvider>
  )
}
