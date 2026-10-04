/**
 * ===========================================================================
 *  A SESSION THE NATIVE APP JUST GOT, TURNED INTO BEING SIGNED IN
 * ===========================================================================
 * Two ways into the app end with a Supabase session in hand: the deep link
 * back from the browser sheet (lib/native-oauth.ts) and the native Google
 * sheet (lib/auth/native-sign-in.ts). What happens next was written out in
 * the first of them, so the second would have been a second copy of it, and
 * two copies of "where does this person go now" is how one of them drifts.
 *
 * It is one thing, here:
 *
 *   the home a cold start opens on   a seller's dashboard or Discover, kept
 *                                    so the next launch does not guess
 *   where they were going            whatever the login or signup page kept
 *                                    before the sheet opened (continue.ts)
 *   cookies                          the native client keeps the session in
 *                                    Capacitor Preferences, and Next.js
 *                                    reads cookies, so the app goes through
 *                                    /auth/sync-session, which sets them
 *                                    server side and then forwards
 *
 * The caller navigates, because only the caller knows whether it is allowed
 * to (a handler mid-flight may want to clear its own state first).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { readSellerAccess, hasSellerAccess } from "@/lib/account/seller-access"
import { NATIVE_BUYER_HOME, SELLER_HOME, continueHref } from "@/lib/auth/continue"
import { takeNativeCarry } from "@/lib/auth/continue-client"
import { cacheNativeHome } from "@/lib/native-bridge"

export interface NativeSessionTokens {
  access_token: string
  refresh_token: string
  user?: { id?: string | null } | null
}

/** The address that writes the session into cookies and then goes on to `next`. */
export function syncSessionHref(tokens: NativeSessionTokens, nextPath: string): string {
  return (
    `/auth/sync-session` +
    `?access_token=${encodeURIComponent(tokens.access_token)}` +
    `&refresh_token=${encodeURIComponent(tokens.refresh_token)}` +
    `&next=${encodeURIComponent(nextPath)}`
  )
}

/**
 * Everything after a native sign in, bar the navigation: returns the address
 * to send the app to. Never throws — a home that could not be cached is not
 * a reason to leave somebody on the login page.
 */
export async function completeNativeSession(supabase: SupabaseClient, session: NativeSessionTokens): Promise<string> {
  const userId = session.user?.id
  if (userId) {
    try {
      const access = await readSellerAccess(supabase, userId)
      cacheNativeHome(hasSellerAccess(access) ? SELLER_HOME : NATIVE_BUYER_HOME)
    } catch {
      /* The home is a shortcut for the next cold start, not a gate. */
    }
  }
  return syncSessionHref(session, continueHref(takeNativeCarry()))
}
