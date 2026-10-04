/**
 * ===========================================================================
 *  THE PHOTO GOOGLE (OR APPLE) SENT, KEPT UNTIL THEY HAVE ONE OF THEIR OWN
 * ===========================================================================
 * The owner: "when a person signs up or signs in with Google or Apple, their
 * provider photo is saved to their profile when they have none (on every
 * sign in until they have one; never overwrite a photo they set)".
 *
 * It used to be copied at sign up only (an account made in the last fifteen
 * minutes), so everybody whose first sign in missed it (the native app,
 * whose sign in never passed the web callback; a profile made by the
 * database trigger before the callback ran; an account that signed up with
 * an email and linked Google later) stayed without a face for good.
 *
 * THE RULE, asked on every sign in, on the web (app/auth/callback) and in
 * the app (app/auth/sync-session, where the native sign in lands):
 *
 *   their profile has a photo      nothing changes, whatever it is
 *   they removed or chose one      nothing changes: the choice is kept on the
 *   themselves (AVATAR_CHOSEN)     account (lib/account/avatar), so a photo
 *                                  they took away never comes back
 *   the provider sent none         nothing (Apple sends no picture at all)
 *   otherwise                      the provider's picture is their photo
 *
 * The write is a compare and set: it only lands while the profile still has
 * no photo (the value read just before), so a photo saved in Settings in
 * the same moment is never overwritten by a sign in. Existing accounts get
 * the same answer once, from the database, in run-now part 97.
 *
 * Pure apart from `keepProviderPhoto`, which takes the client it writes
 * with, so the tests run it against a stand in (tests/profile-provider-photo).
 */
import { AVATAR_CHOSEN, profileAvatar } from "@/lib/account/avatar"

/** The picture a provider put on the account: Google's `avatar_url` or `picture`, an https address only. */
export function providerPhotoOf(meta: Record<string, unknown> | null | undefined): string | null {
  for (const key of ["avatar_url", "picture"] as const) {
    const value = meta?.[key]
    if (typeof value === "string" && /^https:\/\/\S+$/.test(value.trim()) && !value.includes("placeholder.svg")) return value.trim()
  }
  return null
}

/** Whether a sign in should put the provider's picture into the profile. */
export function providerPhotoWanted(input: { profileAvatar: string | null | undefined; providerAvatar: string | null | undefined; chosen: boolean }): boolean {
  if (input.chosen || profileAvatar(input.profileAvatar)) return false
  return !!input.providerAvatar
}

type Answer<T> = PromiseLike<{ data: T | null; error: { message?: string; code?: string } | null }>

/** The part of a Supabase client this uses (the service role: a profile is written for its own account only). */
export interface ProviderPhotoDb {
  from: (table: "profiles") => {
    select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => Answer<{ avatar_url?: string | null }> } }
    update: (values: { avatar_url: string }) => {
      eq: (column: string, value: string) => {
        is: (column: string, value: null) => { select: (columns: string) => Answer<unknown[]> }
        eq: (column: string, value: string) => { select: (columns: string) => Answer<unknown[]> }
      }
    }
  }
}

export type ProviderPhotoResult = "saved" | "has_photo" | "chosen" | "no_provider_photo" | "no_profile" | "lost_race" | "failed"

/**
 * Put the provider's picture into the profile when the rule says so. Never
 * throws: a sign in must not fail over a photo.
 */
export async function keepProviderPhoto(db: ProviderPhotoDb, user: { id: string; user_metadata?: Record<string, unknown> | null }): Promise<ProviderPhotoResult> {
  try {
    const meta = user.user_metadata ?? {}
    if (meta[AVATAR_CHOSEN] === true) return "chosen"
    const photo = providerPhotoOf(meta)
    if (!photo) return "no_provider_photo"
    const { data, error } = await db.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle()
    if (error) return "failed"
    if (!data) return "no_profile"
    const current = typeof data.avatar_url === "string" ? data.avatar_url : null
    if (!providerPhotoWanted({ profileAvatar: current, providerAvatar: photo, chosen: false })) return "has_photo"
    /* Only while it is still what was just read: a photo saved in between wins. */
    const update = db.from("profiles").update({ avatar_url: photo }).eq("id", user.id)
    const { data: rows, error: writeError } = await (current === null ? update.is("avatar_url", null) : update.eq("avatar_url", current)).select("id")
    if (writeError) return "failed"
    return Array.isArray(rows) && rows.length > 0 ? "saved" : "lost_race"
  } catch {
    return "failed"
  }
}
