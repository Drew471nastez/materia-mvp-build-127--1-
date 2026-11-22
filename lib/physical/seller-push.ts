/**
 * ===========================================================================
 *  AN ORDER THAT NEEDS THE SELLER, ON THEIR PHONE (r57)
 * ===========================================================================
 * A return asked for, a cancel asked for, an order cancelled, a parcel that
 * could not be delivered or was never marked delivered, a payment that
 * failed, and stock running low reached the seller by email only
 * (lib/physical/jobs-server.ts sendSellerEmail, sendLowStockEmail), and not
 * even that when sales emails were off. A seller who runs the shop from the
 * Storelib app heard nothing until they opened it.
 *
 * Each is pushed once, by the call that queued its email for the first time
 * (the job's idempotency key is the event's own: a second call, a retry of
 * the email, or a webhook delivered twice finds the row there and pushes
 * nothing). A tap opens the order (or Inventory, for low stock).
 *
 * What it says is the kind of thing that happened and nothing about the
 * buyer: a lock screen is not the place for a name or an address.
 *
 * It follows the person's bell switch for sales (Settings, Notifications):
 * off there, nothing on the phone either. The email keeps its own switch.
 */
import type { SellerCommerceKind } from "@/lib/notify/seller-commerce"
import { PUSH_BODY } from "@/lib/notifications/push"

export interface SellerOrderPush {
  title: string
  body: string
  data: { type: "notification"; kind: string; url: string }
  collapseKey: string
  threadId: string
}

const TITLE: Record<SellerCommerceKind, string> = {
  return_requested: "A buyer asked to return an order",
  cancel_requested: "A buyer asked to cancel an order",
  order_cancelled: "An order was cancelled",
  delivery_exception: "A parcel could not be delivered",
  delivery_unconfirmed: "A parcel was never marked delivered",
  payment_failed: "A payment for an order failed",
  low_stock: "Stock is running low",
}

/** The push for one order event, or for today's low stock. Pure. */
export function sellerOrderPush(kind: SellerCommerceKind, ref: { orderId?: string | null; key: string; lowItems?: { title: string }[] }): SellerOrderPush {
  const order = typeof ref.orderId === "string" && /^[0-9a-f-]{36}$/i.test(ref.orderId) ? ref.orderId : null
  const url = kind === "low_stock" ? "/app/inventory?filter=low" : order ? `/app/orders?order=${order}` : "/app/orders"
  const items = ref.lowItems ?? []
  const title =
    kind === "low_stock" && items.length === 1 && items[0]?.title
      ? `${items[0].title.trim().slice(0, 40)} is running low`
      : kind === "low_stock" && items.length > 1
        ? `${items.length} products are running low`
        : TITLE[kind]
  return {
    title,
    body: kind === "delivery_exception" || kind === "payment_failed" ? PUSH_BODY.critical : PUSH_BODY.other,
    data: { type: "notification", kind: `order_${kind}`, url },
    collapseKey: `o:${ref.key}`.slice(0, 64),
    threadId: kind === "low_stock" ? "store" : "orders",
  }
}

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Pushes it to the seller's phones and browsers. Never throws; the email and the order stand whatever it does. */
export async function pushSellerOrderEvent(
  db: Db,
  e: { creatorId: string; kind: SellerCommerceKind; key: string; checkoutId?: string | null; lowItems?: { title: string }[] },
  send: (userId: string, push: SellerOrderPush) => Promise<unknown> = (userId, push) => import("@/lib/push/sender").then((m) => m.sendPushToUser(userId, push)),
): Promise<"sent" | "off" | "no_user" | "failed"> {
  try {
    const { data: creator } = await db.from("creators").select("user_id").eq("id", e.creatorId).maybeSingle()
    const userId = (creator?.user_id as string | undefined) ?? null
    if (!userId) return "no_user"
    const [{ allowed }, { entryFor }] = await Promise.all([import("@/lib/notify/preferences"), import("@/lib/notify/registry")])
    const entry = entryFor("ORDERS_WAITING_TO_SHIP")
    if (!(await allowed(db as never, userId, entry, "in_app")) || !(await allowed(db as never, userId, entry, "push"))) return "off"
    let orderId: string | null = null
    if (e.checkoutId) {
      const { data: first } = await db.from("orders").select("id").eq("checkout_id", e.checkoutId).order("created_at", { ascending: true }).limit(1).maybeSingle()
      orderId = (first?.id as string | undefined) ?? null
    }
    await send(userId, sellerOrderPush(e.kind, { orderId, key: e.key, lowItems: e.lowItems }))
    return "sent"
  } catch (err) {
    console.error("[push] order event:", err instanceof Error ? err.message : err)
    return "failed"
  }
}
