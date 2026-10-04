import type React from "react"
import type { Metadata } from "next"
import { Suspense } from "react"
import { headers } from "next/headers"
import { currentUserForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureUsername } from "@/lib/profile/ensure-username"
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
import { LibraryBgFix } from "@/components/library/library-bg-fix"
import { ACCOUNT_GUTTER_LEFT, ACCOUNT_GUTTER_RIGHT } from "@/lib/account/account-tabs"
import { communitiesEnabled } from "@/lib/communities/flag"
import { followCounts } from "@/lib/profile/follows"
import { ownCover } from "@/lib/profile/member-profile-data"

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
 *  THE PROFILE CENTER: YOUR OWN PAGE, AND EVERYTHING THAT IS YOURS
 * ===========================================================================
 * The owner: "/account becomes the profile center: it is MY profile page,
 * exactly the same page others see (same header, cover, avatar, tabs, look
 * as the creator page) plus owner extras: pill navigation for Activity,
 * Communities, Library (with sub pills ...), Edit profile, Settings."
 *
 *   /account                    Activity, the page everybody else sees first
 *   /account/communities        the communities you run and are in
 *   /account/library/...        the library, moved here whole (its own
 *                               layout, app/account/library/layout.tsx)
 *   /account/settings           Edit profile and Settings
 *
 * The platform header, a main column, the footer and the phone's tab bar,
 * as every buyer page draws them. Inside the column, the person's header
 * (components/profile/profile-hero.tsx, the one /@handle draws) and the
 * pills, from components/account/account-hub.tsx, which stands aside on
 * Settings and on one purchase, course or membership opened from the
 * library. In the layout, so the person stays put while the page under
 * them changes.
 *
 * SIGNED OUT, EACH PAGE SENDS TO SIGN IN WITH ITS OWN ADDRESS. A layout is
 * not told which of its pages is being opened, so it cannot say where to
 * come back to; every page asks lib/auth/page-user.ts with its own `next`
 * (/login?next=%2Faccount, /login?next=%2Faccount%2Fsettings), the library's
 * layout with the library's, and this layout draws nothing around them.
 * There is no loading.tsx above the pages, so that redirect is decided
 * before anything streams and is a real 307, not a hop after a skeleton.
 *
 * In the native app the session may only be in the app's storage, so the
 * gate there recovers it before deciding, as the library's does.
 * /account/continue, the route a creator's site sends Account to, is a
 * route handler and draws none of this.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [isNative, current, initialWishlistCount, onPlatformDomain, buyerHeaderLight, communities] = await Promise.all([
    isCapacitorWebView(),
    currentUserForRequest(),
    readWishlistCount(),
    isPlatformDomain(),
    isBuyerHeaderLight(),
    /* The Communities pill is drawn only while communities are on. */
    communitiesEnabled().catch(() => false),
  ])
  const user = current.user

  /* Signed out for certain: the page's own redirect (see above). */
  if (!user && !isNative && current.state !== "indeterminate") return <>{children}</>

  /* Cached for the request: the settings page reads the same row. The bio is one more read beside it, not after it. */
  const admin = createAdminClient()
  const [profile, bio, counts, cover] = user
    ? await Promise.all([profileForRequest(user.id), readBio(user.id), followCounts(admin, user.id), ownCover(admin, user.id)])
    : [null, null, { followers: 0, following: 0 }, null]
  /* EVERY ACCOUNT HAS A HANDLE: one that never had one gets it here, the first time it is needed (lib/profile/ensure-username). */
  const username = user ? profile?.username || (profile ? await ensureUsername(admin, user.id) : null) : null
  const identity: AccountIdentity | null = user
    ? {
        userId: user.id,
        name: profile?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || "",
        username: username || null,
        avatarUrl: profile?.avatar_url || null,
        memberSince: memberSince(user.created_at),
        bio,
        coverUrl: cover,
        followers: counts.followers,
        following: counts.following,
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
        {/* The profile's own width, the one /@handle draws at, with the room the library always had under the header. */}
        <div
          className="mx-auto w-full max-w-[960px] pt-4 pb-10 sm:pt-6"
          style={{ paddingLeft: ACCOUNT_GUTTER_LEFT, paddingRight: ACCOUNT_GUTTER_RIGHT }}
        >
          <AccountNavFade>
            {identity ? (
              <AccountHub identity={identity} communities={communities}>
                {children}
              </AccountHub>
            ) : (
              children
            )}
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
