import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadOrder } from "@/lib/physical/orders-server"
import { loadSettings } from "@/lib/physical/config-server"
import { PICKUP_READY_LABEL } from "@/lib/physical/pickup"
import { returnWindow, returnableQuantities } from "@/lib/physical/status"
import { cancelEvents, progressOf } from "@/lib/physical/orders-server"
import { OrderStatusView, PendingOrder } from "./order-status-view"
import { reasonsFor } from "@/lib/store/reasons-server"
import { reasonLabel } from "@/lib/store/reasons"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { gaItem, type GaItem } from "@/lib/store/ga"
import { storeIdentity } from "@/lib/store/identity-server"
import { buyerCaseLink, casesReady, openCaseFor } from "@/lib/support/cases-server"
import { appUrl } from "@/lib/notify/urls"
import { loadCheckoutConfig } from "@/lib/store/settings-server"
import { buyerCancelState, cancelMode } from "@/lib/physical/buyer-cancel"
import { checkoutBrand } from "@/lib/checkout/brand-server"
import { savingsOfLines } from "@/lib/offers/snapshot"
import { orderStoreUrl } from "@/lib/physical/store-link"
import { orderPagePath } from "@/lib/physical/order-link"
import { buyerProperties } from "@/lib/physical/cart-link"
import { buyerPageLanguage } from "@/lib/markets/checkout-language"
import { buyerChannel } from "@/lib/emails/buyer-channel"
import { CheckoutWords } from "@/app/checkout/parts/words"
import { creditNoteNumber, creditNotePath, creditNotesForReceipt } from "@/lib/checkout/credit-note"
import { withinTime } from "@/lib/receipts/discount"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } }

/**
 * The buyer's order page, reached from the confirmation email and the
 * return from Stripe. The address is a random token only those carry, so
 * it is the buyer's key to their order. Not behind the switch in /admin:
 * an order somebody paid for stays readable.
 */
