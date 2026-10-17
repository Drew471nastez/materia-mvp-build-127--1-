import "server-only"

/**
 * THE BUYER'S ORDER PAGE, KEPT CURRENT (app/checkout/physical/order/[token]/live-status.tsx).
 * A short fingerprint of everything the page shows that changes after paying:
 * the order's own status, cancellation and refunds, each parcel and its
 * tracking (a new carrier scan included), each return, the shop's answer to a
 * cancel request. The page asks for it now and then and draws itself again
 * when it moves. Never the time a parcel was last looked up, which moves
 * without anything to show. Every column is read, so a database without the
 * newer ones still answers.
 */
import { createHash } from "node:crypto"
import type { Db } from "./auth"
import { CANCEL_DECLINED, CANCEL_REQUESTED } from "./buyer-cancel"

const ORDER_FIELDS = ["id", "status", "fulfillment_status", "return_status", "cancelled_at", "processing_at", "cod_collected_at", "refunded_cents", "shipping_address", "updated_at"]
const PARCEL_FIELDS = ["id", "status", "carrier", "tracking_number", "tracking_url", "shipped_at", "delivered_at", "tracking_status", "estimated_delivery_at", "delivery_unconfirmed_at"]

/** The fingerprint of the order a receipt token opens, or null when it opens none. */
export async function orderStamp(db: Db, receiptToken: string): Promise<string | null> {
  const { data: row } = await db.from("commerce_checkouts").select("*").eq("receipt_token", receiptToken).maybeSingle()
  if (!row) return null
  const co = row as Record<string, unknown> & { id: string }
  const [lines, parcels, returns, asked] = await Promise.all([
    db.from("orders").select("id, status, refund_amount_cents").eq("checkout_id", co.id),
    db.from("fulfillments").select("*").eq("checkout_id", co.id),
    db.from("commerce_returns").select("id, status, updated_at").eq("checkout_id", co.id),
    db.from("commerce_order_events").select("id").eq("checkout_id", co.id).in("kind", [CANCEL_REQUESTED, CANCEL_DECLINED]).order("created_at", { ascending: false }).limit(1),
  ])
  const rows = (r: { data?: unknown } | null | undefined) => ((r?.data ?? []) as Record<string, unknown>[])
  const ids = rows(parcels).map((f) => String(f.id))
  /* The carrier's scans: how many, so a new one shows. */
  const scans = ids.length ? ((await db.from("fulfillment_events").select("id", { count: "exact", head: true }).in("fulfillment_id", ids)) as { count?: number | null }).count ?? 0 : 0
  const sorted = (list: unknown[]) => list.map((x) => JSON.stringify(x)).sort()
  return createHash("sha256")
    .update(JSON.stringify([ORDER_FIELDS.map((k) => co[k] ?? null), sorted(rows(lines)), sorted(rows(parcels).map((f) => PARCEL_FIELDS.map((k) => f[k] ?? null))), scans, sorted(rows(returns)), sorted(rows(asked))]))
    .digest("base64url")
    .slice(0, 22)
}
