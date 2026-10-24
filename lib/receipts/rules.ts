/**
 * ===========================================================================
 *  RECEIPTS AND DOWNLOADS, FROM PAYMENT TO FILE
 * ===========================================================================
 * The whole buyer side of a purchase, in the order it happens:
 *
 *  1. PAYMENT. A buyer pays through one of three doors:
 *       - Stripe Elements on /checkout, confirmed by
 *         /api/checkout/confirm-payment (or /process for free products),
 *       - hosted Stripe Checkout for one product, fulfilled by the
 *         checkout.session.completed webhook (app/api/stripe/webhook),
 *       - hosted Stripe Checkout for a basket on a creator's site, fulfilled
 *         when Stripe sends the buyer to /api/checkout/cart/complete.
 *
 *  2. FULFILMENT writes one `orders` row per product, every one with its own
 *     random `receipt_token` (lib/security generateReceiptToken, 32 chars of
 *     nanoid) and the buyer's email. A basket is several rows that share one
 *     `stripe_session_id`. Only a payment Stripe reports as paid is written,
 *     with status "completed". Refunds set "refunded", disputes "disputed".
 *
 *  3. EMAIL. lib/email sendBuyerDownloadEmail sends ONE receipt per payment,
 *     read through the same loader as the page (lib/receipts/load), so the
 *     email and the page cannot disagree about items or totals. Its button
 *     is /receipt/<token>.
 *
 *  4. RECEIPT PAGE. /receipt/<token> is the receipt AND the download page.
 *     Every older address sends the buyer here after checking its own
 *     credential server side: /checkout/receipt?token=, /receipt/cart/<cs_>,
 *     /purchase/success?session_id=, /access/<id>?token=, /downloads?orderId=.
 *     The page reads the row by token with the admin client, finds the other
 *     rows of the same payment, and hands the browser a view model with no
 *     storage paths, no fingerprints and no other buyer's data.
 *
 *  5. FILE DELIVERY. A download button asks /api/download/<assetId> with the
 *     item's receipt token (or the signed-in session). The route decides
 *     with decideAccess() below, then signs a five minute URL for that one
 *     file and logs a row in download_events. The URL is made per request
 *     and never stored or shown on the page.
 *
 *  6. LATER. The email link keeps working for as long as the order is
 *     completed. A buyer with an account also reaches every purchase from
 *     /library, where the same route authorises by session instead of token.
 *
 * WHAT THIS FILE IS. The rules above as plain functions with no database and
 * no React, so the page, the email, the download route and the tests all use
 * the same ones. Anything that reads rows lives in lib/receipts/load.ts and
 * lib/receipts/download-access.ts.
 */

import { fullyRefunded } from "../orders/refund-state"
import { SHOP_CURRENCY } from "@/lib/store/shop-money"
import { formatMinor } from "@/lib/markets/money"

/* ─── Order state ─────────────────────────────────────────────────────── */

/**
 * What an order lets its buyer do, from the status the server wrote.
 *
 *  open      paid, files and courses are available
 *  pending   payment not settled yet; the page waits and refreshes
 *  refunded  money went back; access is closed
 *  failed    the payment did not go through
 *  held      disputed or in a state this code does not know; closed until
 *            somebody decides, because guessing "open" gives away files
 */
export type AccessState = "open" | "pending" | "refunded" | "failed" | "held"

/**
 * An order's status, or the order itself. Given the order, a refund is read
 * with its amount: the table has one status, "refunded", for a partial
 * refund and a full one alike, and a partial refund is a gesture on a sale
 * that stands, so the buyer keeps the product (lib/orders/refund-state.ts,
 * the rule the checkout and the Orders page use too). Given only a status,
 * "refunded" is read as the full kind, which is the safe way round.
 */
export type StatusInput =
  | string
  | null
  | undefined
  | { status?: string | null; amount_cents?: number | null; refund_amount_cents?: number | null }

