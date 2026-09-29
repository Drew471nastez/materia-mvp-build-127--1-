/**
 * ===========================================================================
 *  IS THIS REALLY AIRWALLEX, AND WHAT IS IT ABOUT
 * ===========================================================================
 * Airwallex signs every webhook: `x-signature` is the hex HMAC SHA-256 of the
 * `x-timestamp` header (milliseconds, as a string) followed by the RAW body,
 * keyed with the notification URL's own secret. So the body is verified as
 * the exact bytes that arrived, before anything parses it.
 *
 * THE TIMESTAMP WINDOW IS DAYS, NOT MINUTES. Airwallex retries a failed
 * delivery for about three days and does not say whether a retry is signed
 * afresh. A five minute window would throw away every event that arrived
 * while this endpoint was down, which is exactly when they matter. A replay
 * of a genuine event does no harm here anyway: each event id is handled once
 * (payment_webhook_events), and handling one only re-reads the resource from
 * Airwallex, so an old event cannot move money or set an old state.
 *
 * Then the event is read loosely. Airwallex's own examples name the account
 * `account_id` in some events and `accountId` in others, and newer events and
 * fields appear with newer API versions, so this pulls out the few things
 * Storelib routes on and ignores the rest.
 *
 * Pure: no database, no network. The route (app/api/payments/airwallex/
 * webhook) and the tests both use it.
 */

import { createHmac, timingSafeEqual } from "node:crypto"

/** How far an event's timestamp may be from now: the retry window, and a day to spare. */
export const WEBHOOK_TOLERANCE_MS = 4 * 24 * 60 * 60_000

export type Verdict = { ok: true } | { ok: false; reason: "no_secret" | "missing_headers" | "bad_timestamp" | "stale" | "bad_signature" }

export function verifyAirwallexSignature(input: {
  rawBody: string
  timestamp: string | null
  signature: string | null
  secret: string | null
  now?: number
}): Verdict {
  if (!input.secret) return { ok: false, reason: "no_secret" }
  if (!input.timestamp || !input.signature) return { ok: false, reason: "missing_headers" }
  if (!/^\d{10,16}$/.test(input.timestamp)) return { ok: false, reason: "bad_timestamp" }
  const expected = createHmac("sha256", input.secret).update(input.timestamp + input.rawBody).digest("hex")
  const given = input.signature.trim().toLowerCase()
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(given, "utf8")
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" }
  const at = Number(input.timestamp)
  /* A seconds timestamp (10 digits) is read as seconds; Airwallex sends milliseconds. */
  const atMs = input.timestamp.length <= 10 ? at * 1000 : at
  if (Math.abs((input.now ?? Date.now()) - atMs) > WEBHOOK_TOLERANCE_MS) return { ok: false, reason: "stale" }
  return { ok: true }
}

export interface AirwallexEvent {
  id: string
  name: string
  /** The connected account the event concerns, when it names one. */
  accountId: string | null
  /** The resource the event is about (`data.object`, or `data` itself on older account events). */
  object: Record<string, unknown> | null
  /** When Airwallex made the event. Used to order, since delivery order is not guaranteed. */
  createdAt: string | null
  version: string | null
}

export function parseAirwallexEvent(rawBody: string): AirwallexEvent | null {
  let j: unknown
  try {
    j = JSON.parse(rawBody)
  } catch {
    return null
  }
  if (!j || typeof j !== "object") return null
  const e = j as Record<string, unknown>
  const id = typeof e.id === "string" ? e.id : null
  const name = typeof e.name === "string" ? e.name : null
  if (!id || !name) return null
  const accountId = str(e.account_id) ?? str(e.accountId)
  const data = e.data && typeof e.data === "object" ? (e.data as Record<string, unknown>) : null
  const object = data && data.object && typeof data.object === "object" ? (data.object as Record<string, unknown>) : data
  return {
    id,
    name,
    accountId: accountId && accountId.startsWith("acct_") ? accountId : null,
    object,
    createdAt: str(e.created_at) ?? str(e.createdAt),
    version: str(e.version),
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

/** The families of event Storelib acts on. Anything else is recorded and acknowledged. */
export type EventFamily = "account" | "rfi" | "payment" | "refund" | "dispute" | "split" | "payout" | "other"

export function familyOf(name: string): EventFamily {
  if (name.startsWith("account.")) return "account"
  if (name.startsWith("rfi.")) return "rfi"
  if (name.startsWith("payment_intent.")) return "payment"
  if (name.startsWith("refund.")) return "refund"
  if (name.startsWith("payment_dispute.")) return "dispute"
  if (name.startsWith("funds_split.")) return "split"
  if (name.startsWith("payout.transfer.")) return "payout"
  return "other"
}
