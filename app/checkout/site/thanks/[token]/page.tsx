import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { notFound } from "next/navigation"
import { Check, Package } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPlausibleToken } from "@/lib/receipts/rules"
import { siteOfHost } from "@/lib/checkout/site-checkout-server"
import { checkoutBrand } from "@/lib/checkout/brand-server"
import { ShopBar } from "../../../parts/shop-bar"
import { money } from "../../../parts/ui"
import { currencyCode, formatMinor } from "@/lib/markets/money"
import { ClearCart } from "./clear-cart"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { gaItem, type GaItem } from "@/lib/store/ga"
import { storeCurrencyFor } from "@/lib/store/ga-server"
import { checkoutLanguage } from "@/lib/markets/checkout-language"
import { checkoutMsg, checkoutT } from "@/lib/markets/checkout-words"
import { optionKey, valueFor } from "@/lib/markets/translate"
import { CheckoutWords } from "../../../parts/words"

export const dynamic = "force-dynamic"

/* The token is a credential: never indexed, and never sent on as a Referer. */
export const metadata: Metadata = { title: "Thank you", robots: { index: false, follow: false }, referrer: "no-referrer" }

interface Line {
  /** For its title in the page's language (`product:<id>:title`). */
  productId?: string
  title: string
  variantName: string | null
  imageUrl: string | null
  quantity: number
  cents: number
}