export function accessStateOf(input: StatusInput): AccessState {
  const row = input && typeof input === "object" ? input : null
  const status = row ? row.status : (input as string | null | undefined)
  const s = (status ?? "").toString().trim().toLowerCase()
  if (s === "partially_refunded") return "open"
  if (s === "refunded" && row && !fullyRefunded({ status: "refunded", amount_cents: row.amount_cents, refund_amount_cents: row.refund_amount_cents })) {
    return "open"
  }
  switch (s) {
    case "completed":
    case "paid":
    case "succeeded":
      return "open"
    case "pending":
    case "processing":
    case "requires_action":
      return "pending"
    case "refunded":
      return "refunded"
    case "failed":
    case "canceled":
    case "cancelled":
      return "failed"
    default:
      return "held"
  }
}

export function canDeliver(input: StatusInput): boolean {
  return accessStateOf(input) === "open"
}

/**
 * One state for a whole receipt. Open when anything in it can still be
 * opened, so a basket with one refunded line still shows its other files.
 */
export function overallState(states: AccessState[]): AccessState {
  if (states.length === 0) return "held"
  const order: AccessState[] = ["open", "pending", "held", "refunded", "failed"]
  for (const s of order) if (states.includes(s)) return s
  return "held"
}

/* ─── Credentials ─────────────────────────────────────────────────────── */

/**
 * A receipt token is 32 characters of nanoid today; older rows have other
 * random strings. Anything outside this shape is refused before it reaches
 * the database, which keeps junk and injection attempts out of queries and
 * logs.
 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/

export function isPlausibleToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value)
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_SHAPE.test(value)
}

/** A Stripe Checkout Session id, as Stripe sends it back in success_url. */
const SESSION_SHAPE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/

export function isCheckoutSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_SHAPE.test(value)
}

/**
 * Constant time comparison for secrets held in JavaScript (the legacy
 * access_token). Receipt tokens are compared by the database in the WHERE
 * clause instead, so they never need this.
 */
export function sameSecret(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length === 0) return false
  /* The length of a random fixed-size token is not a secret; its characters are. */
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/* ─── Money ───────────────────────────────────────────────────────────── */

export interface MoneyRow {
  amount_cents?: number | null
  tip_cents?: number | null
  status?: string | null
  refund_amount_cents?: number | null
}

/**
 * `amount_cents` is what the card was charged for that row, tip included
 * (confirm-payment and the webhook both store the PaymentIntent amount, and
 * write the tip beside it). So the tip is carved out of it, never added.
 */
export function lineMoney(row: MoneyRow): { subtotalCents: number; tipCents: number; totalCents: number; refundedCents: number } {
  const total = Math.max(0, Math.round(Number(row.amount_cents) || 0))
  const tip = Math.min(total, Math.max(0, Math.round(Number(row.tip_cents) || 0)))
  let refunded = 0
  if ((row.status ?? "").toString().toLowerCase() === "refunded" || (row.status ?? "").toString().toLowerCase() === "partially_refunded") {
    const recorded = Math.round(Number(row.refund_amount_cents) || 0)
    refunded = recorded > 0 ? Math.min(recorded, total) : total
  }
  return { subtotalCents: total - tip, tipCents: tip, totalCents: total, refundedCents: refunded }
}

export function sumMoney(rows: MoneyRow[]) {
  return rows.reduce(
    (acc, row) => {
      const m = lineMoney(row)
      acc.subtotalCents += m.subtotalCents
      acc.tipCents += m.tipCents
      acc.totalCents += m.totalCents
      acc.refundedCents += m.refundedCents
      return acc
    },
    { subtotalCents: 0, tipCents: 0, totalCents: 0, refundedCents: 0 },
  )
}

/** ISO 4217, upper case; the store's own currency (lib/store/shop-money.ts) when the row never said, which is what it was charged in. */
export function normaliseCurrency(value: string | null | undefined): string {
  const c = (value ?? "").toString().trim().toUpperCase()
  return /^[A-Z]{3}$/.test(c) ? c : SHOP_CURRENCY
}

/**
 * Money in the buyer's locale. Zero-decimal currencies (JPY and friends)
 * are still stored in minor units by Stripe, so the division follows the
 * currency's own digits rather than always being by 100.
 */
