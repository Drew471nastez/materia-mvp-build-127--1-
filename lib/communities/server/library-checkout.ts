import "server-only"

/**
 * ===========================================================================
 *  BUYING A LIBRARY ITEM: STRIPE EMBEDDED CHECKOUT, A STORELIB ORDER
 * ===========================================================================
 * A Library item that is sold (lib/communities/library.ts, mode "paid") is
 * bought in a sheet on its page (components/community/library/
 * library-checkout.tsx), the way a program is (./learn-checkout.ts): a
 * Checkout Session in embedded mode that never redirects, a destination
 * charge to the creator's connected account with the platform's fee kept
 * back, only when that account can take payments. The price, the product,
 * the account and the fee are all read here; nothing the page sends is.
 *
 * WHAT IS DIFFERENT FROM A PROGRAM: the item is a Storelib product (one of
 * the creator's own, or the one made for a sold resource), and the session's
 * PaymentIntent carries the product checkout's own metadata (product_id,
 * creator_id, a receipt token, the fee, the tax). So the payment becomes an
 * order exactly as a sale on the product's page does, by the same code
 * (lib/checkout/fulfil-payment.ts fulfilPaymentIntent): the order, the
 * buyer's library entitlement, the seller's ledger and payout, the receipt
 * and its emails, once, whichever of Stripe's webhook and the sheet's own
 * confirm comes first. A refund from anywhere (Orders, the community's
 * Payments, Stripe) removes the entitlement, which locks the item again.
 *
 * The session's own metadata names the item and the buyer and never a
 * product, so the webhook's older session path (which made an order from a
 * session's product_id) never sees it.
 *
 * community_library_purchases keeps which order bought which item, for the
 * admin's sales count; a full refund marks the row.
 *
 * Stripe, the payment checks, the tax and the order are handed in, so the
 * tests run all of it against stubs.
 */
import type Stripe from "stripe"
import { minimumChargeMinor } from "@/lib/store/selling-currency"
import { productPriceCurrency } from "@/lib/money/product-currency"
import { SALE_HOLDER_KEY } from "@/lib/checkout/sales-limit"
import { programPrice } from "../learn"
import type { CommunityRow } from "../types"
import type { Viewer } from "./context"
import { missing, reasonOf, type Db } from "./db"
import { audit } from "./audit"
import { effectivePrice, itemAccess, type LibraryItemRow, type ProductFacts } from "./library"
import type { PlatformFee, StripeSessions } from "./learn-checkout"

export const LIBRARY_SESSION_KIND = "community_library"

export interface LibraryTax {
  totalCents: number
  taxCents: number
  rateBps: number
  included: boolean
  country: string | null
  label: string
}

export interface LibraryCheckoutDeps {
  stripe: StripeSessions
  ready: (creatorId: string) => Promise<boolean>
  fee: (amountCents: number, creatorId: string, currency: string) => Promise<PlatformFee>
  /** The store's tax on a download for this country (Settings › Taxes), or null when it charges none. */
  tax?: (creatorId: string, productId: string, amountCents: number, country: string | null) => Promise<LibraryTax | null>
  /** One copy held under a product's sales limit (lib/checkout/sales-limit), true when there is no limit. */
  holdSale?: (productId: string, holder: string) => Promise<boolean>
  releaseSale?: (productId: string, holder: string) => Promise<void>
  /** The store's own currency (lib/store/selling-currency-read). */
  storeCurrency: (creatorId: string) => Promise<string>
  receiptToken: () => string
  nonce: () => string
}

export interface LibraryBuyer {
  userId: string
  email: string | null
  name: string | null
  country: string | null
}

export type LibraryCheckoutStart =
  | { ok: true; clientSecret: string; sessionId: string; amountCents: number; currency: string }
  | { ok: false; status: number; error: string; code: string }

const refuse = (status: number, code: string, error: string): LibraryCheckoutStart => ({ ok: false, status, code, error })

