import "server-only"

import { createHmac, randomInt, timingSafeEqual } from "node:crypto"

/**
 * ===========================================================================
 *  THE SIGNED NOTES A CREATOR'S WEBSITE KEEPS ABOUT ITS CUSTOMERS
 * ===========================================================================
 * A visitor signs in to a creator's website the way Shopify's customer
 * accounts work: they type their email on the website, get a six digit code
 * by email, type it back, and are signed in. A new email makes the account
 * there and then. Nothing here is a Storelib login: the account is a row in
 * `site_customers` for this one creator (lib/site-accounts/customers.ts), and
 * no Supabase user, profile or creator row is ever made or read for it.
 *
 * Two signed notes carry the state between the steps, both in httpOnly
 * cookies on the website's own host (lib/site-accounts/session.ts):
 *
 *   PENDING    written when a code is sent: which code row this browser is
 *              waiting on, the email it went to (shown on the code step),
 *              the creator, the exact host, and where to land afterwards.
 *              Thirty minutes, so "Send a new code" still knows the email
 *              after a code runs out. It proves nothing on its own: the code
 *              does.
 *
 *   SESSION    written when the code is right: the customer's id, the
 *              creator and the host, for fourteen days. It lets that website
 *              show the customer their orders from that creator and keep
 *              their saved items, and nothing else.
 *
 *     <version>.<claims, base64url JSON>.<HMAC-SHA256 of both, base64url>
 *
 * THE CODE ITSELF is never stored: the row keeps an HMAC of it under the
 * row's own id, so a read of the table gives nobody a code to type.
 *
 * THE KEY is SITE_ACCOUNT_SECRET when one is set, and otherwise one derived
 * from the service role key, the same fallback lib/website-builder/cover-pass
 * and lib/orders/signed-link use: already server-only, already configured.
 * Derived under a label of its own, so a signature made here means nothing
 * anywhere else that key signs.
 *
 * VERSION 2. The first version named a Storelib user; this one names a
 * customer. A version 1 session is not read at all, so nobody signed in the
 * old way is taken for a customer with the same id.
 */

/** How long a code can be typed. */
export const CODE_TTL_MS = 10 * 60_000
/** Wrong codes a code survives. The fifth wrong one ends it (and the table's check says the same). */
export const CODE_TRIES = 5
/** How long the code step is shown for, so a new code can be sent to the same email. */
export const PENDING_TTL_MS = 30 * 60_000
export const SESSION_TTL_MS = 14 * 24 * 60 * 60_000

const VERSION = "v2"
const MAX_TOKEN = 2048

export interface PendingClaims {
  t: "p"
  /** The code row this browser is waiting on. */
  k: string
  /** The email the code went to, lower case. */
  m: string
  /** The creator whose website this is. */
  c: string
  /** The host, e.g. "maralind.storelib.com". */
  h: string
  /** Where on the website to land once signed in, a path. */
  r: string
  e: number
}

export interface SessionClaims {
  t: "s"
  /** The customer, a site_customers id. */
  u: string
  c: string
  h: string
  /** Issued at, ms. */
  i: number
  e: number
}

function signingKey(): Buffer | null {
  const own = process.env.SITE_ACCOUNT_SECRET
  if (own && own.length >= 32) return createHmac("sha256", own).update("storelib:site-account:v2").digest()
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (base.length < 16) return null
  return createHmac("sha256", base).update("storelib:site-account:v2").digest()
}

function mac(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(body).digest("base64url")
}

const B64URL = /^[A-Za-z0-9_-]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A host as the browser sends it: letters, digits, dots, hyphens, an optional port. */
const HOST = /^[a-z0-9.-]{1,253}(:\d{1,5})?$/
/** An email as it is kept: lower case, one @, no spaces, at most 254 characters. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

/**
 * An email a visitor typed, as it is kept: trimmed, lower case, and only
 * when it is shaped like an address. Null otherwise.
 */
export function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const email = value.trim().toLowerCase()
  if (email.length < 6 || email.length > 254 || !EMAIL.test(email)) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>"'`\\]/.test(email)) return null
  return email
}

