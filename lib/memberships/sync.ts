import "server-only"

/**
 * ===========================================================================
 *  STRIPE SAYS, THE MEMBERSHIP ROW FOLLOWS, ONCE
 * ===========================================================================
 * Every path that learns something about a membership comes through here:
 * the webhook (customer.subscription.*, invoice.*), the checkout's own
 * confirmation after the buyer pays, Manage (cancel, resume) and the
 * scheduled job. So there is one way a row changes.
 *
 * STRIPE IS ASKED, NOT BELIEVED. An event carries the subscription as it was
 * when the event was made, and Stripe does not promise to deliver events in
 * order: "created" can land after "updated" and would put a paid member
 * back to incomplete. So every sync retrieves the subscription as it is now
 * and writes that. Running it twice, or for an old event, writes the same
 * row. A Stripe that cannot be reached throws, and the webhook answers 500
 * so Stripe delivers it again.
 *
 * WHAT A CHANGE CAUSES is read from the row before and after
 * (lib/memberships/state.ts transitions), and each effect is once by its own
 * key: the member's emails by notify's event keys, the products a
 * membership includes by the library rows that name the membership, a
 * payment by its Stripe invoice id.
 */
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { emit } from "@/lib/notify/outbox"
import { raiseSaleEvents } from "@/lib/orders/sale-events"
import { paymentFacts, recordCustomer, recordSale } from "@/lib/checkout/fulfil-payment"
import { fieldsFromSubscription, graceEndsAt, grantsAccess, isMembershipSubscription, transitions, type Transition } from "./state"
import { MEMBERSHIP_COLUMNS, receiptTokenFor, siteUrl, type Db, type MembershipRow } from "./server"
import { communityAccessAfterMembership } from "@/lib/communities/server/payment-hooks"

export async function retrieveSubscription(id: string): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(id, { expand: ["default_payment_method", "pending_setup_intent"] })
}

async function rowFor(admin: Db, subscriptionId: string): Promise<MembershipRow | null> {
  const { data } = await admin.from("memberships").select(MEMBERSHIP_COLUMNS).eq("stripe_subscription_id", subscriptionId).maybeSingle()
  return (data as MembershipRow | null) ?? null
}

export interface SyncResult {
  row: MembershipRow | null
  transitions: Transition[]
}

/**
 * The membership row for a subscription, as Stripe has it now. Makes the row
 * when the checkout did not get to (a buyer who closed the tab), from what
 * the checkout put on the subscription's metadata.
 */
export async function syncSubscription(admin: Db, subscriptionId: string, opts: { now?: number; subscription?: Stripe.Subscription } = {}): Promise<SyncResult> {
  const now = opts.now ?? Date.now()
  const sub = opts.subscription ?? (await retrieveSubscription(subscriptionId))
  if (!isMembershipSubscription(sub)) return { row: null, transitions: [] }
  const before = await rowFor(admin, sub.id)
  const fields = fieldsFromSubscription(sub as never, before, now)
  const stamp = { ...fields, synced_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }

  let row: MembershipRow | null = null
  if (before) {
    const { data, error } = await admin.from("memberships").update(stamp).eq("id", before.id).select(MEMBERSHIP_COLUMNS).single()
    if (error) throw new Error(`membership update: ${error.code ?? ""} ${error.message ?? ""}`)
    row = data as MembershipRow
  } else {
    const m = sub.metadata || {}
    const insert = {
      ...stamp,
      stripe_subscription_id: sub.id,
      product_id: m.product_id || null,
      creator_id: m.creator_id || null,
      buyer_id: m.buyer_id || null,
      buyer_email: (m.buyer_email || "").toLowerCase() || `unknown+${sub.id}@storelib.invalid`,
      buyer_name: m.buyer_name || null,
      title: m.title || null,
      email_updates: m.email_opt_out === "true" ? false : true,
    }
    const { data, error } = await admin.from("memberships").insert(insert).select(MEMBERSHIP_COLUMNS).single()
    if (error) {
      /* Made a moment ago by the other path: theirs is the row, and this is an update of it. */
      if (error.code === "23505") return syncSubscription(admin, subscriptionId, { now, subscription: sub })
      throw new Error(`membership insert: ${error.code ?? ""} ${error.message ?? ""}`)
    }
    row = data as MembershipRow
  }

  const changed = transitions(before, row, now)
  await applyEffects(admin, before, row, changed)
  return { row, transitions: changed }
}

