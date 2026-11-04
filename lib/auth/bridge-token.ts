/**
 * The App Link bridge token (app/app/auth/callback): one row of
 * oauth_bridge_tokens, used once.
 *
 * Nothing in this repository writes that table any more (the Android app now
 * finishes OAuth in its own WebView with PKCE, lib/native-oauth.ts), but the
 * route stays because older app builds open /app/auth/callback through their
 * App Link. While it stays, a token must be single use for real.
 *
 * It used to be read, then deleted in a second statement: two requests that
 * arrived together both read the row before either deleted it, and both got
 * the session. Now the delete IS the read (DELETE ... RETURNING through
 * PostgREST): the database hands the row to exactly one caller, and every
 * other caller, at the same moment or later, gets nothing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The minimal query surface used here: the service role client, or a test's stand in. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export type BridgeSession = { accessToken: string; refreshToken: string; nextPath: string | null }

export type BridgeConsume = { ok: true; session: BridgeSession } | { ok: false; reason: "invalid" | "expired" | "unavailable" }

export async function consumeBridgeToken(db: Db, token: unknown, now: Date = new Date()): Promise<BridgeConsume> {
  if (typeof token !== "string" || !UUID.test(token)) return { ok: false, reason: "invalid" }
  let rows: unknown
  try {
    const { data, error } = await db.from("oauth_bridge_tokens").delete().eq("id", token).select("access_token, refresh_token, next_path, expires_at")
    if (error) return { ok: false, reason: "unavailable" }
    rows = data
  } catch {
    return { ok: false, reason: "unavailable" }
  }
  const row = (Array.isArray(rows) ? rows[0] : null) as { access_token?: unknown; refresh_token?: unknown; next_path?: unknown; expires_at?: unknown } | null
  if (!row) return { ok: false, reason: "invalid" }
  /* Removed either way: an expired token is gone too, and says so. */
  const expires = typeof row.expires_at === "string" ? Date.parse(row.expires_at) : Number.NaN
  if (!Number.isFinite(expires) || expires < now.getTime()) return { ok: false, reason: "expired" }
  if (typeof row.access_token !== "string" || !row.access_token || typeof row.refresh_token !== "string" || !row.refresh_token) return { ok: false, reason: "invalid" }
  return { ok: true, session: { accessToken: row.access_token, refreshToken: row.refresh_token, nextPath: typeof row.next_path === "string" ? row.next_path : null } }
}
