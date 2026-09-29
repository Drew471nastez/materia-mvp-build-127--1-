import type React from "react"
import type { Metadata } from "next"
import { Suspense } from "react"
import { headers } from "next/headers"
import { currentUserForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { createClient } from "@/lib/supabase/server"
import { isBuyerHeaderLight } from "@/lib/platform/buyer-header-theme"
import { isPlatformDomain, readWishlistCount } from "@/lib/platform/header-props"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { RouteLoadingBar } from "@/components/navigation/route-loading-bar"
import { NativeAuthGate } from "@/components/native-auth-gate"
import { AccountHub, type AccountIdentity } from "@/components/account/account-hub"
import { AccountNavFade } from "@/components/account/account-nav-fade"
import { AccountSkeleton } from "@/components/account/account-skeleton"
import { LibraryBgFix } from "@/app/library/library-bg-fix"
import { ACCOUNT_GUTTER_LEFT, ACCOUNT_GUTTER_RIGHT } from "@/lib/account/account-tabs"

/** One signed in person's own pages: never in a search index. */
export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } }

/** The native shell keeps its session in Preferences, not cookies (see app/library/layout.tsx). */
async function isCapacitorWebView(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") || ""
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
}

/**
 * THE LINE THEY WROTE ABOUT THEMSELVES (profiles.bio). Its own read, beside
 * the profile's rather than after it, because the shell's select is shared
 * with every other page and does not carry it (lib/auth/request-scope.ts).
 * Nothing where the column has not been added yet
 * (supabase/sql/RUN_PROFILE_COVER_BIO.sql): the profile simply has no bio.
 */
async function readBio(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from("profiles").select("bio").eq("id", userId).maybeSingle()
    return ((data as { bio?: string | null } | null)?.bio || "").trim() || null
  } catch {
    return null
  }
}

/** "March 2025", in UTC, so the server's words and the browser's are the same words. */
function memberSince(createdAt: string | undefined): string {
  const d = new Date(createdAt || "")
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
}

/**
 * ===========================================================================
 *  THE BUYER'S PROFILE, IN THE SAME SHELL AS THE LIBRARY
 * ===========================================================================
 * /account and its pages (lib/account/account-tabs.ts): the signed in
 * person's profile, Overview and Settings. Not a creator page; every avatar
 * outside /app and the Profile tab of the phone's bar open it.
 *
 * The platform header, a main column, the footer and the phone's tab bar,
 * as /library draws them, so moving between Library and Profile on the tab
 * bar is one page changing and not two sites. THE HEADER IS HERE AT EVERY
 * WIDTH now: "The profile page reached from Explore needs to have the
 * header on it." The light bar the profile used to draw for itself on a
 * phone is gone with the rule that hid the real one, so there is one bar
 * and not two, and the column starts the library's 24px under it.
 *
 * Inside the column, the person (photo, name, @username, the bio, when
 * they joined) centred, with Edit profile under them; Settings is its own
 * screen and draws none of that (components/account/account-hub.tsx).
 *
 * SIGNED OUT, EACH PAGE SENDS TO SIGN IN WITH ITS OWN ADDRESS. A layout is
 * not told which of its pages is being opened, so it cannot say where to
 * come back to; every page asks lib/auth/page-user.ts with its own `next`
 * (/login?next=%2Faccount, /login?next=%2Faccount%2Fsettings) and the
 * layout draws nothing around it. There is no loading.tsx above the pages,
 * so that redirect is decided before anything streams and is a real 307,
 * not a hop after a skeleton; the slow part of the overview streams inside
 * the page instead (app/account/page.tsx).
 *
 * In the native app the session may only be in the app's storage, so the
 * gate there recovers it before deciding, as the library's does.
 * /account/continue, the route a creator's site sends Account to, is a
 * route handler and draws none of this.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [isNative, current, initialWishlistCount, onPlatformDomain, buyerHeaderLight] = await Promise.all([
    isCapacitorWebView(),
    currentUserForRequest(),
    readWishlistCount(),
    isPlatformDomain(),
    isBuyerHeaderLight(),
  ])
  const user = current.user

  /* Signed out for certain: the page's own redirect (see above). */
  if (!user && !isNative && current.state !== "indeterminate") return <>{children}</>

  /* Cached for the request: the settings page reads the same row. The bio is one more read beside it, not after it. */
  const [profile, bio] = user ? await Promise.all([profileForRequest(user.id), readBio(user.id)]) : [null, null]
  const identity: AccountIdentity | null = user
    ? {
        userId: user.id,
        name: profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || "",
        username: profile?.username || null,
        avatarUrl: profile?.avatar_url || null,
        memberSince: memberSince(user.created_at),
        bio,
      }
    : null

  const shell = (
    <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="account">
      {/* The same line the library and Explore carry, so leaving Profile for
          another tab says so when the next page is slow. */}
      <RouteLoadingBar />
      <LibraryBgFix />
      <ConditionalHeader initialWishlistCount={initialWishlistCount} onPlatformDomain={onPlatformDomain} buyerHeaderLight={buyerHeaderLight} />
      <main className="flex-1 overflow-x-hidden supports-[scrollbar-gutter:stable]:scrollbar-gutter-stable">
        {/* The library's own room under the header (app/library/layout.tsx py-6), so the two screens start at the same height. */}
        <div
          className="mx-auto w-full max-w-[720px] pt-6 pb-10 lg:max-w-[1080px]"
          style={{ paddingLeft: ACCOUNT_GUTTER_LEFT, paddingRight: ACCOUNT_GUTTER_RIGHT }}
        >
          <AccountNavFade>
            {identity ? <AccountHub identity={identity}>{children}</AccountHub> : children}
          </AccountNavFade>
        </div>
      </main>
      <div className="relative isolate">
        <Suspense fallback={null}>
          <ConditionalFooter />
        </Suspense>
      </div>
      <BuyerTabBar />
    </div>
  )

  if (!user) {
    return (
      <NativeAuthGate requireAuth loadingFallback={<AccountSkeleton />}>
        {shell}
      </NativeAuthGate>
    )
  }

  return <NativeAuthGate>{shell}</NativeAuthGate>
}
