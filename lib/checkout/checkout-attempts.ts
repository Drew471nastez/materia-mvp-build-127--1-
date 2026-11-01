/**
 * ===========================================================================
 *  ONE ORDER, ONE PAYMENTINTENT, HOWEVER OFTEN PAY IS PRESSED (PAY-9)
 * ===========================================================================
 * The product checkout (app/api/checkout/stripe-session) puts fresh tokens on
 * every PaymentIntent it makes (the access token, the session fingerprint,
 * the receipt token, the time the terms were agreed). A key made from the
 * request could never repeat, so a second press or a retried request made a
 * second PaymentIntent.
 *
 * With run-now part 352 (checkout_attempts), the page sends one attempt id per
 * checkout view. The route keys a row on that id, the store, the product, the
 * buyer's email and a hash of what is charged (amount, currency, choices; the
 * tokens left out). The first request writes fresh tokens on the row; a later
 * one for the same order reads them back, so Stripe sees the same request
 * under the same idempotency key (the row's id) and answers the first
 * PaymentIntent. A changed order hashes differently: a new row, new tokens, a
 * new key, never Stripe's "same key, different parameters" refusal.
 *
 * The tokens always come from the server (nanoid, generateReceiptToken),
 * never from the browser's id: knowing the id does not open a receipt.
 *
 * Without the table (PGRST205 / 42P01), or on any database error, every
 * function here answers null and the route works exactly as before: fresh
 * tokens and its own short-lived key.
 */
import { createHash } from "node:crypto"
import { stableJson } from "@/lib/stripe/resilience"

/** What the route needs from its Supabase admin client (kept loose so tests and the route share it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any }

export const ATTEMPTS_TABLE = "checkout_attempts"
/** As long as Stripe keeps an idempotency key. */
export const ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000
/** A database that does not answer quickly is skipped: the payment never waits on this. */
const ATTEMPT_DEADLINE_MS = 3000
/** The metadata keys that change from request to request and are kept on the row instead. */
export const ATTEMPT_TOKEN_KEYS = ["access_token", "session_fingerprint", "receipt_token", "agreed_at"] as const

export interface AttemptTokens {
  accessToken: string
  sessionFingerprint: string
  receiptToken: string
  agreedAt: string
}

export interface CheckoutAttempt extends AttemptTokens {
  id: string
  paymentIntentId: string | null
}

export interface AttemptScope {
  attemptId: string
  /** "intent" (the card form) or "wallet" (the app's Apple Pay and Google Pay sheet). */
  kind: string
  creatorId: string
  productId: string
  email: string
  /** orderHash() of what is sent to Stripe. */
  paramsHash: string
}

/** The page's attempt id, when it sent a usable one: letters, digits, dashes, 16 to 64 of them (a UUID). Anything else is no attempt. */
export function attemptIdFrom(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null
}

/** A copy of the Stripe params with the per-request tokens in every `metadata` masked (an access token only as set or not). */
function masked(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(masked)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "metadata" && v && typeof v === "object" && !Array.isArray(v)) {
      const m: Record<string, unknown> = { ...(v as Record<string, unknown>) }
      for (const t of ATTEMPT_TOKEN_KEYS) if (t in m) m[t] = t === "access_token" ? (m[t] ? "set" : "") : "-"
      out[k] = m
    } else out[k] = masked(v)
  }
  return out
}

/** What is charged and for what, without the tokens: the same order always hashes the same, any change to amount, currency or choices does not. */
export function orderHash(kind: string, params: unknown): string {
  return createHash("sha256").update(`${kind}|${stableJson(masked(params))}`).digest("hex")
}

/** The row's key. The browser's id is one part of it; the store, product, email and order hash are the server's. */
export function attemptKey(s: AttemptScope): string {
  return createHash("sha256").update(`pay9:v1|${s.attemptId}|${s.kind}|${s.creatorId}|${s.productId}|${s.email.toLowerCase()}|${s.paramsHash}`).digest("hex")
}

/** Puts an attempt's tokens on the metadata the PaymentIntent carries (only keys already there; no access token for a signed in buyer). */
export function applyAttemptTokens(metadata: Record<string, string>, t: AttemptTokens, signedIn: boolean) {
  if ("access_token" in metadata) metadata.access_token = signedIn ? "" : t.accessToken
  if ("session_fingerprint" in metadata) metadata.session_fingerprint = t.sessionFingerprint
  if ("receipt_token" in metadata) metadata.receipt_token = t.receiptToken
  if ("agreed_at" in metadata) metadata.agreed_at = t.agreedAt
}

/** Stripe's refusal of a key used again with other parameters (the SDK's StripeIdempotencyError). */
export function isIdempotencyMismatch(error: unknown): boolean {
  const e = error as { type?: string; rawType?: string; message?: string } | null
  if (!e) return false
  return e.type === "StripeIdempotencyError" || e.rawType === "idempotency_error" || /idempotent requests can only be used with the same parameters/i.test(e.message ?? "")
}

/* ── The table ─────────────────────────────────────────────────────────── */

const COLUMNS = "id, access_token, session_fingerprint, receipt_token, agreed_at, payment_intent_id, expires_at"
const MISSING_RETRY_MS = 5 * 60 * 1000
/** Until when this instance knows the table is not there (one failed request every few minutes, not one per checkout). */
let missingUntil = 0

function tableMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "PGRST205" || error.code === "42P01" || /could not find the table|relation .* does not exist/i.test(error.message ?? ""))
}

/** For tests: forget that the table was missing. */
export function resetCheckoutAttemptsCache() {
  missingUntil = 0
}

function deadline<T extends { abortSignal?: (s: AbortSignal) => T }>(q: T): T {
  return typeof q.abortSignal === "function" ? q.abortSignal(AbortSignal.timeout(ATTEMPT_DEADLINE_MS)) : q
}

type Row = { id: string; access_token: string | null; session_fingerprint: string; receipt_token: string; agreed_at: string; payment_intent_id: string | null; expires_at: string | null }

function toAttempt(r: Row): CheckoutAttempt {
  /* timestamptz comes back as "+00:00"; the PaymentIntent was made with toISOString's "Z". The same instant, the same string. */
  const t = new Date(r.agreed_at)
  return {
    id: r.id,
    accessToken: r.access_token ?? "",
    sessionFingerprint: r.session_fingerprint,
    receiptToken: r.receipt_token,
    agreedAt: Number.isNaN(t.getTime()) ? r.agreed_at : t.toISOString(),
    paymentIntentId: r.payment_intent_id ?? null,
  }
}

/** Insert, or read the row already there. null: no table, an error, or nothing came back. */
async function insertOrRead(admin: Admin, key: string, s: AttemptScope, fresh: AttemptTokens): Promise<Row | null | "missing"> {
  const now = Date.now()
  const row = {
    attempt_key: key,
    creator_id: s.creatorId,
    product_id: s.productId,
    buyer_email: s.email.toLowerCase(),
    access_token: fresh.accessToken,
    session_fingerprint: fresh.sessionFingerprint,
    receipt_token: fresh.receiptToken,
    agreed_at: fresh.agreedAt,
    params_hash: s.paramsHash,
    expires_at: new Date(now + ATTEMPT_TTL_MS).toISOString(),
  }
  const ins = await deadline(admin.from(ATTEMPTS_TABLE).upsert(row, { onConflict: "attempt_key", ignoreDuplicates: true }).select(COLUMNS))
  if (ins.error) return tableMissing(ins.error) ? "missing" : null
  const made = (ins.data as Row[] | null)?.[0]
  if (made) return made
  const read = await deadline(admin.from(ATTEMPTS_TABLE).select(COLUMNS).eq("attempt_key", key).maybeSingle())
  if (read.error) return tableMissing(read.error) ? "missing" : null
  return (read.data as Row | null) ?? null
}

/**
 * The attempt for this order: the row already there (its tokens), or a new
 * one with `fresh`. A row past its 24 hours is replaced, since Stripe has
 * forgotten its key. null: work as before (no table, or the database did not
 * answer).
 */
export async function openCheckoutAttempt(admin: Admin, s: AttemptScope, fresh: AttemptTokens): Promise<CheckoutAttempt | null> {
  if (missingUntil > Date.now()) return null
  const key = attemptKey(s)
  try {
    for (let round = 0; round < 2; round++) {
      const got = await insertOrRead(admin, key, s, fresh)
      if (got === "missing") {
        missingUntil = Date.now() + MISSING_RETRY_MS
        return null
      }
      if (!got) return null
      const expired = got.expires_at ? new Date(got.expires_at).getTime() <= Date.now() : false
      if (!expired) return toAttempt(got)
      const del = await deadline(admin.from(ATTEMPTS_TABLE).delete().eq("id", got.id))
      if (del.error) return null
    }
    return null
  } catch {
    return null
  }
}

/**
 * A new attempt for the same order, with `fresh` tokens: after Stripe refused
 * the key (its parameters no longer match) or answered a PaymentIntent that
 * can no longer be paid (canceled). The old row goes; a new row (a new id, so
 * a new key) takes its place. null: no row could be made, work as before.
 */
export async function renewCheckoutAttempt(admin: Admin, stale: CheckoutAttempt, s: AttemptScope, fresh: AttemptTokens): Promise<CheckoutAttempt | null> {
  try {
    const del = await deadline(admin.from(ATTEMPTS_TABLE).delete().eq("id", stale.id))
    if (del.error) return null
  } catch {
    return null
  }
  return openCheckoutAttempt(admin, s, fresh)
}

/** The PaymentIntent (or Checkout Session) made for the attempt, written on its row. Never fails the checkout. */
export async function recordAttemptIntent(admin: Admin, attemptId: string, intentId: string) {
  try {
    await deadline(admin.from(ATTEMPTS_TABLE).update({ payment_intent_id: intentId }).eq("id", attemptId).is("payment_intent_id", null))
  } catch {
    /* only a record */
  }
}

/** Rows past their 24 hours, deleted now and then by the checkout itself (they hold tokens: kept no longer than needed). */
export async function pruneExpiredAttempts(admin: Admin, now = Date.now()) {
  try {
    await deadline(admin.from(ATTEMPTS_TABLE).delete().lt("expires_at", new Date(now).toISOString()))
  } catch {
    /* next time */
  }
}
