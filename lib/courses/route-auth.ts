import "server-only"

import { requestUserId } from "@/lib/auth/route-user"

/** Responses about a course are one person's own: never cached anywhere. */
export const PRIVATE = { "Cache-Control": "private, no-store" } as const

/**
 * The signed in person's id, or null for a visitor (a preview needs no account).
 * Round rel2-auth: the request's one read (lib/auth/route-user), not a second
 * Supabase Auth round trip. null also when Auth could not say; a route that
 * refuses on null answers through signedOutOrRetry, so that is a 503 Try
 * again and never "Sign in".
 */
export async function sessionUserId(): Promise<string | null> {
  return requestUserId()
}
