/**
 * ===========================================================================
 *  A DISPUTE, WRITTEN TO EVERY ROW OF THE PAYMENT
 * ===========================================================================
 * Called from the webhook on `charge.dispute.created` and on a won
 * `charge.dispute.closed` (app/api/stripe/webhook).
 *
 * WHAT THIS REPLACED. The handler found the order with `.maybeSingle()` on
 * the PaymentIntent. A basket is paid once and writes a row per product
 * under the same PaymentIntent (lib/checkout/fulfil-cart-session), so for a
 * basket that lookup answered an error, nothing was marked "disputed", and
 * every figure kept counting the payment as a sale while the bank held the
 * money (lib/orders/order-view isSale). A won dispute then had nothing to
 * restore.
 *
 * NOW every row of the payment is marked, and a won dispute gives each row
 * back the status it had: "refunded" for a row that had been partly or
 * wholly refunded before the dispute (its refund amount is still on it),
 * "completed" for the rest. Restoring everything to "completed" would have
 * turned a partly refunded row back into a full sale.
 *
 * Only rows that were sales are marked: a failed or pending row of the same
 * PaymentIntent is not a payment the bank can take back.
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The column a payment's rows carry its id in: Stripe's, or Airwallex's (run-now part 76). */
export type PaymentColumn = "stripe_payment_intent_id" | "provider_payment_id"

/** The statuses a dispute can be opened on: money that reached the seller. */
export const DISPUTABLE_STATUSES = ["completed", "refunded"] as const

interface DisputedRow {
  id: string
  product_id: string | null
  status: string
  refund_amount_cents?: number | null
  refunded_at?: string | null
}

/** What a row goes back to when its dispute is won. */
export function statusAfterWonDispute(row: Pick<DisputedRow, "refund_amount_cents" | "refunded_at">): "refunded" | "completed" {
  return (row.refund_amount_cents ?? 0) > 0 || !!row.refunded_at ? "refunded" : "completed"
}

/**
 * Marks every sale row of the payment "disputed". Answers the rows it
 * marked, oldest first, so the caller can name the products in the email.
 */
export async function markPaymentDisputed(db: Db, paymentIntentId: string, column: PaymentColumn = "stripe_payment_intent_id"): Promise<DisputedRow[]> {
  const { data, error } = await db
    .from("orders")
    .select("id, product_id, status, created_at")
    .eq(column, paymentIntentId)
  if (error) throw new Error(`orders read failed: ${error.message}`)
  const rows = ((data ?? []) as Array<DisputedRow & { created_at?: string | null }>)
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id))
  const sales = rows.filter((r) => (DISPUTABLE_STATUSES as readonly string[]).includes(r.status))
  if (sales.length === 0) return rows.filter((r) => r.status === "disputed")

  const { error: updateError } = await db
    .from("orders")
    .update({ status: "disputed" })
    .eq(column, paymentIntentId)
    .in("id", sales.map((r) => r.id))
  if (updateError) throw new Error(`orders not marked disputed: ${updateError.message}`)
  return sales
}

/**
 * A won dispute: every "disputed" row of the payment goes back to what it
 * was. Answers how many rows were restored.
 */
export async function restorePaymentAfterWonDispute(db: Db, paymentIntentId: string, column: PaymentColumn = "stripe_payment_intent_id"): Promise<number> {
  const { data, error } = await db
    .from("orders")
    .select("id, product_id, status, refund_amount_cents, refunded_at")
    .eq(column, paymentIntentId)
    .eq("status", "disputed")
  if (error) throw new Error(`orders read failed: ${error.message}`)
  const rows = (data ?? []) as DisputedRow[]
  let restored = 0
  for (const status of ["completed", "refunded"] as const) {
    const ids = rows.filter((r) => statusAfterWonDispute(r) === status).map((r) => r.id)
    if (ids.length === 0) continue
    const { error: updateError } = await db
      .from("orders")
      .update({ status })
      .eq(column, paymentIntentId)
      .eq("status", "disputed")
      .in("id", ids)
    if (updateError) throw new Error(`orders not restored after a won dispute: ${updateError.message}`)
    restored += ids.length
  }
  return restored
}

/** The products a dispute is about, for the seller's email: "Guide", or "Guide and 2 more". */
export function disputedProductName(titles: Array<string | null | undefined>): string | null {
  const named = titles.filter((t): t is string => !!t && !!t.trim())
  if (named.length === 0) return null
  return named.length === 1 ? named[0] : `${named[0]} and ${named.length - 1} more`
}

/* ─── The buyer's access while the bank holds the money ─────────────────── */