/** The product a sold item is paid for: its attached product, or the one made for it. Published and the creator's, or nothing. */
export function productToSell(row: LibraryItemRow, product: ProductFacts | null, creatorId: string | null): ProductFacts | null {
  if (!product || !creatorId || product.creator_id !== creatorId) return null
  if (product.status !== "published" || product.archived === true) return null
  if (product.type !== "digital") return null
  if (row.kind === "resource" && (!row.made_product || product.community_id !== row.community_id)) return null
  if (row.kind === "product" && product.community_id) return null
  return product
}

function splitName(name: string | null): { first: string; last: string } {
  const clean = (name ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim()
  if (!clean) return { first: "Member", last: "" }
  const at = clean.indexOf(" ")
  return at < 0 ? { first: clean.slice(0, 60), last: "" } : { first: clean.slice(0, at).slice(0, 60), last: clean.slice(at + 1).slice(0, 60) }
}

/**
 * What the PaymentIntent carries: the product checkout's own keys
 * (app/api/checkout/stripe-session), so fulfilPaymentIntent makes the order
 * from it, and the item's, so the purchase is recorded against it. Pure.
 */
export function libraryIntentMetadata(p: {
  row: Pick<LibraryItemRow, "id" | "community_id" | "title">
  product: Pick<ProductFacts, "id" | "slug" | "title" | "type">
  community: Pick<CommunityRow, "id" | "slug" | "name">
  creatorId: string
  creatorName: string
  buyer: LibraryBuyer
  baseCents: number
  fee: PlatformFee
  tax: LibraryTax | null
  receiptToken: string
  fingerprint: string
  saleHolder: string | null
  now: string
}): Record<string, string> {
  const name = splitName(p.buyer.name)
  const taxed = p.tax && p.tax.taxCents > 0 ? p.tax : null
  return {
    order_source: "storelib",
    product_id: p.product.id,
    product_slug: String(p.product.slug || "").slice(0, 200),
    product_title: String(p.product.title || p.row.title || "").slice(0, 480),
    product_type: String(p.product.type || "digital"),
    creator_id: p.creatorId,
    creator_name: p.creatorName.slice(0, 200),
    buyer_id: p.buyer.userId,
    buyer_first_name: name.first,
    buyer_last_name: name.last,
    buyer_email: (p.buyer.email || "").toLowerCase().slice(0, 254),
    base_price_cents: String(p.baseCents),
    discount_cents: "0",
    coupon_id: "",
    coupon_code: "",
    tip_cents: "0",
    access_token: "",
    session_fingerprint: p.fingerprint,
    receipt_token: p.receiptToken,
    platform_fee_cents: String(p.fee.platformFeeCents),
    fee_percent: String(p.fee.feePercent),
    fee_fixed_cents: String(p.fee.feeFixedCents),
    plan_used: p.fee.planId,
    pricing_tier: p.fee.pricingTier ?? "standard",
    fee_rule_version: p.fee.feeRuleVersion ?? "",
    variant_id: "",
    variant_name: "",
    variant_price_cents: "",
    tax_cents: String(taxed?.taxCents ?? 0),
    tax_rate_bps: String(taxed?.rateBps ?? 0),
    tax_included: taxed?.included ? "true" : "false",
    tax_country: taxed?.country ?? "",
    tax_label: taxed ? taxed.label : "",
    buyer_country: "",
    buyer_country_code: p.buyer.country ?? "",
    email_opt_in: "false",
    agreed_to_terms: "false",
    agreed_at: p.now,
    ...(p.saleHolder ? { [SALE_HOLDER_KEY]: p.saleHolder } : {}),
    kind: LIBRARY_SESSION_KIND,
    community_library_item_id: p.row.id,
    community_id: p.community.id,
  }
}

/** Everything Stripe is asked for, from the server's own facts. Pure, so the tests can read it. */
export function libraryCheckoutParams(p: {
  row: Pick<LibraryItemRow, "id" | "community_id" | "title" | "cover_url">
  product: Pick<ProductFacts, "id" | "title">
  community: Pick<CommunityRow, "id" | "slug" | "name">
  buyer: LibraryBuyer
  destination: string
  currency: string
  chargeCents: number
  fee: PlatformFee
  intentMetadata: Record<string, string>
}): Stripe.Checkout.SessionCreateParams {
  const metadata: Record<string, string> = {
    kind: LIBRARY_SESSION_KIND,
    community_library_item_id: p.row.id,
    community_id: p.community.id,
    community_slug: p.community.slug.slice(0, 200),
    buyer_id: p.buyer.userId,
  }
  const cover = p.row.cover_url && /^https:\/\//.test(p.row.cover_url) ? [p.row.cover_url] : undefined
  const title = (p.row.title || p.product.title || "Library item").slice(0, 250)
  return {
    mode: "payment",
    ui_mode: "embedded",
    redirect_on_completion: "never",
    line_items: [{ quantity: 1, price_data: { currency: p.currency, unit_amount: p.chargeCents, product_data: { name: title, description: `From the library of ${p.community.name}`.slice(0, 500), ...(cover ? { images: cover } : {}) } } }],
    ...(p.buyer.email ? { customer_email: p.buyer.email } : {}),
    client_reference_id: p.buyer.userId,
    payment_intent_data: {
      application_fee_amount: p.fee.platformFeeCents,
      transfer_data: { destination: p.destination },
      description: `${title.slice(0, 200)} (${p.community.name.slice(0, 200)})`,
      metadata: p.intentMetadata,
    },
    metadata,
  }
}

/**
 * A session for this member and this sold item, or why not: off, not theirs
 * to see, already theirs, not sold, the product not on sale, sold out, or the
 * creator not able to take payments.
 */
export async function startLibraryCheckout(db: Db, deps: LibraryCheckoutDeps, a: { community: CommunityRow; viewer: Viewer; itemId: string; buyer: LibraryBuyer }): Promise<LibraryCheckoutStart> {
  const { community, viewer } = a
  if (!viewer.userId || !viewer.active) return refuse(403, "not_member", "Join the community first.")
  const access = await itemAccess(db, community, viewer, a.itemId)
  if (!access) return refuse(404, "not_found", "That is not in the Library.")
  if (access.gate.open) return refuse(409, "already_yours", "This is yours already.")
  if (!("reason" in access.gate) || access.gate.reason !== "paid") return refuse(403, "closed", "This is not for sale to you.")
  const creatorId = community.creator_id
  if (!creatorId) return refuse(409, "seller_unavailable", "This community cannot take payments right now. Nothing was charged.")
  const product = productToSell(access.row, access.product, creatorId)
  if (!product) return refuse(409, "not_for_sale", "This is not for sale right now.")
  const { data: options } = await db.from("product_variants").select("id").eq("product_id", product.id).limit(1)
  if (((options as unknown[] | null) ?? []).length) return refuse(409, "not_for_sale", "This is sold from its own page.")
  const storeCurrency = await deps.storeCurrency(creatorId)
  const currency = (access.row.kind === "resource" ? access.row.currency || storeCurrency : productPriceCurrency(product, storeCurrency)).toLowerCase()
  const base = effectivePrice(access.row, product)
  if (!base || base < minimumChargeMinor(currency)) return refuse(409, "not_for_sale", "This is not for sale right now.")
  const { data: creator } = await db.from("creators").select("id, stripe_account_id, display_name, user_id").eq("id", creatorId).maybeSingle()
  const account = (creator as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? null
  if (!account || !account.startsWith("acct_") || !(await deps.ready(creatorId))) return refuse(409, "seller_unavailable", "This community cannot take payments right now. Nothing was charged.")
  let fee: PlatformFee
  try {
    fee = await deps.fee(base, creatorId, currency)
  } catch {
    return refuse(400, "currency", "This currency is not available for checkout yet.")
  }
  const tax = deps.tax ? await deps.tax(creatorId, product.id, base, a.buyer.country).catch(() => null) : null
  const chargeCents = tax ? tax.totalCents : base
  const holder = deps.holdSale ? `library:${viewer.userId}` : null
  if (holder && deps.holdSale && !(await deps.holdSale(product.id, holder))) return refuse(409, "sold_out", "This has sold out.")
  const intentMetadata = libraryIntentMetadata({
    row: access.row,
    product,
    community,
    creatorId,
    creatorName: (creator as { display_name?: string | null } | null)?.display_name || community.name,
    buyer: a.buyer,
    baseCents: base,
    fee,
    tax,
    receiptToken: deps.receiptToken(),
    fingerprint: deps.nonce(),
    saleHolder: holder,
    now: new Date().toISOString(),
  })
  try {
    const session = await deps.stripe.checkout.sessions.create(libraryCheckoutParams({ row: access.row, product, community, buyer: a.buyer, destination: account, currency, chargeCents, fee, intentMetadata }))
    if (!session.client_secret) throw new Error("no client secret")
    return { ok: true, clientSecret: session.client_secret, sessionId: session.id, amountCents: chargeCents, currency }
  } catch (e) {
    if (holder && deps.releaseSale) await deps.releaseSale(product.id, holder).catch(() => undefined)
    console.error("[communities] library checkout:", e instanceof Error ? e.message.slice(0, 200) : "unknown")
    return refuse(502, "stripe", "The payment form did not load. Nothing was charged. Try again.")
  }
}

/** A Checkout Session this file made. */
export function isLibrarySession(session: Pick<Stripe.Checkout.Session, "metadata">): boolean {
  const m = session.metadata ?? {}
  return m.kind === LIBRARY_SESSION_KIND && typeof m.community_library_item_id === "string" && typeof m.buyer_id === "string" && typeof m.community_id === "string"
}

/** The order made from a PaymentIntent (lib/checkout/fulfil-payment.ts fulfilPaymentIntent, handed in). */
export type Fulfil = (paymentIntentId: string) => Promise<{ ok: true; orderId: string; created: boolean; amountCents: number } | { ok: false; status: number; error: string }>

export type LibraryGrant = { ok: true; itemId: string; orderId: string } | { ok: false; status: number; error: string }

/**
 * WHICH ORDER BOUGHT WHICH ITEM, once per payment (unique on the
 * PaymentIntent): from the session's confirm, the session's webhook, or the
 * PaymentIntent's webhook, whichever comes first. Never throws.
 */
export async function recordLibraryPurchase(db: Db, p: { communityId: string; itemId: string; userId: string | null; productId: string | null; orderId: string | null; paymentIntentId: string; sessionId?: string | null; amountCents: number; currency: string | null }): Promise<void> {
  try {
    const { error } = await db.from("community_library_purchases").upsert(
      { community_id: p.communityId, item_id: p.itemId, user_id: p.userId, product_id: p.productId, order_id: p.orderId, payment_intent_id: p.paymentIntentId, checkout_session_id: p.sessionId ?? null, amount_cents: Math.max(0, Math.round(p.amountCents) || 0), currency: p.currency },
      { onConflict: "payment_intent_id", ignoreDuplicates: true },
    )
    if (error) {
      if (!missing(error)) console.error(`[communities] library purchase: ${reasonOf(error)}`)
      return
    }
    await audit(db, { communityId: p.communityId, actorId: p.userId, actorKind: "member", action: "library.bought", targetType: "library_item", targetId: p.itemId, detail: { orderId: p.orderId, amountCents: p.amountCents, currency: p.currency } })
  } catch (e) {
    console.error(`[communities] library purchase: ${reasonOf(e)}`)
  }
}

/** A paid PaymentIntent of a Library sale (the PaymentIntent's webhook, after its order is made): the purchase recorded. */
export async function recordFromIntent(db: Db, pi: Pick<Stripe.PaymentIntent, "id" | "metadata" | "amount_received" | "amount" | "currency">, orderId: string | null): Promise<void> {
  const m = pi.metadata ?? {}
  if (m.kind !== LIBRARY_SESSION_KIND || !m.community_library_item_id || !m.community_id) return
  await recordLibraryPurchase(db, { communityId: m.community_id, itemId: m.community_library_item_id, userId: m.buyer_id || null, productId: m.product_id || null, orderId, paymentIntentId: pi.id, amountCents: pi.amount_received || pi.amount || 0, currency: pi.currency ?? null })
}

/**
 * THE ITEM IS THEIRS, FROM A PAID SESSION: only a session this file made,
 * paid, for the buyer it names (and, from the sheet, that buyer must be the
 * one asking). The order is made by the product checkout's own fulfilment;
 * then the purchase is recorded.
 */
export async function grantLibraryFromSession(db: Db, session: Stripe.Checkout.Session, fulfil: Fulfil, opts: { userId?: string } = {}): Promise<LibraryGrant> {
  if (!isLibrarySession(session)) return { ok: false, status: 400, error: "not_a_library_session" }
  const m = session.metadata as Record<string, string>
  if (opts.userId && m.buyer_id !== opts.userId) return { ok: false, status: 403, error: "forbidden" }
  if (session.payment_status !== "paid") return { ok: false, status: 409, error: "not_paid" }
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null)
  if (!intent) return { ok: false, status: 409, error: "not_paid" }
  const order = await fulfil(intent)
  if (order.ok === false) return { ok: false, status: order.status, error: order.error }
  const { data: item } = await db.from("community_library_items").select("id, product_id").eq("id", m.community_library_item_id).eq("community_id", m.community_id).maybeSingle()
  await recordLibraryPurchase(db, {
    communityId: m.community_id,
    itemId: m.community_library_item_id,
    userId: m.buyer_id,
    productId: (item as { product_id?: string | null } | null)?.product_id ?? null,
    orderId: order.orderId,
    paymentIntentId: intent,
    sessionId: session.id,
    amountCents: typeof session.amount_total === "number" ? session.amount_total : order.amountCents,
    currency: session.currency ?? null,
  })
  return { ok: true, itemId: m.community_library_item_id, orderId: order.orderId }
}

/** The sheet's question after onComplete: the session read from Stripe again, never trusted from the page. */
export async function confirmLibraryCheckout(db: Db, stripe: StripeSessions, fulfil: Fulfil, a: { sessionId: unknown; userId: string }): Promise<LibraryGrant> {
  const id = typeof a.sessionId === "string" && /^cs_[A-Za-z0-9_]{8,255}$/.test(a.sessionId) ? a.sessionId : null
  if (!id) return { ok: false, status: 400, error: "bad_session" }
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(id)
  } catch {
    return { ok: false, status: 502, error: "stripe" }
  }
  return grantLibraryFromSession(db, session, fulfil, { userId: a.userId })
}

/**
 * A FULL REFUND (app/api/stripe/webhook, charge.refunded): the purchase is
 * marked, so the admin's sales leave it out. The item itself locks because
 * the refund took the product out of the buyer's library, as every refund
 * of a product does. Never throws.
 */
export async function revokeRefundedLibrary(db: Db, paymentIntentId: string | null | undefined): Promise<number> {
  if (!paymentIntentId) return 0
  try {
    const { data, error } = await db.from("community_library_purchases").update({ refunded_at: new Date().toISOString() }).eq("payment_intent_id", paymentIntentId).is("refunded_at", null).select("id")
    if (error) return 0
    return ((data as unknown[] | null) ?? []).length
  } catch {
    return 0
  }
}

/** "$12" for the sheet, from the start's answer. */
export function libraryPriceLabel(cents: number, currency: string): string {
  return programPrice(cents, currency)
}
