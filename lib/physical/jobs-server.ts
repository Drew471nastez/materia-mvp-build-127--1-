import "server-only"

/**
 * ===========================================================================
 *  THE PHYSICAL COMMERCE JOB QUEUE (commerce_jobs)
 * ===========================================================================
 * Anything that talks to the outside world after an order is a job: the
 * buyer's emails, the order emailed to a supplier, the signed webhook to a
 * merchant's own system. A job is queued with an idempotency key (so the
 * same thing is never queued twice), tried straight away after the response
 * (next/server after), and retried by the cron (/api/cron/physical) with
 * backoff until it succeeds or runs out of attempts. commerce_claim_jobs
 * hands each job to one worker at a time (FOR UPDATE SKIP LOCKED, a lease),
 * so two runs never send the same email.
 */

import { createHmac } from "node:crypto"
import https from "node:https"
import type net from "node:net"
import { after } from "next/server"
import { publicLookup, publicUrlProblem } from "@/lib/api/public-fetch"
import { sendEmail, buildFromHeader } from "@/lib/mail"
import { resolveCreatorIdentity, resolveSellerEmail } from "@/lib/email"
import { getMainDomain } from "@/lib/url-helpers"
import type { Db } from "./auth"
import { addOrderEvent } from "./events-server"
import { loadCustomerEmailCopy } from "@/lib/emails/customer-copy-server"
import { emailIdForJob, itemsText, resolveCopy } from "@/lib/emails/customer-custom"
import { lowStockEmail, orderCancelledEmail, orderConfirmationEmail, orderDateText, pickupEmail, refundEmail, returnEmail, shipmentEmail, supplierOrderEmail, type EmailBrand, type EmailLine } from "./email-templates"
import { creatorTimeZone } from "@/lib/account/time-zone"
import { storeIdentity } from "@/lib/store/identity-server"
import { addressLines } from "./address"
import { METHODS, readMethod } from "./fulfillment"
import { PICKUP_READY_LABEL } from "./pickup"
import type { PickupReady } from "./types"
import { deliveryEstimate } from "./rates"
import { orderNumber, trackingUrl } from "./status"
import { openSecret } from "./secrets"
import { orderPageUrl } from "./order-link-server"
import { PARTNER_PAGE_PREFIX, signPartnerLink } from "./partner-link"
import { sellerCommerceEmail, sellerKindForEvent } from "@/lib/notify/seller-commerce"
import { EMAIL_REPLY_TO } from "@/lib/mail"

export type JobKind = "forward_fulfillment" | "supplier_email" | "webhook_delivery" | "tracking_sync" | "inventory_sync" | "send_email"

export async function enqueueJob(db: Db, j: { creatorId: string | null; kind: JobKind; key: string; payload: Record<string, unknown>; runNow?: boolean }): Promise<void> {
  const { data, error } = await db
    .from("commerce_jobs")
    .insert({ creator_id: j.creatorId, kind: j.kind, payload: j.payload, idempotency_key: j.key })
    .select("id")
    .maybeSingle()
  if (error && error.code !== "23505") console.error("[physical] job not queued:", j.kind, error.code)
  if (data?.id && j.runNow !== false) {
    try {
      after(() => runJobs(db, 5).then(() => undefined))
    } catch {
      /* Outside a request: the cron picks it up. */
    }
  }
}

export async function queueOrderConfirmation(db: Db, checkoutId: string, creatorId: string): Promise<void> {
  await enqueueJob(db, { creatorId, kind: "send_email", key: `email:confirmation:${checkoutId}`, payload: { template: "confirmation", checkoutId } })
}

export async function queueShipmentEmail(db: Db, checkoutId: string, creatorId: string, fulfillmentId: string, kind: "shipped" | "out_for_delivery" | "delivered" | "tracking", key?: string): Promise<void> {
  await enqueueJob(db, { creatorId, kind: "send_email", key: key ?? `email:${kind}:${fulfillmentId}`, payload: { template: "shipment", kind, checkoutId, fulfillmentId } })
}

/** Cancelled before it shipped: once per order. */
export async function queueCancelledEmail(db: Db, checkoutId: string, creatorId: string): Promise<void> {
  await enqueueJob(db, { creatorId, kind: "send_email", key: `email:cancelled:${checkoutId}`, payload: { template: "cancelled", checkoutId } })
}

/**
 * Money went back. Keyed by the order's refunded total, so the Refund button
 * and Stripe's webhook for the same refund queue one email, and a second
 * refund later queues its own. amountCents is this refund alone.
 */
export async function queueRefundEmail(db: Db, checkoutId: string, creatorId: string, refundedCents: number, amountCents: number): Promise<void> {
  if (amountCents <= 0) return
  await enqueueJob(db, { creatorId, kind: "send_email", key: `email:refund:${checkoutId}:${refundedCents}`, payload: { template: "refund", checkoutId, refundedCents, amountCents } })
}

