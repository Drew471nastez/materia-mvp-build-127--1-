import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto"

/*
  A BOOKING PAID THROUGH THE PRODUCT CHECKOUT.

  1. The booking is kept with payment_status "unpaid" and a hold until
     payment_due_at (30 minutes, native_form_book, SQL part 375).
  2. The visitor's Pay button opens /checkout?productId=…&booking=<token>.
     The token is the booking id signed for that product, so an id typed by
     hand or carried to another product is refused.
  3. /api/checkout/stripe-session checks the token and the booking (still
     unpaid, still held, this product), records the amount and currency it
     is about to charge on the booking, and puts the booking id and that
     amount in the PaymentIntent's metadata (BOOKING_METADATA_KEY).
  4. The existing Stripe webhook, on payment_intent.succeeded, confirms the
     booking once, only when the product, the currency and the amount
     received match what the booking recorded. A repeated event changes
     nothing; the visitor's confirmation email is a job unique per booking.
  5. A failed payment marks it failed and leaves it unconfirmed; a full
     refund cancels it. A hold that runs out unpaid is cancelled by the cron
     and its time is free again.

  The decisions are pure functions here, so tests/forms-booking-payment.test.ts
  checks them without Stripe or a database.
*/

export const BOOKING_METADATA_KEY = "form_booking"
export const BOOKING_AMOUNT_KEY = "form_booking_amount"
export const BOOKING_HOLD_MINUTES = 30
/** Starting checkout again may extend the hold, but never past this long after booking. */
export const BOOKING_HOLD_MAX_MINUTES = 120

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

function key(): Buffer {
  const own = process.env.COMMERCE_SECRETS_KEY
  const base = own || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("No key to sign booking payments with: set COMMERCE_SECRETS_KEY")
  return Buffer.from(hkdfSync("sha256", Buffer.from(base, "utf8"), Buffer.from("storelib-booking-payment"), Buffer.from(own ? "own" : "service"), 32))
}
const sig = (bookingId: string, productId: string) =>
  createHmac("sha256", key()).update(`booking-pay:v1:${bookingId.toLowerCase()}:${productId.toLowerCase()}`).digest("base64url").slice(0, 22)

export function bookingCheckoutToken(bookingId: string, productId: string): string {
  return `${bookingId.toLowerCase()}.${sig(bookingId, productId)}`
}

/** The booking id when the token was signed for this product, else null. */
export function readBookingToken(token: unknown, productId: unknown): string | null {
  if (typeof token !== "string" || typeof productId !== "string" || !UUID.test(productId)) return null
  const m = /^([\da-f-]{36})\.([A-Za-z0-9_-]{22})$/.exec(token)
  if (!m || !UUID.test(m[1])) return null
  const want = Buffer.from(sig(m[1], productId))
  const got = Buffer.from(m[2])
  return want.length === got.length && timingSafeEqual(want, got) ? m[1].toLowerCase() : null
}

export interface BookingPaymentRow {
  id: string
  owner_id: string
  form_id: string
  submission_id: string
  status: "pending" | "confirmed" | "declined" | "cancelled"
  payment_status: "none" | "unpaid" | "paid" | "failed" | "refunded" | "review"
  payment_product_id: string | null
  payment_due_at: string | null
  payment_amount_cents: number | null
  payment_currency: string | null
  payment_intent_id: string | null
  created_at: string
}

/** May a checkout start for this booking now? An error the buyer reads, or null. */
export function checkoutProblem(b: BookingPaymentRow | null, productId: string, now = Date.now()): string | null {
  if (!b) return "This booking could not be found. Book the time again."
  if (b.payment_product_id !== productId) return "This booking is paid with another product."
  if (b.payment_status === "paid") return "This booking is already paid."
  if (b.status !== "pending" || !["unpaid", "failed"].includes(b.payment_status)) return "This booking is no longer waiting for payment. Book the time again."
  if (b.payment_due_at && Date.parse(b.payment_due_at) <= now) return "The time was held for 30 minutes and has been released. Book it again."
  return null
}

