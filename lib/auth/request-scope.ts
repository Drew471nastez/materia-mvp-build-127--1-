import "server-only"

import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { readCurrentUser, type CurrentUser } from "@/lib/auth/current-user"
import { sellerAccessFrom, type SellerAccess } from "@/lib/account/seller-access"

/**
 * ===========================================================================
 *  THE SAME QUESTION, ASKED ONCE PER REQUEST
 * ===========================================================================
 * A layout and the page inside it both need to know who is signed in, and
 * both were asking Supabase separately. That is two auth round trips to
 * render one screen, and lib/auth/current-user.ts gives the first one a 3s
 * ceiling with a retry, so a bad moment on the auth service could be paid for
 * twice before anything was drawn.
 *
 * The same is true of the profile row: the library layout reads three columns
 * off it to decide whether to let somebody through, and the library page then
 * reads three different columns off the same row to put a name and a picture
 * at the top.
 *
 * React's `cache` is per request, not across requests. It holds nothing
 * between people and expires with the render, so this is deduplication and
 * not a cache of anybody's session.
 *
 * NOTHING HERE DECIDES ANYTHING. The answers, the classification of errors
 * and every redirect stay exactly where they were; this only stops the same
 * question being put on the wire twice.
 */
export const currentUserForRequest = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient()
  return readCurrentUser(supabase)
})

export interface RequestProfile {
  display_name: string | null
  avatar_url: string | null
  username: string | null
  email_verified: boolean | null
  is_creator: boolean | null
  welcome_completed: boolean | null
}

/**
 * Every column the library shell and the library page between them need, in
 * one select. Row-level security still applies: this is the caller's own
 * client, so it can only ever return the caller's own row.
 */
export const profileForRequest = cache(async (userId: string): Promise<RequestProfile | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, username, email_verified, is_creator, welcome_completed")
    .eq("id", userId)
    .maybeSingle()
  return (data as RequestProfile | null) ?? null
})

/**
 * The columns of the creator row the /app shell reads (app/app/layout.tsx),
 * which cover what the pages that read it with their own client need too.
 */
const SHELL_CREATOR_COLUMNS =
  "id, user_id, slug, username, display_name, avatar_url, bio, onboarding_completed, payouts_enabled, charges_enabled, stripe_onboarding_status, stripe_account_id, store_published, subscription_plan_id"

export interface RequestCreator {
  id: string
  user_id: string
  slug: string | null
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  onboarding_completed: boolean | null
  payouts_enabled: boolean | null
  /** With payouts_enabled, whether Stripe can take a charge (lib/home/progress paymentsReadyFrom). */
  charges_enabled: boolean | null
  stripe_onboarding_status: string | null
  stripe_account_id: string | null
  store_published: boolean | null
  /** The plan: "free", "growth" (Pro) or the earlier "pro" (lib/billing/plans). */
  subscription_plan_id: string | null
}

/**
 * The signed in person's creator row, once per request. The /app layout and
 * the pages under it that read it with the caller's own client (Products,
 * Customers, Coupons) asked for it separately on every full load. Same
 * client, same `user_id` filter, same row-level security: this only stops
 * the second copy of the question. The service role never reads it here.
 */
export const creatorForRequest = cache(async (userId: string): Promise<RequestCreator | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from("creators").select(SHELL_CREATOR_COLUMNS).eq("user_id", userId).maybeSingle()
  return (data as RequestCreator | null) ?? null
})

/**
 * Seller access for the signed in person (lib/account/seller-access.ts), from
 * the two rows above, so a layout that has asked for them already pays
 * nothing more for the answer.
 */
export const sellerAccessForRequest = cache(async (userId: string): Promise<SellerAccess> => {
  const [creator, profile] = await Promise.all([creatorForRequest(userId), profileForRequest(userId)])
  return sellerAccessFrom({ creator, profile })
})