export async function queueReturnEmail(db: Db, checkoutId: string, creatorId: string, returnId: string, status: "approved" | "rejected" | "received" | "completed"): Promise<void> {
  await enqueueJob(db, { creatorId, kind: "send_email", key: `email:return:${returnId}:${status}`, payload: { template: "return", status, checkoutId, returnId } })
}

/**
 * The order goes to whoever ships it: for each location in the order that
 * forwards by email or webhook, a job. A location shipped by the merchant
 * themselves needs nothing; a provider integration that is not live yet is
 * said on the timeline instead of pretending it was sent.
 */
export async function queueForwarding(db: Db, checkoutId: string, creatorId: string): Promise<void> {
  const { data: co } = await db.from("commerce_checkouts").select("lines, delivery_method").eq("id", checkoutId).maybeSingle()
  /* Picked up: the seller hands it over, nobody else is sent anything. */
  if (co?.delivery_method === "pickup") return
  const lines = (co?.lines ?? []) as { location_id: string | null; requires_shipping: boolean; fulfillment_method?: string | null; title?: string }[]
  const ids = [...new Set(lines.filter((l) => l.requires_shipping && l.location_id).map((l) => l.location_id as string))]
  /* An item a partner fulfils, with nowhere to send it: said on the order, never silently dropped. */
  const partnerLines = lines.filter((l) => l.requires_shipping && (readMethod(l.fulfillment_method) ?? "self") !== "self")
  if (ids.length === 0) {
    for (const l of partnerLines) {
      await addOrderEvent(db, {
        checkoutId,
        creatorId,
        kind: "fulfillment.manual_needed",
        message: `${l.title ?? "An item"} is set to ${METHODS[readMethod(l.fulfillment_method) ?? "self"].title.toLowerCase()} but has no partner location. Send it to them yourself.`,
        key: `partner_missing:${checkoutId}:${l.title ?? ""}`.slice(0, 200),
      })
    }
    return
  }
  const { data: locs } = await db.from("inventory_locations").select("id, name, forwarding, email, integration_id").eq("creator_id", creatorId).in("id", ids)
  for (const loc of (locs ?? []) as { id: string; name: string; forwarding: string; email: string | null; integration_id: string | null }[]) {
    const partnerHere = partnerLines.some((l) => l.location_id === loc.id)
    if (loc.forwarding === "none" && partnerHere) {
      await addOrderEvent(db, {
        checkoutId,
        creatorId,
        kind: "fulfillment.manual_needed",
        message: `${loc.name} fulfils part of this order but doesn't receive orders automatically. Send it to them, then add their tracking.`,
        key: `partner_manual:${checkoutId}:${loc.id}`,
      })
      continue
    }
    if (loc.forwarding === "email" && loc.email) {
      await enqueueJob(db, { creatorId, kind: "supplier_email", key: `supplier_email:${checkoutId}:${loc.id}`, payload: { checkoutId, locationId: loc.id } })
    } else if (loc.forwarding === "webhook") {
      await enqueueJob(db, { creatorId, kind: "webhook_delivery", key: `webhook:${checkoutId}:${loc.id}`, payload: { checkoutId, locationId: loc.id, event: "order.paid" } })
    } else if (loc.forwarding === "provider") {
      await addOrderEvent(db, {
        checkoutId,
        creatorId,
        kind: "fulfillment.manual_needed",
        message: `${loc.name} is set to forward through a provider that is not connected. Send this order to them yourself.`,
        key: `provider_manual:${checkoutId}:${loc.id}`,
      })
    }
  }
}

/**
 * After a sale: each variant that sold down to its low stock line (the
 * product's own, else the shop's) is emailed to the seller, at most once a
 * day per variant, when the shop has low stock emails on.
 */
