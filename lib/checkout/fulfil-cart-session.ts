import "server-only"

/**
 * ===========================================================================
 *  A PAID BASKET BECOMES PURCHASES, EXACTLY ONCE, EVEN IF THE TAB CLOSES
 * ===========================================================================
 * A basket is paid on Stripe's own Checkout page, and two things report that
 * it was:
 *
 *   the buyer's browser   /api/checkout/cart/complete, Checkout's success_url;
 *   Stripe itself         the checkout.session.completed webhook.
 *
 * Only the browser used to write the orders, so a buyer who paid and closed
 * the tab before the redirect had been charged and had nothing. Both call
 * this now, and whichever comes first writes the basket.
 *
 * ONCE, UNDER A RACE. Each line's receipt token is an HMAC of the session id
 * and the line's place in the basket, and the orders table holds receipt
 * tokens UNIQUE. Two callers writing at once therefore write each line once:
 * the second insert of a line fails with 23505 and counts as "exists". The
 * session fingerprint is derived the same way, so whichever caller wrote an
 * order, the browser's cookie matches it.
 *
 * WHAT HAPPENS ONCE PER BASKET (the buyer's email, the customer, the seller's
 * ledger, the sale notification) is done by the caller that wrote the FIRST
 * line. What happens once per line (the entitlement, the sales count, the
 * seller's email for that product) is done by the caller that wrote that line.
 *
 * A RETRY FILLS GAPS. Lines that exist are skipped and the missing ones are
 * written, so the webhook answering 500 on a failed line and Stripe retrying
 * it completes a basket rather than duplicating one.
 */

import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { sendBuyerDownloadEmail, sendSellerNotificationEmail, resolveSellerEmail } from "@/lib/email"
import { unpackItems, packedTotalCents, apportionFee } from "./cart-items"
import { fulfilCartLine, recordCartCustomer, type FulfilContext, type FulfilledLine } from "./fulfil-cart-item"
import { paymentFacts, recordSale } from "./fulfil-payment"
import { cartFingerprint, cartReceiptToken } from "./cart-tokens"

type Db = FulfilContext["admin"]

export type CartFulfilment =
  | { ok: true; created: boolean; receiptToken: string; sessionFingerprint: string; complete: boolean }
  | { ok: false; status: number; reason: "not_found" | "unpaid" | "unreadable" | "failed" }

export function isCartSession(session: Pick<Stripe.Checkout.Session, "metadata" | "mode">): boolean {
  return session.mode === "payment" && session.metadata?.cart === "1"
}

export async function fulfilCartSession(
  admin: Db,
  sessionId: string,
  opts: { baseUrl: string; request?: Request; viewerId?: string | null },
): Promise<CartFulfilment> {
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { ok: false, status: 400, reason: "not_found" }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent", "payment_intent.latest_charge", "payment_intent.latest_charge.transfer"],
    })
  } catch {
    return { ok: false, status: 404, reason: "not_found" }
  }
  if (!isCartSession(session)) return { ok: false, status: 400, reason: "unreadable" }
  if (session.payment_status !== "paid") return { ok: false, status: 409, reason: "unpaid" }

  const metadata = (session.metadata ?? {}) as Record<string, string>
  const items = unpackItems(metadata)
  const creatorId = metadata.creator_id || ""
  if (items.length === 0 || !creatorId) {
    console.error("[cart] paid session with no readable basket:", sessionId)
    return { ok: false, status: 422, reason: "unreadable" }
  }

  const pi = session.payment_intent && typeof session.payment_intent === "object" ? (session.payment_intent as Stripe.PaymentIntent) : null
  const paymentIntentId = pi?.id ?? (typeof session.payment_intent === "string" ? session.payment_intent : null)
  const facts = pi ? paymentFacts(pi) : null
  const recordedFee = Number.parseInt(metadata.platform_fee_cents || "0", 10) || 0
  const feeTotal = pi?.application_fee_amount ?? facts?.applicationFeeCents ?? recordedFee
  const paidTotal = session.amount_total ?? packedTotalCents(items)

  const buyerEmail = (metadata.buyer_email || session.customer_details?.email || "").toLowerCase().trim() || null
  let buyerId = metadata.buyer_id || opts.viewerId || null
  if (!buyerId && buyerEmail) {
    const { data: profile } = await admin.from("profiles").select("id").eq("email", buyerEmail).maybeSingle()
    if (profile) buyerId = profile.id
  }
  const name = (session.customer_details?.name ?? "").trim()
  const firstName = name ? name.split(/\s+/)[0] : null
  const lastName = name && name.includes(" ") ? name.slice(name.indexOf(" ") + 1) : null

  const sessionFingerprint = cartFingerprint(sessionId)
  let device: FulfilContext["device"] = { country: null, countryCode: null, deviceType: null, os: null, browser: null }
  if (opts.request) {
    const { collectOrderDeviceInfo } = await import("@/lib/device-info")
    const { deviceInfo, geoInfo } = collectOrderDeviceInfo(opts.request)
    device = {
      country: geoInfo.country || null,
      countryCode: geoInfo.countryCode || null,
      deviceType: deviceInfo.deviceType || null,
      os: deviceInfo.os || null,
      browser: deviceInfo.browser || null,
    }
  }

  const ctx: FulfilContext = {
    admin,
    sessionId,
    paymentIntentId,
    creatorId,
    buyerId,
    buyerEmail,
    buyerFirstName: firstName,
    buyerLastName: lastName,
    receiptTokenFor: (index) => cartReceiptToken(sessionId, index),
    sessionFingerprint,
    paymentMethod: facts?.paymentMethod ?? "card",
    cardBrand: facts?.cardBrand ?? null,
    cardLast4: facts?.cardLast4 ?? null,
    device,
  }

  /* The fee, apportioned once for the whole basket, so the parts provably
     sum to what Stripe took, whichever caller writes which line. */
  const fees = apportionFee(feeTotal, items.map((i) => i.priceCents * i.quantity))

  const created: (FulfilledLine & { index: number })[] = []
  let failed = 0
  for (let i = 0; i < items.length; i++) {
    const outcome = await fulfilCartLine(ctx, items[i], i, fees[i] ?? 0)
    if (outcome.status === "created") created.push({ ...outcome.line, index: i })
    else if (outcome.status === "failed") failed++
  }

  /* The receipt the buyer lands on: the basket's first line, whoever wrote it. */
  const firstToken = cartReceiptToken(sessionId, 0)
  const { data: firstOrder } = await admin.from("orders").select("id, receipt_token").eq("receipt_token", firstToken).maybeSingle()
  const receiptToken = firstOrder?.receipt_token ?? created[0]?.receiptToken ?? null
  if (!receiptToken) return { ok: false, status: 500, reason: "failed" }

  const ownsBasket = created.some((l) => l.index === 0)
  if (created.length > 0) {
    await sideEffects(admin, { ctx, created, ownsBasket, paidTotal, feeTotal, destinationPaymentId: facts?.destinationPaymentId ?? null, baseUrl: opts.baseUrl, firstOrderId: firstOrder?.id ?? created[0].orderId, receiptToken })
  }

  return { ok: true, created: created.length > 0, receiptToken, sessionFingerprint, complete: failed === 0 }
}