function sign(claims: PendingClaims | SessionClaims): string | null {
  const key = signingKey()
  if (!key) return null
  const body = `${VERSION}.${Buffer.from(JSON.stringify(claims), "utf8").toString("base64url")}`
  return `${body}.${mac(key, body)}`
}

/** The claims, when this server signed the token and nothing in it is off. Null otherwise. */
function open(token: unknown): Record<string, unknown> | null {
  const key = signingKey()
  if (!key || typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN) return null
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== VERSION || !B64URL.test(parts[1]) || !B64URL.test(parts[2])) return null
  const given = Buffer.from(parts[2], "base64url")
  const expected = Buffer.from(mac(key, `${parts[0]}.${parts[1]}`), "base64url")
  /* Length first: timingSafeEqual throws on a mismatch rather than answering. */
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
    return claims && typeof claims === "object" && !Array.isArray(claims) ? (claims as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** A path on the website: one slash, then anything but a second one or a backslash. */
export function isSitePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 512 &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/\\") &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f\s\\]/.test(path)
  )
}

/* ─── The code ──────────────────────────────────────────────────────────── */

/** Six digits from the system's random source, leading zeros kept. */
export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

/** What a visitor typed, as six digits: spaces and dashes they added are dropped. Null when it is not a code. */
export function cleanCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 32) return null
  const digits = value.replace(/[\s-]/g, "")
  return /^\d{6}$/.test(digits) ? digits : null
}

/** What the table keeps instead of the code: an HMAC under the row's id. Null when no key is configured. */
export function codeHash(codeId: string, code: string): string | null {
  const key = signingKey()
  if (!key) return null
  return mac(key, `site-code.${codeId}.${code}`)
}

/** Constant time, for a hash worked out now against the one the row keeps. */
export function sameHash(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || a.length > 200) return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/* ─── Pending: the code step ────────────────────────────────────────────── */

export function mintPending(
  input: { codeId: string; email: string; creatorId: string; host: string; returnPath: string },
  now = Date.now(),
): string | null {
  if (!UUID.test(input.codeId) || !UUID.test(input.creatorId) || !HOST.test(input.host)) return null
  if (cleanEmail(input.email) !== input.email || !isSitePath(input.returnPath)) return null
  return sign({ t: "p", k: input.codeId, m: input.email, c: input.creatorId, h: input.host, r: input.returnPath, e: now + PENDING_TTL_MS })
}

export function readPending(token: unknown, now = Date.now()): PendingClaims | null {
  const c = open(token)
  if (!c || c.t !== "p") return null
  if (typeof c.k !== "string" || !UUID.test(c.k)) return null
  if (typeof c.c !== "string" || !UUID.test(c.c)) return null
  if (typeof c.h !== "string" || !HOST.test(c.h)) return null
  if (typeof c.m !== "string" || cleanEmail(c.m) !== c.m) return null
  if (!isSitePath(c.r)) return null
  if (typeof c.e !== "number" || !Number.isFinite(c.e) || c.e <= now) return null
  if (c.e > now + PENDING_TTL_MS + 5_000) return null
  return c as unknown as PendingClaims
}

/* ─── The session ───────────────────────────────────────────────────────── */

export function mintSession(input: { customerId: string; creatorId: string; host: string }, now = Date.now()): string | null {
  if (!UUID.test(input.customerId) || !UUID.test(input.creatorId) || !HOST.test(input.host)) return null
  return sign({ t: "s", u: input.customerId, c: input.creatorId, h: input.host, i: now, e: now + SESSION_TTL_MS })
}

export function readSession(token: unknown, now = Date.now()): SessionClaims | null {
  const c = open(token)
  if (!c || c.t !== "s") return null
  if (typeof c.u !== "string" || !UUID.test(c.u)) return null
  if (typeof c.c !== "string" || !UUID.test(c.c)) return null
  if (typeof c.h !== "string" || !HOST.test(c.h)) return null
  if (typeof c.i !== "number" || typeof c.e !== "number" || !Number.isFinite(c.e)) return null
  if (c.e <= now || c.i > now + 60_000) return null
  if (c.e - c.i > SESSION_TTL_MS + 1_000) return null
  return c as unknown as SessionClaims
}
