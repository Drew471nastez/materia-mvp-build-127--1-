import type React from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { cookies, headers } from "next/headers"
import { currentUserForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { LibraryTabs } from "@/components/library/library-tabs"
import { LibraryPanel } from "@/components/library/library-panel"
import { OpenInApp } from "@/components/library/open-in-app"
import { PurchaseSyncProvider } from "@/components/checkout/purchase-sync-provider"
import { NativeAuthGate } from "@/components/native-auth-gate"
import { HtmlClass } from "@/components/platform/html-class"
import { accountLoginPath } from "@/lib/account/account-tabs"
import { LIBRARY_HOME } from "@/lib/library/paths"
import { APP_BANNER_COOKIE, bannerPhone, isAppWebView, type Phone } from "@/lib/platform/open-in-app"
import LibraryLoading from "./loading"

/**
 * One signed in person's own screens: never in a search index. robots.txt
 * keeps crawlers out too (lib/seo/indexing.ts PLATFORM_DISALLOW); this is
 * for the page somebody links to anyway.
 */
export const metadata: Metadata = { title: "Library", robots: { index: false, follow: false } }

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

/**
 * ===========================================================================
 *  THE LIBRARY, INSIDE THE PROFILE
 * ===========================================================================
 * The owner: "/account becomes the profile center ... The library lives
 * inside /account as subpages". So the shell the library used to draw for
 * itself (the platform header, the footer, the phone's tab bar, the light
 * page colour) is the profile's now (app/account/layout.tsx). But it is a
 * page of its own, not a panel under the person: "Library opens as its own
 * page ... WITHOUT the profile hero above them (like /account/settings
 * does), with their own page title and the sub pills". So the profile's
 * hub stands aside here (lib/profile/owner-pills.ts showsProfileHeader),
 * and the head of the stage is the library's title over its sub pills
 * (components/library/library-tabs.tsx). What is left here is what only
 * the library has: its gates, the purchase sync, the stage that cross fades
 * one tab into the next (components/library/library-panel.tsx), and the
 * app's banner under it. Every screen inside is the same component
 * it always was; only the addresses moved (lib/library/paths.ts), and every
 * old /library address answers with the new one (app/library/[[...path]]).
 */
export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  /* A blip is not a sign-out (lib/auth/current-user.ts); the header read happens while the auth request is in flight. */
  const [isNative, current, bannerFor] = await Promise.all([isCapacitorWebView(), currentUserForRequest(), appBannerPhone()])
  const user = current.user

  if (!user) {
    /** Could not tell, so the client decides with the session it is holding. */
    if (isNative || current.state === "indeterminate") {
      return (
        <NativeAuthGate requireAuth loadingFallback={<LibraryLoading />}>
          {children}
        </NativeAuthGate>
      )
    }
    redirect(accountLoginPath(LIBRARY_HOME))
  }

  /* The email must be verified before anything bought is handed over. The row is the one the profile above already read. */
  const gateCheck = await profileForRequest(user.id)
  if (!gateCheck?.email_verified) {
    redirect(`/signup/verify?userId=${user.id}&email=${encodeURIComponent(user.email || "")}`)
  }

  return (
    <div data-page="library">
      <HtmlClass name="with-page-library" />
      <PurchaseSyncProvider />
      {/* The sub pills and the screen under them, which cross fades from one to the next (library-panel.tsx). */}
      <LibraryPanel head={<LibraryTabs />}>{children}</LibraryPanel>
      {/*
        THE APP'S BANNER SITS UNDER THE LIBRARY, NOT OVER IT: "do not use
        the banner above the library, use it under, at the page". Outside
        the panel on purpose, so it holds still while the screens cross fade
        over each other, and the phone it is for is known on the server, so
        nothing shifts when the page hydrates.
      */}
      <OpenInApp phone={bannerFor} />
    </div>
  )
}
