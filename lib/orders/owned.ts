import "server-only"

/**
 * ===========================================================================
 *  AN ORDER, IF IT IS THIS CREATOR'S
 * ===========================================================================
 * Every action on an order's page (resend the receipt, change the email,
 * the invoice, the app's download link) arrives with an order id from the
 * browser. An id from the browser is a claim, not a fact, and these routes
 * read with the service role, which row level security does not check. So
 * each of them asks this one question first, with the creator id taken from
 * the session: is this row one of your products' orders? Anything else is
 * answered as if the order did not exist.
 *
 * ONE PAYMENT IS ONE ORDER (lib/orders/order-view.ts): a basket writes a row
 * per product under one Stripe session. The page shows it as one order, so
 * an action on it covers every row of that payment that is this creator's,
 * and none that is somebody else's.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isOrderId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

export interface OwnedLine {
  id: string
  product_id: string
  status: string
  created_at: string
  amount_cents: number | null
  tip_cents: number | null
  fee_cents: number | null
  buyer_email: string | null
  customer_email?: string | null
  buyer_first_name: string | null
  buyer_last_name: string | null
  receipt_token: string | null
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  variant_name?: string | null
  card_brand?: string | null
  card_last4?: string | null
  payment_method?: string | null
  paypal_email?: string | null
  refund_amount_cents?: number | null
  refunded_at?: string | null
  refund_reason?: string | null
  buyer_notified_at?: string | null
  buyer_email_last_error?: string | null
  /** An order that ships: its checkout (lib/physical), which holds the address its emails go to. */
  checkout_id?: string | null
  product: { id: string; title: string | null; creator_id: string } | null
}

const SELECT = "*, product:products(id, title, creator_id)"

/**
 * The rows of the order `orderId` belongs to, oldest first, when that row is
 * one of `creatorId`'s. Null for an id that is malformed, missing, or not
 * theirs, which the routes all answer the same way.
 */
export async function ownedOrderLines(admin: any, creatorId: string, orderId: unknown): Promise<OwnedLine[] | null> {
  if (!creatorId || !isOrderId(orderId)) return null
  const { data: row, error } = await admin.from("orders").select(SELECT).eq("id", orderId).maybeSingle()
  if (error || !row || row.product?.creator_id !== creatorId) return null
  if (!row.stripe_session_id) return [row as OwnedLine]

  const { data: rows, error: groupError } = await admin.from("orders").select(SELECT).eq("stripe_session_id", row.stripe_session_id)
  if (groupError || !Array.isArray(rows)) return [row as OwnedLine]
  return (rows as OwnedLine[])
    .filter((r) => r.product?.creator_id === creatorId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

/** A line the buyer has access to, and so one whose access email can be sent. */
export function canEmailAccess(line: Pick<OwnedLine, "status" | "receipt_token">): boolean {
  return line.status === "completed" && Boolean(line.receipt_token)
}

/* No brackets, quotes or separators: none appear in a real address, and an
   address that carried markup would travel into the emails that show it. */
const EMAIL = /^[^\s@<>"'`(),;:\\[\]]+@[^\s@<>"'`(),;:\\[\]]+\.[^\s@<>"'`(),;:\\[\]]{2,}$/

/** The address, trimmed, when it looks like one a mail server would take. */
export function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const email = value.trim()
  if (email.length < 6 || email.length > 254 || !EMAIL.test(email)) return null
  return email
}