/* ── What a change causes ───────────────────────────────────────────────── */

async function applyEffects(admin: Db, before: MembershipRow | null, row: MembershipRow, changed: Transition[]) {
  const quietly = async (what: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      console.error(`[memberships] ${what} failed for ${row.id}:`, e instanceof Error ? e.message : e)
    }
  }
  /*
    The library rows follow access as it is now, not only its changes: a
    period that ran out between two syncs is no access at both ends of the
    change, and its rows must still go. Removing rows that are not there
    removes nothing.
  */
  if (changed.includes("access_on")) await quietly("granting included products", () => grantIncluded(admin, row))
  if (!grantsAccess(row)) await quietly("removing included products", () => revokeIncluded(admin, row.id))
  if (changed.includes("started")) await quietly("welcome", () => notice(admin, row, "membership.started", `membership:${row.id}:started`))
  if (changed.includes("cancel_scheduled"))
    await quietly("cancel notice", () => notice(admin, row, "membership.canceled", `membership:${row.id}:canceled:${row.current_period_end ?? "now"}`, { endsAt: row.current_period_end }))
  if (changed.includes("ended")) await quietly("ended notice", () => notice(admin, row, "membership.ended", `membership:${row.id}:ended`))
  /*
    THE COMMUNITIES THIS MEMBERSHIP OPENS follow it on every sync, not only
    on a change, for the same reason as the library rows above. Access that
    has just started may bring back a member who had left; a renewal never
    does. Caught twice over (payment-hooks catches everything), so a
    community can never stop a membership from syncing.
  */
  await quietly("community access", () => communityAccessAfterMembership(admin, row, { fresh: changed.includes("access_on") }))
  void before
}

/** The account a membership's buyer has, by id or by the confirmed address they paid with; written onto the row when found. */
export async function buyerAccountOf(admin: Db, row: Pick<MembershipRow, "id" | "buyer_id" | "buyer_email">): Promise<string | null> {
  if (row.buyer_id) return row.buyer_id
  const { data: profile } = await admin.from("profiles").select("id, email_verified").eq("email", row.buyer_email).maybeSingle()
  if (!profile?.id || profile.email_verified === false) return null
  await admin.from("memberships").update({ buyer_id: profile.id }).eq("id", row.id).is("buyer_id", null)
  return profile.id as string
}

/**
 * THE PRODUCTS A MEMBERSHIP INCLUDES, IN THE MEMBER'S LIBRARY. A library row
 * per included product, marked with the membership, so it can be taken away
 * again when the membership ends, and only that one: a product the member
 * also bought on its own is theirs already and is left alone.
 */
export async function grantIncluded(admin: Db, row: Pick<MembershipRow, "id" | "product_id" | "creator_id" | "buyer_id" | "buyer_email">): Promise<number> {
  if (!row.product_id) return 0
  const { data: plan } = await admin.from("membership_plans").select("included_product_ids, creator_id").eq("product_id", row.product_id).maybeSingle()
  const ids: string[] = Array.isArray(plan?.included_product_ids) ? plan.included_product_ids : []
  if (ids.length === 0) return 0
  const buyerId = await buyerAccountOf(admin, row)
  if (!buyerId) return 0
  const { data: owned } = await admin.from("entitlements").select("product_id").eq("buyer_id", buyerId).in("product_id", ids)
  const have = new Set(((owned as { product_id: string }[] | null) ?? []).map((e) => e.product_id))
  const missing = ids.filter((id) => !have.has(id))
  if (missing.length === 0) return 0
  const { error } = await admin.from("entitlements").insert(
    missing.map((productId) => ({ buyer_id: buyerId, creator_id: plan?.creator_id ?? row.creator_id, product_id: productId, membership_id: row.id, community_access: false })),
  )
  if (error && error.code !== "23505") throw new Error(`${error.code ?? ""} ${error.message ?? ""}`)
  return missing.length
}

