import type React from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { cookies, headers } from "next/headers"
import { currentUserForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { isPlatformDomain, readWishlistCount } from "@/lib/platform/header-props"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { RouteLoadingBar } from "@/components/navigation/route-loading-bar"
import { LibraryTabs } from "@/components/library/library-tabs"
import { LibraryPanel } from "@/components/library/library-panel"
import { OpenInApp } from "@/components/library/open-in-app"
import { PurchaseSyncProvider } from "@/components/checkout/purchase-sync-provider"
import { NativeAuthGate } from "@/components/native-auth-gate"
import LibraryLoading from "./loading"
import { LibraryBgFix } from "./library-bg-fix"
import { HtmlClass } from "@/components/platform/html-class"
import { APP_BANNER_COOKIE, bannerPhone, isAppWebView, type Phone } from "@/lib/platform/open-in-app"

/**
 * One signed in person's own screens: never in a search index. robots.txt
 * keeps crawlers out too (lib/seo/indexing.ts PLATFORM_DISALLOW); this is
 * for the page somebody links to anyway.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Detect Capacitor WebView from the User-Agent header.
 * In Capacitor, auth is stored in Preferences (not cookies), so
 * server-side session checks may fail on full-page reloads.
 * The client-side NativeAuthGate restores the session asynchronously.
 */
async function isCapacitorWebView(): Promise<boolean> {
  const headersList = await headers()
  return isAppWebView(headersList.get("user-agent") || "")
}

/** The phone the app banner is for, from the same request: none in the app, on a computer, or once closed. */
async function appBannerPhone(): Promise<Phone | null> {
  const [headersList, jar] = await Promise.all([headers(), cookies()])
  return bannerPhone(headersList.get("user-agent") || "", jar.get(APP_BANNER_COOKIE)?.value)
}

export default async function LibraryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /**
   * Reading a header and asking Supabase who this is are unrelated, and the
   * second can take up to three seconds. They were awaited one after the
   * other; now the header read happens while the auth request is in flight.
   */
  /* The header's two server-side props, asked for alongside everything else
     rather than in front of it. */
  const [isNative, current, initialWishlistCount, onPlatformDomain, bannerFor] = await Promise.all([
    isCapacitorWebView(),
    /** A blip is not a sign-out. See lib/auth/current-user.ts. */
    currentUserForRequest(),
    readWishlistCount(),
    isPlatformDomain(),
    appBannerPhone(),
  ])
  const user = current.user

  if (!user) {
    /** Could not tell, so the client decides with the session it is holding. */
    if (isNative || current.state === "indeterminate") {
      // In Capacitor, session lives in Preferences (not cookies).
      // A full-page reload won't have a server-side session yet;
      // the client will restore it asynchronously from Preferences.
      // Skip the redirect and let NativeAuthGate handle it.
      return (
        <NativeAuthGate requireAuth loadingFallback={<LibraryLoading />}>
          {children}
        </NativeAuthGate>
      )
    }
    redirect("/login")
  }

  // ── Access gates ───────────────────────────────────────────────────────
  /**
   * The page inside this layout needs the display name and avatar off the
   * same row, so both come back in one select. See lib/auth/request-scope.ts.
   */
  const gateCheck = await profileForRequest(user.id)

  // Gate 1: email must be verified
  if (!gateCheck?.email_verified) {
    redirect(`/signup/verify?userId=${user.id}&email=${encodeURIComponent(user.email || "")}`)
  }

  /*
    No "role must be selected" gate any more. Every account is a buyer from
    the moment it exists; there is no creator or buyer question to have
    answered (lib/account/seller-access.ts). A new signup used to be bounced
    from here to that question.
  */

  return (
    /*
      ═══════════════════════════════════════════════════════════════════════
       THE SAME SHELL AS THE REST OF THE PLATFORM
      ═══════════════════════════════════════════════════════════════════════
      This was a 256px sidebar with the page beside it, and on a phone that
      sidebar was ALSO the header: a fixed 3.5rem bar with its own logo, and
      the content pushed down to clear it. So /library had no platform header,
      no footer, its own scroll container and its own navigation, while every
      other page on the site had the opposite of all four.

      It is the marketing shell now, which is what Explore and the product
      pages use: header, a main column, footer. The sidebar's links were
      almost all in the header already: Discover, Dashboard, Settings, Log
      out, the wishlist, and the four that were not are a row of pills above
      the content. See components/library/library-tabs.

      The h-svh scroll container went with it. It existed to give
      overscroll-behavior something to apply to on iOS; the page scrolls with
      the document now, like every other page, and components/platform/
      capacitor-bounce-guard is what handles the bounce.
    */
    <NativeAuthGate>
    <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="library">
      <HtmlClass name="with-page-library" />
      {/* Nothing until a navigation (a press, or the browser's own back) has been slow for 220ms.
          The marketing layout has carried this for every other buyer page; this one had none, so a
          slow way back to the library said nothing at all. */}
      <RouteLoadingBar />
      <LibraryBgFix />
      <PurchaseSyncProvider />
      <ConditionalHeader initialWishlistCount={initialWishlistCount} onPlatformDomain={onPlatformDomain} />

      <main className="flex-1">
        <div
          className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8"
          style={{
            paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
          }}
        >
          {/* On a phone's browser, the app's banner at the top; nowhere else. Known here, so its room is in the first paint. */}
          <OpenInApp phone={bannerFor} />
          {/* The heading and pills, and the screen under them, which cross fades from one to the next (library-panel.tsx). */}
          <LibraryPanel head={<LibraryTabs />}>{children}</LibraryPanel>
        </div>
      </main>

      {/* Its own stacking context, as on the marketing layout: the footer
          arrives after hydration, into a document already painted. */}
      <div className="relative isolate">
        <Suspense fallback={null}>
          <ConditionalFooter />
        </Suspense>
      </div>

      {/* The phone's Home, Search, Library and Profile bar, on the pages of
          this layout that are Storelib's own buyer pages. It decides which
          those are, and brings the room it takes at the end of the page. */}
      <BuyerTabBar />
    </div>
    </NativeAuthGate>
  )
}
