import "server-only"

/**
 * ===========================================================================
 *  A PLACE UNDER A CODE'S USE LIMIT, HELD FROM PAY TO THE ORDER
 * ===========================================================================
 * A use is counted when the order is made (recordCouponUse), and a code's
 * limit was checked when the payment started. Between the two there was a
 * gap: with one use left, two buyers pressing Pay together both passed the
 * check, both paid, and the code was used once more than its limit allowed.
 *
 * Now a payment that starts with a limited code first takes a place under
 * the limit, in one statement in the database (hold_coupon_use, run-now
 * part 31): the code's row is locked, the places still held are counted
 * with the uses, and a new place is only given while there is room. The
 * second buyer is told the code has been used up before anything is charged.
 *
 *   taken     at payment start: the card checkout (stripe-session), the
 *             basket (checkout/cart), and the free routes;
 *   turned    into the use when the order is made, in one statement that
 *             counts the use and drops the place (use_coupon_hold);
 *   given up  when the payment could not be started or the order could not
 *             be written, and otherwise after COUPON_HOLD_SECONDS, so a
 *             buyer who walks away does not keep a place for ever. A
 *             basket's Stripe page is made to expire before its place.
 *
 * WHO HOLDS IT. The card checkout makes a new PaymentIntent on every press
 * of Pay, so a declined card and a second try would otherwise hold two
 * places. The holder is the buyer's address (hashed: the table needs to tell
 * two buyers apart, not to know who they are), and a second try refreshes
 * the same place. A basket's holder is the signed in buyer, or a random id
 * this browser keeps in a cookie, for the same reason: back from Stripe and
 * Check out again is the same place.
 *
 * NEVER A NEW WAY TO FAIL A PAYMENT. Until part 31 has run, and whenever the
 * database cannot be asked, the answer is yes and the checkout behaves as it
 * did before: the only new refusal is the database saying there is no room.
 */
import { createHash, randomBytes } from "node:crypto"
import type { CouponRow } from "./coupons"

type Db = { rpc?: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** How long a started payment keeps its place. A basket's Stripe page is made to expire before this. */
export const COUPON_HOLD_SECONDS = 35 * 60
/** A basket's Stripe page, when it holds a place: Stripe's shortest allowed life is 30 minutes. */
export const HELD_SESSION_SECONDS = 31 * 60

/** The holder for a buyer's address: the same address is the same holder, and the table never sees it. */
export function holderForEmail(email: string): string {
  return `e:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 40)}`
}

/** A holder of its own, for a browser nobody has an address for yet (a basket going to Stripe's page), kept in HOLD_COOKIE. */
export function newHolder(): string {
  return `s:${randomBytes(16).toString("hex")}`
}

/** The cookie a guest's browser keeps its holder in, so a second Check out refreshes the same place. */
export const HOLD_COOKIE = "storelib_code_hold"

/** A holder this module made, and nothing else: the cookie is the browser's to send. */
export function isHolder(value: string): boolean {
  return /^s:[0-9a-f]{32}$/.test(value)
}

/** Whether the code needs a place held at all: only a code with a use limit does. */
export function needsHold(coupon: Pick<CouponRow, "usage_limit"> | null | undefined): coupon is CouponRow {
  return !!coupon && coupon.usage_limit !== null && coupon.usage_limit !== undefined
}

/**
 * Takes (or refreshes) this holder's place under the code's limit. False
 * only when the database answered that there is no room left.
 */
export async function holdCouponUse(db: Db, couponId: string, holder: string): Promise<boolean> {
  if (!db.rpc || !couponId || !holder) return true
  try {
    const { data, error } = await db.rpc("hold_coupon_use", { p_coupon_id: couponId, p_holder: holder, p_seconds: COUPON_HOLD_SECONDS })
    if (error) return true
    return data !== false
  } catch {
    return true
  }
}

/** Gives the place back, when the payment it was for will not happen. Never throws. */
export async function releaseCouponHold(db: Db, couponId: string | null | undefined, holder: string | null | undefined): Promise<void> {
  if (!db.rpc || !couponId || !holder) return
  try {
    await db.rpc("release_coupon_hold", { p_coupon_id: couponId, p_holder: holder })
  } catch {
    /* it expires on its own */
  }
}
