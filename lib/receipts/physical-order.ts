/**
 * A RECEIPT LINK FOR SOMETHING THAT SHIPS OPENS ITS ORDER PAGE.
 *
 * Every line of a paid cart gets an order row with a receipt token, the
 * physical ones too, so a buyer's notifications, their Receipts list and an
 * old email can all hold a /receipt/<token> link for a t-shirt. That page is
 * built for downloads ("Open your library"), which a parcel has none of.
 * A token whose product ships is sent to the order it came from,
 * /checkout/physical/order/<token>, the way Shopify sends a buyer to their
 * order status page. A digital line bought in the same cart keeps its
 * download receipt (the order page links to it).
 */
import { cartFingerprint } from "@/lib/checkout/cart-tokens"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function physicalOrderPageFor(db: Db, receiptToken: string): Promise<string | null> {
  try {
    const { data: row } = await db.from("orders").select("product_id, stripe_session_id").eq("receipt_token", receiptToken).maybeSingle()
    if (!row?.product_id || !row.stripe_session_id) return null
    const { data: product } = await db.from("products").select("type").eq("id", row.product_id).maybeSingle()
    if (product?.type !== "physical") return null
    /* A paid Stripe checkout keeps its session; one a code made free keeps only the session's fingerprint. */
    let { data: co } = await db.from("commerce_checkouts").select("receipt_token").eq("stripe_session_id", row.stripe_session_id).maybeSingle()
    if (!co) ({ data: co } = await db.from("commerce_checkouts").select("receipt_token").eq("session_fingerprint", cartFingerprint(String(row.stripe_session_id))).maybeSingle())
    const token = typeof co?.receipt_token === "string" ? co.receipt_token : ""
    return /^[A-Za-z0-9_-]{20,64}$/.test(token) ? `/checkout/physical/order/${encodeURIComponent(token)}` : null
  } catch {
    return null
  }
}
