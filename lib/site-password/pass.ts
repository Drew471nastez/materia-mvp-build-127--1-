/**
 * ===========================================================================
 *  THE PASS A VISITOR GETS FOR TYPING A WEBSITE'S PASSWORD
 * ===========================================================================
 * A creator can ask visitors for a password before their published website
 * shows (Website Settings, Publishing; lib/site-password/store.ts). Typing
 * the right one on the password page gives the browser a pass: a signed
 * note in an httpOnly cookie on that website's own host, which the proxy
 * reads on every page (lib/site-password/proxy-gate.ts).
 *
 *   p1.<claims, base64url JSON>.<HMAC-SHA256 of both, base64url>
 *
 * A pass names the creator, the exact host and the password's VERSION. A new
 * password is a new version, so every pass made for the old one stops
 * working the moment it is saved, without a list of passes to revoke.
 *
 * Two kinds:
 *
 *   pass     the cookie. Thirty days.
 *   owner    the hand off that lets the site's owner in: minted on
 *            storelib.com after checking who is signed in there
 *            (app/api/site-password/owner), carried once in a link to the
 *            website, and exchanged there for a pass. Two minutes, with an
 *            id that is spent the first time it is used.
 *
 * Web Crypto rather than node:crypto, so the same code runs in the proxy and
 * in a route. The key is SITE_ACCOUNT_SECRET when one is set, otherwise one
 * derived from the service role key, under a label of its own, the way
 * lib/site-accounts/token.ts derives its key: a signature made here means
 * nothing anywhere else.
 */

export const PASS_TTL_MS = 30 * 24 * 60 * 60_000
export const OWNER_TTL_MS = 2 * 60_000

const VERSION = "p1"
const MAX_TOKEN = 2048
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HOST = /^[a-z0-9.-]{1,253}(:\d{1,5})?$/
const B64URL = /^[A-Za-z0-9_-]+$/

export interface PassClaims {
  t: "pass" | "owner"
  /** The creator whose website this is. */
  c: string
  /** The host, e.g. "maralind.storelib.com". */
  h: string
  /** The password's version when the pass was made. */
  v: number
  /** Expiry, ms. */
  e: number
  /** The owner hand off's own id, spent once. */
  j?: string
  /** The owner hand off's signed in Storelib user, recorded when it is spent. */
  u?: string
}

const SESSION_NAME = "sl_site_pass"

function isLocal(host: string): boolean {
  const bare = host.split(":")[0]
  return bare === "localhost" || bare === "127.0.0.1"
}

/** The cookie's name on this host: __Host- prefixed wherever it can be Secure, so no other website under storelib.com can set it. */
export function passCookieName(host: string): string {
  return isLocal(host) ? SESSION_NAME : `__Host-${SESSION_NAME}`
}

export function passCookie(host: string) {
  return { httpOnly: true, secure: !isLocal(host), sameSite: "lax" as const, path: "/", maxAge: Math.floor(PASS_TTL_MS / 1000) }
}

/* ─── Bytes ─────────────────────────────────────────────────────────────── */

const encoder = new TextEncoder()

function toB64url(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromB64url(text: string): Uint8Array | null {
  if (!B64URL.test(text)) return null
  try {
    const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4))
    const out = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/* ─── The key ───────────────────────────────────────────────────────────── */

let keyFor: { base: string; key: Promise<CryptoKey> } | null = null

function baseSecret(): string | null {
  const own = process.env.SITE_ACCOUNT_SECRET
  if (own && own.length >= 32) return own
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return service.length >= 16 ? service : null
}

async function signingKey(): Promise<CryptoKey | null> {
  const base = baseSecret()
  if (!base) return null
  if (keyFor?.base === base) return keyFor.key
  const key = (async () => {
    const outer = await crypto.subtle.importKey("raw", encoder.encode(base), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const derived = await crypto.subtle.sign("HMAC", outer, encoder.encode("storelib:site-password:v1"))
    return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
  })()
  keyFor = { base, key }
  return key
}

/* ─── Minting and reading ───────────────────────────────────────────────── */

export async function mintPass(claims: PassClaims): Promise<string | null> {
  if (!UUID.test(claims.c) || !HOST.test(claims.h) || !Number.isInteger(claims.v) || claims.v < 1) return null
  if (claims.t === "owner" && (!claims.j || !UUID.test(claims.j) || !claims.u || !UUID.test(claims.u))) return null
  const key = await signingKey()
  if (!key) return null
  const body = `${VERSION}.${toB64url(encoder.encode(JSON.stringify(claims)))}`
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)))
  return `${body}.${toB64url(mac)}`
}

/** The claims, when this server signed the token and nothing in it is off. Null otherwise. */
export async function readPass(token: unknown, now = Date.now()): Promise<PassClaims | null> {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN) return null
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== VERSION) return null
  const mac = fromB64url(parts[2])
  const json = fromB64url(parts[1])
  if (!mac || !json) return null
  const key = await signingKey()
  if (!key) return null
  /* crypto.subtle.verify compares in constant time. */
  const ok = await crypto.subtle.verify("HMAC", key, mac, encoder.encode(`${parts[0]}.${parts[1]}`)).catch(() => false)
  if (!ok) return null
  let c: Record<string, unknown>
  try {
    const parsed = JSON.parse(new TextDecoder().decode(json))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    c = parsed as Record<string, unknown>
  } catch {
    return null
  }
  if (c.t !== "pass" && c.t !== "owner") return null
  if (typeof c.c !== "string" || !UUID.test(c.c)) return null
  if (typeof c.h !== "string" || !HOST.test(c.h)) return null
  if (typeof c.v !== "number" || !Number.isInteger(c.v) || c.v < 1) return null
  if (typeof c.e !== "number" || !Number.isFinite(c.e) || c.e <= now) return null
  const ttl = c.t === "owner" ? OWNER_TTL_MS : PASS_TTL_MS
  if (c.e > now + ttl + 5_000) return null
  if (c.t === "owner" && (typeof c.j !== "string" || !UUID.test(c.j) || typeof c.u !== "string" || !UUID.test(c.u))) return null
  return c as unknown as PassClaims
}

/**
 * Whether a cookie's pass lets this browser into this website now: a pass
 * (not a hand off), signed here, for this creator, this exact host and the
 * password as it is now.
 */
export async function passHolds(token: unknown, expect: { creatorId: string; host: string; version: number }, now = Date.now()): Promise<boolean> {
  const claims = await readPass(token, now)
  if (!claims || claims.t !== "pass") return false
  return claims.c === expect.creatorId && claims.h === expect.host.trim().toLowerCase() && claims.v === expect.version
}
