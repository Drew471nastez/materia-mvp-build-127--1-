import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { notFound } from "next/navigation"
import { orderNumber } from "@/lib/physical/status"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPlausibleToken } from "@/lib/receipts/rules"
import { siteOfHost } from "@/lib/checkout/site-checkout-server"
import { checkoutBrand } from "@/lib/checkout/brand-server"
import { ShopBar } from "../../../parts/shop-bar"
import { ClearCart } from "./clear-cart"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { gaItem, type GaItem } from "@/lib/store/ga"
import { storeCurrencyFor } from "@/lib/store/ga-server"
import { checkoutLanguage } from "@/lib/markets/checkout-language"
import { checkoutMsg } from "@/lib/markets/checkout-words"
import { CheckoutWords } from "../../../parts/words"
import { ThanksView, type Line, type Summary } from "./thanks-view"
import { buyerProperties, lineProperties } from "@/lib/physical/cart-link"
import { offersOfSnapshot, savingsOfLines } from "@/lib/offers/snapshot"

export const dynamic = "force-dynamic"

/* The token is a credential: never indexed, and never sent on as a Referer. */
export const metadata: Metadata = { title: "Thank you", robots: { index: false, follow: false }, referrer: "no-referrer" }



// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** A cart that shipped: the held checkout's own record (lib/physical/checkout-server). */
async function shippedOrder(db: Db, creatorId: string, token: string): Promise<Summary | null> {
  try {
    const { data: co, error } = await db
      .from("commerce_checkouts")
      .select("id, creator_id, status, buyer_email, buyer_name, lines, items_subtotal_cents, discount_cents, coupon_code, total_cents, shipping_cents, shipping_discount_cents, tax_cents, shipping_rate, shipping_address, pickup, delivery_method, currency, provider, cod_collected_at, cancelled_at, paid_at, created_at")
      .eq("receipt_token", token)
      .maybeSingle()
    if (error || !co || co.creator_id !== creatorId || co.status !== "paid") return null
    const lines = (Array.isArray(co.lines) ? co.lines : []) as { product_id?: string; type?: string; title: string; variant_name: string | null; image_url: string | null; quantity: number; unit_cents: number; discount_cents: number; offers?: unknown; properties?: unknown }[]
    const address = co.shipping_address as { line1?: string; city?: string; country?: string } | null
    const pickup = co.pickup as { name?: string } | null
    const rate = (co.shipping_rate ?? null) as { name?: unknown; min_days?: unknown; max_days?: unknown; kind?: unknown; local_note?: unknown } | null
    const days = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
    return {
      email: co.buyer_email ?? null,
      firstName: typeof co.buyer_name === "string" ? co.buyer_name.trim().split(/\s+/)[0] || null : null,
      lines: lines.map((l) => ({ productId: l.product_id, title: l.title, variantName: l.variant_name, imageUrl: l.image_url, quantity: l.quantity, unitCents: l.unit_cents, cents: Math.max(0, l.unit_cents * l.quantity - l.discount_cents), properties: buyerProperties(lineProperties(l.properties)) })),
      totalCents: co.total_cents ?? 0,
      shippingCents: co.delivery_method === "none" ? null : Math.max(0, (co.shipping_cents ?? 0) - (co.shipping_discount_cents ?? 0)),
      taxCents: co.shipping_rate?.tax_included ? 0 : co.tax_cents ?? 0,
      shipTo: co.delivery_method === "pickup" ? null : address ? [address.line1, address.city].filter(Boolean).join(", ") : null,
      pickupAt: co.delivery_method === "pickup" ? (pickup?.name ?? "") : null,
      receipt: `/checkout/physical/order/${encodeURIComponent(token)}`,
      /* Still to pay: not once the shop has the cash, nor on an order that was cancelled or refused. */
      cashWhen: co.provider === "cod" && !co.cod_collected_at && !co.cancelled_at ? (co.delivery_method === "pickup" ? "picked up" : "delivered") : null,
      ga: { id: String(co.id), items: lines.map((l) => gaItem({ id: l.product_id ?? "", title: l.title, priceCents: l.unit_cents, quantity: l.quantity, variant: l.variant_name, kind: l.type === "physical" ? "physical" : "digital", currency: typeof co.currency === "string" ? co.currency : null })).filter((i): i is GaItem => !!i), currency: typeof co.currency === "string" ? co.currency : null },
      shipped: {
        number: orderNumber(String(co.id)),
        placedAt: co.paid_at ?? co.created_at ?? null,
        subtotalCents: Number(co.items_subtotal_cents ?? 0) || lines.reduce((n, l) => n + l.unit_cents * l.quantity, 0),
        discountCents: Math.max(0, Number(co.discount_cents ?? 0) || 0),
        /* Each offer by its own name (the lines' snapshot), so the code's row is the code's part only. */
        savings: savingsOfLines(lines),
        coupon: typeof co.coupon_code === "string" && co.coupon_code.trim() ? co.coupon_code.trim() : null,
        address: co.delivery_method === "pickup" || co.delivery_method === "none" ? null : (co.shipping_address as Record<string, unknown> | null),
        method: co.delivery_method !== "pickup" && co.delivery_method !== "none" && typeof rate?.name === "string" && rate.name.trim() ? { name: rate.name.trim(), minDays: days(rate.min_days), maxDays: days(rate.max_days), local: rate.kind === "local", note: typeof rate.local_note === "string" ? rate.local_note : null } : null,
      },
    }
  } catch {
    return null
  }
}

