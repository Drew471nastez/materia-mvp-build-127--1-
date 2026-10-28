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

import { apportionFee } from "./cart-items"
import { CODE_PATTERN } from "./coupon-state"
import { couponMinimumError } from "./coupon-scope"
import { SHOP_CURRENCY, shopMoneyIn } from "@/lib/store/shop-money"

/* What the Coupons page also draws in the browser lives in ./coupon-state, which
   has no server import; this file reaches the admin cookie (adminSignedIn), so a
   client component importing it broke the production build. */
export { CODE_PATTERN, COUPON_STATE_LABEL, couponState, type CouponState } from "./coupon-state"

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

/** "10%", or a fixed amount in the store's own currency ("$5.00", "5.00 lei"). */
export function couponLabel(coupon: Pick<CouponRow, "discount_type" | "discount_value">, currency: string = SHOP_CURRENCY): string {
  const value = Number(coupon.discount_value)
  return coupon.discount_type === "percentage" ? `${value}%` : shopMoneyIn(Math.round(value * 100), currency)
}

/** Whether a found code can be used at all right now, whatever it is used on. */
export function couponStanding(coupon: CouponRow | null, now: Date = new Date()): { ok: true; coupon: CouponRow } | { ok: false; error: string } {
  if (!coupon || coupon.is_active !== true) return { ok: false, error: "That code is not valid." }
  const t = now.getTime()
  if (coupon.starts_at && Date.parse(coupon.starts_at) > t) return { ok: false, error: "That code is not active yet." }
  if (coupon.expires_at && Date.parse(coupon.expires_at) < t) return { ok: false, error: "That code has expired." }
  if (coupon.usage_limit !== null && coupon.usage_limit !== undefined && (coupon.usage_count ?? 0) >= coupon.usage_limit) {
    return { ok: false, error: "That code has been used up." }
  }
  return { ok: true, coupon }
}

/** Whether the code's product list lets it take something off this product. No list is every product. */
export function couponCovers(coupon: Pick<CouponRow, "product_ids">, productId: string): boolean {
  return !Array.isArray(coupon.product_ids) || coupon.product_ids.length === 0 || coupon.product_ids.includes(productId)
}

/**
 * ===========================================================================
 *  ONE CODE OVER SEVERAL LINES
 * ===========================================================================
 * A line is one product (or one option of it) at its price times its
 * quantity. The code comes off the lines it applies to: a product of the
 * code's own creator, inside its product list. Every other line is paid in
 * full.
 *
 *   percentage  each line it applies to loses that share of itself, rounded
 *               to the nearest cent, exactly as a single product would;
 *   fixed       the amount comes off the lines it applies to together, never
 *               more than they cost, split in proportion to each line by the
 *               largest remainder (lib/checkout/cart-items apportionFee), so
 *               the parts add up to the amount to the cent and no line goes
 *               below zero.
 *
 * The single product checkout is this with one line (checkCoupon below), so
 * the two cannot price the same product differently.
 */
export interface CouponLine {
  productId: string
  creatorId: string
  /** The line's price times its quantity, in cents. */
  cents: number
}

export type CouponLinesCheck =
  | { ok: true; coupon: CouponRow; discounts: number[]; discountCents: number; label: string }
  | { ok: false; error: string }

/** What the code takes off each line, given which lines it applies to. */
export function lineDiscounts(coupon: Pick<CouponRow, "discount_type" | "discount_value">, lines: number[], applies: boolean[]): number[] {
  if (coupon.discount_type === "percentage") return lines.map((cents, i) => (applies[i] ? discountFor(coupon, cents) : 0))
  const eligible = lines.map((cents, i) => (applies[i] ? Math.max(0, cents) : 0))
  const amount = discountFor(coupon, eligible.reduce((n, c) => n + c, 0))
  return apportionFee(amount, eligible)
}

