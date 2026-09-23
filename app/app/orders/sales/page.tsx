import { after } from "next/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { COLUMNS_COOKIE, hiddenColumnsFrom, type OrderRow } from "@/lib/orders/order-view"
import { readCreatorOrders } from "@/lib/orders/load-rows"
import { TIME_ZONE_COOKIE, readTimeZone } from "@/lib/orders/time-zone"
import { RANGE_COOKIE } from "@/lib/orders/range"
import { OrdersClient } from "../orders-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Orders",
}

/**
 * A REFUND MADE IN THE STRIPE DASHBOARD reaches us as `charge.refunded` on the
 * webhook. This is the net under that, for a webhook that never arrived.
 *
 * It used to run before the page rendered, one Stripe call after another for
 * every paid order the creator had ever taken: a page that got slower with
 * every sale. It runs after the response now, on recent orders only and a
 * few at a time, and what it finds shows on the next visit.
 */
const REFUND_CHECK_DAYS = 120
const REFUND_CHECK_CONCURRENCY = 6
const REFUND_CHECK_MAX = 60

async function catchMissedRefunds(rows: OrderRow[]) {
  const admin = createAdminClient()
  const since = Date.now() - REFUND_CHECK_DAYS * 24 * 3_600_000
  /*
    ONE PAYMENT CAN BE SEVERAL ROWS. A basket writes a row per product under
    one payment intent, and Stripe reports refunds per payment, not per row.
    Reading "something on this payment was refunded" as "this row was" marked
    every product in a basket refunded when one of them was. So the check is
    per payment: a payment with one row takes Stripe's amount, a payment with
    several is only marked when Stripe says the whole of it went back, and a
    part refund of a basket is left to the webhook, which knows which item.
  */
  const rowsByIntent = new Map<string, OrderRow[]>()
  for (const row of rows) {
    if (!row.stripe_payment_intent_id) continue
    const list = rowsByIntent.get(row.stripe_payment_intent_id)
    if (list) list.push(row)
    else rowsByIntent.set(row.stripe_payment_intent_id, [row])
  }
  const queue = [...rowsByIntent.entries()]
    .filter(([, group]) => group.some((o) => o.status === "completed" && Date.parse(o.created_at) >= since))
    .slice(0, REFUND_CHECK_MAX)
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [intent, group] = next
      try {
        const pi = await stripe.paymentIntents.retrieve(intent, { expand: ["latest_charge"] })
        const charge = pi.latest_charge as { refunded?: boolean; amount_refunded?: number } | null
        if (!charge || !(charge.refunded || (charge.amount_refunded ?? 0) > 0)) continue
        if (group.length > 1 && !charge.refunded) continue
        const refundedAt = new Date().toISOString()
        for (const order of group) {
          if (order.status !== "completed") continue
          await admin.from("orders").update({ status: "refunded" }).eq("id", order.id)
          const whole = (order.amount_cents || 0) + (order.tip_cents || 0)
          await admin
            .from("orders")
            .update({
              refund_amount_cents: group.length === 1 ? charge.amount_refunded || order.amount_cents : whole,
              refunded_at: refundedAt,
            })
            .eq("id", order.id)
        }
      } catch {
        /* An invalid or rate limited intent is left for the next visit. */
      }
    }
  }
  await Promise.all(Array.from({ length: REFUND_CHECK_CONCURRENCY }, worker))
}

export default async function OrdersPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: creator } = await admin
    .from("creators")
    .select("id, stripe_onboarding_status")
    .eq("user_id", user.id)
    .single()
  if (!creator) redirect("/onboarding")

  /* Scoped by the creator's own products, read with the service role: the
     creator id came from the session above, never from the request. Every
     product with every column, and every order a thousand at a time, and a
     failed read stops the page rather than drawing no orders
     (lib/orders/load-rows.ts). */
  const { products, rows } = await readCreatorOrders(admin, creator.id)
  if (rows.length > 0) {
    const snapshot = rows
    after(() => catchMissedRefunds(snapshot))
  }

  const jar = await cookies()

  return (
    <OrdersClient
      rows={rows}
      products={products.map((p) => ({ id: p.id, title: p.title }))}
      stripeConnected={creator.stripe_onboarding_status === "connected"}
      hiddenColumns={hiddenColumnsFrom(jar.get(COLUMNS_COOKIE)?.value)}
      initialRange={jar.get(RANGE_COOKIE)?.value ?? null}
      timeZone={readTimeZone(jar.get(TIME_ZONE_COOKIE)?.value)}
      now={Date.now()}
    />
  )
}
