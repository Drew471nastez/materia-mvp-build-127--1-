import "server-only"

import { routeUser } from "@/lib/auth/route-user"
import { authUserById, currentEmailIsVerified } from "@/lib/auth/verified-email"
import { createAdminClient } from "@/lib/supabase/admin"
import { viewerOf, type Viewer } from "./server"

/**
 * AN ADDRESS FINDS A GUEST'S MEMBERSHIP ONLY WHEN THIS ACCOUNT PROVED IT.
 * Supabase stamps email_confirmed_at at sign up with nothing proven (Confirm
 * email is off), so an account made with somebody else's address used to
 * read as confirmed: it found that person's guest membership by its email,
 * read the posts, and the row's buyer_id became the stranger's. Orders
 * already ask which address was proven (lib/auth/verified-email.ts); this
 * asks the same of the member. Any doubt is "not proven": the membership is
 * then reached by its own account only, never lost.
 */
export async function provenViewer(viewer: Viewer | null, admin: any = null): Promise<Viewer | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!viewer || !viewer.emailConfirmed || !viewer.email) return viewer
  try {
    const db = admin ?? createAdminClient()
    const user = await authUserById(db, viewer.id)
    const proven = !!user && (user.email ?? "").trim().toLowerCase() === viewer.email && (await currentEmailIsVerified(db, user))
    return proven ? viewer : { ...viewer, emailConfirmed: false }
  } catch {
    return { ...viewer, emailConfirmed: false }
  }
}

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
  return provenViewer(viewerOf(who.kind === "user" ? who.user : null))
}
