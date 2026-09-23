/**
 * ===========================================================================
 *  DISCOUNT CODES, CHECKED WHERE THE MONEY IS
 * ===========================================================================
 * A code used to be checked by the page, and the page then showed a smaller
 * total that nothing on the server knew about: the payment was created for
 * the full price. Now the same rules run in three places from this one
 * module: the Apply button's check, the free checkout, and the payment's
 * own amount. What a buyer is shown and what they are charged cannot differ.
 *
 * TWO HOLES CLOSED ON THE WAY:
 *   - the code was matched with `ilike`, so `%` matched any active code of
 *     that creator. The pattern characters are escaped now, and the match is
 *     case-insensitive equality and nothing else;
 *   - usage was counted by an open endpoint the page called after paying,
 *     so anybody could use up anybody's code. It is counted here, by the
 *     server, once, when an order is created with it.
 */

type Db = { from: (table: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CouponRow {
  id: string
  code: string
  creator_id: string
  discount_type: "percentage" | "fixed" | string
  discount_value: number | string
  starts_at: string | null
  expires_at: string | null
  usage_limit: number | null
  usage_count: number | null
  product_ids: string[] | null
  is_active: boolean
  min_purchase_cents?: number | null
}

export type CouponCheck =
  | { ok: true; coupon: CouponRow; discountCents: number; label: string }
  | { ok: false; error: string }

/** The longest code worth looking up. Anything longer is not a code. */
export const MAX_CODE_LENGTH = 64

/** `%`, `_` and `\` mean something to LIKE; in a code they mean themselves. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** A code as typed, trimmed, or null when it cannot be one. */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const code = raw.trim()
  if (!code || code.length > MAX_CODE_LENGTH) return null
  /* Printable characters only: a code is something a person types. */
  if (/[\u0000-\u001f\u007f]/.test(code)) return null
  return code
}

/** What the code takes off this price, never more than the price. */
export function discountFor(coupon: Pick<CouponRow, "discount_type" | "discount_value">, priceCents: number): number {
  const value = Number(coupon.discount_value)
  if (!Number.isFinite(value) || value <= 0 || priceCents <= 0) return 0
  const cents =
    coupon.discount_type === "percentage"
      ? Math.round(priceCents * (Math.min(value, 100) / 100))
      : /* fixed: stored in dollars */ Math.round(value * 100)
  return Math.max(0, Math.min(cents, priceCents))
}

export function couponLabel(coupon: Pick<CouponRow, "discount_type" | "discount_value">): string {
  const value = Number(coupon.discount_value)
  return coupon.discount_type === "percentage" ? `${value}%` : `$${value.toFixed(2)}`
}

/** Every rule a found code must pass, without a database. */
export function checkCoupon(
  coupon: CouponRow | null,
  opts: { productId: string; priceCents: number; now?: Date },
): CouponCheck {
  if (!coupon || coupon.is_active !== true) return { ok: false, error: "That code is not valid." }
  const now = (opts.now ?? new Date()).getTime()
  if (coupon.starts_at && Date.parse(coupon.starts_at) > now) return { ok: false, error: "That code is not active yet." }
  if (coupon.expires_at && Date.parse(coupon.expires_at) < now) return { ok: false, error: "That code has expired." }
  if (coupon.usage_limit !== null && coupon.usage_limit !== undefined && (coupon.usage_count ?? 0) >= coupon.usage_limit) {
    return { ok: false, error: "That code has been used up." }
  }
  if (Array.isArray(coupon.product_ids) && coupon.product_ids.length > 0 && !coupon.product_ids.includes(opts.productId)) {
    return { ok: false, error: "That code does not apply to this product." }
  }
  if (coupon.min_purchase_cents && opts.priceCents < coupon.min_purchase_cents) {
    return { ok: false, error: `That code needs an order of at least $${(coupon.min_purchase_cents / 100).toFixed(2)}.` }
  }
  const discountCents = discountFor(coupon, opts.priceCents)
  if (discountCents <= 0) return { ok: false, error: "That code takes nothing off this price." }
  return { ok: true, coupon, discountCents, label: couponLabel(coupon) }
}

/** One creator's code, matched exactly and without regard to case. */
export async function findCoupon(db: Db, creatorId: string, code: string): Promise<CouponRow | null> {
  const { data, error } = await db
    .from("coupons")
    .select("*")
    .eq("creator_id", creatorId)
    .ilike("code", escapeLike(code))
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  /* Belt and braces: the database matched it; the row must equal it too. */
  return String((data as CouponRow).code).toLowerCase() === code.toLowerCase() ? (data as CouponRow) : null
}

export async function validateCoupon(
  db: Db,
  opts: { creatorId: string; productId: string; code: unknown; priceCents: number },
): Promise<CouponCheck> {
  const code = normaliseCode(opts.code)
  if (!code) return { ok: false, error: "That code is not valid." }
  return checkCoupon(await findCoupon(db, opts.creatorId, code), { productId: opts.productId, priceCents: opts.priceCents })
}

/**
 * Counts one use of a code, from the server, when an order is created with
 * it. Never allowed to fail the order it belongs to.
 */
export async function recordCouponUse(db: Db, couponId: string | null | undefined): Promise<void> {
  if (!couponId) return
  try {
    const rpc = db.rpc ? await db.rpc("increment_coupon_usage", { coupon_id: couponId }) : { error: true }
    if (!rpc?.error) return
    const { data } = await db.from("coupons").select("usage_count").eq("id", couponId).maybeSingle()
    if (data) await db.from("coupons").update({ usage_count: (data.usage_count || 0) + 1 }).eq("id", couponId)
  } catch {
    /* the order stands */
  }
}