export async function revokeIncluded(admin: Db, membershipId: string, productIds?: string[]): Promise<void> {
  let q = admin.from("entitlements").delete().eq("membership_id", membershipId)
  if (productIds && productIds.length > 0) q = q.in("product_id", productIds)
  const { error } = await q
  if (error) throw new Error(`${error.code ?? ""} ${error.message ?? ""}`)
}

/* ── Telling the member ─────────────────────────────────────────────────── */

type MembershipEvent = "membership.started" | "membership.renewed" | "membership.renewal_upcoming" | "membership.payment_failed" | "membership.canceled" | "membership.ended"

async function creatorNameOf(admin: Db, creatorId: string | null): Promise<string | null> {
  if (!creatorId) return null
  const { data: creator } = await admin.from("creators").select("user_id, slug").eq("id", creatorId).maybeSingle()
  if (!creator?.user_id) return creator?.slug ?? null
  const { data: profile } = await admin.from("profiles").select("display_name, username").eq("id", creator.user_id).maybeSingle()
  return (profile?.display_name || profile?.username || creator.slug || null) as string | null
}

/** One event for the member (lib/notify/workflows/memberships.ts). Never throws. */
export async function notice(admin: Db, row: MembershipRow, name: MembershipEvent, key: string, extra: Record<string, unknown> = {}): Promise<void> {
  if (!row.buyer_email || row.buyer_email.endsWith("@storelib.invalid")) return
  const creatorName = await creatorNameOf(admin, row.creator_id).catch(() => null)
  await emit({
    name,
    key,
    userId: null,
    creatorId: row.creator_id,
    entityType: "membership",
    entityId: row.id,
    payload: {
      buyerEmail: row.buyer_email,
      membershipId: row.id,
      membershipTitle: row.title,
      creatorName,
      amountCents: row.amount_cents,
      currency: row.currency,
      interval: row.billing_interval,
      periodEnd: row.current_period_end,
      trialEnd: row.status === "trialing" ? row.trial_end : null,
      cardLast4: row.card_last4,
      graceEndsAt: graceEndsAt(row),
      ...extra,
    },
  })
}

/* ── Payments ───────────────────────────────────────────────────────────── */

/** The subscription an invoice belongs to, in the API version this SDK pins and the ones before it. */
export function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent?.subscription_details?.subscription
  if (typeof parent === "string") return parent
  if (parent && typeof parent === "object") return parent.id
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription
  return typeof legacy === "string" ? legacy : legacy?.id ?? null
}

/** Whether an invoice is a membership's: from the subscription's metadata the invoice carries, else from the table. */
export async function isMembershipInvoice(admin: Db, invoice: Stripe.Invoice): Promise<boolean> {
  if (invoice.parent?.subscription_details?.metadata?.kind === "membership") return true
  const subId = subscriptionIdOf(invoice)
  if (!subId) return false
  const { data } = await admin.from("memberships").select("id").eq("stripe_subscription_id", subId).maybeSingle()
  return Boolean(data?.id)
}

function invoicePeriod(invoice: Stripe.Invoice): { start: string | null; end: string | null } {
  const line = invoice.lines?.data?.[0]
  const s = line?.period?.start ?? null
  const e = line?.period?.end ?? null
  return { start: s ? new Date(s * 1000).toISOString() : null, end: e ? new Date(e * 1000).toISOString() : null }
}

async function paymentIntentOf(invoice: Stripe.Invoice): Promise<Stripe.PaymentIntent | null> {
  const payments = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 10 })
  const paid = payments.data.find((p) => p.status === "paid" && p.payment?.type === "payment_intent") ?? payments.data.find((p) => p.payment?.type === "payment_intent")
  const pi = paid?.payment?.payment_intent
  const id = typeof pi === "string" ? pi : pi?.id
  if (!id) return null
  return stripe.paymentIntents.retrieve(id, { expand: ["latest_charge", "latest_charge.transfer"] })
}

