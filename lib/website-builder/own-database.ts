/**
 * ===========================================================================
 *  A WEBSITE'S OWN SUPABASE
 * ===========================================================================
 * An advanced, opt-in connection: a creator who keeps their own data in a
 * Supabase project (a waitlist, a guestbook, a leaderboard) can let a
 * section's script read and write it. Website Settings › Connections takes
 * two things and nothing else:
 *
 *   the project URL   https://<ref>.supabase.co, or the project's own domain
 *   the PUBLIC key    the anon key, or a publishable key (sb_publishable_…)
 *
 * Both are public by design: Supabase ships the anon key to every browser,
 * and what it can reach is decided by the project's own Row Level Security.
 * They are stored with the site's theme settings and handed only to a
 * section that declares the `database` capability (lib/storelib-theme/
 * storelib/script.ts), through `storelib.database` in its sandbox.
 *
 * A SECRET KEY IS REFUSED EVERYWHERE. A service role JWT or an sb_secret_
 * key bypasses RLS, and a website is public: one pasted here would be one
 * every visitor could read. The settings field will not save it, and
 * `ownDatabase` will not hand one to a section even if one got stored some
 * other way. Pure, so the field, the renderer and the tests share it.
 */

export const OWN_DB_URL = "own_db_url"
export const OWN_DB_KEY = "own_db_key"

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

/** The project's address, as an origin: https only, no path, no credentials. */
export function checkDatabaseUrl(raw: unknown): Checked<string> {
  const text = typeof raw === "string" ? raw.trim() : ""
  if (!text) return { ok: false, error: "Paste the project URL from Supabase › Project Settings › API." }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { ok: false, error: "That is not an address. It looks like https://abcd.supabase.co." }
  }
  if (url.protocol !== "https:") return { ok: false, error: "The project URL starts with https://." }
  if (url.username || url.password) return { ok: false, error: "The project URL has no name or password in it." }
  if (!/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes(".")) return { ok: false, error: "That is not a project address." }
  return { ok: true, value: url.origin }
}

function jwtRole(token: string): string | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
    const json = typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("utf8")
    const role = (JSON.parse(json) as { role?: unknown }).role
    return typeof role === "string" ? role : null
  } catch {
    return null
  }
}

const SECRET = "That is a secret key. It can read and change everything in your project, and a website shows its settings to every visitor, so it never goes here. Use the anon or publishable key."

/** The public key, or why not. */
export function checkPublicKey(raw: unknown): Checked<string> {
  const key = typeof raw === "string" ? raw.trim() : ""
  if (!key) return { ok: false, error: "Paste the anon or publishable key from Supabase › Project Settings › API." }
  if (/^sb_secret_/i.test(key)) return { ok: false, error: SECRET }
  if (/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key)) return { ok: true, value: key }
  const role = jwtRole(key)
  if (role === "service_role" || (role && role !== "anon")) return { ok: false, error: SECRET }
  if (role === "anon") return { ok: true, value: key }
  return { ok: false, error: "That is not a Supabase key. The anon key is a long string in three parts; a publishable key starts with sb_publishable_." }
}

/** The connection a section may use, or null: nothing set, half set, or anything but a public key. */
export function ownDatabase(settings: Record<string, unknown> | null | undefined): { url: string; key: string } | null {
  if (!settings) return null
  const url = checkDatabaseUrl(settings[OWN_DB_URL])
  const key = checkPublicKey(settings[OWN_DB_KEY])
  return url.ok && key.ok ? { url: url.value, key: key.value } : null
}
