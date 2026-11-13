import "server-only"

/**
 * ===========================================================================
 *  EVERY ACCOUNT GETS A HANDLE THE FIRST TIME ONE IS NEEDED
 * ===========================================================================
 * profiles.username was only ever written by the creator flows (onboarding
 * and /app Settings), so a buyer had none: no /@handle, nothing to @mention,
 * nothing a follower list could link to. ensureUsername gives them one the
 * first time something needs it (their own profile, the account page, a
 * follow, a mention) and returns what is there from then on.
 *
 * TAKEN MEANS TAKEN ANYWHERE A HANDLE LIVES: another profile (any case),
 * a creator's store slug, a handle somebody renamed away from (its old
 * links still redirect through username_history), and a website address
 * (website_handle_taken, when part of the site tables has run).
 *
 * NEVER OVERWRITES. The write is `username IS NULL` guarded, so a handle the
 * person (or a parallel request) set a moment ago wins, and the unique
 * constraint on profiles.username settles two requests racing for the same
 * new handle: the loser tries the next candidate.
 *
 * Server only, service role: the profile's email is a private column.
 */
import { isValidUsername } from "@/lib/reserved-words"
import { baseHandleFrom, handleCandidates } from "./username-rules"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether `handle` is free for `userId` (their own current handle counts as free). */
export async function handleAvailable(db: Db, handle: string, userId: string | null): Promise<boolean> {
  if (!isValidUsername(handle).valid) return false
  const [profiles, creators, history, pages] = await Promise.all([
    db.from("profiles").select("id").ilike("username", handle).limit(2),
    db.from("creators").select("user_id").ilike("slug", handle).limit(2),
    db.from("username_history").select("user_id").ilike("old_username", handle).limit(2),
    /*
      ANOTHER CREATOR'S ONEPAGE ADDRESS (the OnePage production audit). A page
      address is never somebody else's username (lib/onepage/name-availability),
      but a username could be taken over somebody else's page address: their
      storelib.me/<address> then answered both, and the new account's page
      named the other creator's page as its own canonical address.
    */
    db.from("onepages").select("owner_id").ilike("slug", handle).limit(2),
  ])
  if (profiles.error) return false
  const others = (rows: { data: unknown } | undefined, key: string) =>
    ((rows?.data as Record<string, string | null>[] | null) ?? []).some((r) => r[key] && r[key] !== userId)
  if (others(profiles, "id")) return false
  if (!creators.error && others(creators, "user_id")) return false
  /* A handle given up by somebody else still redirects their old links; it is not handed to a stranger. */
  if (!history.error && others(history, "user_id")) return false
  if (!pages.error && others(pages, "owner_id")) return false
  try {
    const site = await db.rpc("website_handle_taken", { p_handle: handle })
    if (!site?.error && site?.data === true) return false
  } catch {
    /* The site tables are not there yet: nothing to clash with. */
  }
  return true
}

/**
 * The person's handle, made now when they have none. Null when there is no
 * such profile or the profiles table cannot be read; never throws.
 */
export async function ensureUsername(db: Db, userId: string, random: () => number = Math.random): Promise<string | null> {
  if (!userId || !UUID.test(userId)) return null
  try {
    const { data, error } = await db.from("profiles").select("id, username, display_name, email").eq("id", userId).maybeSingle()
    if (error || !data) return null
    const row = data as { username: string | null; display_name: string | null; email: string | null }
    if (row.username && row.username.trim()) return row.username.trim()

    for (const candidate of handleCandidates(baseHandleFrom({ displayName: row.display_name, email: row.email }), random)) {
      if (!(await handleAvailable(db, candidate, userId))) continue
      const write = await db.from("profiles").update({ username: candidate }).eq("id", userId).is("username", null).select("username").maybeSingle()
      if (write.error) {
        /* 23505: somebody took it between the check and the write. Try the next one. */
        if (write.error.code === "23505") continue
        console.error("[profile] username not saved", write.error.code, write.error.message)
        return null
      }
      if (write.data?.username) return String(write.data.username)
      /* Nothing updated: a handle arrived from elsewhere in the meantime. That one is theirs. */
      const again = await db.from("profiles").select("username").eq("id", userId).maybeSingle()
      return (again.data as { username?: string | null } | null)?.username || null
    }
    console.error("[profile] no free handle found for", userId)
    return null
  } catch (e) {
    console.error("[profile] ensureUsername failed", e instanceof Error ? e.message : e)
    return null
  }
}

/** Handles for several people at once (a follower list, a mention picker), made where missing. */
export async function ensureUsernames(db: Db, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(userIds.filter((id) => UUID.test(id)))].slice(0, 100)
  if (ids.length === 0) return out
  try {
    const { data, error } = await db.from("profiles").select("id, username").in("id", ids)
    if (error) return out
    const missing: string[] = []
    for (const r of (data as { id: string; username: string | null }[] | null) ?? []) {
      if (r.username) out.set(r.id, r.username)
      else missing.push(r.id)
    }
    for (const id of missing.slice(0, 20)) {
      const handle = await ensureUsername(db, id)
      if (handle) out.set(id, handle)
    }
  } catch {
    /* Whatever was found is returned. */
  }
  return out
}