export async function queueLowStockAlerts(db: Db, creatorId: string, variantIds: string[]): Promise<void> {
  const ids = [...new Set(variantIds)].slice(0, 100)
  if (ids.length === 0) return
  const { data: settings } = await db.from("commerce_settings").select("low_stock_alerts, low_stock_default").eq("creator_id", creatorId).maybeSingle()
  if (settings && settings.low_stock_alerts === false) return
  const fallback = Number(settings?.low_stock_default ?? 5)
  const [{ data: variants }, { data: levels }] = await Promise.all([
    db.from("product_variants").select("id, name, product_id, track_inventory, inventory_policy, products!inner(title, creator_id, low_stock_threshold, track_inventory, type)").in("id", ids),
    db.from("inventory_levels").select("variant_id, available").eq("creator_id", creatorId).in("variant_id", ids),
  ])
  const sum = new Map<string, number>()
  for (const l of (levels ?? []) as { variant_id: string; available: number }[]) sum.set(l.variant_id, (sum.get(l.variant_id) ?? 0) + Number(l.available ?? 0))
  const low: { variantId: string; title: string; variantName: string | null; available: number; threshold: number }[] = []
  for (const v of (variants ?? []) as Record<string, any>[]) {
    const p = Array.isArray(v.products) ? v.products[0] : v.products
    if (!p || p.creator_id !== creatorId || p.type !== "physical") continue
    if ((v.track_inventory ?? p.track_inventory ?? true) === false) continue
    const threshold = p.low_stock_threshold ?? fallback
    const available = sum.get(v.id) ?? 0
    if (available > threshold) continue
    low.push({ variantId: v.id, title: p.title, variantName: v.name && v.name !== "Default" ? v.name : null, available, threshold })
  }
  if (low.length === 0) return
  const day = new Date().toISOString().slice(0, 10)
  const key = `email:low_stock:${creatorId}:${day}:${low.map((l) => l.variantId.slice(0, 8)).sort().join(",")}`.slice(0, 200)
  await enqueueJob(db, { creatorId, kind: "send_email", key, payload: { template: "low_stock", creatorId, items: low } })
}

/**
 * THE SELLER IS TOLD about an order event (lib/physical/events-server.ts
 * calls this for the kinds sellerEmailFor names): one job per event, keyed
 * by the event's own key, so the same event never mails twice.
 */
export async function queueSellerEmail(db: Db, e: { checkoutId: string; creatorId: string; kind: string; message: string; detail: Record<string, unknown> | null; key: string | null }): Promise<void> {
  if (!sellerKindForEvent(e.kind)) return
  const key = `email:seller:${e.kind}:${e.key ?? e.checkoutId}`.slice(0, 200)
  await enqueueJob(db, { creatorId: e.creatorId, kind: "send_email", key, payload: { template: "seller", event: e.kind, checkoutId: e.checkoutId, message: e.message.slice(0, 300), detail: e.detail ?? null } })
}

function backoffSeconds(attempts: number): number {
  return Math.min(6 * 3600, 60 * 2 ** Math.max(0, attempts - 1))
}

