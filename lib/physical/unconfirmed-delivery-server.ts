import "server-only"

/**
 * ===========================================================================
 *  A TRACKED PARCEL NOBODY EVER MARKED DELIVERED
 * ===========================================================================
 * A shipment with a tracking number that is still "shipped", "in transit"
 * or "out for delivery" 60 days after it left was lost, delivered without a
 * scan, or simply never updated. It is closed as DELIVERY NOT CONFIRMED for
 * the seller to follow up: the shipment is marked (fulfillments.
 * delivery_unconfirmed_at, SQL part 164), the order's timeline says so, and
 * the seller is emailed once (the delivery problem email, through the
 * timeline entry: lib/physical/events-server.ts). The buyer's return window
 * already ended on its own (lib/physical/status returnWindow), so nothing
 * stays open for ever.
 *
 * COURIER TRACKING (SQL part 160, lib/physical/tracking) knows better. A
 * parcel its carrier says was delivered or sent back to the shop is never
 * closed here (tracking moves it itself), and neither is one whose carrier
 * scanned it in the last TRACKING_RECENT_DAYS: it is still moving. This
 * pass only reads tracking's columns and never writes them, so tracking's
 * own end (tracking_stopped_at) stays tracking's.
 *
 * Run by /api/cron/physical. Keyed by the shipment, so two runs at once, or
 * a run before part 164 (no column to mark, the timeline key holds it),
 * write and send once.
 */
import type { Db } from "./auth"
import { addOrderEvent } from "./events-server"
import { logEvent } from "@/lib/net/log"

export const UNCONFIRMED_AFTER_DAYS = 60
export const UNCONFIRMED_EVENT = "delivery.unconfirmed"
const OPEN = ["shipped", "in_transit", "out_for_delivery"]

export const TRACKING_RECENT_DAYS = 14
/** Courier tracking's states that end a parcel's way (lib/physical/tracking/labels.ts). */
const TRACKING_ENDED = new Set(["delivered", "returned"])

type Row = { id: string; checkout_id: string; creator_id: string | null; status: string; carrier: string | null; tracking_number: string | null; shipped_at: string; tracking_status?: string | null; tracking_last_event_at?: string | null }

/** Whether a shipment is one to close: tracked, still on its way, shipped at least 60 days before `now`, never delivered, and courier tracking neither ended it nor saw it move lately. Pure. */
export function isUnconfirmed(
  f: { status: string; tracking_number: string | null; shipped_at: string | null; delivered_at: string | null; delivery_unconfirmed_at?: string | null; tracking_status?: string | null; tracking_last_event_at?: string | null },
  now: number,
): boolean {
  if (!OPEN.includes(f.status) || !f.tracking_number || f.delivered_at || f.delivery_unconfirmed_at) return false
  if (f.tracking_status && TRACKING_ENDED.has(f.tracking_status)) return false
  const scanned = f.tracking_last_event_at ? Date.parse(f.tracking_last_event_at) : NaN
  if (Number.isFinite(scanned) && now - scanned < TRACKING_RECENT_DAYS * 86_400_000) return false
  const shipped = f.shipped_at ? Date.parse(f.shipped_at) : NaN
  return Number.isFinite(shipped) && now - shipped >= UNCONFIRMED_AFTER_DAYS * 86_400_000
}

export async function closeUnconfirmedDeliveries(db: Db, now: number = Date.now(), limit = 100): Promise<{ closed: number }> {
  const before = new Date(now - UNCONFIRMED_AFTER_DAYS * 86_400_000).toISOString()
  const cols = "id, checkout_id, creator_id, status, carrier, tracking_number, shipped_at, delivered_at"
  /* Part 164's mark and part 160's tracking columns, each read only where it ran. */
  let withTracking = true
  const ask = (withMark: boolean) => {
    const extra = [withMark ? "delivery_unconfirmed_at" : "", withTracking ? "tracking_status, tracking_last_event_at" : ""].filter(Boolean).join(", ")
    let q = db.from("fulfillments").select(extra ? `${cols}, ${extra}` : cols).in("status", OPEN).is("delivered_at", null).not("tracking_number", "is", null).lte("shipped_at", before)
    if (withMark) q = q.is("delivery_unconfirmed_at", null)
    return q.order("shipped_at", { ascending: true }).limit(limit)
  }
  let marked = true
  let { data, error } = await ask(true)
  /* Before SQL part 164 there is no mark: the timeline entry's key keeps each shipment to one entry and one email. */
  const missing = (e: { code?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204")
  if (missing(error)) {
    withTracking = false
    ;({ data, error } = await ask(true))
  }
  if (missing(error)) {
    marked = false
    ;({ data, error } = await ask(false))
  }
  if (error) {
    /* Was `error.code` alone, which a timeout does not have ("not read: undefined"). */
    logEvent("error", "physical_unconfirmed_unread", { msg: "[physical] unconfirmed deliveries not read", code: (error as { code?: string }).code ?? null, reason: (error as { message?: string }).message ?? null })
    return { closed: 0 }
  }
  let closed = 0
  for (const f of (data ?? []) as Row[]) {
    if (!isUnconfirmed({ ...f, delivered_at: null }, now)) continue
    if (marked) {
      const { data: took } = await db.from("fulfillments").update({ delivery_unconfirmed_at: new Date(now).toISOString() }).eq("id", f.id).is("delivery_unconfirmed_at", null).select("id").maybeSingle()
      /* Another run took it first. */
      if (!took) continue
    }
    await addOrderEvent(db, {
      checkoutId: f.checkout_id,
      creatorId: f.creator_id,
      kind: UNCONFIRMED_EVENT,
      message: `Delivery not confirmed: ${[f.carrier, f.tracking_number].filter(Boolean).join(" ")} shipped ${UNCONFIRMED_AFTER_DAYS} days ago and was never marked delivered. Check with the carrier or the buyer.`,
      detail: { fulfillmentId: f.id, carrier: f.carrier, trackingNumber: f.tracking_number, shippedAt: f.shipped_at },
      actor: "system",
      key: `unconfirmed:${f.id}`,
    })
    closed++
  }
  return { closed }
}
