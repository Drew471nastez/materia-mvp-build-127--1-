import { combineChunks, createChunks, isChunkLike, stringFromBase64URL, stringToBase64URL } from "@supabase/ssr"

/**
 * ===========================================================================
 *  ONE SESSION ON THE PHONE, NOT TWO THAT DRIFT APART
 * ===========================================================================
 * The native app kept its session in TWO places, and each one renewed itself
 * on its own:
 *
 *   Capacitor Preferences   the app's own Supabase client
 *                           (lib/supabase/client.ts), refreshed by its timer
 *                           about a minute and a half before the hour is up
 *
 *   the WebView's cookies   read by proxy.ts on every request, and refreshed
 *                           there when the access token has run out
 *
 * They start from the same refresh token (/auth/sync-session copies one into
 * the other) and then each rotates it without telling the other. Supabase
 * forgives a client that presents the token ONE step behind the current one:
 * it hands back the current one. It does not forgive two steps. A copy that
 * has fallen two rotations behind looks exactly like a stolen token being
 * replayed, and Supabase answers that by revoking the whole session: this
 * copy, the other copy, every tab. The person is signed out, with no action of
 * theirs anywhere near it.
 *
 * Two steps behind is not exotic. An hour or two in the website editor, which
 * talks to Supabase from the browser and hardly ever asks the server for a
 * page, rotates the Preferences copy twice while the cookie sits still. The
 * next page load sends the cookie's token, and that was the end of the
 * session.
 *
 * So the two copies are kept as one:
 *
 *   READ    both, and use the one that expires later. A refresh always moves
 *           expiry forward, so the later one is the newest rotation, whoever
 *           made it. If the cookie is newer, Preferences is brought up to it.
 *
 *   WRITE   both. When the app's client rotates the token, the cookie gets the
 *           new one in the same format the server writes (base64url, split
 *           into chunks of 3180 like @supabase/ssr), so the next request the
 *           proxy sees carries the current token and never an old one.
 *
 *   REMOVE  both.
 *
 * Preferences stays, because the WebView can lose its cookies (an OS storage
 * purge, a reinstall of the WebView) and the session must survive that. It is
 * the backup that keeps up, not a second session.
 *
 * Pure except for the cookie string it is handed and the setter it calls, so
 * tests/session-stability.test.ts drives it without a browser.
 */

/**
 * The key supabase-js stores the session under, `sb-<project ref>-auth-token`,
 * which is also the cookie's name. Derived from the project URL the same way
 * supabase-js derives it, never hardcoded.
 */
export function storedSessionKey(): string | null {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!url) return null
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`
  } catch {
    return null
  }
}

/** 400 days: the ceiling browsers put on a cookie, and what @supabase/ssr asks for. */
export const SESSION_COOKIE_MAX_AGE = 400 * 24 * 60 * 60

const BASE64_PREFIX = "base64-"

export function parseCookieHeader(cookieHeader: string): Map<string, string> {
  const jar = new Map<string, string>()
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=")
    if (eq < 1) continue
    const name = part.slice(0, eq).trim()
    let value = part.slice(eq + 1).trim()
    try {
      value = decodeURIComponent(value)
    } catch {
      /* a value that is not URI encoded is used as it is */
    }
    if (!jar.has(name)) jar.set(name, value)
  }
  return jar
}

/** The session stored in the cookie jar under `key`, as the JSON supabase-js stores, or null. */
export async function readSessionFromCookies(key: string, cookieHeader: string): Promise<string | null> {
  const jar = parseCookieHeader(cookieHeader)
  const raw = await combineChunks(key, (name) => jar.get(name) ?? null)
  if (!raw) return null
  if (raw.startsWith(BASE64_PREFIX)) {
    try {
      return stringFromBase64URL(raw.slice(BASE64_PREFIX.length))
    } catch {
      return null
    }
  }
  return raw
}

/**
 * The Set-Cookie strings (for `document.cookie =`) that store `value` under
 * `key` the way the server does, and expire any chunk of an older, longer
 * value that the new one no longer needs.
 */
export function sessionCookieWrites(key: string, value: string, cookieHeader: string, secure: boolean): string[] {
  const attrs = `; path=/; max-age=${SESSION_COOKIE_MAX_AGE}; samesite=lax${secure ? "; secure" : ""}`
  const gone = `; path=/; max-age=0; samesite=lax${secure ? "; secure" : ""}`
  const { set, expire } = sessionCookieChunks(key, value, parseCookieHeader(cookieHeader).keys())
  return [...set.map((c) => `${c.name}=${encodeURIComponent(c.value)}${attrs}`), ...expire.map((name) => `${name}=${gone}`)]
}

/**
 * The same cookies as name and value, for a server response to set (app/api/
 * businesses/switch): the chunks that hold `value` under `key`, and the names
 * of older chunks among `existing` to expire. The value is not URI encoded
 * here; the response's own cookie writer does that.
 */
export function sessionCookieChunks(key: string, value: string, existing: Iterable<string>): { set: { name: string; value: string }[]; expire: string[] } {
  const set = createChunks(key, BASE64_PREFIX + stringToBase64URL(value)).map((c) => ({ name: c.name, value: c.value }))
  const keep = new Set(set.map((c) => c.name))
  const expire: string[] = []
  for (const name of existing) if (isChunkLike(name, key) && !keep.has(name)) expire.push(name)
  return { set, expire }
}

/** Expire every cookie that holds part of the session under `key`. */
export function sessionCookieRemovals(key: string, cookieHeader: string, secure: boolean): string[] {
  const gone = `; path=/; max-age=0; samesite=lax${secure ? "; secure" : ""}`
  return [...parseCookieHeader(cookieHeader).keys()].filter((name) => isChunkLike(name, key)).map((name) => `${name}=${gone}`)
}

function expiresAt(session: string | null): number {
  if (!session) return -1
  try {
    const parsed = JSON.parse(session) as { expires_at?: unknown; refresh_token?: unknown }
    if (typeof parsed?.refresh_token !== "string" || !parsed.refresh_token) return -1
    return typeof parsed.expires_at === "number" ? parsed.expires_at : 0
  } catch {
    return -1
  }
}

/**
 * Of two stored sessions, the newer: the one that expires later. A copy that
 * does not parse, or has no refresh token, never wins. On a tie the device's
 * own copy is kept, so nothing is written for no reason.
 */
export function fresherSession(device: string | null, cookie: string | null): string | null {
  const d = expiresAt(device)
  const c = expiresAt(cookie)
  if (c > d) return cookie
  if (d >= 0) return device
  return null
}

/**
 * A session as supabase-js stores it: the JSON its own storage holds under
 * storedSessionKey(), so a copy written by the server (app/api/businesses/
 * switch) or straight into the jar (lib/businesses/switch-client) reads back
 * exactly as one the client wrote itself.
 */
export function storedSessionJson(
  session: { access_token: string; refresh_token: string; expires_at?: number | null; expires_in?: number | null; token_type?: string | null; user?: unknown },
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const expiresAt = typeof session.expires_at === "number" ? session.expires_at : nowSeconds + (typeof session.expires_in === "number" ? session.expires_in : 3600)
  return JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type || "bearer",
    expires_in: typeof session.expires_in === "number" ? session.expires_in : Math.max(0, expiresAt - nowSeconds),
    expires_at: expiresAt,
    refresh_token: session.refresh_token,
    user: session.user ?? null,
  })
}