/**
 * A PAID INVOICE: THE MEMBER'S RECEIPT AND THE CREATOR'S SALE, ONCE. The
 * invoice is kept by its Stripe id (membership_invoices), and a payment of
 * more than nothing becomes an order like any other sale, so it is in the
 * creator's Orders, Analytics, balance and sale email, and the buyer's
 * receipts. The order's receipt token is made from the invoice id
 * (./server receiptTokenFor) and orders hold it unique, so two deliveries at
 * once make one order.
 */
export async function recordPaidInvoice(admin: Db, invoice: Stripe.Invoice, opts: { baseUrl?: string } = {}): Promise<{ orderId: string | null }> {
  const subId = subscriptionIdOf(invoice)
  if (!subId) return { orderId: null }
  let row = await rowFor(admin, subId)
  if (!row) row = (await syncSubscription(admin, subId)).row
  if (!row) return { orderId: null }

  const period = invoicePeriod(invoice)
  const paidAt = invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : new Date().toISOString()
  await admin.from("membership_invoices").upsert(
    {
      stripe_invoice_id: invoice.id,
      membership_id: row.id,
      amount_cents: invoice.amount_paid ?? 0,
      currency: invoice.currency || "usd",
      status: "paid",
      billing_reason: invoice.billing_reason ?? null,
      period_start: period.start,
      period_end: period.end,
      paid_at: paidAt,
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    },
    { onConflict: "stripe_invoice_id" },
  )
  const { data: kept } = await admin.from("membership_invoices").select("order_id").eq("stripe_invoice_id", invoice.id).maybeSingle()
  if (kept?.order_id) return { orderId: kept.order_id as string }
  const total = invoice.amount_paid ?? 0
  if (total <= 0 || !row.product_id || !row.creator_id) return { orderId: null }

  const pi = await paymentIntentOf(invoice)
  const facts = pi ? paymentFacts(pi) : null
  const feeCents = facts?.applicationFeeCents ?? 0
  const receiptToken = receiptTokenFor(invoice.id)
  const [first, ...rest] = (row.buyer_name || "").trim().split(/\s+/)
  const orderRow = {
    buyer_id: row.buyer_id,
    buyer_first_name: first || null,
    buyer_last_name: rest.join(" ") || null,
    buyer_email: row.buyer_email,
    product_id: row.product_id,
    amount_cents: total,
    tip_cents: 0,
    fee_cents: feeCents,
    application_fee_cents: feeCents,
    transfer_id: facts?.transferId ?? null,
    currency: invoice.currency || "usd",
    provider: "stripe",
    status: "completed",
    stripe_payment_intent_id: pi?.id ?? null,
    receipt_token: receiptToken,
    allowed_fingerprints: [],
    buyer_email_attempt_count: 0,
    seller_email_attempt_count: 0,
    payment_method: facts?.paymentMethod ?? "card",
    card_brand: facts?.cardBrand ?? row.card_brand,
    card_last4: facts?.cardLast4 ?? row.card_last4,
    agreed_to_terms: true,
    agreed_at: paidAt,
  }
  let orderId: string | null = null
  const { data: made, error } = await admin.from("orders").insert(orderRow).select("id").single()
  let created = false
  if (made?.id) {
    orderId = made.id
    created = true
  } else {
    const { data: raced } = await admin.from("orders").select("id").eq("receipt_token", receiptToken).maybeSingle()
    if (!raced?.id) throw new Error(`membership order: ${error?.code ?? ""} ${error?.message ?? ""}`)
    orderId = raced.id
  }
  await admin.from("membership_invoices").update({ order_id: orderId }).eq("stripe_invoice_id", invoice.id)
  if (!created || !orderId) return { orderId }

  const step = async (what: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      console.error(`[memberships] ${what} failed for order ${orderId}:`, e instanceof Error ? e.message : e)
    }
  }
  const creatorId = row.creator_id
  const productId = row.product_id
  const firstPayment = invoice.billing_reason === "subscription_create" || invoice.billing_reason === "subscription_update"
  await step("customer", () => recordCustomer(admin, { creatorId, email: row!.buyer_email, first: first || undefined, last: rest.join(" ") || undefined, total }))
  await step("ledger", () => recordSale(admin, { creatorId, orderId: orderId!, total, fee: feeCents, destinationPaymentId: facts?.destinationPaymentId ?? null }))
  if (firstPayment) {
    await step("sales count", async () => {
      await admin.rpc("increment_product_sales", { p_product_id: productId })
      await admin.from("analytics_events").insert({ creator_id: creatorId, product_id: productId, event_type: "purchase" })
    })
  }
  /* The seller's sale email, once per order (email_logs), under their own "Sales by email" setting. */
  await step("sale email", async () => {
    const { resolveSellerEmail, sendSellerNotificationEmail } = await import("@/lib/email")
    const sellerEmail = await resolveSellerEmail(admin, creatorId)
    await sendSellerNotificationEmail(admin, {
      orderId: orderId!,
      creatorId,
      sellerEmail,
      productTitle: row!.title || "Membership",
      buyerFirstName: first || "",
      buyerLastName: rest.join(" "),
      buyerEmail: row!.buyer_email,
      amountCents: total,
      feeCents,
      baseUrl: opts.baseUrl || siteUrl(""),
      variantName: row!.billing_interval === "year" ? "Yearly" : "Monthly",
    })
  })
  /*
    The bell. The first payment is a purchase (order.created, and the one review ask a purchase gets); a renewal is a
    sale line only, so a member is not asked for a review every month.
  */
  await step("notify", () =>
    raiseSaleEvents(admin, {
      creatorId,
      purchase: firstPayment ? { orderId: orderId!, amountCents: total, lineCount: 1 } : null,
      lines: [{ orderId: orderId!, productId, productTitle: row!.title, amountCents: total, feeCents }],
      currency: invoice.currency || "usd",
      buyerEmail: row!.buyer_email,
      correlationId: invoice.id,
    }),
  )
  await step("push", async () => {
    const { data: creator } = await admin.from("creators").select("user_id").eq("id", creatorId).maybeSingle()
    if (!creator?.user_id) return
    const { notifySale } = await import("@/lib/push/notifications")
    await notifySale(creator.user_id, { productName: row!.title || "Membership", amountCents: total, orderId: orderId!, productId })
  })
  if (invoice.billing_reason === "subscription_cycle") {
    await step("renewal receipt", () => notice(admin, row!, "membership.renewed", `membership:${row!.id}:renewed:${invoice.id}`, { amountCents: total, invoiceId: invoice.id, cardLast4: facts?.cardLast4 ?? row!.card_last4 }))
  }
  return { orderId }
}

