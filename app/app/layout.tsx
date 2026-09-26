import type React from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { creatorForRequest, currentUserForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { AppSidebar } from "@/components/app/sidebar"
import { AppLayoutWrapper } from "@/components/app/app-layout-wrapper"
import { Toaster } from "@/components/ui/toaster"
import { NativeAuthGate } from "@/components/native-auth-gate"
import { OfflineGuard } from "@/components/app/offline-guard"
import { NativeBackHandler } from "@/components/app/native-back-handler"
import AppColdStart from "./cold-start"
import { profileAvatar } from "@/lib/account/avatar"
import { accountTimeZone, timeZoneScript } from "@/lib/account/time-zone"
import { TimeZoneSync } from "@/components/app/time-zone-sync"
import { factsFromRows, homeProgress, WEBSITE_LIVE_STATUS } from "@/lib/home/progress"
import { listBusinesses } from "@/lib/businesses/server"

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
  const ua = headersList.get("user-agent") || ""
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const isNative = await isCapacitorWebView()

  /**
   * A BLIP IS NOT A SIGN-OUT. See lib/auth/current-user.ts: `getUser()`
   * returning no user can mean "nobody is signed in" or "Supabase did not
   * answer", and this guard used to treat both as the first one.
   *
   * Asked through the per-request cache (lib/auth/request-scope.ts, which
   * calls readCurrentUser), so the page under this layout and its metadata
   * get this same answer instead of a second auth round trip each.
   */
  const current = await currentUserForRequest()
  const user = current.user

  if (!user) {
    /**
     * WE COULD NOT TELL, SO THE CLIENT DECIDES.
     *
     * The browser is holding the session and can read it without going
     * anywhere, so it is in a better position than this request was. The gate
     * below already does exactly that for Capacitor, where the session lives
     * in Preferences rather than cookies: read it, sync it to cookies, and
     * come back. If there really is no session it sends them to /login, which
     * is the same outcome as before but arrived at from evidence instead of
     * from a failed network call.
     */
    if (isNative || current.state === "indeterminate") {
      // In Capacitor, session lives in Preferences (not cookies).
      // A full-page reload won't have a server-side session yet —
      // the client will restore it asynchronously from Preferences.
      // Skip the redirect and let NativeAuthGate handle it.
      // The shell frame and the spinner (./cold-start) instead of a blank screen while
      // NativeAuthGate restores the Supabase session from Capacitor Preferences.
      return (
        <NativeAuthGate requireAuth loadingFallback={<AppColdStart />}>
          {children}
        </NativeAuthGate>
      )
    }
    redirect("/login")
  }

  // ── Access gates ───────────────────────────────────────────────────────
  /*
    ONE TRIP FOR EVERYTHING THAT NEEDS ONLY THE USER. The gates, the creator
    row, the OnePage and the store's header used to be asked for one after
    another, five round trips before the shell could draw. They depend on
    nothing but `user.id`, so they go together; the redirects below are still
    decided in the same order, from the same answers. The profile and the
    creator row come through the per-request cache (lib/auth/request-scope.ts),
    so a page that reads them too with its own client is not a second trip.
    All of it on the caller's own client: row-level security as before.
  */
  const [gateCheck, creator, { data: onepage }, businesses] = await Promise.all([
    profileForRequest(user.id),
    creatorForRequest(user.id),
    supabase
      .from("onepages")
      .select("id, avatar_url, published, draft_blocks, bio")
      .eq("owner_id", user.id)
      .maybeSingle(),
    /* The account menu's businesses (lib/businesses/server). In parallel with the rest, so the
       shell draws no later; an error reads as this business alone, as it always was. */
    listBusinesses(user.id).catch(() => []),
  ])
  const profile = gateCheck

  // Gate 1: email must be verified
  if (!gateCheck?.email_verified) {
    redirect(`/signup/verify?userId=${user.id}&email=${encodeURIComponent(user.email || "")}`)
  }

  // Gate 2: role must be selected (creator OR buyer with welcome_completed)
  const roleSelected = gateCheck.is_creator === true || gateCheck.welcome_completed === true
  if (!roleSelected) {
    redirect("/signup/success")
  }

  // No creator record or onboarding not completed - redirect to welcome selection
  if (!creator || creator.onboarding_completed !== true) {
    redirect("/signup/success")
  }

  /*
    WHAT THE SETUP RING COUNTS, IN ONE TRIP. The sidebar's "Setup" ring and
    the phone menu's Store setup card say how far Getting started on Home
    has got, so they count the same seven steps by the same rules
    (lib/home/progress): a product, a website published right now, a
    verified domain and one sale, all by the creator's id, on the caller's
    own client. The sale is found through its product's creator, as Home
    reads orders, so it no longer waits for the product ids to come back.
  */
  const [{ data: products }, { data: domains }, { data: liveSite }, { data: aSale }] = await Promise.all([
    supabase.from("products").select("id").eq("creator_id", creator.id),
    supabase.from("custom_domains").select("*").eq("creator_id", creator.id),
    supabase.from("store_theme_installs").select("id").eq("creator_id", creator.id).eq("status", WEBSITE_LIVE_STATUS).limit(1).maybeSingle(),
    supabase
      .from("orders")
      .select("id, products!inner(creator_id)")
      .eq("products.creator_id", creator.id)
      .not("status", "in", "(failed,pending,disputed)")
      .limit(1),
  ])

  /*
    THE PROFILE'S PHOTO, OR THE INITIALS (lib/account/avatar). This used to
    fall back to the creator page header's photo, the OnePage's, and the
    picture Google sent at sign in, so removing the photo in Settings left
    the Google one in the header. The Google picture is copied into the
    profile once, at sign up (app/auth/callback), and nowhere else.
  */
  const avatarUrl = profileAvatar(profile?.avatar_url)

  /* The account's time zone (lib/account/time-zone), written where every
     /app page reads it before any of them hydrates. */
  const accountZone = accountTimeZone(null, user.user_metadata)

  const displayName = profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || creator.slug

  const setup = homeProgress({
    ...factsFromRows({
      creator,
      products: products ?? [],
      domains: domains ?? [],
      websiteLive: !!liveSite,
      userMetadata: user.user_metadata ?? null,
    }),
    sales: (aSale?.length ?? 0) > 0 ? 1 : 0,
  })
  const completedSteps = setup.completed
  const totalSteps = setup.total

  return (
    <NativeAuthGate loadingFallback={<AppColdStart />}>
    <OfflineGuard>
    <NativeBackHandler />
    {accountZone ? <script dangerouslySetInnerHTML={{ __html: timeZoneScript(accountZone) }} /> : null}
    <TimeZoneSync accountZone={accountZone} />
    <AppLayoutWrapper>
      <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar">
        <AppSidebar
          creatorSlug={creator.slug ?? undefined}
          username={profile?.username || creator.slug || undefined}
          storePublished={creator.store_published ?? undefined}
          avatarUrl={avatarUrl ?? undefined}
          displayName={displayName}
          stripeConnected={!!creator.stripe_account_id}
          stripeStatus={creator.stripe_onboarding_status || "not_connected"}
          onePagePublished={!!onepage}
          setupProgress={{ completed: completedSteps, total: totalSteps }}
          businesses={businesses}
        />
        {/* md:pt accounts for the desktop header height (58 px) plus the
            safe-area-inset-top padding the header adds in Capacitor.
            In a browser env() = 0, so md:pt stays exactly 58 px. */}
        {/* bg-[#f8f9fa] matches dashboard bg so any momentary overscroll gap never shows white */}
        <main className="h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[240px] bg-[#f8f9fa] md:bg-white rounded-t-[20px] md:rounded-none overflow-hidden app-main-content">
          {/* pb ensures content at scroll-bottom is never hidden under the iOS home indicator
              or Android gesture-nav bar. env() = 0 in browsers so this is a no-op there. */}
          {/* pb-[env(safe-area-inset-bottom)] removed — globals.css already applies it
              via html.capacitor .app-content-scroll to avoid double padding on iOS */}
          <div className="h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll">
            {children}
          </div>
        </main>
        <Toaster />
      </div>
    </AppLayoutWrapper>
    </OfflineGuard>
    </NativeAuthGate>
  )
}
