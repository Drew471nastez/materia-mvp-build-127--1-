import "server-only"

import { routeUser } from "@/lib/auth/route-user"
import { viewerOf, type Viewer } from "./server"

/**
 * The signed in person on this request, as a member (./server Viewer), or null.
 *
 * Round rel2-auth: the request's one read, Supabase Auth first since a
 * Viewer needs email_confirmed_at (lib/auth/route-user `full`). null for
 * signed out and could not tell alike; the routes refuse through
 * signedOutOrRetry(..., { full: true }) (or { fresh: true }), so a slow Auth is a 503 Try again
 * and never "Sign in".
 */
export async function requestViewer({ fresh = false }: { fresh?: boolean } = {}): Promise<Viewer | null> {
  /* `fresh`: Supabase Auth itself (a buyer's billing: cancel, the Stripe portal), as the raw getUser this replaced asked. */
  const who = await routeUser(fresh ? { fresh: true } : { full: true })
  return viewerOf(who.kind === "user" ? who.user : null)
}