/** A payment that failed: kept, the row brought up to date (past due), and the member told once per attempt. */
export async function recordFailedInvoice(admin: Db, invoice: Stripe.Invoice): Promise<void> {
  const subId = subscriptionIdOf(invoice)
  if (!subId) return
  const { row } = await syncSubscription(admin, subId)
  if (!row) return
  const period = invoicePeriod(invoice)
  const { data: kept } = await admin.from("membership_invoices").select("status").eq("stripe_invoice_id", invoice.id).maybeSingle()
  if (kept?.status !== "paid") {
    await admin.from("membership_invoices").upsert(
      {
        stripe_invoice_id: invoice.id,
        membership_id: row.id,
        amount_cents: invoice.amount_due ?? 0,
        currency: invoice.currency || "usd",
        status: "failed",
        billing_reason: invoice.billing_reason ?? null,
        period_start: period.start,
        period_end: period.end,
        hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      },
      { onConflict: "stripe_invoice_id" },
    )
  }
  /* The first payment failing is said on the checkout page, to the person pressing Pay; an email would only repeat it. */
  if (invoice.billing_reason === "subscription_create") return
  await notice(admin, row, "membership.payment_failed", `membership:${row.id}:failed:${invoice.id}:${invoice.attempt_count ?? 1}`, {
    amountCents: invoice.amount_due ?? row.amount_cents,
    invoiceId: `${invoice.id}:${invoice.attempt_count ?? 1}`,
  })
}
