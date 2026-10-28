import "server-only"

/**
 * ===========================================================================
 *  SAVING THE PROFILE PHOTO (app/api/account/avatar)
 * ===========================================================================
 * The rule is lib/account/avatar's: `profiles.avatar_url` is the photo, the
 * initials when it is empty. This is the order a change is written in, and
 * it is the order that keeps a removed photo removed:
 *
 *   1  The choice is marked on the account first (AVATAR_CHOSEN), so the
 *      sign in callback never copies the Google picture back, and so
 *      anything that copies an account's picture into its profile when the
 *      account changes has run before step 2, not after it.
 *   2  The profile is written on the person's own client (row level
 *      security decides, as for every profile field) and read back in the
 *      same request: an update the database turned away changes no row and
 *      says nothing, and used to be reported as saved.
 *   3  The creator page header follows (followProfilePhoto), draft and
 *      published alike, so its old copy cannot be saved back over this one.
 *      A failure here is logged, not returned: the profile is the photo.
 *
 * Kept apart from the route so the order can be tested with a stand in
 * client (tests/avatar-one-source.test.ts).
 */
import { AVATAR_CHOSEN, followProfilePhoto } from "./avatar"

type Result<T> = PromiseLike<{ data: T | null; error: { code?: string; status?: number; message?: string } | null }>

/** The part of a Supabase client this uses. */
export interface PhotoClient {
  auth: { updateUser: (attrs: { data: Record<string, unknown> }) => Result<unknown> }
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Result<unknown> & { select: (columns: string) => Result<Array<Record<string, unknown>>> }
    }
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Result<Record<string, unknown>>
        eq: (column: string, value: string) => Result<Array<Record<string, unknown>>>
      }
    }
  }
}

export type PhotoSaved =
  | {
      ok: true
      url: string | null
      creatorId: string | null
      pagesFollowed: number
      /** The photo this one replaced, so the caller can move the copies that still hold it. The file itself is kept. */
      previous: string | null
    }
  | { ok: false; status: number; error: string }

export async function saveProfilePhoto(
  supabase: PhotoClient,
  user: { id: string; user_metadata?: Record<string, unknown> | null },
  url: string | null,
): Promise<PhotoSaved> {
  /* 1. The choice, on the account, before the photo. */
  if (user.user_metadata?.[AVATAR_CHOSEN] !== true) {
    const { error } = await supabase.auth.updateUser({ data: { [AVATAR_CHOSEN]: true } })
    if (error) console.error(`[account/avatar] choice not kept on the account (${error.code ?? error.status ?? "unknown"})`)
  }

  /* 1b. The photo being replaced, read BEFORE it is overwritten. Every other
     row that holds a copy of it follows this change (lib/account/profile-follow),
     which needs to know which address is going away. The file itself is
     never deleted (app/api/account/avatar). */
  const { data: before } = await supabase.from("profiles").select("avatar_url").eq(
    "id",
    user.id,
  ).maybeSingle()
  const previous = typeof before?.avatar_url === "string" && before.avatar_url.trim() !== "" ? before.avatar_url.trim() : null

  /* 2. The photo, read back. */
  const { data: rows, error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id).select("avatar_url")
  if (error) {
    console.error(`[account/avatar] not saved (${error.code ?? "unknown"})`)
    /* The database's code goes with the words (42501 is a refused write, 42703 a column the database does not have), so a report says which. */
    const code = error.code ? ` (${error.code})` : ""
    return { ok: false, status: 500, error: url ? `The photo did not save${code}. Try again in a moment.` : `The photo was not removed${code}. Try again in a moment.` }
  }
  const saved = Array.isArray(rows) ? rows[0] : null
  if (!saved) {
    console.error("[account/avatar] not saved (no profile row was changed)")
    return { ok: false, status: 409, error: url ? "The photo did not save. Reload the page and try again." : "The photo was not removed. Reload the page and try again." }
  }
  if ((saved.avatar_url ?? null) !== url) {
    console.error("[account/avatar] the database kept a different photo than the one saved")
    return { ok: false, status: 409, error: url ? "The photo did not save. Try again in a moment." : "The photo was not removed. Try again in a moment." }
  }

  /* 3. The creator page header follows it. */
  let creatorId: string | null = null
  let pagesFollowed = 0
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (creator && typeof creator.id === "string") {
    creatorId = creator.id
    const { data: configs, error: readError } = await supabase
      .from("store_builder_configs")
      .select("id, draft_config, published_config")
      .eq("creator_id", creator.id)
      .eq("page_type", "shop")
    if (readError) console.error(`[account/avatar] creator page not read (${readError.code ?? "unknown"})`)
    for (const row of configs ?? []) {
      const draft = followProfilePhoto(row.draft_config as Record<string, unknown> | null, url)
      const published = followProfilePhoto(row.published_config as Record<string, unknown> | null, url)
      if (!draft && !published) continue
      const { error: writeError } = await supabase
        .from("store_builder_configs")
        .update({ ...(draft ? { draft_config: draft } : {}), ...(published ? { published_config: published } : {}) })
        .eq("id", String(row.id))
      if (writeError) console.error(`[account/avatar] creator page photo not updated (${writeError.code ?? "unknown"})`)
      else pagesFollowed++
    }
  }

  return { ok: true, url, creatorId, pagesFollowed, previous }
}
