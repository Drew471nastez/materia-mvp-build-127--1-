import { Metadata } from "next"
import { Suspense } from "react"
import { redirect } from "next/navigation"

import { WishlistContent } from "@/components/wishlist/wishlist-content"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { savedShelfHref } from "@/lib/marketplace/saved-items"

export const metadata: Metadata = {
  title: "My Wishlist",
  description: "Your saved products",
}

export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  /wishlist — WHICH IS NOW A DOOR INTO THE SALVATE TAB
 * ===========================================================================
 *
 * The saved list lives on your profile, beside your listings and your reviews,
 * at /member/<handle>/saved. Every bookmark in the chrome builds that URL
 * directly — but "every bookmark" is a promise the CLIENT cannot keep on its
 * own, and that is why this redirect exists rather than four more edits.
 *
 * A link in a header can only point at the handle if the component drawing it
 * knows the handle at the moment of the click. On a cold load the auth snapshot
 * has not been read, on a fresh sign-in it has not been written, and there are
 * half a dozen other doors — the account drawer, the settings hub, the library,
 * the dashboard sidebar, an old bookmark somebody saved last month, a link in an
 * email — that were written against this address years before the tab existed
 * and are not going to be found by grep. Every one of them arrives here.
 *
 * So the decision is made on the SERVER, where the session is a fact rather
 * than a cached guess: signed in with a handle, this is the tab; anything else,
 * this is the page it always was.
 *
 * ---------------------------------------------------------------------------
 * AND THE PAGE STAYS, BECAUSE A GUEST HAS A WISHLIST
 * ---------------------------------------------------------------------------
 * Saving does not require an account — the list hangs off the `materia_guest_id`
 * cookie (see app/api/wishlist/route.ts), which is deliberate: asking somebody
 * to sign up before they can keep a jumper they liked is the surest way to lose
 * both. A guest has no profile to put a tab on, so they get this. So does a
 * signed-in account whose profile row has no handle yet, which is the state of
 * every account for the few seconds between signing up and the profile being
 * written.
 *
 * `try` around the whole of it: a wishlist that fails to render because an auth
 * call timed out is a worse outcome than one shown at its own address.
 */
async function savedTabHref(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    // The admin client, matching /member/[username]: a handle is public data and
    // an owner-scoped RLS policy would only make the two disagree about whether
    // this account has one.
    const { data } = await createAdminClient()
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle()

    const handle = (data?.username ?? "").trim()
    if (!handle) return null
    const href = savedShelfHref(handle)
    return href === "/wishlist" ? null : href
  } catch {
    return null
  }
}

function WishlistSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-neutral-100 overflow-hidden">
          <div className="aspect-[3/4] bg-neutral-100 animate-pulse" />
          <div className="p-3.5 space-y-2">
            <div className="h-4 w-3/4 bg-neutral-100 rounded animate-pulse" />
            <div className="h-3 w-1/3 bg-neutral-100 rounded animate-pulse" />
            <div className="h-4 w-1/4 bg-neutral-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function WishlistPage() {
  const tab = await savedTabHref()
  if (tab) redirect(tab)

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl lg:max-w-[1270px] px-4 sm:px-6 lg:px-8 pt-4 pb-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">Wishlist</h1>
          <p className="text-sm text-neutral-500 mt-1">Products you&apos;ve saved for later</p>
        </div>
        <Suspense fallback={<WishlistSkeleton />}>
          <WishlistContent showDiscoverMoreCta />
        </Suspense>
      </div>
    </div>
  )
}