export function formatMoney(cents: number, currency: string, locale?: string): string {
  /* The app's one money writer (lib/markets/money formatMinor): "25.00 lei" as the product page and Orders write it, never "RON 25.00". */
  return formatMinor(Number(cents) || 0, normaliseCurrency(currency), locale || "en")
}

/* ─── Display ─────────────────────────────────────────────────────────── */

/** The order's short number: the first eight characters of its id. */
export function orderNumberOf(orderId: string | null | undefined): string {
  return (orderId ?? "").replace(/-/g, "").slice(0, 8).toUpperCase()
}

/**
 * The address the receipt went to, shown well enough for its owner to
 * recognise and not well enough to be harvested from a forwarded link.
 */
export function maskAddress(email: string | null | undefined): string | null {
  const e = (email ?? "").trim()
  const at = e.lastIndexOf("@")
  if (at < 1) return null
  const local = e.slice(0, at)
  const domain = e.slice(at + 1)
  if (!domain) return null
  const shown = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2)
  /* A fixed run of dots, so the mask does not give away the length either. */
  return `${shown}••••@${domain}`
}

export function formatFileSize(bytes: number | null | undefined): string {
  const b = Number(bytes) || 0
  if (b <= 0) return ""
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * A file name in two parts, so a long one is cut in the middle and keeps
 * the end a person recognises it by: "6e6ba82c-3022-42a6-…b4 (4).pdf".
 * The page lets the head shrink with an ellipsis and never the tail.
 */
export function splitFileName(name: string, tailChars = 6): { head: string; tail: string } {
  const n = (name ?? "").trim()
  const dot = n.lastIndexOf(".")
  const ext = dot > 0 && n.length - dot <= 6 ? n.slice(dot) : ""
  const stem = ext ? n.slice(0, dot) : n
  if (stem.length <= tailChars + 4) return { head: n, tail: "" }
  return { head: stem.slice(0, stem.length - tailChars), tail: stem.slice(stem.length - tailChars) + ext }
}

/** "PDF", "ZIP": the short type a file row shows, from its name. Empty when it has none. */
export function fileKindOf(name: string): string {
  const m = (name ?? "").trim().match(/\.([A-Za-z0-9]{1,5})$/)
  return m ? m[1].toUpperCase() : ""
}

/**
 * The refund policy a product states, in the words the product page uses
 * (components/product/refund-policy-display.tsx). Null when it has none.
 */
const REFUND_POLICY_LABELS: Record<string, string> = {
  no_refunds: "No refunds",
  "7_day": "7-day money back guarantee",
  "14_day": "14-day money back guarantee",
  "30_day": "30-day money back guarantee",
  "6_month": "6-month money back guarantee",
}

export function refundPolicyOf(row: {
  refund_policy_enabled?: boolean | null
  refund_policy_type?: string | null
  refund_policy_fine_print?: string | null
} | null | undefined): { label: string; finePrint: string | null } | null {
  if (!row || !row.refund_policy_enabled) return null
  const label = REFUND_POLICY_LABELS[row.refund_policy_type ?? ""]
  if (!label) return null
  const fine = (row.refund_policy_fine_print ?? "").toString().trim()
  return { label, finePrint: fine ? fine.slice(0, 600) : null }
}

/* ─── Which files an order includes ───────────────────────────────────── */

/**
 * A variant hands over the files mapped to it in product_variant_files. A
 * variant with nothing mapped does not restrict anything: the product editor
 * only asks for a mapping when the product has more than one file, so a one
 * file product with variants has no rows at all and every buyer gets the file.
 *
 * `all` is always the product's own files, so a mapping row that points at a
 * file from another product (or a deleted one) can never add it.
 */
export function filesForVariant<T extends { id: string }>(all: T[], mapped: string[] | null | undefined): T[] {
  if (!mapped || mapped.length === 0) return all
  const allowed = new Set(mapped)
  return all.filter((f) => allowed.has(f.id))
}

export function assetAllowedForVariants(
  assetId: string,
  variants: Array<string | null>,
  variantFiles: Map<string, string[]>,
): boolean {
  for (const v of variants) {
    if (!v) return true
    const mapped = variantFiles.get(v) ?? []
    if (mapped.length === 0 || mapped.includes(assetId)) return true
  }
  return false
}

/* ─── May this person have this file ──────────────────────────────────── */

export interface AccessEvidence {
  assetId: string
  /** The product the file belongs to, from the digital_assets row. */
  assetProductId: string
  /** The order a receipt token resolved to, if one was sent. */
  receiptOrder?: { product_id: string; variant_id: string | null; status: string | null; amount_cents?: number | null; refund_amount_cents?: number | null } | null
  /** The signed-in person's own orders for this product. */
  accountOrders?: Array<{ variant_id: string | null; status: string | null; amount_cents?: number | null; refund_amount_cents?: number | null }>
  /** Their entitlements for this product. */
  entitlements?: Array<{ variant_id?: string | null }>
  /** They created the product. */
  isCreator?: boolean
  /** variant id to the asset ids mapped to it. */
  variantFiles: Map<string, string[]>
}

export type DenyReason = "refunded" | "pending" | "failed" | "held" | "variant" | "denied"

export type AccessDecision =
  | { ok: true; via: "creator" | "receipt" | "account" }
  | { ok: false; reason: DenyReason }

function reasonFor(state: AccessState): DenyReason {
  return state === "open" ? "denied" : state
}

/**
 * The single rule every download goes through.
 *
 *  - The creator can always fetch their own files.
 *  - A receipt token grants its own order: the file must belong to that
 *    order's product, the order must be paid, and the file must be in the
 *    variant that was bought.
 *  - A signed-in buyer is judged by their ORDERS when they have any, because
 *    orders are the ledger: a refund changes the order, it does not remove the
 *    entitlement row. Entitlements decide only for people with no order for
 *    the product at all (free claims and gifts from before orders existed).
 */
export function decideAccess(e: AccessEvidence): AccessDecision {
  if (e.isCreator) return { ok: true, via: "creator" }

  let receiptDenial: DenyReason | null = null
  if (e.receiptOrder) {
    const o = e.receiptOrder
    if (o.product_id !== e.assetProductId) {
      receiptDenial = "denied"
    } else {
      const state = accessStateOf(o)
      if (state !== "open") receiptDenial = reasonFor(state)
      else if (!assetAllowedForVariants(e.assetId, [o.variant_id ?? null], e.variantFiles)) receiptDenial = "variant"
      else return { ok: true, via: "receipt" }
    }
  }

  const orders = e.accountOrders ?? []
  if (orders.length > 0) {
    const paid = orders.filter((o) => canDeliver(o))
    if (paid.length === 0) {
      const states = orders.map((o) => accessStateOf(o))
      const worst: AccessState = states.includes("refunded")
        ? "refunded"
        : states.includes("held")
          ? "held"
          : states.includes("pending")
            ? "pending"
            : "failed"
      return { ok: false, reason: receiptDenial && receiptDenial !== "denied" ? receiptDenial : reasonFor(worst) }
    }
    if (assetAllowedForVariants(e.assetId, paid.map((o) => o.variant_id ?? null), e.variantFiles)) {
      return { ok: true, via: "account" }
    }
    return { ok: false, reason: "variant" }
  }

  const ents = e.entitlements ?? []
  if (ents.length > 0) {
    if (assetAllowedForVariants(e.assetId, ents.map((x) => x.variant_id ?? null), e.variantFiles)) {
      return { ok: true, via: "account" }
    }
    return { ok: false, reason: "variant" }
  }

  return { ok: false, reason: receiptDenial ?? "denied" }
}

/** What the buyer is told for each refusal. Plain, and the same everywhere. */
export const DENY_MESSAGES: Record<DenyReason, string> = {
  refunded: "This order was refunded, so its files are closed.",
  pending: "The payment has not cleared yet. Files open as soon as it does.",
  failed: "This payment did not go through, so there is nothing to download.",
  held: "This order is on hold while the payment is reviewed.",
  variant: "This file is not part of the option you bought.",
  denied: "This link does not give access to that file.",
}