export function checkCouponLines(
  coupon: CouponRow | null,
  lines: CouponLine[],
  opts: {
    now?: Date
    notCovered?: string
    currency?: string
    /** Which lines the code is for, when it is more than its product list: its collections, physical products only (./coupon-scope digitalCoverage). */
    covers?: ((line: CouponLine) => boolean) | null
  } = {},
): CouponLinesCheck {
  const standing = couponStanding(coupon, opts.now)
  if (standing.ok === false) return standing
  const c = standing.coupon
  const covers = opts.covers ?? ((l: CouponLine) => couponCovers(c, l.productId))
  const applies = lines.map((l) => l.creatorId === c.creator_id && covers(l))
  if (!applies.some(Boolean)) return { ok: false, error: opts.notCovered ?? "That code does not apply to anything in your cart." }
  /* The minimum is held to the covered lines after offers, before this code (./coupon-scope couponMinimumError): `cents` are already after offers here. */
  const short = couponMinimumError(c, lines.map((l) => l.cents), applies, opts.currency)
  if (short) return { ok: false, error: short }
  const discounts = lineDiscounts(c, lines.map((l) => l.cents), applies)
  const discountCents = discounts.reduce((n, d) => n + d, 0)
  if (discountCents <= 0) return { ok: false, error: "That code takes nothing off this price." }
  return { ok: true, coupon: c, discounts, discountCents, label: couponLabel(c, opts.currency) }
}

/** Every rule a found code must pass for one product, without a database: one line of the above. */
export function checkCoupon(
  coupon: CouponRow | null,
  opts: { productId: string; priceCents: number; now?: Date; covers?: ((line: CouponLine) => boolean) | null },
): CouponCheck {
  const r = checkCouponLines(coupon, [{ productId: opts.productId, creatorId: coupon?.creator_id ?? "", cents: opts.priceCents }], {
    now: opts.now,
    notCovered: "That code does not apply to this product.",
    covers: opts.covers,
  })
  if (r.ok === false) return r
  return { ok: true, coupon: r.coupon, discountCents: r.discountCents, label: r.label }
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

/**
 * ===========================================================================
 *  THE PLATFORM ADMIN'S OWN CODE
 * ===========================================================================
 * 100% off any product, for Storelib's admin to buy anything to check it.
 * The code alone does nothing: it is honoured only for a request that
 * carries a signed-in admin console session (the /admin cookie, checked on
 * the server by ./admin-code, which priceOrder asks first), so seeing it written down, here or
 * anywhere, gives nobody else a free product. For everyone else it is an
 * unknown code, answered like any other.
 *
 * It has no row: no id, no limit, so no hold is taken and no use counted
 * (lib/checkout/coupon-holds, recordCouponUse). The order still records the
 * code it was bought with.
 */
export const ADMIN_CODE = "STORELIB100"

export function isAdminCode(code: string): boolean {
  return code.trim().toUpperCase() === ADMIN_CODE
}

export function adminCoupon(creatorId: string): CouponRow {
  return {
    id: "",
    code: ADMIN_CODE,
    creator_id: creatorId,
    discount_type: "percentage",
    discount_value: 100,
    starts_at: null,
    expires_at: null,
    usage_limit: null,
    usage_count: 0,
    product_ids: null,
    is_active: true,
  }
}

/**
 * A code for one product (the download checkout). `covers` is where the
 * code's collections and "Physical products only" are applied
 * (./coupon-scope digitalCoverage), worked out by the caller from the row
 * this finds; without it the code's product list decides.
 */
export async function validateCoupon(
  db: Db,
  opts: { creatorId: string; productId: string; code: unknown; priceCents: number; scope?: (coupon: CouponRow) => Promise<((line: CouponLine) => boolean) | null> },
): Promise<CouponCheck> {
  const code = normaliseCode(opts.code)
  if (!code) return { ok: false, error: "That code is not valid." }
  const found = await findCoupon(db, opts.creatorId, code)
  const covers = found && opts.scope ? await opts.scope(found) : null
  return checkCoupon(found, { productId: opts.productId, priceCents: opts.priceCents, covers })
}

/**
 * Counts one use of a code, from the server, when an order is created with
 * it. Never allowed to fail the order it belongs to.
 *
 * With the holder of the place the payment took under the code's limit
 * (lib/checkout/coupon-holds.ts), the use is counted and the place dropped
 * in one statement; before that function exists, the use is counted as it
 * always was.
 */
export async function recordCouponUse(db: Db, couponId: string | null | undefined, holder?: string | null): Promise<void> {
  if (!couponId) return
  try {
    if (holder && db.rpc) {
      const held = await db.rpc("use_coupon_hold", { p_coupon_id: couponId, p_holder: holder })
      if (!held?.error) return
    }
    const rpc = db.rpc ? await db.rpc("increment_coupon_usage", { coupon_id: couponId }) : { error: true }
    if (!rpc?.error) return
    const { data } = await db.from("coupons").select("usage_count").eq("id", couponId).maybeSingle()
    if (data) await db.from("coupons").update({ usage_count: (data.usage_count || 0) + 1 }).eq("id", couponId)
  } catch {
    /* the order stands */
  }
}

/* ===========================================================================
 *  WHAT A CREATOR MAY SAVE AS A CODE
 * ===========================================================================
 * The same rules for a new code and an edited one, run on the server before
 * anything is written. The form checks a few of them too, to answer sooner;
 * these are the ones that count.
 */


export interface CouponValues {
  code: string
  discount_type: "percentage" | "fixed"
  discount_value: number
  product_ids: string[] | null
  usage_limit: number | null
  starts_at: string | null
  expires_at: string | null
  min_purchase_cents: number | null
  is_active: boolean
}

export type CouponInput = { ok: true; values: CouponValues } | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const nothing = (v: unknown) => v === undefined || v === null || v === ""

function whole(v: unknown, min: number, max: number): number | null | undefined {
  if (nothing(v)) return null
  const n = typeof v === "string" ? Number(v) : v
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) return undefined
  return n
}