/** The hold after a checkout starts: at least 15 more minutes, never past the cap. */
export function extendedHold(b: Pick<BookingPaymentRow, "payment_due_at" | "created_at">, now = Date.now()): string {
  const cap = Date.parse(b.created_at) + BOOKING_HOLD_MAX_MINUTES * 60_000
  const current = b.payment_due_at ? Date.parse(b.payment_due_at) : now
  return new Date(Math.min(cap, Math.max(current, now + 15 * 60_000))).toISOString()
}

export interface PaidIntent {
  id: string
  status: string
  amount: number
  amount_received: number
  currency: string
  metadata: Record<string, string | undefined>
}

export type PaymentVerdict =
  | { kind: "ignore" }
  | { kind: "duplicate" }
  | { kind: "confirm" }
  | { kind: "late" }
  | { kind: "review"; reason: string }

/**
 * What a succeeded PaymentIntent does to its booking. Only a full payment
 * of the recorded amount, in the recorded currency, for the booking's own
 * product confirms it.
 */
export function paymentVerdict(b: BookingPaymentRow | null, pi: PaidIntent): PaymentVerdict {
  if (!b) return { kind: "ignore" }
  if (b.payment_status === "paid") return b.payment_intent_id === pi.id ? { kind: "duplicate" } : { kind: "review", reason: "A second payment arrived for a booking already paid." }
  if (pi.status !== "succeeded") return { kind: "ignore" }
  if (!b.payment_product_id || pi.metadata.product_id !== b.payment_product_id) return { kind: "review", reason: "The payment was for another product." }
  if (!b.payment_currency || pi.currency.toLowerCase() !== b.payment_currency.toLowerCase()) return { kind: "review", reason: "The payment was in another currency." }
  const recorded = b.payment_amount_cents ?? -1
  if (recorded <= 0 || pi.amount_received < recorded || Number(pi.metadata[BOOKING_AMOUNT_KEY]) !== recorded) return { kind: "review", reason: "The amount paid does not match the booking." }
  if (b.status === "cancelled" || b.status === "declined") return { kind: "late" }
  return { kind: "confirm" }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }
const COLUMNS = "id,owner_id,form_id,submission_id,status,payment_status,payment_product_id,payment_due_at,payment_amount_cents,payment_currency,payment_intent_id,created_at"

/**
 * Called by /api/checkout/stripe-session before it creates the PaymentIntent:
 * the metadata to add, or the buyer's error. Records the amount about to be
 * charged so the webhook can compare against it.
 */
export async function prepareBookingCheckout(
  db: Db,
  input: { token: unknown; productId: string; chargeCents: number; currency: string; now?: number },
): Promise<{ ok: true; metadata: Record<string, string> } | { ok: false; error: string }> {
  const id = readBookingToken(input.token, input.productId)
  if (!id) return { ok: false, error: "This booking link is not valid. Book the time again." }
  const { data, error } = await db.from("form_bookings").select(COLUMNS).eq("id", id).maybeSingle()
  if (error) return { ok: false, error: "The booking could not be checked. Try again." }
  const b = data as BookingPaymentRow | null
  const problem = checkoutProblem(b, input.productId, input.now)
  if (problem) return { ok: false, error: problem }
  const { data: held, error: holdError } = await db
    .from("form_bookings")
    .update({ payment_amount_cents: input.chargeCents, payment_currency: input.currency.toLowerCase(), payment_due_at: extendedHold(b!, input.now) })
    .eq("id", id)
    .eq("status", "pending")
    .in("payment_status", ["unpaid", "failed"])
    .select("id")
  if (holdError || !held?.length) return { ok: false, error: "This booking is no longer waiting for payment. Book the time again." }
  return { ok: true, metadata: { [BOOKING_METADATA_KEY]: id, [BOOKING_AMOUNT_KEY]: String(input.chargeCents) } }
}

