/**
 * ===========================================================================
 *  ONE PRESS OF ADD, ONE WEBSITE, HOWEVER OFTEN IT IS SENT (round 27)
 * ===========================================================================
 * The owner: "sometimes it says Storelib doesn't respond / things are not
 * added correctly". A press whose answer was lost (a dropped connection, a
 * gateway that gave up while the function finished) was pressed again and
 * made a second copy of the same theme in a seven-website library.
 *
 * The page now sends a key with each press (`key`, kept for that theme until
 * an answer says yes or no, so a retry carries the same one; the browser
 * half is ./add-attempt-client.ts). The server writes the key into the new
 * website's settings, beside the listing note (`compat.add_key` in the
 * compatible profile, `marketplace_add_key` otherwise; no new column), and:
 *
 *   before adding   a website of this store already carrying the key is the
 *                   answer (`replay: true`), nothing is made;
 *   at once twice   a second request with the key while the first is still
 *                   running on this server waits for it, then finds it;
 *   on two servers  after adding, the websites carrying the key are counted:
 *                   the oldest stays, a younger one (this request's) is
 *                   removed and the oldest is the answer.
 *
 * A press without a key works as before. Server only (the service role).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

/** A key as the page makes it (crypto.randomUUID, or a fallback of the same alphabet). */
export const ADD_KEY_RE = /^[A-Za-z0-9_-]{8,80}$/
export const ADD_KEY_SETTING = "marketplace_add_key"

export function isAddKey(v: unknown): v is string {
  return typeof v === "string" && ADD_KEY_RE.test(v)
}

/** The settings with the key written where the listing note is. */
export function withAddKey(settings: Record<string, unknown>, key: string): Record<string, unknown> {
  return settings.compat && typeof settings.compat === "object"
    ? { ...settings, compat: { ...(settings.compat as Record<string, unknown>), add_key: key } }
    : { ...settings, [ADD_KEY_SETTING]: key }
}

/** The key a website was added with, or null. */
export function addKeyOfSettings(settings: unknown): string | null {
  if (!settings || typeof settings !== "object") return null
  const s = settings as Record<string, unknown>
  const inCompat = s.compat && typeof s.compat === "object" ? (s.compat as Record<string, unknown>).add_key : undefined
  const k = typeof inCompat === "string" ? inCompat : s[ADD_KEY_SETTING]
  return isAddKey(k) ? k : null
}

export type KeyedInstall = { id: string; name: string; created_at: string | null }

/**
 * This store's websites that carry the key, oldest first. Two small reads:
 * the store's websites (seven at most), then which of their settings name
 * the key (filtered by the database, only ids come back).
 */
export async function installsWithAddKey(admin: Admin, creatorId: string, key: string): Promise<KeyedInstall[]> {
  if (!isAddKey(key)) return []
  const { data: installs, error } = await admin.from("store_theme_installs").select("id, name, created_at").eq("creator_id", creatorId)
  if (error || !Array.isArray(installs) || installs.length === 0) return []
  const ids = (installs as KeyedInstall[]).map((i) => i.id)
  const { data: marked, error: markErr } = await admin
    .from("store_theme_settings")
    .select("install_id")
    .in("install_id", ids)
    .or(`settings->>${ADD_KEY_SETTING}.eq.${key},settings->compat->>add_key.eq.${key}`)
  if (markErr || !Array.isArray(marked)) return []
  const have = new Set((marked as { install_id: string }[]).map((m) => m.install_id))
  return (installs as KeyedInstall[])
    .filter((i) => have.has(i.id))
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id))
}

/**
 * After adding `installId` with `key`: the oldest website with the key
 * stays. When that is not this one, this one is removed (with its rows) and
 * the oldest is answered. A read that fails keeps this one.
 */
export async function oneWebsitePerKey(admin: Admin, creatorId: string, key: string, installId: string): Promise<KeyedInstall | null> {
  const all = await installsWithAddKey(admin, creatorId, key)
  const first = all[0]
  if (!first || first.id === installId) return null
  await admin.from("store_theme_installs").delete().eq("id", installId).eq("creator_id", creatorId)
  return first
}

/*
  The same key twice at once on this server: the second waits for the first.
  Keyed by the key alone (a random value of the page's): what is shared is
  only "wait", never an answer; each request then reads its own store.
*/
const going = new Map<string, Promise<unknown>>()

/** Run `work` for the key; a second call with the same key while it runs waits for it first, then runs its own `work`. */
export async function oncePerKey<T>(key: string | null, work: () => Promise<T>): Promise<T> {
  if (!key) return work()
  const before = going.get(key)
  if (before) await before.catch(() => undefined)
  const p = work()
  going.set(key, p)
  try {
    return await p
  } finally {
    if (going.get(key) === p) going.delete(key)
  }
}