function instant(v: unknown): string | null | undefined {
  if (nothing(v)) return null
  if (typeof v !== "string") return undefined
  const t = Date.parse(v)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}

/**
 * The body of a create, or an edit laid over the row it edits (`base`), as
 * the values to write, or the first thing wrong with it in words a creator
 * can act on.
 */
export function readCouponInput(body: unknown, base?: Partial<CouponValues> | null, opts: { allowZero?: boolean } = {}): CouponInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Nothing to save." }
  const b = { ...(base ?? {}), ...(body as Record<string, unknown>) } as Record<string, unknown>

  const code = typeof b.code === "string" ? b.code.trim().toUpperCase() : ""
  /* A code saved before these rules is kept as it is: turning it off, or
     changing its dates, does not make its owner rename it. */
  const kept = !!base?.code && code === base.code.trim().toUpperCase() && normaliseCode(code) !== null
  if (!kept && !CODE_PATTERN.test(code)) return { ok: false, error: "A code is 3 to 32 letters, numbers, - or _." }

  const type = b.discount_type
  if (type !== "percentage" && type !== "fixed") return { ok: false, error: "Choose a percentage or a fixed amount." }

  const value = typeof b.discount_value === "string" ? Number(b.discount_value) : b.discount_value
  /* Zero only for a free shipping code, which the physical checkout prices (lib/physical). */
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (value === 0 && !opts.allowZero)) return { ok: false, error: "The discount has to be more than 0." }
  if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) return { ok: false, error: "The discount can have at most two decimals." }
  if (type === "percentage" && value > 100) return { ok: false, error: "A percentage discount is at most 100%." }
  if (type === "fixed" && value > 100_000) return { ok: false, error: "A fixed discount is at most $100,000." }

  let productIds: string[] | null = null
  if (!nothing(b.product_ids)) {
    if (!Array.isArray(b.product_ids) || b.product_ids.length > 500 || !b.product_ids.every((id) => typeof id === "string" && UUID_RE.test(id))) {
      return { ok: false, error: "Those products could not be read." }
    }
    productIds = b.product_ids.length ? [...new Set(b.product_ids as string[])] : null
  }

  const usageLimit = whole(b.usage_limit, 1, 1_000_000)
  if (usageLimit === undefined) return { ok: false, error: "A use limit is a whole number from 1." }

  const minPurchase = whole(b.min_purchase_cents, 1, 100_000_000)
  if (minPurchase === undefined) return { ok: false, error: "A minimum order is an amount above $0." }

  const startsAt = instant(b.starts_at)
  const expiresAt = instant(b.expires_at)
  if (startsAt === undefined || expiresAt === undefined) return { ok: false, error: "That date could not be read." }
  if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) return { ok: false, error: "The end has to be after the start." }

  return {
    ok: true,
    values: {
      code,
      discount_type: type,
      discount_value: Math.round(value * 100) / 100,
      product_ids: productIds,
      usage_limit: usageLimit,
      starts_at: startsAt,
      expires_at: expiresAt,
      min_purchase_cents: minPurchase,
      is_active: b.is_active !== false,
    },
  }
}

/** A Postgres or PostgREST error saying a column the query named is not there yet. */
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined, column: string): boolean {
  if (!error) return false
  return (error.code === "PGRST204" || error.code === "42703") && (error.message ?? "").includes(column)
}