export type QueueEmail = (b: BookingPaymentRow) => Promise<void>

/** payment_intent.succeeded. Idempotent: a repeated event, or one that lost a race, changes nothing. */
export async function applyBookingPayment(db: Db, pi: PaidIntent, queueEmail: QueueEmail, now = new Date().toISOString()): Promise<PaymentVerdict> {
  const id = pi.metadata[BOOKING_METADATA_KEY]
  if (!id || !UUID.test(id)) return { kind: "ignore" }
  const { data, error } = await db.from("form_bookings").select(COLUMNS).eq("id", id).maybeSingle()
  if (error) throw new Error("booking read failed")
  const b = data as BookingPaymentRow | null
  const verdict = paymentVerdict(b, pi)
  if (verdict.kind === "confirm") {
    const { data: rows, error: e } = await db
      .from("form_bookings")
      .update({ status: "confirmed", decided_at: now, payment_status: "paid", payment_intent_id: pi.id, paid_at: now, payment_note: null })
      .eq("id", id)
      .eq("status", "pending")
      .in("payment_status", ["unpaid", "failed"])
      .select("id")
    if (e) throw new Error("booking confirm failed")
    if (rows?.length) await queueEmail(b!)
    else return { kind: "duplicate" }
  } else if (verdict.kind === "late") {
    /* Paid after the hold ran out: confirm it if the time is still free, else keep the payment on record for the owner to refund. */
    const { data: rows, error: e } = await db
      .from("form_bookings")
      .update({ status: "confirmed", decided_at: now, payment_status: "paid", payment_intent_id: pi.id, paid_at: now, payment_note: null })
      .eq("id", id)
      .eq("status", "cancelled")
      .in("payment_status", ["unpaid", "failed"])
      .select("id")
    if (!e && rows?.length) {
      await queueEmail(b!)
      return { kind: "confirm" }
    }
    await db
      .from("form_bookings")
      .update({ payment_status: "review", payment_intent_id: pi.id, paid_at: now, payment_note: "Paid after the hold ran out and the time was taken. Refund it or book another time." })
      .eq("id", id)
      .in("payment_status", ["unpaid", "failed"])
  } else if (verdict.kind === "review") {
    await db.from("form_bookings").update({ payment_status: "review", payment_intent_id: pi.id, payment_note: verdict.reason }).eq("id", id).neq("payment_status", "paid")
  }
  return verdict
}

/** payment_intent.payment_failed: never confirmed; the hold runs out as usual. */
export async function applyBookingFailure(db: Db, pi: Pick<PaidIntent, "id" | "metadata">): Promise<boolean> {
  const id = pi.metadata[BOOKING_METADATA_KEY]
  if (!id || !UUID.test(id)) return false
  const { data } = await db.from("form_bookings").update({ payment_status: "failed", payment_intent_id: pi.id }).eq("id", id).eq("payment_status", "unpaid").select("id")
  return !!data?.length
}

/** charge.refunded in full: the paid booking is cancelled and its time freed. */
export async function applyBookingRefund(db: Db, intentId: string, now = new Date().toISOString()): Promise<boolean> {
  const { data } = await db
    .from("form_bookings")
    .update({ payment_status: "refunded", status: "cancelled", decided_at: now })
    .eq("payment_intent_id", intentId)
    .in("payment_status", ["paid", "review"])
    .select("id")
  return !!data?.length
}

/** The cron: unpaid holds past their time are cancelled, freeing the slot. */
export async function expireUnpaidBookings(db: Db, now = new Date().toISOString(), ownerId?: string): Promise<number> {
  let q = db
    .from("form_bookings")
    .update({ status: "cancelled", decided_at: now, payment_note: "The hold ran out before payment." })
  if (ownerId) q = q.eq("owner_id", ownerId)
  const { data, error } = await q
    .eq("status", "pending")
    .in("payment_status", ["unpaid", "failed"])
    .lt("payment_due_at", now)
    .select("id")
  return error ? 0 : data?.length || 0
}
