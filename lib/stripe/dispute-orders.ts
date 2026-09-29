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
