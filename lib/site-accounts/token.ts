import "server-only"

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * ===========================================================================
 *  TWO SIGNED NOTES, AND NEITHER OF THEM IS A SESSION TO STORELIB
 * ===========================================================================
 * A visitor to a creator's website signs in on storelib.com, because that is
 * where their account and its session live, and the session cookie there is
 * host-only on purpose. The website still needs to know who came back, so
 * the platform hands it two things, one after the other:
 *
 *   A CODE      made by storelib.com the moment the visitor says "continue",
 *               carried in the redirect to the website, good for two minutes
 *               and exchanged once (the exchange records its id in Postgres,
 *               lib/site-accounts/codes.ts). It names the person, the
 *               creator, the exact host it may be exchanged on, the state the
 *               website set in this browser before it sent them, and the
 *               path to land on.
 *
 *   A SESSION   what the website's own route writes after the exchange: an
 *               httpOnly cookie on the website's host, signed, naming the
 *               person, the creator and the host, for fourteen days. It lets
 *               that website show the person their purchases from that
 *               creator and keep their saved items. It is not a Supabase
 *               session and cannot become one: nothing reads it on
 *               storelib.com, and it carries no Supabase token.
 *
 *     <version>.<claims, base64url JSON>.<HMAC-SHA256 of both, base64url>
 *
 * THE KEY is SITE_ACCOUNT_SECRET when one is set, and otherwise one derived
 * from the service role key, the same fallback lib/website-builder/cover-pass
 * and lib/orders/signed-link use: already server-only, already configured.
 * Derived under a label of its own, so a signature made here means nothing
 * anywhere else that key signs.
 */

export const CODE_TTL_MS = 2 * 60_000
export const SESSION_TTL_MS = 14 * 24 * 60 * 60_000
/** How long the website waits for the visitor to come back from signing in. */
export const STATE_TTL_S = 30 * 60

const VERSION = "v1"
const MAX_TOKEN = 2048

export interface CodeClaims {
  t: "c"
  /** The person, by auth user id. */
  u: string
  /** The creator whose website this is. */
  c: string
  /** The host the code may be exchanged on, e.g. "maralind.storelib.com". */
  h: string
  /** The state the website set in this browser before sending them. */
  s: string
  /** Where on the website to land, a path. */
  r: string
  /** Expiry, ms since the epoch. */
  e: number
  /** This code's id, which the exchange records so it is used once. */
  j: string
}

export interface SessionClaims {
  t: "s"
  u: string
  c: string
  h: string
  /** Issued at, ms. */
  i: number
  e: number
}

function signingKey(): Buffer | null {
  const own = process.env.SITE_ACCOUNT_SECRET
  if (own && own.length >= 32) return createHmac("sha256", own).update("storelib:site-account:v1").digest()
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (base.length < 16) return null
  return createHmac("sha256", base).update("storelib:site-account:v1").digest()
}

function mac(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(body).digest("base64url")
}

const B64URL = /^[A-Za-z0-9_-]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A host as the browser sends it: letters, digits, dots, hyphens, an optional port. */
const HOST = /^[a-z0-9.-]{1,253}(:\d{1,5})?$/
const STATE = /^[A-Za-z0-9_-]{32,64}$/
const JTI = /^[A-Za-z0-9_-]{16,64}$/

function sign(claims: CodeClaims | SessionClaims): string | null {
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

export function isState(value: unknown): value is string {
  return typeof value === "string" && STATE.test(value)
}

/** A fresh random value for the state cookie: 32 bytes, base64url. */
export function newState(): string {
  return randomBytes(32).toString("base64url")
}

export function newCodeId(): string {
  return randomBytes(18).toString("base64url")
}

export function mintCode(
  input: { userId: string; creatorId: string; host: string; state: string; returnPath: string },
  now = Date.now(),
): string | null {
  if (!UUID.test(input.userId) || !UUID.test(input.creatorId)) return null
  if (!HOST.test(input.host) || !isState(input.state) || !isSitePath(input.returnPath)) return null
  return sign({ t: "c", u: input.userId, c: input.creatorId, h: input.host, s: input.state, r: input.returnPath, e: now + CODE_TTL_MS, j: newCodeId() })
}

export function readCode(token: unknown, now = Date.now()): CodeClaims | null {
  const c = open(token)
  if (!c || c.t !== "c") return null
  if (typeof c.u !== "string" || !UUID.test(c.u)) return null
  if (typeof c.c !== "string" || !UUID.test(c.c)) return null
  if (typeof c.h !== "string" || !HOST.test(c.h)) return null
  if (!isState(c.s) || !isSitePath(c.r)) return null
  if (typeof c.j !== "string" || !JTI.test(c.j)) return null
  if (typeof c.e !== "number" || !Number.isFinite(c.e) || c.e <= now) return null
  /* A code is never good for longer than it is made for, whatever it says. */
  if (c.e > now + CODE_TTL_MS + 5_000) return null
  return c as unknown as CodeClaims
}

export function mintSession(input: { userId: string; creatorId: string; host: string }, now = Date.now()): string | null {
  if (!UUID.test(input.userId) || !UUID.test(input.creatorId) || !HOST.test(input.host)) return null
  return sign({ t: "s", u: input.userId, c: input.creatorId, h: input.host, i: now, e: now + SESSION_TTL_MS })
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

/**
 * The consent form's proof that it was drawn by this server for this person,
 * this website and this state, in the last ten minutes. The POST that grants
 * a code checks it beside the request's Origin, so a page elsewhere cannot
 * make somebody's browser grant one by submitting a form of its own.
 */
export const FORM_TTL_MS = 10 * 60_000

export function formProof(input: { userId: string; returnUrl: string; state: string }, now = Date.now()): string | null {
  const key = signingKey()
  if (!key) return null
  const at = now.toString(36)
  return `${at}.${mac(key, `form.${input.userId}.${input.returnUrl}.${input.state}.${at}`)}`
}

export function checkFormProof(proof: unknown, input: { userId: string; returnUrl: string; state: string }, now = Date.now()): boolean {
  const key = signingKey()
  if (!key || typeof proof !== "string" || proof.length > 200) return false
  const [at, sig] = proof.split(".")
  if (!at || !sig || !/^[a-z0-9]{1,12}$/.test(at) || !B64URL.test(sig)) return false
  const issued = Number.parseInt(at, 36)
  if (!Number.isFinite(issued) || issued > now + 60_000 || now - issued > FORM_TTL_MS) return false
  const given = Buffer.from(sig, "base64url")
  const expected = Buffer.from(mac(key, `form.${input.userId}.${input.returnUrl}.${input.state}.${at}`), "base64url")
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Constant time, for the state the browser sent against the one in the code. */
export function sameState(a: unknown, b: unknown): boolean {
  if (!isState(a) || !isState(b)) return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
