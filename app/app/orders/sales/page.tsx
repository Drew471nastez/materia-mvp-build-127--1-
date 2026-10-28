import { after } from "next/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorFor } from "@/lib/team/server"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { stripe } from "@/lib/stripe"
import { COLUMNS_COOKIE, hiddenColumnsFrom, queryFromParams } from "@/lib/orders/order-view"
import { readOrdersListing } from "@/lib/orders/paged"
import { byCreator, ownRows, scopedOrders } from "@/lib/analytics/creator-orders"
import { TIME_ZONE_COOKIE, readTimeZone } from "@/lib/orders/time-zone"
import { accountTimeZone } from "@/lib/account/time-zone"
import { RANGE_COOKIE, firstDayOf, rangeWindow, readOrdersPeriod } from "@/lib/orders/range"
import { todayIn } from "@/lib/date-range/range"
import { isOrderId } from "@/lib/orders/owned"
import { listingKey } from "@/lib/orders/listing-params"
import { OrdersClient } from "../orders-client"
import { pageUser } from "@/lib/auth/page-user"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Orders"),
  }
}

/**
 * A REFUND MADE IN THE STRIPE DASHBOARD reaches us as `charge.refunded` on the
 * webhook. This is the net under that, for a webhook that never arrived.
 *
 * It used to run before the page rendered, one Stripe call after another for
 * every paid order the creator had ever taken: a page that got slower with
 * every sale. It runs after the response now, on recent orders only and a
 * few at a time, and what it finds shows on the next visit. The page no
 * longer reads every order, so this reads its own: the last REFUND_CHECK_DAYS
 * of payments, newest first, and then every row of the ones it checks.
 */
const REFUND_CHECK_DAYS = 120
const REFUND_CHECK_CONCURRENCY = 6
const REFUND_CHECK_MAX = 60
const REFUND_CHECK_ROWS = 2000

type PaidRow = { id: string; status: string; created_at: string; amount_cents: number | null; stripe_payment_intent_id: string | null }
const PAID_COLUMNS = "id, status, created_at, amount_cents, stripe_payment_intent_id"

async function recentPayments(admin: ReturnType<typeof createAdminClient>, creatorId: string, since: number): Promise<Map<string, PaidRow[]>> {
  return byCreator(async (scope) => {
    const { data, error } = await scopedOrders(admin, PAID_COLUMNS, scope, creatorId, null)
      .eq("status", "completed")
      .not("stripe_payment_intent_id", "is", null)
      .gte("created_at", new Date(since).toISOString())
      .order("created_at", { ascending: false })
      .limit(REFUND_CHECK_ROWS)
    if (error) throw new Error(error.message)
    const intents: string[] = []
    for (const row of ownRows((data ?? []) as PaidRow[])) {
      const intent = row.stripe_payment_intent_id
      if (intent && !intents.includes(intent)) intents.push(intent)
      if (intents.length >= REFUND_CHECK_MAX) break
    }
    /* Every row of each payment, whatever its status: a basket is only marked when Stripe says the whole of it went back. */
    const rowsByIntent = new Map<string, PaidRow[]>(intents.map((i) => [i, []]))
    for (let i = 0; i < intents.length; i += 30) {
      const { data: lines, error: linesError } = await scopedOrders(admin, PAID_COLUMNS, scope, creatorId, null).in("stripe_payment_intent_id", intents.slice(i, i + 30))
      if (linesError) throw new Error(linesError.message)
      for (const row of ownRows((lines ?? []) as PaidRow[])) rowsByIntent.get(row.stripe_payment_intent_id as string)?.push(row)
    }
    return rowsByIntent
  })
}

async function catchMissedRefunds(creatorId: string) {
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
  let rowsByIntent: Map<string, PaidRow[]>
  try {
    rowsByIntent = await recentPayments(admin, creatorId, since)
  } catch {
    /* Read again on the next visit. */
    return
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
          /* What was charged, the tip already inside it. */
          const whole = order.amount_cents || 0
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

/** What the address says, as the browser's URLSearchParams would read it. */
function addressOf(searchParams: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    const first = Array.isArray(value) ? value[0] : value
    if (typeof first === "string") params.set(key, first)
  }
  return params
}

export default async function OrdersPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = createAdminClient()

  /* The same answer the /app layout got, through the per-request cache
     (lib/auth/request-scope.ts): no second auth round trip on a full load. */
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  /* The store's: the owner's own, or the one a team member works in when their role has orders (lib/team). */
  const found = await creatorFor<{ id: string; stripe_onboarding_status: string | null }>(admin, user.id, "orders", "id, stripe_onboarding_status")
  if (found.kind === "denied") return <TeamAreaClosed area="orders" store={found.acting.name} permissions={found.acting.permissions} />
  if (found.kind === "none") redirect("/onboarding")
  const creator = found.creator

  const jar = await cookies()
  const address = addressOf((await searchParams) ?? {})
  const timeZone = accountTimeZone(null, user.user_metadata) ?? readTimeZone(jar.get(TIME_ZONE_COOKIE)?.value)
  const initialRange = jar.get(RANGE_COOKIE)?.value ?? null
  const now = Date.now()
  const open = address.get("order")

  /*
    One page of orders, the one the address asks for, with its figures and
    tabs (lib/orders/paged.ts): read with the service role, scoped to the
    creator found from the session above, never from the request. The period
    is worked out as the browser works it out (orders-client.tsx), from the
    first order's day, the address and the remembered range. A failed read
    stops the page rather than drawing no orders.
  */
  const query = queryFromParams(address)
  let key = ""
  const listing = await readOrdersListing(admin, creator.id, (earliest) => {
    const { period } = readOrdersPeriod(address, initialRange, todayIn(timeZone, now), firstDayOf(earliest ? Date.parse(earliest) : null, timeZone))
    const span = rangeWindow(period, { mode: "previous_period" }, now, timeZone)
    key = listingKey(query, period, timeZone)
    return {
      query,
      window: { start: span.start, end: span.end },
      previous: span.previous,
      timeZone,
      open: open && isOrderId(open) ? open : null,
    }
  })
  if (listing.summary.total > 0) after(() => catchMissedRefunds(creator.id))

  const { products, ...initial } = listing
  return (
    <OrdersClient
      listing={initial}
      listingKey={key}
      products={products.map((p) => ({ id: p.id, title: p.title }))}
      stripeConnected={creator.stripe_onboarding_status === "connected"}
      /* Money leaving the store is the owner's: a team member sees no refund button (the refund route refuses them too). */
      canRefund={found.role === "owner"}
      hiddenColumns={hiddenColumnsFrom(jar.get(COLUMNS_COOKIE)?.value)}
      initialRange={jar.get(RANGE_COOKIE)?.value ?? null}
      timeZone={accountTimeZone(null, user.user_metadata) ?? readTimeZone(jar.get(TIME_ZONE_COOKIE)?.value)}
      now={now}
    />
  )
}
