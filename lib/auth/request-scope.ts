import "server-only"

import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readCurrentUser, type CurrentUser } from "@/lib/auth/current-user"
import { sellerAccessFrom, type SellerAccess } from "@/lib/account/seller-access"
import { ServiceUnavailable, classifyServiceError, dataOrThrow, isServiceUnavailable } from "@/lib/net/service-error"
import { currentRequestId, logLine, logServiceFailure } from "@/lib/net/log"

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
  /* When Supabase Auth does not answer, the token's signature is checked instead (lib/auth/current-user.ts). */
  const current = await readCurrentUser(supabase, { fallbackClaims: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null })
  /* Logged, never decided on: a degraded answer is one JSON line (lib/net/log.ts) with the request's id. */
  const degraded = current.verifiedBy === "claims" ? "claims" : !current.user && current.state !== "anonymous" ? "indeterminate" : null
  if (degraded) {
    void currentRequestId().then((rid) => console.warn(logLine("auth_degraded", { outcome: degraded, reason: current.reason ?? "unknown", rid })))
  }
  return current
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
/*
  READ ONCE, AND THE FAILURE KEPT (lib/net/service-error.ts). A read that
  failed used to come back as null, the same as no row, and the /app layout
  sent a seller whose profile read timed out to /signup/verify. The cached
  read keeps the failure beside the row: `profileForRequest` still answers
  null for it (an optional use, a name on a page), and
  `profileOrThrowForRequest` throws it, for the one caller that decides
  where somebody belongs from the answer.
*/
const profileRead = cache(async (userId: string): Promise<{ row: RequestProfile | null; failure: ServiceUnavailable | null }> => {
  const supabase = await createClient()
  try {
    const row = dataOrThrow(
      "profile",
      await supabase
        .from("profiles")
        .select("display_name, avatar_url, username, email_verified, is_creator, welcome_completed")
        .eq("id", userId)
        .maybeSingle(),
    )
    return { row: (row as RequestProfile | null) ?? null, failure: null }
  } catch (e) {
    if (!isServiceUnavailable(e)) throw e
    logServiceFailure(e)
    return { row: null, failure: e }
  }
})

export const profileForRequest = cache(async (userId: string): Promise<RequestProfile | null> => (await profileRead(userId)).row)

/** The profile, or a ServiceUnavailable thrown when it could not be read (never null for a failure). */
export const profileOrThrowForRequest = cache(async (userId: string): Promise<RequestProfile | null> => {
  const { row, failure } = await profileRead(userId)
  if (failure) throw failure
  return row
})

/**
 * The columns of the creator row the /app shell reads (app/app/layout.tsx),
 * which cover what the pages that read it with their own client need too.
 */
export const SHELL_CREATOR_COLUMNS =
  "id, user_id, slug, username, display_name, avatar_url, bio, onboarding_completed, payouts_enabled, charges_enabled, store_published"

/**
 * THE SHELL'S PRIVATE COLUMNS, read apart. Run-now part 63 refuses these to a
 * visitor's client (lib/security/public-columns PRIVATE_CREATOR_COLUMNS), and
 * PostgREST answers a select naming one with an error, not a null: asked in
 * the one select above, the whole row came back empty and /app sent every
 * creator to /sell. They are read with the service role for the row the
 * caller's own client already returned, so nobody reads anyone else's.
 */
export const SHELL_PRIVATE_CREATOR_COLUMNS = "stripe_onboarding_status, stripe_account_id, subscription_plan_id, details_submitted, stripe_requirements, stripe_connected_at"

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
  /* What Home says about payments (lib/payments/stripe/readiness homePaymentsState). */
  details_submitted?: boolean | null
  stripe_requirements?: string[] | null
  stripe_connected_at?: string | null
  store_published: boolean | null
  /** The plan: "free", "growth" (Pro) or the earlier "pro" (lib/billing/plans). */
  subscription_plan_id: string | null
}

/**
 * The signed in person's creator row, once per request. The /app layout and
 * the pages under it that read it with the caller's own client (Products,
 * Customers, Coupons) asked for it separately on every full load. Same
 * client, same `user_id` filter, same row-level security: this only stops
 * the second copy of the question. The service role reads only the three private
 * columns of the row the caller's client returned (SHELL_PRIVATE_CREATOR_COLUMNS).
 */
export const creatorForRequest = cache(async (userId: string): Promise<RequestCreator | null> => (await creatorRead(userId)).row)

/** The creator row, or a ServiceUnavailable thrown when it could not be read (never null for a failure). */
export const creatorOrThrowForRequest = cache(async (userId: string): Promise<RequestCreator | null> => {
  const { row, failure } = await creatorRead(userId)
  if (failure) throw failure
  return row
})

const creatorRead = cache(async (userId: string): Promise<{ row: RequestCreator | null; failure: ServiceUnavailable | null }> => {
  try {
    return { row: await creatorRow(userId), failure: null }
  } catch (e) {
    if (!isServiceUnavailable(e)) throw e
    logServiceFailure(e)
    return { row: null, failure: e }
  }
})

async function creatorRow(userId: string): Promise<RequestCreator | null> {
  const supabase = await createClient()
  /*
    BOTH HALVES AT ONCE, BY THE SIGNED IN USER'S OWN ID. The private columns
    were read by the creator id the first read found, so every /app page
    waited for one read and then the other. creators.user_id is unique, so
    the same row is found by the user's id directly, on the service role
    exactly as before and filtered by nothing but the signed in user's own
    id; the public half still decides whether there is a creator at all.
  */
  const [publicHalf, privateHalf] = await Promise.all([
    supabase.from("creators").select(SHELL_CREATOR_COLUMNS).eq("user_id", userId).maybeSingle(),
    createAdminClient().from("creators").select(SHELL_PRIVATE_CREATOR_COLUMNS).eq("user_id", userId).maybeSingle(),
  ])
  /* The public half decides whether there is a creator: its failure is a failure, not "no store". */
  const data = dataOrThrow("creator", publicHalf)
  /* The private half is the plan and Stripe's state: without it the row is drawn as before, and the miss is logged. */
  if (privateHalf.error) logServiceFailure(new ServiceUnavailable("creator private columns", classifyServiceError(privateHalf.error, privateHalf.status), { status: privateHalf.status }))
  const privateCols = privateHalf.error ? null : privateHalf.data
  if (!data) return null
  return {
    stripe_onboarding_status: null,
    stripe_account_id: null,
    subscription_plan_id: null,
    ...(data as object),
    ...((privateCols as object | null) ?? {}),
  } as RequestCreator
}

/**
 * Seller access for the signed in person (lib/account/seller-access.ts), from
 * the two rows above, so a layout that has asked for them already pays
 * nothing more for the answer.
 */
export const sellerAccessForRequest = cache(async (userId: string): Promise<SellerAccess> => {
  const [creator, profile] = await Promise.all([creatorForRequest(userId), profileForRequest(userId)])
  return sellerAccessFrom({ creator, profile })
})
