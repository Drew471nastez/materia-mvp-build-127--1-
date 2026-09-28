import type React from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { NativeAuthGate } from "@/components/native-auth-gate"
import { currentUserForRequest } from "@/lib/auth/request-scope"

/**
 * One signed in person's own screens: never in a search index. robots.txt
 * keeps crawlers out too (lib/seo/indexing.ts PLATFORM_DISALLOW); this is
 * for the page somebody links to anyway.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  /* A blip is not a sign-out (lib/auth/current-user.ts). When Supabase did
     not answer, the gate reads the session in the browser and recovers it;
     only a definite "nobody" goes to /login. */
  const current = await currentUserForRequest()
  const user = current.user

  if (!user) {
    if (current.state === "indeterminate") return <NativeAuthGate requireAuth>{children}</NativeAuthGate>
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

  return (
    <NativeAuthGate>
    <div className="min-h-screen bg-background overflow-x-hidden">
      <DashboardSidebar />
      <main className="min-h-screen pt-14 md:ml-64 md:pt-0">
        <div className="px-4 py-6 sm:px-6 md:px-8">{children}</div>
      </main>
    </div>
    </NativeAuthGate>
  )
}
