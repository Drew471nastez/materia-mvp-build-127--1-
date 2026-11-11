import "server-only"

import { routeUser } from "@/lib/auth/route-user"
import { viewerOf, type Viewer } from "./server"

/**
 * The signed in person on this request, as a member (./server Viewer), or null.
 *
 * Round rel2-auth: Supabase Auth itself, as the raw getUser() this replaced
 * asked (lib/auth/route-user `fresh`, which also carries email_confirmed_at),
 * with retries and a ceiling. null for signed out and could not tell alike;
 * the routes refuse through signedOutOrRetry (fresh by default), so a slow
 * Auth is a 503 Try again and never "Sign in".
 */
export async function requestViewer(): Promise<Viewer | null> {
  const who = await routeUser({ fresh: true })
  return viewerOf(who.kind === "user" ? who.user : null)
}
