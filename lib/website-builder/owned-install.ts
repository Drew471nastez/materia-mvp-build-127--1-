/**
 * ===========================================================================
 *  "THEME NOT FOUND" ONLY WHEN IT IS NOT THERE
 * ===========================================================================
 * The editor's routes find the creator and their install with two reads and
 * answered 404 "Theme not found" whenever a read came back empty, including
 * when it came back empty because the read itself failed: a statement
 * timeout, a dropped connection, a 504 from the database's gateway. Under
 * load that is several times a minute, so somebody adjusting a slider was
 * told the website they were looking at did not exist.
 *
 * A read that fails is tried once more after a short pause, and a read that
 * fails twice is answered 503 with words that say what happened. Only a read
 * that worked and found nothing is "not found".
 */

import type { SupabaseClient, User } from "@supabase/supabase-js"
import { readCurrentUser } from "@/lib/auth/current-user"

export const UNREACHABLE = "Storelib could not reach your website just now. Your changes are still here; try again in a moment."

/** The read, and once more after a pause if it failed. */
export async function readTwice<R extends { error: unknown }>(run: () => PromiseLike<R>): Promise<R> {
  const first = await run()
  if (!first.error) return first
  await new Promise((r) => setTimeout(r, 250))
  return run()
}

/**
 * ===========================================================================
 *  401 ONLY WHEN AUTH SAID NOBODY (round 12)
 * ===========================================================================
 * The routes read `getUser()` and answered 401 whenever it came back without
 * a user, including when Auth did not answer in time or answered a 5xx, and
 * the editor said "You're signed out" over a save that could simply have
 * been sent again. A read that could not tell is a 503 now, which the editor
 * tries again on its own; a 401 is Auth saying there is nobody
 * (lib/auth/current-user.ts, the same rule the pages use).
 */
export const AUTH_UNREACHABLE = "Storelib could not check your sign in just now. Your changes are still here; try again in a moment."

export async function editorUser(supabase: SupabaseClient): Promise<{ user: User; status: 200; error: null } | { user: null; status: 401 | 503; error: string }> {
  const current = await readCurrentUser(supabase)
  if (current.user) return { user: current.user, status: 200, error: null }
  if (current.state === "indeterminate") return { user: null, status: 503, error: AUTH_UNREACHABLE }
  return { user: null, status: 401, error: "Unauthorized" }
}