export async function runJobs(db: Db, limit = 20): Promise<{ done: number; failed: number }> {
  const { data, error } = await db.rpc("commerce_claim_jobs", { p_limit: limit, p_lease_seconds: 120 })
  if (error) return { done: 0, failed: 0 }
  let done = 0
  let failed = 0
  for (const job of (data ?? []) as { id: number; kind: JobKind; payload: Record<string, any>; attempts: number; max_attempts: number; creator_id: string | null }[]) {
    try {
      await handle(db, job)
      await db.from("commerce_jobs").update({ status: "done", finished_at: new Date().toISOString(), last_error: null, locked_until: null, updated_at: new Date().toISOString() }).eq("id", job.id)
      done++
    } catch (e) {
      failed++
      const message = (e instanceof Error ? e.message : "failed").slice(0, 500)
      const dead = job.attempts >= job.max_attempts
      await db
        .from("commerce_jobs")
        .update({
          status: dead ? "dead" : "failed",
          last_error: message,
          locked_until: null,
          run_after: new Date(Date.now() + backoffSeconds(job.attempts) * 1000).toISOString(),
          finished_at: dead ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
      if (dead && job.payload?.checkoutId) {
        await addOrderEvent(db, {
          checkoutId: job.payload.checkoutId,
          creatorId: job.creator_id,
          kind: "job.failed",
          message: job.kind === "send_email" ? "An email to the buyer could not be sent." : job.kind === "supplier_email" ? "The order could not be emailed to the supplier." : "The order could not be sent to your webhook.",
          detail: { error: message },
          key: `job_dead:${job.id}`,
        })
      }
    }
  }
  return { done, failed }
}

/* ── what each job does ───────────────────────────────────────────────── */

async function handle(db: Db, job: { kind: JobKind; payload: Record<string, any> }): Promise<void> {
  switch (job.kind) {
    case "send_email":
      return job.payload?.template === "low_stock" ? sendLowStockEmail(db, job.payload) : job.payload?.template === "seller" ? sendSellerEmail(db, job.payload) : sendBuyerEmail(db, job.payload)
    case "supplier_email":
      return sendSupplierEmail(db, job.payload)
    case "webhook_delivery":
      return deliverWebhook(db, job.payload)
    default:
      throw new Error("This kind of job is not available yet.")
  }
}

interface CheckoutForEmail {
  id: string
  creator_id: string
  buyer_email: string | null
  buyer_name: string | null
  cancel_reason?: string | null
  refunded_cents?: number | null
  currency: string
  items_subtotal_cents: number
  discount_cents: number
  shipping_cents: number
  shipping_discount_cents: number
  tax_cents: number
  total_cents: number
  shipping_address: Record<string, any> | null
  shipping_rate: Record<string, any> | null
  lines: Record<string, any>[]
  receipt_token: string
  buyer_note: string | null
  delivery_method?: string | null
  pickup?: { name: string; address: string[]; instructions: string | null; ready: string; hours?: string | null } | null
  paid_at?: string | null
  created_at?: string | null
  /** Where it was placed (lib/orders/order-source OrderOrigin): a website's host in `site`. */
  origin?: Record<string, unknown> | null
}

function pickupOf(co: CheckoutForEmail) {
  if (co.delivery_method !== "pickup" || !co.pickup) return null
  return {
    name: co.pickup.name,
    address: Array.isArray(co.pickup.address) ? co.pickup.address : [],
    ready: PICKUP_READY_LABEL[co.pickup.ready as PickupReady] ?? null,
    instructions: co.pickup.instructions ?? null,
    hours: typeof co.pickup.hours === "string" && co.pickup.hours.trim() ? co.pickup.hours.trim().slice(0, 200) : null,
  }
}

async function loadCheckout(db: Db, id: string): Promise<CheckoutForEmail> {
  const { data } = await db.from("commerce_checkouts").select("*").eq("id", id).maybeSingle()
  if (!data) throw new Error("checkout gone")
  return data as CheckoutForEmail
}

/** "Visa ending 4242", "PayPal", "Card": as the receipt says it. */
function paymentLabelOf(row: { payment_method?: string | null; card_brand?: string | null; card_last4?: string | null } | null): string | null {
  if (!row?.payment_method) return null
  if (row.payment_method === "card") {
    const brand = row.card_brand ? row.card_brand.charAt(0).toUpperCase() + row.card_brand.slice(1) : "Card"
    return row.card_last4 ? `${brand} ending ${row.card_last4}` : brand
  }
  const named: Record<string, string> = { paypal: "PayPal", apple_pay: "Apple Pay", google_pay: "Google Pay", link: "Link", klarna: "Klarna" }
  return named[row.payment_method] ?? row.payment_method.replace(/_/g, " ")
}


function emailLines(lines: Record<string, any>[]): EmailLine[] {
  return lines.map((l) => ({
    title: l.title,
    variantName: l.variant_name ?? null,
    quantity: l.quantity,
    cents: Math.max(0, l.unit_cents * l.quantity - (l.discount_cents ?? 0)),
    imageUrl: l.image_url ?? null,
    sku: l.sku ?? null,
  }))
}

function addressOf(a: Record<string, any> | null) {
  return a ? { name: a.name, line1: a.line1, line2: a.line2, city: a.city, region: a.region, postalCode: a.postalCode, country: a.country, phone: a.phone } : null
}

/** Item rows for an email from the order rows it names (a shipment's items, a return's items). */
async function linesOfOrders(db: Db, checkoutId: string, items: { order_id: string; quantity: number }[]): Promise<EmailLine[]> {
  if (items.length === 0) return []
  const { data: orders } = await db.from("orders").select("id, product_snapshot").eq("checkout_id", checkoutId)
  const snap = new Map(((orders ?? []) as { id: string; product_snapshot: Record<string, any> | null }[]).map((o) => [o.id, o.product_snapshot ?? {}]))
  return items.map((i) => {
    const s = snap.get(i.order_id) ?? {}
    return { title: s.title ?? "Item", variantName: s.variant_name ?? null, quantity: i.quantity, cents: 0, imageUrl: s.image_url ?? null }
  })
}

/** Where a return is sent: the store's default location when the store ships from it, as address lines. */
async function returnAddressOf(db: Db, creatorId: string): Promise<string[] | null> {
  const { data: settings } = await db.from("commerce_settings").select("default_location_id").eq("creator_id", creatorId).maybeSingle()
  let q = db.from("inventory_locations").select("name, kind, address_line1, address_line2, city, region, postal_code, country, forwarding").eq("creator_id", creatorId).eq("active", true)
  q = settings?.default_location_id ? q.eq("id", settings.default_location_id) : q.order("priority", { ascending: true })
  const { data } = await q.limit(1).maybeSingle()
  if (!data?.address_line1) return null
  /* A partner's warehouse is theirs; the buyer is told by the store where to send it, in its note. */
  if (["print_on_demand", "dropshipper", "supplier", "third_party_logistics"].includes(data.kind)) return null
  return addressLines({ name: data.name, line1: data.address_line1, line2: data.address_line2, city: data.city, region: data.region, postalCode: data.postal_code, country: data.country })
}

/**
 * The legal line under every buyer email: the business behind the store, its
 * address and tax number, when Settings › Store details has them (read off
 * the store's identity under these names, so whichever part adds them is
 * used without a change here). Nothing given, the store's name alone.
 */
export function legalOf(store: object | null | undefined): EmailBrand["legal"] {
  const s = (store ?? {}) as Record<string, unknown>
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "")
  const address = Array.isArray(s.legalAddress) ? (s.legalAddress as unknown[]).map((l) => text(l, 120)).filter(Boolean).slice(0, 6) : text(s.legalAddress, 300) ? [text(s.legalAddress, 300)] : []
  const name = text(s.legalName, 120)
  const taxId = text(s.taxId, 60)
  return name || address.length || taxId ? { name: name || null, address, taxId: taxId || null } : null
}

async function sendBuyerEmail(db: Db, p: Record<string, any>): Promise<void> {
  const co = await loadCheckout(db, p.checkoutId)
  if (!co.buyer_email) return
  const [identity, store, zone] = await Promise.all([resolveCreatorIdentity(db, co.creator_id), storeIdentity(db, co.creator_id), creatorTimeZone(db, co.creator_id)])
  /* When it was placed, in the store's own time zone, on every email about it. */
  const orderDate = orderDateText(co.paid_at ?? co.created_at ?? null, zone) || null
  const shopName = store.name || identity.fromName || "Storelib"
  const firstName = co.buyer_name ? co.buyer_name.split(/\s+/)[0] : null
  const number = orderNumber(co.id)
  /* On the store's own website when it has one (the one the order was placed on first), else storelib.com: ./order-link.ts. */
  const orderUrl = await orderPageUrl(db, co)
  /* The store's logo and ways to reach it, on every email; "Get help" goes to the order page's help form. */
  const brand: EmailBrand = { logoUrl: store.logoUrl, email: store.email, phone: store.phone, websiteUrl: store.websiteUrl, helpUrl: `${orderUrl}#get-help`, legal: legalOf(store) }
  let mail: { subject: string; html: string; text: string }
  /* Settings › Customer emails: the store's own words for this one, if it changed any (lib/emails/customer-custom.ts). */
  const saved = await loadCustomerEmailCopy(db, co.creator_id)
  const copyFor = (id: string | null, lines: { title?: string | null }[]) =>
    id ? resolveCopy(saved[id], { customer_name: firstName, order_number: number, shop_name: shopName, items: itemsText(lines.map((l) => l.title)) }) : undefined

  if (p.template === "confirmation") {
    /* How it was paid: optional, the email reads without it. */
    const { data: paidRow } = await db.from("orders").select("payment_method, card_brand, card_last4").eq("checkout_id", co.id).limit(1).maybeSingle()
    mail = orderConfirmationEmail({
      storeUrl: store.websiteUrl,
      paymentLabel: paymentLabelOf(paidRow),
      supportEmail: store.email || identity.replyTo || null,
      brand: { ...brand, websiteUrl: null },
      shopName,
      orderNumber: number,
      buyerFirstName: firstName,
      lines: emailLines(co.lines),
      totals: {
        subtotal: co.items_subtotal_cents,
        discount: co.discount_cents,
        shipping: co.shipping_cents,
        shippingDiscount: co.shipping_discount_cents,
        tax: co.tax_cents,
        taxIncluded: !!co.shipping_rate?.tax_included,
        total: co.total_cents,
        currency: co.currency,
      },
      address: addressOf(co.shipping_address),
      deliveryName: co.shipping_rate?.name ?? null,
      deliveryEstimate: co.shipping_rate ? deliveryEstimate({ minDays: co.shipping_rate.min_days ?? null, maxDays: co.shipping_rate.max_days ?? null }) || null : null,
      statusUrl: orderUrl,
      hasDownloads: co.lines.some((l) => l.type !== "physical"),
      pickup: pickupOf(co),
      copy: copyFor("order_confirmation", co.lines),
      orderDate,
    })
  } else if (p.template === "shipment") {
    const { data: f } = await db.from("fulfillments").select("id, carrier, tracking_number, tracking_url, notify_buyer, status").eq("id", p.fulfillmentId).maybeSingle()
    if (!f || f.notify_buyer === false || f.status === "cancelled") return
    const { data: items } = await db.from("fulfillment_items").select("order_id, quantity").eq("fulfillment_id", f.id)
    const shipped = await linesOfOrders(db, co.id, (items ?? []) as { order_id: string; quantity: number }[])
    const pickup = pickupOf(co)
    if (pickup) {
      if (p.kind === "out_for_delivery" || p.kind === "tracking") return
      mail = pickupEmail({ shopName, orderNumber: number, buyerFirstName: firstName, lines: shipped, kind: p.kind === "delivered" ? "picked_up" : "ready", pickup, statusUrl: orderUrl, brand, copy: copyFor(emailIdForJob("shipment", p.kind, null, true), shipped), orderDate })
    } else {
      /* Part of the order: what still has to ship after every live shipment so far. */
      const { data: all } = await db.from("fulfillments").select("id, status, fulfillment_items ( quantity )").eq("checkout_id", co.id)
      const sent = ((all ?? []) as { status: string; fulfillment_items: { quantity: number }[] | null }[]).filter((x) => x.status !== "cancelled").reduce((n, x) => n + (x.fulfillment_items ?? []).reduce((m, i) => m + i.quantity, 0), 0)
      const owed = co.lines.filter((l) => l.requires_shipping).reduce((n, l) => n + (l.quantity ?? 0), 0)
      mail = shipmentEmail({
        shopName,
        orderNumber: number,
        buyerFirstName: firstName,
        lines: shipped,
        carrier: f.carrier,
        trackingNumber: f.tracking_number,
        trackingUrl: f.tracking_url ?? trackingUrl(f.carrier, f.tracking_number),
        address: addressOf(co.shipping_address),
        deliveryName: co.shipping_rate?.name ?? null,
        partial: p.kind === "shipped" && owed > 0 && sent < owed,
        statusUrl: orderUrl,
        kind: p.kind,
        brand,
        copy: copyFor(emailIdForJob("shipment", p.kind, null, false), shipped),
        orderDate,
      })
    }
  } else if (p.template === "return") {
    const [{ data: r }, { data: items }] = await Promise.all([
      db.from("commerce_returns").select("merchant_note, refunded_cents").eq("id", p.returnId).maybeSingle(),
      db.from("commerce_return_items").select("order_id, quantity").eq("return_id", p.returnId),
    ])
    const returned = await linesOfOrders(db, co.id, (items ?? []) as { order_id: string; quantity: number }[])
    mail = returnEmail({
      shopName,
      orderNumber: number,
      status: p.status,
      note: r?.merchant_note ?? null,
      refundedCents: r?.refunded_cents ?? 0,
      currency: co.currency,
      statusUrl: orderUrl,
      lines: returned,
      returnAddress: p.status === "approved" ? await returnAddressOf(db, co.creator_id) : null,
      brand,
      copy: copyFor(emailIdForJob("return", null, p.status), returned),
      orderDate,
    })
  } else if (p.template === "cancelled") {
    mail = orderCancelledEmail({ shopName, orderNumber: number, buyerFirstName: firstName, reason: co.cancel_reason ?? null, refundedCents: co.refunded_cents ?? 0, totalCents: co.total_cents, currency: co.currency, lines: emailLines(co.lines), statusUrl: orderUrl, brand, copy: copyFor("order_cancelled", co.lines), orderDate })
  } else if (p.template === "refund") {
    const { data: paidRow } = await db.from("orders").select("payment_method, card_brand, card_last4").eq("checkout_id", co.id).limit(1).maybeSingle()
    mail = refundEmail({ shopName, orderNumber: number, buyerFirstName: firstName, amountCents: Number(p.amountCents) || 0, refundedCents: Number(p.refundedCents) || 0, totalCents: co.total_cents, currency: co.currency, paymentLabel: paymentLabelOf(paidRow), statusUrl: orderUrl, brand, copy: copyFor("refund", co.lines), orderDate })
  } else {
    return
  }
  const sent = await sendEmail({
    from: buildFromHeader(shopName),
    to: co.buyer_email,
    replyTo: identity.replyTo || store.email || identity.sellerEmail || undefined,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  })
  if (!sent.success) throw new Error(sent.error || "Email not sent")
  await addOrderEvent(db, {
    checkoutId: co.id,
    creatorId: co.creator_id,
    kind: "email.sent",
    message:
      p.template === "confirmation"
        ? "Order confirmation emailed to the buyer"
        : p.template === "shipment"
          ? co.delivery_method === "pickup"
            ? p.kind === "delivered"
              ? "Pickup confirmation emailed to the buyer"
              : "Ready for pickup email sent to the buyer"
            : p.kind === "delivered"
              ? "Delivery email sent to the buyer"
              : p.kind === "out_for_delivery"
                ? "Out for delivery email sent to the buyer"
                : p.kind === "tracking"
                  ? "New tracking number emailed to the buyer"
                  : "Shipping email sent to the buyer"
          : p.template === "cancelled"
            ? "Cancellation emailed to the buyer"
            : p.template === "refund"
              ? "Refund emailed to the buyer"
              : "Return update emailed to the buyer",
    key: `email_sent:${p.template}:${p.fulfillmentId ?? p.returnId ?? co.id}:${p.kind ?? p.status ?? p.refundedCents ?? ""}`,
  })
}

/** The seller's own inbox, or null when the store has none (Storelib's support address is never a seller's). */
async function sellerInbox(db: Db, creatorId: string): Promise<string | null> {
  const to = (await resolveSellerEmail(db, creatorId)).trim().toLowerCase()
  return to && to.includes("@") && to !== EMAIL_REPLY_TO.trim().toLowerCase() ? to : null
}

async function sendLowStockEmail(db: Db, p: Record<string, any>): Promise<void> {
  const creatorId = String(p.creatorId ?? "")
  const items = (Array.isArray(p.items) ? p.items : []).slice(0, 50) as { title: string; variantName: string | null; available: number; threshold: number }[]
  if (!creatorId || items.length === 0) return
  const to = await sellerInbox(db, creatorId)
  if (!to) return
  const identity = await resolveCreatorIdentity(db, creatorId)
  const mail = lowStockEmail({ shopName: identity.fromName || "Storelib", items, inventoryUrl: `https://${getMainDomain()}/app/inventory?filter=low` })
  const sent = await sendEmail({ from: buildFromHeader("Storelib"), to, subject: mail.subject, html: mail.html, text: mail.text, headers: { "X-Storelib-Notification": "LOW_STOCK" } })
  if (!sent.success) throw new Error(sent.error || "Email not sent")
}

/**
 * A return asked for, an order the buyer cancelled, a parcel the carrier
 * couldn't deliver, a payment that failed: to the seller, in Storelib's
 * look (lib/notify/seller-commerce.ts), when they have sales emails on in
 * Settings › Notifications.
 */
async function sendSellerEmail(db: Db, p: Record<string, any>): Promise<void> {
  const kind = sellerKindForEvent(String(p.event ?? ""))
  if (!kind) return
  const co = await loadCheckout(db, p.checkoutId)
  const { data: creator } = await db.from("creators").select("user_id").eq("id", co.creator_id).maybeSingle()
  const userId: string | null = creator?.user_id ?? null
  const [{ allowed }, { entryFor }, { unsubscribeUrl, preferencesUrl }] = await Promise.all([import("@/lib/notify/preferences"), import("@/lib/notify/registry"), import("@/lib/notify/unsubscribe")])
  if (userId && !(await allowed(db, userId, entryFor("NEW_SALE"), "email"))) return
  const to = await sellerInbox(db, co.creator_id)
  if (!to) return
  const detail = (p.detail && typeof p.detail === "object" ? p.detail : {}) as Record<string, unknown>
  const { data: firstOrder } = await db.from("orders").select("id").eq("checkout_id", co.id).order("created_at", { ascending: true }).limit(1).maybeSingle()
  let lines: { title: string; variantName: string | null; quantity: number }[] = emailLines(co.lines).map((l) => ({ title: l.title, variantName: l.variantName, quantity: l.quantity }))
  let reason: string | null = typeof detail.reason === "string" ? detail.reason : null
  let note: string | null = null
  if (kind === "return_requested") {
    /* The newest return the buyer asked for on this order: its items, reason and note. */
    const { data: r } = await db.from("commerce_returns").select("id, reason, reason_label, customer_note").eq("checkout_id", co.id).eq("status", "requested").order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (r) {
      const { data: items } = await db.from("commerce_return_items").select("order_id, quantity").eq("return_id", r.id)
      const returned = await linesOfOrders(db, co.id, (items ?? []) as { order_id: string; quantity: number }[])
      if (returned.length) lines = returned.map((l) => ({ title: l.title, variantName: l.variantName, quantity: l.quantity }))
      reason = r.reason_label ?? r.reason ?? null
      note = r.customer_note ?? null
    }
  }
  if (kind === "order_cancelled" && !reason) reason = co.cancel_reason ?? null
  if (kind === "delivery_exception" && !reason) reason = p.message ?? null
  const userUnsubscribe = userId ? unsubscribeUrl(userId, "sales") : null
  const mail = sellerCommerceEmail(
    kind,
    {
      orderId: firstOrder?.id ?? null,
      orderNumber: orderNumber(co.id),
      buyerName: co.buyer_name,
      buyerEmail: co.buyer_email,
      lines,
      reason,
      note,
      totalCents: co.total_cents,
      refundedCents: co.refunded_cents ?? null,
      currency: co.currency,
      carrier: typeof detail.carrier === "string" ? detail.carrier : null,
      trackingNumber: typeof detail.trackingNumber === "string" ? detail.trackingNumber : typeof detail.tracking_number === "string" ? detail.tracking_number : null,
    },
    { baseUrl: `https://${getMainDomain()}`, unsubscribeUrl: userUnsubscribe, preferencesUrl: preferencesUrl() },
  )
  const sent = await sendEmail({
    from: buildFromHeader("Storelib"),
    to,
    replyTo: co.buyer_email && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(co.buyer_email) ? co.buyer_email : undefined,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: { "X-Storelib-Notification": `SELLER_${kind.toUpperCase()}`, ...(userUnsubscribe ? { "List-Unsubscribe": `<${userUnsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}) },
  })
  if (!sent.success) throw new Error(sent.error || "Email not sent")
}

/** The partner's own page for this order, where tracking is added (./partner-server.ts), or null without a signing key. */
function partnerPageUrl(checkoutId: string, location: { id: string; email: string | null; forwarding: string | null }): string | null {
  const token = signPartnerLink(checkoutId, location)
  return token ? `https://${getMainDomain()}${PARTNER_PAGE_PREFIX}${token}` : null
}

async function sendSupplierEmail(db: Db, p: Record<string, any>): Promise<void> {
  const co = await loadCheckout(db, p.checkoutId)
  const { data: loc } = await db.from("inventory_locations").select("id, name, email, forwarding").eq("id", p.locationId).eq("creator_id", co.creator_id).maybeSingle()
  if (!loc?.email) throw new Error("The location has no email address.")
  const identity = await resolveCreatorIdentity(db, co.creator_id)
  const shopName = identity.fromName || "Storelib"
  const lines = emailLines(co.lines.filter((l) => l.location_id === loc.id && l.requires_shipping))
  if (lines.length === 0) return
  const mail = supplierOrderEmail({
    shopName,
    orderNumber: orderNumber(co.id),
    locationName: loc.name,
    lines,
    address: addressOf(co.shipping_address),
    buyerEmail: null,
    deliveryName: co.shipping_rate?.name ?? null,
    note: co.buyer_note,
    trackingLink: partnerPageUrl(co.id, loc),
  })
  const sent = await sendEmail({ from: buildFromHeader(shopName), to: loc.email, replyTo: identity.replyTo || identity.sellerEmail || undefined, subject: mail.subject, html: mail.html, text: mail.text })
  if (!sent.success) throw new Error(sent.error || "Email not sent")
  await addOrderEvent(db, { checkoutId: co.id, creatorId: co.creator_id, kind: "fulfillment.forwarded", message: `Order emailed to ${loc.name}`, key: `forwarded_email:${co.id}:${loc.id}` })
}

/** POST, to a public https address only, with the socket's own lookup refusing private addresses. */
function postJson(url: string, body: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      u,
      { method: "POST", lookup: publicLookup as unknown as net.LookupFunction, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body).toString(), "user-agent": "Storelib-Webhooks/1.0", ...headers } },
      (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      },
    )
    req.setTimeout(10_000, () => req.destroy(new Error("timed out")))
    req.on("error", reject)
    req.end(body)
  })
}

async function deliverWebhook(db: Db, p: Record<string, any>): Promise<void> {
  const co = await loadCheckout(db, p.checkoutId)
  const { data: integration } = await db.from("commerce_integrations").select("id, config, webhook_secret_ciphertext, status").eq("creator_id", co.creator_id).eq("provider", "custom_webhook").maybeSingle()
  const url = integration?.config?.url as string | undefined
  if (!integration || !url) throw new Error("No webhook address is set.")
  if (!url.startsWith("https://") || publicUrlProblem(url)) throw new Error("The webhook address must be a public https address.")
  const secret = openSecret(integration.webhook_secret_ciphertext)
  if (!secret) throw new Error("The webhook signing secret could not be read. Set it again.")
  const payload = JSON.stringify({
    event: p.event ?? "order.paid",
    created: Math.floor(Date.now() / 1000),
    order: {
      id: co.id,
      number: orderNumber(co.id),
      currency: co.currency,
      total_cents: co.total_cents,
      shipping: co.shipping_rate ? { name: co.shipping_rate.name, price_cents: co.shipping_rate.price_cents } : null,
      address: addressOf(co.shipping_address),
      note: co.buyer_note,
      /* Where this order went, and where to say it shipped: POST signed the same way, with your secret (lib/physical/partner-server.ts). */
      location_id: p.locationId ?? null,
      tracking_endpoint: `https://${getMainDomain()}/api/physical/partner-tracking`,
      lines: co.lines
        .filter((l) => !p.locationId || l.location_id === p.locationId)
        .map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, title: l.title, variant: l.variant_name, sku: l.sku, quantity: l.quantity, requires_shipping: l.requires_shipping })),
    },
  })
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")
  const status = await postJson(url, payload, { "x-storelib-timestamp": timestamp, "x-storelib-signature": `v1=${signature}`, "x-storelib-event": String(p.event ?? "order.paid") })
  if (status < 200 || status >= 300) throw new Error(`Your webhook answered ${status}.`)
  await db.from("commerce_integrations").update({ last_sync_at: new Date().toISOString(), last_error: null, status: "connected" }).eq("id", integration.id)
  await addOrderEvent(db, { checkoutId: co.id, creatorId: co.creator_id, kind: "fulfillment.forwarded", message: "Order sent to your webhook", key: `forwarded_webhook:${co.id}:${p.locationId ?? ""}:${p.event ?? ""}` })
}