async function sideEffects(
  admin: Db,
  s: {
    ctx: FulfilContext
    created: (FulfilledLine & { index: number })[]
    ownsBasket: boolean
    paidTotal: number
    feeTotal: number
    destinationPaymentId: string | null
    baseUrl: string
    firstOrderId: string
    receiptToken: string
  },
) {
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      console.error(`[cart] ${name} failed for session ${s.ctx.sessionId}:`, e instanceof Error ? e.message : e)
    }
  }
  const { ctx } = s
  const ids = [...new Set(s.created.map((l) => l.productId))]
  const { data: rows } = await admin.from("products").select("id, title").in("id", ids)
  const titles = new Map<string, string>((rows ?? []).map((r: { id: string; title: string }) => [r.id, r.title]))
  const sellerEmail = await resolveSellerEmail(admin, ctx.creatorId)

  if (s.ownsBasket) {
    await step("customer", () => recordCartCustomer(ctx, s.paidTotal, s.firstOrderId))
    /* The seller's balance, once for the one payment, against the first line. */
    await step("ledger", () =>
      recordSale(admin, { creatorId: ctx.creatorId, orderId: s.firstOrderId, total: s.paidTotal, fee: s.feeTotal, destinationPaymentId: s.destinationPaymentId }),
    )
    /* ONE receipt email for the basket: the sender reads every line of this
       session and lists them with one total. */
    if (ctx.buyerEmail) {
      const first = s.created.find((l) => l.index === 0)!
      await step("buyer email", () =>
        sendBuyerDownloadEmail(admin, {
          orderId: first.orderId,
          creatorId: ctx.creatorId,
          buyerEmail: ctx.buyerEmail as string,
          buyerFirstName: ctx.buyerFirstName ?? "",
          productTitle: titles.get(first.productId) ?? "Your purchase",
          receiptToken: s.receiptToken,
          sellerReplyTo: sellerEmail,
          baseUrl: s.baseUrl,
          amountCents: s.paidTotal,
        }),
      )
    }
    await step("push", async () => {
      const { data: creator } = await admin.from("creators").select("user_id").eq("id", ctx.creatorId).maybeSingle()
      if (!creator?.user_id) return
      const { notifySale } = await import("@/lib/push/notifications")
      await notifySale(creator.user_id, {
        productName: s.created.length > 1 ? `${s.created.length} products` : titles.get(s.created[0].productId) ?? "A product",
        amountCents: s.paidTotal,
        orderId: s.firstOrderId,
        productId: s.created[0].productId,
      })
    })
  }

  /* The seller hears about each product this caller wrote. */
  for (const line of s.created) {
    await step("seller email", () =>
      sendSellerNotificationEmail(admin, {
        orderId: line.orderId,
        creatorId: ctx.creatorId,
        sellerEmail,
        productTitle: titles.get(line.productId) ?? "Your purchase",
        buyerFirstName: ctx.buyerFirstName ?? "",
        buyerLastName: ctx.buyerLastName ?? "",
        buyerEmail: ctx.buyerEmail ?? "",
        amountCents: line.amountCents,
        feeCents: 0,
        baseUrl: s.baseUrl,
      }),
    )
  }
}
