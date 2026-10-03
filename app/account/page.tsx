import { Suspense } from "react"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { pageUser } from "@/lib/auth/page-user"
import { sellerAccessForRequest } from "@/lib/auth/request-scope"
import { loadLibrary } from "@/lib/library/load-library"
import { loadMyCourses } from "@/lib/courses/load"
import { loadLibraryMemberships } from "@/lib/memberships/library"
import { viewerOf } from "@/lib/memberships/server"
import { accountLoginPath } from "@/lib/account/account-tabs"
import { accountOverview } from "@/lib/account/overview"
import { communitiesEnabled } from "@/lib/communities/flag"
import { activeCommunityCount } from "@/lib/communities/server/public"
import { AccountOverview } from "@/components/account/account-overview"
import { OverviewSkeleton } from "@/components/account/account-skeleton"

export const dynamic = "force-dynamic"

/** A read that fails leaves its fact out; it never takes the page down with it. */
async function orNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch {
    return null
  }
}

/**
 * The overview's facts, read side by side with the library's own loaders,
 * so every number is the one its page shows: what they own (the library),
 * their courses and how far through, their memberships, the wishlist (only
 * what is still on sale, as the wishlist lists it), and seller access
 * (lib/account/seller-access.ts, from the rows the request already read).
 */
async function overviewBody(user: User) {
  const supabase = await createClient()
  const [library, courses, memberships, saved, access, communities] = await Promise.all([
    orNull(() => loadLibrary(user.id)),
    orNull(() => loadMyCourses(createAdminClient(), user.id)),
    orNull(async () => {
      const viewer = viewerOf(user)
      if (!viewer) return null
      const list = await loadLibraryMemberships(createAdminClient(), viewer)
      return list.available ? { current: list.current.length, ended: list.ended.length } : null
    }),
    orNull(async () =>
      supabase
        .from("wishlist_items")
        .select("id, products!inner(status)", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("products.status", "published"),
    ),
    /* SELLER ACCESS FOR THIS PERSON, FROM THIS REQUEST. `user` is the
       signed in person as the auth server confirmed them for this request
       (pageUser, lib/auth/request-scope.ts), and the answer is their own
       creators row, `user_id = user.id` on their own client, with their
       profile (lib/account/seller-access.ts). Not any creator row and not
       a remembered one: nothing here reads the browser's auth snapshot. */
    orNull(() => sellerAccessForRequest(user.id)),
    /* How many communities they are an active member of; nothing while communities are off. */
    orNull(async () => ((await communitiesEnabled()) ? activeCommunityCount(user.id) : null)),
  ])

  const data = accountOverview({
    items: library?.items ?? null,
    courses,
    memberships,
    wishlist: saved?.count ?? 0,
    seller: access?.state ?? "none",
    communities,
  })
  /* Stamped, so a copy the router kept is asked for again (components/account/account-fresh.tsx). */
  return <AccountOverview data={data} drawnAt={Date.now()} />
}

/**
 * /account, the buyer's profile. The person and the tabs are the layout's
 * and are drawn at once; the facts stream in under them, with a deferred
 * skeleton a quick answer never shows.
 */
export default async function AccountOverviewRoute() {
  const user = await pageUser(accountLoginPath("/account"))
  /* Supabase did not answer in time: the layout's gate recovers the session
     in the browser (lib/auth/page-user.ts). */
  if (!user) return null
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      {/* A promise as the child, as app/app/payouts/page.tsx does: React
          waits for it inside this boundary. */}
      {overviewBody(user)}
    </Suspense>
  )
}