/** A cart of downloads: its order rows, grouped by the payment that made them. */
async function basketOrder(db: Db, creatorId: string, token: string): Promise<Summary | null> {
  const { data: first } = await db
    .from("orders")
    .select("id, product_id, stripe_session_id, buyer_email, buyer_first_name, amount_cents, quantity, currency, product:products(creator_id, title)")
    .eq("receipt_token", token)
    .maybeSingle()
  const product = Array.isArray(first?.product) ? first.product[0] : first?.product
  if (!first || product?.creator_id !== creatorId) return null
  let rows: Record<string, unknown>[] = [first]
  if (first.stripe_session_id) {
    const { data } = await db
      .from("orders")
      .select("id, product_id, amount_cents, quantity, product_snapshot, variant:product_variants(name), product:products(title, thumbnail_url)")
      .eq("stripe_session_id", first.stripe_session_id)
      .eq("buyer_email", first.buyer_email)
      .order("created_at", { ascending: true })
      .limit(50)
    if (Array.isArray(data) && data.length) rows = data
  }
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
  const lines: Line[] = rows.map((r) => {
    const p = one(r.product as { title?: string; thumbnail_url?: string | null } | null)
    const v = one(r.variant as { name?: string | null } | null)
    /* What the line kept of the checkout (lib/checkout/fulfil-cart-item lineSnapshot): the offers that saved on it and the buyer's own words. */
    const snap = (r.product_snapshot ?? null) as { offers?: unknown; properties?: unknown } | null
    const offers = (offersOfSnapshot(snap?.offers) ?? []).map((o) => ({ title: o.title, cents: o.savedCents }))
    const cents = Number(r.amount_cents) || 0
    const quantity = Number(r.quantity) || 1
    const saved = offers.reduce((n, o) => n + o.cents, 0)
    return { productId: typeof r.product_id === "string" ? r.product_id : undefined, title: p?.title ?? checkoutMsg("Your purchase"), variantName: v?.name ?? null, imageUrl: p?.thumbnail_url ?? null, quantity, cents, properties: buyerProperties(lineProperties(snap?.properties)), offers, ...(saved > 0 && (cents + saved) % quantity === 0 ? { unitCents: (cents + saved) / quantity } : {}) }
  })
  return {
    email: first.buyer_email ?? null,
    firstName: first.buyer_first_name ?? null,
    lines,
    totalCents: lines.reduce((n, l) => n + l.cents, 0),
    shippingCents: null,
    taxCents: 0,
    shipTo: null,
    receipt: `/receipt/${encodeURIComponent(token)}`,
    ga: {
      id: String(first.id),
      items: rows.map((r, i) => gaItem({ id: String(r.product_id ?? ""), title: lines[i]?.title, priceCents: Math.round((Number(r.amount_cents) || 0) / Math.max(1, Number(r.quantity) || 1)), quantity: Number(r.quantity) || 1, variant: lines[i]?.variantName, kind: "digital", currency: typeof first.currency === "string" ? first.currency : null })).filter((x): x is GaItem => !!x),
      /* What the order was charged in, kept on each of its rows. */
      currency: typeof first.currency === "string" && first.currency ? first.currency.toUpperCase() : null,
    },
  }
}

/**
 * ===========================================================================
 *  AFTER PAYING, ON THE WEBSITE
 * ===========================================================================
 * https://<site host>/checkout/thanks/<token>: the order, under the website's
 * own logo, on the website's own address, with its receipt one press away
 * (the receipt and its downloads are served on this host too) and the way
 * back to the shop. The cart the order came from is emptied (?cart=1).
 */
export default async function SiteThanksPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ cart?: string; lang?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams])
  if (!isPlausibleToken(token)) notFound()
  const admin = createAdminClient()
  const site = await siteOfHost(admin, (await headers()).get("host"))
  if (!site) notFound()
  /* In the language the checkout was in (?lang, which it hands on), else the one chosen on the website (lib/markets/checkout-language.ts). */
  const chosen = sp.lang ?? (await cookies()).get("sl_lang")?.value
  const [brand, order, language] = await Promise.all([
    checkoutBrand(admin, site.creatorId),
    shippedOrder(admin, site.creatorId, token).then((o) => o ?? basketOrder(admin, site.creatorId, token)),
    checkoutLanguage(site.creatorId, null, chosen).catch(() => ({ lang: "en", words: {} as Record<string, string>, map: null })),
  ])
  if (!order) notFound()
  const shopUrl = `${site.origin}/`

  return (
    <CheckoutWords lang={language.lang} words={language.words}>
    <div data-page="checkout-thanks" className="min-h-dvh bg-[#f8f9fa]">
      {sp.cart === "1" ? <ClearCart shopId={site.creatorId} /> : null}
      {/* The store's own Google Analytics and pixels hear the purchase, once per order in this browser (lib/store/tracking.ts purchaseTags). */}
      <StoreTracking creatorId={site.creatorId} purchase={{ id: order.ga.id, valueCents: order.totalCents, currency: order.ga.currency ?? (await storeCurrencyFor(site.creatorId)), quantity: order.lines.reduce((n, l) => n + l.quantity, 0), items: order.ga.items }} />
      <ShopBar brand={brand} backTo={null} shopUrl={shopUrl} />
      <ThanksView order={order} shopUrl={shopUrl} lang={language.lang} words={language.words} map={language.map} />
    </div>
    </CheckoutWords>
  )
}
