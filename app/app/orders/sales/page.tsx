import { after } from "next/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { COLUMNS_COOKIE, hiddenColumnsFrom, type OrderRow } from "@/lib/orders/order-view"
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
  const queue = rows.filter(
    (o) => o.status === "completed" && o.stripe_payment_intent_id && Date.parse(o.created_at) >= since,
  ).slice(0, REFUND_CHECK_MAX)
  const worker = async () => {
    for (let order = queue.shift(); order; order = queue.shift()) {
      try {
        const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id!, { expand: ["latest_charge"] })
        const charge = pi.latest_charge as { refunded?: boolean; amount_refunded?: number } | null
        if (!charge || !(charge.refunded || (charge.amount_refunded ?? 0) > 0)) continue
        await admin.from("orders").update({ status: "refunded" }).eq("id", order.id)
        await admin
          .from("orders")
          .update({ refund_amount_cents: charge.amount_refunded || order.amount_cents, refunded_at: new Date().toISOString() })
          .eq("id", order.id)
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

  /*
    EVERY COLUMN, NOT A LIST OF THEM. This named `gallery_images`, a column
    the products table does not have (it is `gallery_urls`), and PostgREST
    answers a query naming a missing column with an error, not with the
    columns it does have. The error was not looked at, so the page read "no
    products", then "no orders", and a creator with a year of sales was told
    they had none. `*` cannot name a column that is not there, and a failed
    read now stops the page instead of drawing an empty one.
  */
  const { data: productsData, error: productsError } = await admin
    .from("products")
    .select("*")
    .eq("creator_id", creator.id)
  if (productsError) throw new Error(`Orders: could not read products (${productsError.message})`)
  const products = (productsData || []).map((p: any) => ({
    id: p.id as string,
    title: (p.title as string) || "Untitled product",
    type: (p.type as string) || null,
    thumbnail_url: (p.thumbnail_url as string) || p.gallery_urls?.[0] || p.gallery_images?.[0] || null,
  }))

  let rows: OrderRow[] = []
  if (products.length > 0) {
    /* Scoped by the creator's own products, read with the service role: the
       creator id came from the session above, never from the request. */
    /*
      A page at a time: a query returns at most 1,000 rows, and a creator
      with more orders than that would otherwise lose the oldest ones from
      the list without a word.
    */
    const ordersData: any[] = []
    const productIds = products.map((p) => p.id)
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error: ordersError } = await admin
        .from("orders")
        .select("*")
        .in("product_id", productIds)
        .order("created_at", { ascending: false })
        .range(from, from + 999)
      if (ordersError) throw new Error(`Orders: could not read orders (${ordersError.message})`)
      ordersData.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }

    const byId = new Map(products.map((p) => [p.id, p]))
    rows = ordersData.map((order: any) => {
      const product = byId.get(order.product_id)
      return {
        id: order.id,
        product_id: order.product_id,
        amount_cents: order.amount_cents || 0,
        fee_cents: order.fee_cents ?? null,
        tip_cents: order.tip_cents ?? null,
        status: order.status || "pending",
        created_at: order.created_at,
        payment_method: order.payment_method ?? null,
        card_brand: order.card_brand ?? null,
        card_last4: order.card_last4 ?? null,
        paypal_email: order.paypal_email ?? null,
        buyer_email: order.buyer_email ?? order.customer_email ?? null,
        buyer_first_name: order.buyer_first_name ?? null,
        buyer_last_name: order.buyer_last_name ?? null,
        buyer_country: order.buyer_country ?? null,
        buyer_country_code: order.buyer_country_code ?? null,
        buyer_device_type: order.buyer_device_type ?? null,
        buyer_os: order.buyer_os ?? null,
        buyer_browser: order.buyer_browser ?? null,
        receipt_token: order.receipt_token ?? null,
        stripe_session_id: order.stripe_session_id ?? null,
        stripe_payment_intent_id: order.stripe_payment_intent_id ?? null,
        refund_reason: order.refund_reason ?? null,
        refund_amount_cents: order.refund_amount_cents ?? null,
        refunded_at: order.refunded_at ?? null,
        buyer_notified_at: order.buyer_notified_at ?? null,
        buyer_email_last_error: order.buyer_email_last_error ?? null,
        variant_name: order.variant_name ?? null,
        source: order.source ?? null,
        product: product
          ? { id: product.id, title: product.title, type: product.type, thumbnail_url: product.thumbnail_url }
          : null,
      }
    })

    if (rows.length > 0) {
      const snapshot = rows
      after(() => catchMissedRefunds(snapshot))
    }
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