/** A product opened or closed for a buyer: the communities it lets them into follow (lib/communities/server/payment-hooks). */
export type AccessHook = (db: Db, e: { userId: string; productId: string; orderId: string; granted: boolean }) => Promise<void>

interface AccessRow {
  id: string
  buyer_id?: string | null
  product_id?: string | null
  variant_id?: string | null
  status?: string | null
  amount_cents?: number | null
  refund_amount_cents?: number | null
  requires_shipping?: boolean | null
}

/** A row refunded in full: its library entry went with the refund, and a won dispute does not bring it back. */
function refundedInFull(row: AccessRow): boolean {
  if (row.status !== "refunded") return false
  const recorded = row.refund_amount_cents
  return !(typeof recorded === "number" && recorded > 0 && recorded < (row.amount_cents || 0))
}

function entitlementOf(db: Db, row: AccessRow, q: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  q = q.eq("buyer_id", row.buyer_id).eq("product_id", row.product_id)
  return row.variant_id ? q.eq("variant_id", row.variant_id) : q.is("variant_id", null)
}

/**
 * A CHARGEBACK CLOSES THE PRODUCT. While the bank holds the money the
 * download is already refused (lib/receipts/rules, a disputed order is
 * "held"), but the buyer's library entry stayed, and a course is opened by
 * that entry (lib/courses/server ownsProduct). So a buyer who disputed the
 * charge, and one who won the chargeback, kept the course. Each disputed
 * row's entry goes now, as a full refund takes it (lib/stripe/refund-sync);
 * a won dispute gives it back (reopenAccessAfterWonDispute). An entry that
 * another paid order of the same product also gives is left alone.
 * Answers how many entries were closed.
 */
export async function closeAccessForDispute(db: Db, paymentIntentId: string, column: PaymentColumn = "stripe_payment_intent_id", onAccess?: AccessHook): Promise<number> {
  const { data, error } = await db.from("orders").select("*").eq(column, paymentIntentId).eq("status", "disputed")
  if (error) throw new Error(`orders read failed: ${error.message}`)
  let closed = 0
  for (const row of (data ?? []) as AccessRow[]) {
    /* A line that ships was never in the library. */
    if (!row.buyer_id || !row.product_id || row.requires_shipping === true) continue
    const { data: others } = await entitlementOf(db, row, db.from("orders").select("id").eq("status", "completed"))
    if (((others ?? []) as AccessRow[]).some((o) => o.id !== row.id)) continue
    const { error: deleteError } = await entitlementOf(db, row, db.from("entitlements").delete())
    if (deleteError) throw new Error(`library entry not closed for a dispute: ${deleteError.message}`)
    closed++
    if (onAccess) await onAccess(db, { userId: row.buyer_id, productId: row.product_id, orderId: row.id, granted: false })
  }
  return closed
}

/**
 * A WON DISPUTE OPENS IT AGAIN: every row the dispute held that is a sale
 * again (restorePaymentAfterWonDispute ran first) and was not refunded in
 * full gets its library entry back, once. Nothing that ships, and no
 * membership (its access is the membership's own, lib/memberships), ever
 * had one, so none is made for them. Answers how many entries were made.
 */
export async function reopenAccessAfterWonDispute(db: Db, paymentIntentId: string, column: PaymentColumn = "stripe_payment_intent_id", onAccess?: AccessHook): Promise<number> {
  const { data, error } = await db.from("orders").select("*").eq(column, paymentIntentId).in("status", ["completed", "refunded"])
  if (error) throw new Error(`orders read failed: ${error.message}`)
  let opened = 0
  for (const row of (data ?? []) as AccessRow[]) {
    if (!row.buyer_id || !row.product_id || refundedInFull(row) || row.requires_shipping === true) continue
    const { data: product } = await db.from("products").select("id, creator_id, type").eq("id", row.product_id).maybeSingle()
    const p = product as { creator_id?: string | null; type?: string | null } | null
    if (!p || p.type === "physical" || p.type === "membership") continue
    const { data: has } = await entitlementOf(db, row, db.from("entitlements").select("id"))
    if (((has ?? []) as unknown[]).length === 0) {
      const { error: insertError } = await db.from("entitlements").insert({ buyer_id: row.buyer_id, creator_id: p.creator_id ?? null, product_id: row.product_id, variant_id: row.variant_id ?? null, community_access: false })
      if (insertError && (insertError as { code?: string }).code !== "23505") throw new Error(`library entry not given back after a won dispute: ${insertError.message}`)
      opened++
    }
    if (onAccess) await onAccess(db, { userId: row.buyer_id, productId: row.product_id, orderId: row.id, granted: true })
  }
  return opened
}
