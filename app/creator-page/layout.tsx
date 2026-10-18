import type React from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { NativeAuthGate } from "@/components/native-auth-gate"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { cachedStoreCurrency } from "@/lib/store/selling-currency-server"
import { LiveStoreCurrency } from "@/lib/store/currency-context"

/**
 * One signed in person's own screens: never in a search index. robots.txt
 * keeps crawlers out too (lib/seo/indexing.ts PLATFORM_DISALLOW); this is
 * for the page somebody links to anyway.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }

async function isCapacitorWebView(): Promise<boolean> {
  const headersList = await headers()
  const ua = headersList.get("user-agent") || ""
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
}

export default async function CreatorPageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const isNative = await isCapacitorWebView()

  /* A blip is not a sign-out (lib/auth/current-user.ts): when Supabase did
     not answer, the gate below recovers the session in the browser, exactly
     as it does for the native app. */
  const current = await currentUserForRequest()
  const user = current.user

  if (!user) {
    if (isNative || current.state === "indeterminate") {
      return (
        <NativeAuthGate
          requireAuth
          loadingFallback={
            <div className="h-svh w-full bg-[#0f0f14] flex items-center justify-center">
              <div className="h-8 w-8 rounded-full border-[3px] border-white/10 border-t-white/60 animate-spin" />
            </div>
          }
        >
          <LiveStoreCurrency currency={null}>{children}</LiveStoreCurrency>
        </NativeAuthGate>
      )
    }
    redirect("/login")
  }

  // ── Access gates ───────────────────────────────────────────────────────
  const { data: gateCheck } = await supabase
    .from("profiles")
    .select("email_verified, is_creator, welcome_completed")
    .eq("id", user.id)
    .maybeSingle()

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

  const { data: creator } = await supabase.from("creators").select("id, slug").eq("user_id", user.id).single()

  if (!creator) {
    redirect("/onboarding")
  }

  /* The store's currency for the prices this editor lists (lib/store/currency-context), as /app has it. */
  const storeCurrency = await cachedStoreCurrency(creator.id).catch(() => null)

  // Full-screen layout without dashboard sidebar
  return (
    <NativeAuthGate>
      <LiveStoreCurrency currency={storeCurrency}>{children}</LiveStoreCurrency>
    </NativeAuthGate>
  )
}
