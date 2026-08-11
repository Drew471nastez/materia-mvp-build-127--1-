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
 * configuration — an env var, a profile marked official, or the reserved
 * "storelib" handle — and in an environment where none of the three is present
 * every function below returns null quietly. A missing migration behaves the
 * same way: the insert fails, the error is logged, and the inbox renders the
 * conversations that do exist. Messaging must never go down because a
 * marketing feature is half-configured.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The reserved handle. It tie-breaks when more than one profile carries the
 * official flag, and it resolves the account on its own when the flag is not
 * available. Safe as an identifier because lib/reserved-words.ts lists it, so
 * no ordinary account can ever hold it.
 */
const SYSTEM_USERNAME = "storelib"

/**
 * The welcome note, sent once, at the moment the thread comes into existence.
 * Short on purpose: it is the first thing a new user reads in their inbox, and
 * its whole job is to explain why Storelib is writing to them.
 *
 * The last line used to read "scrie-ne direct aici — îți răspundem". It was
 * true of the composer and never true of anybody reading: replies landed in a
 * thread owned by a service account with no inbox behind it. The composer is
 * gone from this thread now, so the invitation had to go with it — copy that
 * asks for something the screen no longer offers is the worst of both.
 */
const WELCOME_RO = [
  "Bine ai venit pe Storelib! 💜",
  "Aici îți trimitem noutăți despre aplicație și sfaturi care te ajută să vinzi mai repede.",
  "Ai o întrebare? Găsești răspunsurile și formularul de contact în Centrul de ajutor.",
].join("\n\n")

export type OfficialProfile = {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  is_official?: boolean | null
  /** Ships with 20260731_presence.sql; absent means "we cannot tell", which the
   *  UI must render as nothing rather than as offline. */
  last_seen_at?: string | null
}

/**
 * Storelib's own face, for the one account that will never upload one.
 *
 * The official thread sits in every inbox and was showing the letter avatar —
 * a violet circle with an S in it — which is the correct fallback for a person
 * and the wrong one for the platform: the brand has a mark, and a thread from
 * Storelib that does not carry it looks like a thread from a user called
 * Storelib. Applied at read time rather than written into the profile row so it
 * follows the asset, and only when the account has not set one of its own.
 */
export const STORELIB_AVATAR_URL =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"

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
 * preferring the reserved handle if several are flagged; and failing that, the
 * profile holding the reserved handle itself.
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
    // The flag is the primary credential: it is set by a migration or by an
    // operator's UPDATE, so nothing a signup flow can reach ever grants it.
    // Among flagged profiles the reserved handle wins, and the username
    // ordering makes the tie-break deterministic rather than whatever the
    // planner returns first.
    //
    // is_official arrives with 20260804_system_account.sql; before it, this
    // query errors instead of returning rows, and the handle lookup below is
    // what keeps the account resolvable in that window.
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

  try {
    // Fall back to the handle. This used to be refused on the grounds that
    // anyone could register "storelib" — but they cannot: it sits in
    // RESERVED_WORDS, and validateUsername in lib/reserved-words.ts rejects it
    // on every path that lets someone choose a username. So the handle is a
    // second operator-controlled credential rather than a public one, and
    // leaning on it is what makes 20260805_storelib_seed.sql work on a
    // deployment whose is_official column is missing or whose flag an operator
    // has not yet set — no env var, no redeploy.
    const { data: byHandle } = await admin
      .from("profiles")
      .select("id")
      .eq("username", SYSTEM_USERNAME)
      .limit(1)
      .maybeSingle()
    if (byHandle?.id) {
      cachedId = byHandle.id as string
      return cachedId
    }
  } catch (e: any) {
    console.error("[system-account] handle lookup failed:", e?.message || e)
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
    // Both optional columns in one select. They ship in the same consolidated
    // script, so a database that has one has the other — and asking for them
    // separately would be a second round trip on every inbox render to cover a
    // combination that does not occur.
    const withFlag = await admin
      .from("profiles")
      .select("id, display_name, username, avatar_url, is_official, last_seen_at")
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
