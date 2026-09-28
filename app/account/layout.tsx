import type React from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { headers } from "next/headers"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { isPlatformDomain, readWishlistCount } from "@/lib/platform/header-props"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { NativeAuthGate } from "@/components/native-auth-gate"
import { LibraryBgFix } from "@/app/library/library-bg-fix"
import AccountLoading from "./loading"

/** One signed in person's own page: never in a search index. */
export const metadata: Metadata = { title: "Account", robots: { index: false, follow: false } }

/** The native shell keeps its session in Preferences, not cookies (see app/library/layout.tsx). */
async function isCapacitorWebView(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") || ""
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
}

/**
 * ===========================================================================
 *  THE BUYER'S ACCOUNT, IN THE SAME SHELL AS THE LIBRARY
 * ===========================================================================
 * /account is the signed in person's own page: their photo and name, how
 * they sign in, their preferences, the way into what they bought and saved,
 * and the way out. Not a creator page; every avatar outside /app links here.
 *
 * The platform header, a main column, the footer and the phone's tab bar,
 * exactly as /library draws them, so moving between Library and Profile on
 * the tab bar is one page changing and not two sites. Signed out, it is sign
 * in first and then here (`next`); in the native app the session may only be
 * in the app's storage, so the gate there recovers it before deciding, as
 * the library's does. /account/continue, the route a creator's site sends
 * Account to, is a route handler and draws none of this.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [isNative, current, initialWishlistCount, onPlatformDomain] = await Promise.all([
    isCapacitorWebView(),
    currentUserForRequest(),
    readWishlistCount(),
    isPlatformDomain(),
  ])

  const shell = (
    <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="account">
      <LibraryBgFix />
      <ConditionalHeader initialWishlistCount={initialWishlistCount} onPlatformDomain={onPlatformDomain} />
      <main className="flex-1">{children}</main>
      <div className="relative isolate">
        <Suspense fallback={null}>
          <ConditionalFooter />
        </Suspense>
      </div>
      <BuyerTabBar />
    </div>
  )

  if (!current.user) {
    if (isNative || current.state === "indeterminate") {
      return (
        <NativeAuthGate requireAuth loadingFallback={<AccountLoading />}>
          {shell}
        </NativeAuthGate>
      )
    }
    redirect("/login?next=%2Faccount")
  }

  return <NativeAuthGate>{shell}</NativeAuthGate>
}
