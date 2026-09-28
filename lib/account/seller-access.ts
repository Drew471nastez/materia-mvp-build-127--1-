import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * ===========================================================================
 *  DOES THIS ACCOUNT HAVE SELLER ACCESS
 * ===========================================================================
 * The one answer every screen asks for: the headers (Dashboard or Become a
 * seller), /sell, the /app gate, and the end of every sign in
 * (lib/auth/continue.ts). It used to be decided in about ten places from
 * three different columns, and they did not agree.
 *
 * Buyers and sellers are the same account. Every account can buy; seller
 * access is added on top by finishing seller onboarding, and nothing about
 * the buyer side changes when it is.
 *
 * SELLER ACCESS means the account's row in `creators` has
 * `onboarding_completed = true`. That flag is written in one place, by
 * /api/onboarding/finalize with the service role, as the last step of the
 * onboarding, so a row that says true is a creator the dashboard can draw.
 *
 * Three states, from the same two rows:
 *
 *   "seller"   creators.onboarding_completed is true. /app works.
 *
 *   "started"  onboarding was begun and not finished: a creators row that is
 *              not complete (the onboarding writes one before a paid plan's
 *              checkout), or `profiles.is_creator` set by the old "I'm a
 *              creator" choice with no finished row behind it. NOT a
 *              seller: /sell opens the onboarding again, /app sends them to
 *              it, and everywhere else they are a buyer.
 *
 *   "none"     a buyer who never started. Every new signup starts here.
 *
 * `profiles.welcome_completed` is not part of this. It recorded the old
 * creator or buyer question after sign up, which no longer exists: an
 * account that never answered it is a buyer, like any other.
 *
 * This module is safe to import from a client component: it imports no
 * server code, and `readSellerAccess` takes whichever Supabase client the
 * caller has. The per request server copy is `sellerAccessForRequest` in
 * lib/auth/request-scope.ts, which reuses the rows the /app layout already
 * reads, so the gate costs no extra query.
 */

export type SellerState = "none" | "started" | "seller"

export interface SellerAccess {
  state: SellerState
}

/** The minimum of each row the answer needs. Extra columns are fine. */
export interface SellerAccessRows {
  creator: { onboarding_completed?: boolean | null } | null | undefined
  profile?: { is_creator?: boolean | null } | null | undefined
}

export function sellerAccessFrom({ creator, profile }: SellerAccessRows): SellerAccess {
  if (creator?.onboarding_completed === true) return { state: "seller" }
  if (creator || profile?.is_creator === true) return { state: "started" }
  return { state: "none" }
}

export function hasSellerAccess(access: SellerAccess | null | undefined): boolean {
  return access?.state === "seller"
}

/**
 * The same answer from the database, with the client the caller already
 * has (the server's cookie client, the browser's, or the service role in a
 * route that has checked who is asking). Both reads at once. A read that
 * fails is read again once, and then counts as "none", which is what the
 * gates this replaced did with a missing row: offering the onboarding is a
 * recoverable mistake, drawing a dashboard with no creator behind it is not.
 */
export async function readSellerAccess(supabase: SupabaseClient, userId: string): Promise<SellerAccess> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const [creatorRes, profileRes] = await Promise.all([
        supabase.from("creators").select("onboarding_completed").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("is_creator").eq("id", userId).maybeSingle(),
      ])
      if (creatorRes.error && attempt === 0) continue
      return sellerAccessFrom({
        creator: (creatorRes.data as SellerAccessRows["creator"]) ?? null,
        profile: (profileRes.data as SellerAccessRows["profile"]) ?? null,
      })
    } catch {
      /* the second go, or "none" below */
    }
  }
  return { state: "none" }
}