interface Summary {
  email: string | null
  firstName: string | null
  lines: Line[]
  totalCents: number
  shippingCents: number | null
  taxCents: number
  shipTo: string | null
  /** Picked up: where, said in the page's language. */
  pickupAt?: string | null
  receipt: string
  /** To be paid in cash when it arrives (lib/physical/cash-on-delivery.ts): "delivered" or "picked up", or null when it was paid. */
  cashWhen?: "delivered" | "picked up" | null
  /** For the store's Google Analytics purchase: the order's own id (never the token, which is a credential) and what was bought. */
  ga: { id: string; items: GaItem[]; currency: string | null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** A cart that shipped: the held checkout's own record (lib/physical/checkout-server). */
async function shippedOrder(db: Db, creatorId: string, token: string): Promise<Summary | null> {
  try {
    const { data: co, error } = await db
      .from("commerce_checkouts")
      .select("id, creator_id, status, buyer_email, buyer_name, lines, total_cents, shipping_cents, shipping_discount_cents, tax_cents, shipping_rate, shipping_address, pickup, delivery_method, currency, provider")
      .eq("receipt_token", token)
      .maybeSingle()
    if (error || !co || co.creator_id !== creatorId || co.status !== "paid") return null
    const lines = (Array.isArray(co.lines) ? co.lines : []) as { product_id?: string; type?: string; title: string; variant_name: string | null; image_url: string | null; quantity: number; unit_cents: number; discount_cents: number }[]
    const address = co.shipping_address as { line1?: string; city?: string; country?: string } | null
    const pickup = co.pickup as { name?: string } | null
    return {
      email: co.buyer_email ?? null,
      firstName: typeof co.buyer_name === "string" ? co.buyer_name.trim().split(/\s+/)[0] || null : null,
      lines: lines.map((l) => ({ productId: l.product_id, title: l.title, variantName: l.variant_name, imageUrl: l.image_url, quantity: l.quantity, cents: Math.max(0, l.unit_cents * l.quantity - l.discount_cents) })),
      totalCents: co.total_cents ?? 0,
      shippingCents: co.delivery_method === "none" ? null : Math.max(0, (co.shipping_cents ?? 0) - (co.shipping_discount_cents ?? 0)),
      taxCents: co.shipping_rate?.tax_included ? 0 : co.tax_cents ?? 0,
      shipTo: co.delivery_method === "pickup" ? null : address ? [address.line1, address.city].filter(Boolean).join(", ") : null,
      pickupAt: co.delivery_method === "pickup" ? (pickup?.name ?? "") : null,
      receipt: `/checkout/physical/order/${encodeURIComponent(token)}`,
      cashWhen: co.provider === "cod" ? (co.delivery_method === "pickup" ? "picked up" : "delivered") : null,
      ga: { id: String(co.id), items: lines.map((l) => gaItem({ id: l.product_id ?? "", title: l.title, priceCents: l.unit_cents, quantity: l.quantity, variant: l.variant_name, kind: l.type === "physical" ? "physical" : "digital" })).filter((i): i is GaItem => !!i), currency: typeof co.currency === "string" ? co.currency : null },
    }
  } catch {
    return null
  }
}

/** A cart of downloads: its order rows, grouped by the payment that made them. */
async function basketOrder(db: Db, creatorId: string, token: string): Promise<Summary | null> {
  const { data: first } = await db
    .from("orders")
    .select("id, product_id, stripe_session_id, buyer_email, buyer_first_name, amount_cents, quantity, product:products(creator_id, title)")
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
    return { productId: typeof r.product_id === "string" ? r.product_id : undefined, title: p?.title ?? checkoutMsg("Your purchase"), variantName: v?.name ?? null, imageUrl: p?.thumbnail_url ?? null, quantity: Number(r.quantity) || 1, cents: Number(r.amount_cents) || 0 }
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
      items: rows.map((r, i) => gaItem({ id: String(r.product_id ?? ""), title: lines[i]?.title, priceCents: Math.round((Number(r.amount_cents) || 0) / Math.max(1, Number(r.quantity) || 1)), quantity: Number(r.quantity) || 1, variant: lines[i]?.variantName, kind: "digital" })).filter((x): x is GaItem => !!x),
      currency: null,
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
  const ships = order.shippingCents !== null
  /* In the currency the order was charged in (the checkout's own), as the receipt and the order page write it. */
  const orderCurrency = currencyCode(order.ga.currency)
  const shown = (cents: number) => (orderCurrency ? formatMinor(cents, orderCurrency, "en-US") : money(cents))
  const ct = checkoutT(language.lang, language.words)
  const map = language.map
  /* A line's title and its option's name in the page's language, as the checkout showed them (lib/markets/checkout-quote.ts). */
  const titleOf = (l: Line) => (l.productId && map ? (valueFor(map, `product:${l.productId}:title`, { approvedOnly: true, fresh: true }, l.title) ?? ct(l.title)) : ct(l.title))
  const nameOf = (n: string) => (map ? n.split(" / ").map((p) => valueFor(map, optionKey(p.trim()), { approvedOnly: true, fresh: true }, p.trim()) ?? p).join(" / ") : n)

  return (
    <CheckoutWords lang={language.lang} words={language.words}>
    <div data-page="checkout-thanks" className="min-h-dvh bg-[#f8f9fa]">
      {sp.cart === "1" ? <ClearCart shopId={site.creatorId} /> : null}
      {/* The store's own Google Analytics and pixels hear the purchase, once per order in this browser (lib/store/tracking.ts purchaseTags). */}
      <StoreTracking creatorId={site.creatorId} purchase={{ id: order.ga.id, valueCents: order.totalCents, currency: order.ga.currency ?? (await storeCurrencyFor(site.creatorId)), quantity: order.lines.reduce((n, l) => n + l.quantity, 0), items: order.ga.items }} />
      <ShopBar brand={brand} backTo={null} shopUrl={shopUrl} />
      <main className="mx-auto w-full max-w-[560px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <div className="checkout-enter">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#1a1a2e] text-white shadow-[0_1px_2px_rgba(17,17,19,0.2)]">
            <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          </span>
          <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">{order.firstName ? ct("Thank you, {name}", { name: order.firstName }) : ct("Thank you for your order")}</h1>
          <p className="mt-1.5 text-[14.5px] leading-6 text-[#6b7280]">
            {order.email ? ct("Your receipt is on its way to {email}.", { email: order.email }) : ct("Your receipt is on its way to your email.")}
            {ships ? ` ${ct("We'll email you when it ships.")}` : ""}
          </p>

          <section aria-label={ct("Your order")} className="mt-7 rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <ul className="space-y-4">
              {order.lines.map((l, i) => (
                <li key={i} className="flex items-start gap-3.5">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-black/[0.06] bg-white">
                    {l.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center">
                        <Package className="h-5 w-5 text-[#c4c7cd]" strokeWidth={1.5} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e]">{titleOf(l)}</p>
                    {l.variantName ? <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">{nameOf(l.variantName)}</p> : null}
                    <p className="mt-0.5 text-[12.5px] text-[#6b7280]">{ct("Qty {quantity}", { quantity: l.quantity })}</p>
                  </div>
                  <p className="shrink-0 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{l.cents === 0 ? ct("Free") : shown(l.cents)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-2 border-t border-black/[0.07] pt-4 text-[14px]">
              {ships ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-[#6b7280]">{ct("Shipping")}</dt>
                  <dd className="tabular-nums text-[#6b7280]">{order.shippingCents === 0 ? ct("Free") : shown(order.shippingCents ?? 0)}</dd>
                </div>
              ) : null}
              {order.taxCents > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-[#6b7280]">{ct("Tax")}</dt>
                  <dd className="tabular-nums text-[#6b7280]">{shown(order.taxCents)}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-4 pt-1">
                <dt className="text-[15px] font-semibold text-[#1a1a2e]">{ct("Total")}</dt>
                <dd className="text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{shown(order.totalCents)}</dd>
              </div>
            </dl>
            {order.shipTo ? <p className="mt-4 text-[13.5px] text-[#4b5563]">{order.shipTo}</p> : null}
            {order.pickupAt !== null && order.pickupAt !== undefined ? <p className="mt-4 text-[13.5px] text-[#4b5563]">{order.pickupAt ? ct("Pick up at {place}", { place: order.pickupAt }) : ct("Pick up at the shop")}</p> : null}
            {order.cashWhen ? (
              <p data-cash-payment="" className="mt-3 rounded-[8px] bg-[#f8f9fa] px-3.5 py-2.5 text-[14px] leading-5 text-[#4b5563]">
                {order.cashWhen === "picked up" ? ct("Pay {amount} in cash when you pick it up.", { amount: shown(order.totalCents) }) : ct("Pay {amount} in cash when it's delivered.", { amount: shown(order.totalCents) })}
              </p>
            ) : null}
          </section>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <a href={order.receipt} data-receipt-link="" className="inline-flex h-11 flex-1 items-center justify-center rounded-[8px] bg-[#1a1a2e] px-4 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_1px_rgba(0,0,0,0.12)] hover:bg-[#262640]">
              {ships ? ct("View your order") : ct("View receipt and downloads")}
            </a>
            <a href={shopUrl} data-continue="" className="inline-flex h-11 flex-1 items-center justify-center rounded-[8px] border border-[#e1e3e7] bg-white px-4 text-[15px] font-medium text-[#1a1a2e] hover:bg-[#fafafb]">
              {ct("Continue shopping")}
            </a>
          </div>
        </div>
      </main>
    </div>
    </CheckoutWords>
  )
}
