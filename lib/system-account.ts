import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * The official Storelib account.
 *
 * Storelib appears in the inbox as a verified correspondent rather than as a
 * seller: it sends product news and selling tips, and people can reply to it
 * for support. Its thread is created lazily, the first time someone opens
 * their inbox, so a brand-new account never lands on an empty page — and so
 * there is no backfill job to run when this ships.
 *
 * Everything here is best-effort by design. The account is identified by
 * configuration (an env var, or a profile someone marked official), and in an
 * environment where nobody has done either — which is every environment until
 * an operator acts — every function below returns null quietly. A missing
 * migration behaves the same way: the insert fails, the error is logged, and
 * the inbox renders the conversations that do exist. Messaging must never go
 * down because a marketing feature is half-configured.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Tie-breaker when more than one profile carries the official flag. */
const SYSTEM_USERNAME = "storelib"

/**
 * The welcome note, sent once, at the moment the thread comes into existence.
 * Short on purpose: it is the first thing a new user reads in their inbox, and
 * its whole job is to explain why Storelib is writing to them and that the
 * reply box works.
 */
const WELCOME_RO = [
  "Bine ai venit pe Storelib! 💜",
  "Aici îți trimitem noutăți despre aplicație și sfaturi care te ajută să vinzi mai repede.",
  "Dacă ai o întrebare, scrie-ne direct aici — îți răspundem.",
].join("\n\n")

export type OfficialProfile = {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  is_official?: boolean | null
}

/**
 * Resolution is memoised per process because it never changes at runtime, and
 * the inbox would otherwise pay a profiles lookup on every request. A negative
 * answer is cached too, but only briefly: an operator who seeds the account
 * should see it appear within minutes rather than after the next deploy.
 */
let cachedId: string | null = null
let missUntil = 0
const MISS_TTL_MS = 5 * 60 * 1000

/**
 * Whether profiles.is_official exists yet. Same bargain as the id above: once
 * the column is seen it is permanent, but its absence is only believed for a
 * few minutes, so running the migration takes effect without a redeploy. This
 * is what keeps the pre-migration state from paying two profile queries on
 * every single inbox load.
 */
let hasOfficialColumn = false
let columnMissUntil = 0

/**
 * The auth user id behind the official account, or null when nobody has
 * configured one. STORELIB_SYSTEM_USER_ID wins because it is unambiguous;
 * otherwise the account is whichever profile an operator flagged is_official,
 * preferring the reserved handle if several are flagged.
 */
export async function getSystemUserId(admin: SupabaseClient): Promise<string | null> {
  if (cachedId) return cachedId
  if (Date.now() < missUntil) return null

  const fromEnv = process.env.STORELIB_SYSTEM_USER_ID?.trim()
  if (fromEnv && UUID_RE.test(fromEnv)) {
    cachedId = fromEnv
    return cachedId
  }

  try {
    // The flag is the credential, never the handle on its own: "storelib" is
    // not a reserved username, so anyone could register it, and an account
    // that gets to impersonate the platform in every inbox is not a risk worth
    // carrying for the convenience of a name lookup. Among flagged profiles
    // the reserved handle wins, and the username ordering makes the fallback
    // deterministic rather than whatever the planner returns first.
    //
    // is_official arrives with 20260804_system_account.sql; before it, this
    // query errors instead of returning rows, which reads as "not configured"
    // and is exactly right.
    const { data: official } = await admin
      .from("profiles")
      .select("id, username")
      .eq("is_official", true)
      .order("username", { ascending: true })
      .limit(10)
    if (official?.length) {
      const exact = official.find((p: any) => p.username === SYSTEM_USERNAME)
      cachedId = ((exact ?? official[0]).id as string) ?? null
      if (cachedId) return cachedId
    }
  } catch (e: any) {
    console.error("[system-account] lookup failed:", e?.message || e)
  }

  missUntil = Date.now() + MISS_TTL_MS
  return null
}

/**
 * Find-or-create the caller's thread with Storelib, seeding it with the
 * welcome message on the way in. Returns the conversation id, or null when
 * there is no official account to talk to.
 *
 * The insert runs on the admin client: the welcome message is sent BY Storelib
 * to a conversation the caller has no right to author, and the service role is
 * the only writer that can do both. The unique index on (buyer_id) where
 * kind = 'system' is what makes the race safe — two tabs opening the inbox at
 * once produce one thread and one loser, and the loser re-reads it.
 */
export async function ensureSystemConversation(admin: SupabaseClient, userId: string): Promise<string | null> {
  if (!userId) return null
  const systemId = await getSystemUserId(admin)
  if (!systemId) return null
  // conversations_distinct_parties forbids a thread with yourself, so the
  // official account simply does not get one. It has no inbox to fill anyway.
  if (systemId === userId) return null

  try {
    const existing = await findSystemConversation(admin, userId)
    if (existing) return existing

    const { data: created, error: createErr } = await admin
      .from("conversations")
      .insert({ listing_id: null, buyer_id: userId, seller_id: systemId, kind: "system" })
      .select("id")
      .single()

    if (createErr || !created) {
      // A unique violation means another request won the race; anything else
      // means the migration has not run, and both resolve the same way — look
      // again, and give up quietly if there is still nothing.
      const raced = await findSystemConversation(admin, userId)
      if (raced) return raced
      console.error("[system-account] could not create system conversation:", createErr?.message)
      return null
    }

    const { error: msgErr } = await admin.from("messages").insert({
      conversation_id: created.id,
      sender_id: systemId,
      kind: "text",
      body: WELCOME_RO,
    })
    // A thread with no welcome message is odd but harmless — it still renders,
    // and the next broadcast fills it. Worth a log, not worth a rollback.
    if (msgErr) console.error("[system-account] welcome message failed:", msgErr.message)

    return created.id as string
  } catch (e: any) {
    console.error("[system-account] ensure failed:", e?.message || e)
    return null
  }
}

async function findSystemConversation(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("conversations")
    .select("id")
    .eq("buyer_id", userId)
    .eq("kind", "system")
    .maybeSingle()
  return (data?.id as string) ?? null
}

/**
 * Profiles for the inbox, with the official flag when the column exists.
 *
 * The fallback is the point: is_official ships with 20260804, and a deployment
 * that runs code ahead of migrations would otherwise turn every inbox into a
 * 500 over a decoration. Both routes go through here so that dance lives in
 * one place.
 */
export async function fetchProfilesWithOfficial(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, OfficialProfile>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()

  if (hasOfficialColumn || Date.now() >= columnMissUntil) {
    const withFlag = await admin
      .from("profiles")
      .select("id, display_name, username, avatar_url, is_official")
      .in("id", unique)
    if (!withFlag.error) {
      hasOfficialColumn = true
      return new Map((withFlag.data ?? []).map((p: any) => [p.id as string, p as OfficialProfile]))
    }
    columnMissUntil = Date.now() + MISS_TTL_MS
  }

  const plain = await admin.from("profiles").select("id, display_name, username, avatar_url").in("id", unique)
  return new Map((plain.data ?? []).map((p: any) => [p.id as string, p as OfficialProfile]))
}

/** One rule for the blue check, so the inbox and the thread can never disagree. */
export function isOfficialProfile(profile: OfficialProfile | null, systemId: string | null): boolean {
  if (!profile) return false
  return profile.is_official === true || (systemId !== null && profile.id === systemId)
}
