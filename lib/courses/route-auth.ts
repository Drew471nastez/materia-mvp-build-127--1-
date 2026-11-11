import "server-only"

import { requestUserId } from "@/lib/auth/route-user"

/** Responses about a course are one person's own: never cached anywhere. */
export const PRIVATE = { "Cache-Control": "private, no-store" } as const

/**
 * The signed in person's id, or null for a visitor (a preview needs no account).
 * Round rel2-auth: Supabase Auth itself, as before, through lib/auth/route-user
 * (requestUserId, `fresh`: retries and a ceiling). null also when Auth could not say; a route that
 * refuses on null answers through signedOutOrRetry, so that is a 503 Try
 * again and never "Sign in".
 */
export async function sessionUserId(): Promise<string | null> {
  return requestUserId()
}
