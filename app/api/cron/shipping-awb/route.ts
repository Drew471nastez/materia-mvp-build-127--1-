import { NextResponse, type NextRequest } from "next/server"

import { autoAwbEnabled, createAwbForOrder, PAID_STATUSES } from "@/lib/shipping/create-awb"
import { isMissingShippingSchema } from "@/lib/shipping/order-access"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  CRON: book the courier for anything paid that still has no AWB
 * ===========================================================================
 *
 * Like Vinted, the label should exist without anyone asking for it. There are
 * two things that make that happen and this is the reliable one.
 *
 * The other is opportunistic: the order page books the shipment the moment it
 * attaches a delivery address. That covers the common case within seconds, but
 * it only fires if somebody opens the order — so on its own it would mean a
 * buyer who closes the tab after paying waits for the seller to look.
 *
 * This sweep is the floor under that. It asks a question no webhook can get
 * wrong — "which paid orders have a destination and no AWB?" — and answers it
 * on a schedule. It needs no hook in the payment flow, which is the point:
 * four separate places create orders in this codebase and none of them had to
 * change for shipping to work.
 *
 * ---------------------------------------------------------------------------
 * Why running this repeatedly is safe
 * ---------------------------------------------------------------------------
 * Every booking goes through `createAwbForOrder`, which read-checks the AWB,
 * claims the order with a conditional update, and is backed by a unique index.
 * A sweep that overlaps with the order page, or with a previous sweep that ran
 * long, produces one AWB — not two vans.
 *
 * It is also bounded: BATCH orders per run, and it stops early the moment the
 * wallet says there is no money, rather than walking a hundred orders to fail
 * a hundred times.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Small enough to finish inside the function's time limit, with each booking
 *  costing a round trip to the courier. */
const BATCH = 10

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Unset locally so the route can be exercised in development; on any
  // deployment that sets it — which Vercel does — the header must match.
  if (!secret) return true
  return req.headers.get("authorization") === `Bearer ${secret}`
}

async function sweep(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!autoAwbEnabled()) {
    return NextResponse.json({ ok: true, skipped: "auto_awb_disabled", booked: 0 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 })
  }

  // Paid, has somewhere to go, has no AWB. `ship_mode` rather than the locker
  // id, because a home delivery legitimately has no locker.
  const { data, error } = await admin
    .from("orders")
    .select("id")
    // The same list createAwbForOrder checks against, imported rather than
    // retyped — a second copy would drift, and the drift shows up as orders
    // this sweep never picks up and nobody notices are unshipped.
    .in("status", PAID_STATUSES as unknown as string[])
    .not("ship_mode", "is", null)
    .is("awb_number", null)
    // An order already being booked by something else is left alone; the claim
    // in createAwbForOrder would refuse it anyway, but not asking is cheaper.
    .or("shipping_status.is.null,shipping_status.eq.awaiting_shipment,shipping_status.eq.shipping_creation_failed")
    .order("created_at", { ascending: true })
    .limit(BATCH)

  if (error) {
    // The migration has not been run. Not a failure — shipping is simply not
    // switched on yet, and a cron that screams about it every ten minutes is
    // noise that trains people to ignore the log.
    if (isMissingShippingSchema(error)) {
      return NextResponse.json({ ok: true, skipped: "shipping_not_configured", booked: 0 })
    }
    console.error("[cron/shipping-awb] query failed:", error.message)
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 })
  }

  const orders = (data ?? []) as Array<{ id: string }>
  let booked = 0
  let failed = 0
  const reasons: Record<string, number> = {}

  for (const order of orders) {
    const result = await createAwbForOrder(order.id)
    if (result.ok) {
      booked++
      continue
    }
    failed++
    reasons[result.code] = (reasons[result.code] ?? 0) + 1
    // An empty wallet will not fill up between two orders in the same loop.
    // Stopping here keeps one unfunded account from producing a run of
    // identical failures across every pending order.
    if (result.code === "insufficient_funds") break
  }

  // Order ids are deliberately absent: this line goes to a log that is not the
  // place for a list of who bought what.
  console.log("[cron/shipping-awb]", { considered: orders.length, booked, failed, reasons })
  return NextResponse.json({ ok: true, considered: orders.length, booked, failed, reasons })
}

// Vercel Cron issues GET; POST is kept so the sweep can be triggered by hand.
export async function GET(req: NextRequest) {
  return sweep(req)
}
export async function POST(req: NextRequest) {
  return sweep(req)
}
