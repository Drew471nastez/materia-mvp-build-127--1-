import "server-only"

/**
 * ===========================================================================
 *  A STORE'S HANDLE IS THREE ADDRESSES, AND ONLY THE SERVER MOVES THEM
 * ===========================================================================
 *   storelib.com/<handle>     the creator page  (profiles.username)
 *   <handle>.storelib.com     the website       (creators.slug)
 *   storelib.me/<handle>      the OnePage       (onepages.slug)
 *
 * Every rule on a name lives here in the app: the format, the reserved words,
 * the link farm score and a name for a fake sign in page
 * (lib/reserved-words isValidUsername, lib/security/phishing-names), and what
 * taken means (lib/profile/ensure-username handleAvailable: another profile,
 * another store, a name somebody gave up in username_history, another page,
 * a website's own address). /app Settings and the seller onboarding used to
 * write these columns straight from the browser, so nothing stopped a name
 * like paypal-login reaching <name>.storelib.com. Both come here now
 * (PATCH /api/profile/username with store: true), and the database refuses
 * a browser write that changes either column (supabase/sql/run-now/462).
 *
 * The order is the one Settings always had: the username, then the store,
 * then the OnePage. A store that cannot follow puts the username back, so the
 * two never point at different names. A OnePage that cannot follow is
 * reported, not fatal, as before: the name has moved and Save can retry it.
 *
 * Service role only (the caller's db): the session's own rows, by user id.
 */
import { isValidUsername } from "@/lib/reserved-words"
import { handleAvailable } from "./ensure-username"
import { baseHandleFrom, handleCandidates, normalizeHandle } from "./username-rules"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/* One flat shape (not a union): the push suite compiles with strict off, where a union on `ok` does not narrow. */
export interface HandleMove {
  ok: boolean
  /** The handle all three addresses now use (ok only). */
  username?: string
  /** The username before, when it changed (for username_history and the CDN purge); null when nothing moved. */
  previous?: string | null
  /** False only when the OnePage could not be moved; the rest has. */
  onepageMoved?: boolean
  /** Why not (not ok only): 400 a name the rules refuse, 409 taken, 500 not saved. */
  status?: 400 | 409 | 500
  error?: string
}

const TAKEN = "This username is taken"
const NOT_SAVED = "That did not save. Try again in a moment."

async function current(db: Db, userId: string) {
  const [profile, creator, pages] = await Promise.all([
    db.from("profiles").select("username").eq("id", userId).maybeSingle(),
    db.from("creators").select("id, slug").eq("user_id", userId).maybeSingle(),
    db.from("onepages").select("id, slug").eq("owner_id", userId),
  ])
  if (profile.error || creator.error) return null
  return {
    username: String((profile.data as { username?: string | null } | null)?.username || "").trim(),
    creator: (creator.data as { id: string; slug: string | null } | null) ?? null,
    pages: ((pages.data as { id: string; slug: string | null }[] | null) ?? []),
  }
}

/**
 * Move the store's three addresses to `wanted`. A handle that is already the
 * account's (in any case) is never checked again, so a name kept from before
 * these rules still saves; it only brings a store address that drifted back
 * in line with it, as Settings always did.
 */
export async function moveStoreHandle(db: Db, userId: string, wanted: unknown): Promise<HandleMove> {
  const handle = normalizeHandle(wanted)
  const now = await current(db, userId)
  if (!now) return { ok: false, status: 500, error: NOT_SAVED }
  const same = !!now.username && now.username.toLowerCase() === handle
  if (!same) {
    const valid = isValidUsername(handle)
    if (!valid.valid) return { ok: false, status: 400, error: valid.error || "This username is not available" }
    if (!(await handleAvailable(db, handle, userId))) return { ok: false, status: 409, error: TAKEN }
  }
  /* Lowercase, as Settings always wrote it: a case change of the account's own name is not a new name. */
  const target = handle

  if (now.username !== target) {
    const { error } = await db.from("profiles").update({ username: target }).eq("id", userId)
    if (error) {
      if (error.code === "23505") return { ok: false, status: 409, error: TAKEN }
      console.error("[handle] username not saved", error.code, error.message)
      return { ok: false, status: 500, error: NOT_SAVED }
    }
  }

  if (now.creator && (now.creator.slug || "") !== target) {
    const { error } = await db.from("creators").update({ slug: target }).eq("id", now.creator.id)
    if (error) {
      console.error("[handle] store address not moved", error.code, error.message)
      /* The username goes back, so the creator page and the website never answer to different names. */
      if (now.username !== target) await db.from("profiles").update({ username: now.username || null }).eq("id", userId)
      return error.code === "23505" ? { ok: false, status: 409, error: TAKEN } : { ok: false, status: 500, error: NOT_SAVED }
    }
  }

  if (same) return { ok: true, username: target, previous: null, onepageMoved: true }

  if (now.username) {
    const { error } = await db.from("username_history").insert({ user_id: userId, old_username: now.username, new_username: target })
    if (error) console.error("[handle] username_history insert failed", error.message)
  }

  let onepageMoved = true
  if (now.pages.length > 0) {
    const { error } = await db.from("onepages").update({ slug: target }).eq("owner_id", userId)
    if (error) {
      console.error("[handle] onepage address not moved", error.code, error.message)
      onepageMoved = false
    }
  }
  return { ok: true, username: target, previous: now.username || null, onepageMoved }
}

/**
 * The seller onboarding's handle: the one on screen when it is free and
 * allowed; otherwise the account's own handle when it has one; otherwise the
 * first free name made from it. Onboarding never stops on a name, and never
 * hands out one the rules refuse.
 */
export async function claimStoreHandle(db: Db, userId: string, wanted: unknown): Promise<HandleMove> {
  const first = await moveStoreHandle(db, userId, wanted)
  if (first.ok || first.status === 500) return first
  const now = await current(db, userId)
  if (now?.username) return moveStoreHandle(db, userId, now.username)
  /* A name the rules refuse is not repaired into a near copy of itself: it falls back to "member" (baseHandleFrom). */
  for (const candidate of handleCandidates(baseHandleFrom({ displayName: normalizeHandle(wanted) }))) {
    const next = await moveStoreHandle(db, userId, candidate)
    if (next.ok || next.status === 500) return next
  }
  return first
}
