/**
 * ===========================================================================
 *  A NAME FOR EVERY ACCOUNT, KEPT ON EVERY SIGN IN
 * ===========================================================================
 * The same shape as the photo (lib/profile/provider-photo.ts): asked on every
 * sign in, on the web (app/auth/callback, app/auth/continue) and in the app
 * (app/auth/sync-session), and written only when lib/profile/display-name
 * nameRepair says so: the provider's name over an empty or made up one, else
 * a name made from the handle or the email over an empty one. A name the
 * person has is never touched.
 *
 * The write is a compare and set on the value just read, so a name saved in
 * Settings in the same moment is never overwritten by a sign in. Never
 * throws: a sign in must not fail over a name.
 */
import { nameRepair } from "./display-name"

type Answer<T> = PromiseLike<{ data: T | null; error: { message?: string; code?: string } | null }>

/** The part of a Supabase client this uses (the service role: a profile is written for its own account only). */
export interface KeepNameDb {
  from: (table: "profiles") => {
    select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => Answer<{ display_name?: string | null; username?: string | null; email?: string | null }> } }
    update: (values: { display_name: string }) => {
      eq: (column: string, value: string) => {
        is: (column: string, value: null) => { select: (columns: string) => Answer<unknown[]> }
        eq: (column: string, value: string) => { select: (columns: string) => Answer<unknown[]> }
      }
    }
  }
}

export type KeepNameResult = "saved" | "has_name" | "no_profile" | "lost_race" | "failed"

export async function keepProfileName(
  db: KeepNameDb,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null },
): Promise<KeepNameResult> {
  try {
    const { data, error } = await db.from("profiles").select("display_name, username, email").eq("id", user.id).maybeSingle()
    if (error) return "failed"
    if (!data) return "no_profile"
    const stored = typeof data.display_name === "string" ? data.display_name : null
    const name = nameRepair({ stored, username: data.username ?? null, email: data.email ?? user.email ?? null, meta: user.user_metadata ?? null })
    if (!name) return "has_name"
    /* Only while it is still what was just read: a name saved in between wins. */
    const update = db.from("profiles").update({ display_name: name }).eq("id", user.id)
    const { data: rows, error: writeError } = await (stored === null ? update.is("display_name", null) : update.eq("display_name", stored)).select("id")
    if (writeError) return "failed"
    return Array.isArray(rows) && rows.length > 0 ? "saved" : "lost_race"
  } catch {
    return "failed"
  }
}