export default async function OrderStatusPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string; reason?: string; lang?: string }> }) {
  const { token } = await params
  const { paid, reason, lang } = await searchParams
  if (token === "pending") return <PendingOrder reason={reason ?? null} />
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound()
  const db = createAdminClient()
  const order = await loadOrder(db, { receiptToken: token })
  if (!order || (order.status !== "paid" && order.status !== "refunded" && order.status !== "partially_refunded")) {
    if (order?.status === "pending") return <PendingOrder reason="unpaid" />
    notFound()
  }
  /* Where it was bought (lib/orders/order-source.ts OrderOrigin): the website, in which language. */
  const origin = await originOf(db, order.id)
  /* The order's language, as its emails (lib/markets/buyer-language.ts): the one an email link names, else the one it was placed in, else the store's default; English for an order from storelib.com. Never a cookie from another visit. */
  const channel = buyerChannel({ family: "physical", surface: origin?.surface, lang: origin?.lang })
  const host = (await headers()).get("host")
  const [store, brand, storeUrl, settings, reasons, ready, open, checkout, language] = await Promise.all([
    storeIdentity(db, order.creatorId),
    /* The shop at the top, as its website and checkout draw it: the website's logo, else Store details', else the photo (lib/checkout/brand-server). */
    checkoutBrand(db, order.creatorId),
    /* Visit store: the live website the order was placed on, never the creator page (lib/physical/store-link.ts); empty when there is none. */
    orderStoreUrl({ creator_id: order.creatorId, origin }, { db }),
    loadSettings(db, order.creatorId),
    reasonsFor(db, order.creatorId, "return"),
    casesReady(db),
    openCaseFor(db, { checkoutId: order.id }),
    loadCheckoutConfig(db, order.creatorId),
    buyerPageLanguage(order.creatorId, { channel, named: lang, order: origin?.lang }).catch(() => ENGLISH),
  ])
  const cancelAsked = await cancelEvents(db, order.id)
  /* A refunded order's credit notes, one per refund (lib/checkout/credit-note.ts), opened by the order's own receipt token as its invoice is. */
  const noteToken = order.refundedCents > 0 ? (order.lines.find((l) => l.receiptToken)?.receiptToken ?? null) : null
  const notes = noteToken ? await withinTime(() => creditNotesForReceipt(db, noteToken), 1500).catch(() => null) : null
  const creditNotes = noteToken ? (notes?.notes ?? []).map((n) => ({ number: creditNoteNumber(n.seq), href: creditNotePath(noteToken, n.id) })) : []
  const path = orderPagePath(token)
  const orderUrl = host && path ? `${/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https"}://${host}${path}` : null
  const returnable = returnableQuantities(progressOf(order))
  /* Counted from delivery, from shipping without tracking, or from when a tracked parcel never marked delivered should have arrived (lib/physical/status returnWindow), as the return route checks it. */
  const window = returnWindow({ ...order, pickup: order.deliveryMethod === "pickup" }, settings.returnWindowDays)
  const windowOpen = settings.returnsEnabled && window.open
  const openReturn = order.returns.some((r) => ["requested", "approved", "in_transit"].includes(r.status))
  /* The store's pixels hear about the purchase once: on this page as it opens straight from paying (?paid=1), never on a later visit. */
  const purchase = paid === "1" && order.status === "paid" ? { id: order.id, valueCents: order.totalCents, currency: order.currency, quantity: order.lines.reduce((n, l) => n + l.quantity, 0), items: order.lines.map((l) => gaItem({ id: l.productId ?? "", title: l.title, priceCents: l.unitCents, quantity: l.quantity, variant: l.variantName, kind: l.type === "physical" ? "physical" : "digital", currency: order.currency })).filter((i): i is GaItem => !!i) } : null
  return (
    <>
    {purchase ? <StoreTracking creatorId={order.creatorId} purchase={purchase} /> : null}
    <CheckoutWords lang={language.lang} words={language.words}>
    <OrderStatusView
      token={token}
      justPaid={paid === "1"}
      shop={{ name: brand.name || store.name, avatar: brand.imageUrl ?? store.logoUrl, avatarKind: brand.imageUrl ? brand.kind : store.logoUrl ? "logo" : null, email: store.email, phone: store.phone, websiteUrl: storeUrl || null, legal: store.legal }}
      orderUrl={orderUrl}
      help={ready ? { openCase: open ? { link: buyerCaseLink(appUrl("/").replace(/\/$/, ""), open.id), status: open.status } : null } : null}
      order={{
        id: order.id,
        status: order.status,
        fulfillmentStatus: order.fulfillmentStatus,
        cancelled: !!order.cancelledAt,
        createdAt: order.paidAt ?? order.createdAt,
        email: order.buyerEmail,
        name: order.buyerName,
        address: order.deliveryMethod === "pickup" ? null : order.address,
        delivery: order.delivery,
        coupon: order.couponCode,
        /* Each offer's saving by the name the checkout showed it, inside the discount; the rest is the code's (lib/receipts/discount splitSavings). */
        savings: savingsOfLines(order.lines),
        /* The invoice PDF (lib/checkout/invoice.ts, app/api/checkout/invoice), opened by one of the order's own receipt tokens: for an order paid by card. */
        invoiceToken: order.payment === "card" && order.totalCents > 0 ? (order.lines.find((l) => l.receiptToken)?.receiptToken ?? null) : null,
        creditNotes,
        pickup: order.pickup ? { name: order.pickup.name, address: order.pickup.address, instructions: order.pickup.instructions, ready: PICKUP_READY_LABEL[order.pickup.ready], hours: order.pickup.hours ?? null } : null,
        processing: !!order.processingAt,
        cash: order.payment === "cod_due" ? "due" : order.payment === "cod_collected" ? "paid" : null,
        /* What it was paid with, as the order email and the download receipt say it (round 51: the receipt names the payment method). */
        paidWith: order.payment === "card" && order.totalCents > 0 ? (order.paidWith ?? null) : null,
        totals: { subtotal: order.itemsSubtotalCents, discount: order.discountCents, shipping: order.shippingCents - order.shippingDiscountCents, tax: order.taxCents, taxIncluded: order.taxIncluded, taxLabel: order.taxLabel, total: order.totalCents, refunded: order.refundedCents, currency: order.currency },
        /* Each line as bought: its option, how many, at what each, and how far it got (sent, back, refunded). */
        /* `properties`: the buyer's own words on the line (an engraving); a theme's notes (a name starting with "_") stay with the store. */
        lines: order.lines.map((l) => ({ orderId: l.orderId, title: l.title, variantName: l.variantName, properties: buyerProperties(l.properties), files: (l.files ?? []).filter((f) => f.url && !f.property.startsWith("_")).map((f) => ({ id: f.id, name: f.name, url: f.url as string })), imageUrl: l.imageUrl, quantity: l.quantity, unitCents: l.unitCents, cents: l.unitCents * l.quantity - l.discountCents, type: l.type, receiptToken: l.type === "physical" ? null : l.receiptToken, returnable: returnable.get(l.orderId) ?? 0, shipped: l.requiresShipping ? l.fulfilled : 0, returned: l.returned, refunded: l.refundedCents > 0 })),
        shipments: order.shipments
          .filter((s) => s.status !== "cancelled")
          /* Its updates, oldest first, as statuses only: the seller's own notes stay on their side. */
          .map((s) => ({
            id: s.id,
            status: s.status,
            carrier: s.carrier,
            trackingNumber: s.trackingNumber,
            trackingUrl: s.trackingUrl,
            shippedAt: s.shippedAt,
            deliveredAt: s.deliveredAt,
            items: s.items,
            updates: [...s.events].reverse().map((e) => ({ status: e.status, at: e.occurredAt })),
            /* The carrier's own scans and its estimate (lib/physical/tracking), when Storelib follows the parcel. */
            checkpoints: s.checkpoints ?? [],
            tracking: s.tracking ? { status: s.tracking.status, estimatedDelivery: s.tracking.estimatedDelivery, auto: s.tracking.mode === "auto" } : null,
          })),
        returns: order.returns.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt, reason: r.reasonLabel || reasonLabel(r.reason, "return", reasons) })),
        returnPolicy: settings.returnsEnabled ? { days: settings.returnWindowDays, endsAt: window.endsAt, open: window.open, started: window.started, assumed: window.assumed } : null,
      }}
      reasons={reasons.map((r) => ({ value: r.value, label: r.label }))}
      canReturn={windowOpen && !openReturn && [...returnable.values()].some((n) => n > 0)}
      cancel={buyerCancelState({ ...order, events: cancelAsked }, checkout.buyerCancel)}
      cancelNow={cancelMode({ lines: order.lines, events: cancelAsked }) === "now" && order.payment !== "cod_collected"}
    />
    </CheckoutWords>
    </>
  )
}

const ENGLISH = { lang: "en", words: {} as Record<string, string>, map: null }

/** Where the order's checkout was opened (lib/orders/order-source.ts OrderOrigin): the website and its language, when kept. */
async function originOf(db: ReturnType<typeof createAdminClient>, checkoutId: string): Promise<{ lang?: unknown; site?: unknown; surface?: unknown } | null> {
  const { data } = await db.from("commerce_checkouts").select("origin").eq("id", checkoutId).maybeSingle()
  const origin = data?.origin
  return origin && typeof origin === "object" ? (origin as { lang?: unknown; site?: unknown; surface?: unknown }) : null
}
