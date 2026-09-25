import { NextResponse } from "next/server"
import { rateLimit, addressSubject, LIMITS } from "@/lib/api/rate-limit"
import { baseFor } from "@/lib/checkout/pricing"
import { stripe } from "@/lib/stripe"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { calculatePlatformFee } from "@/lib/billing/fee-calculator"
import { getMainDomain } from "@/lib/url-helpers"
import { siteHostsFor } from "@/lib/checkout/site-hosts"
import { packItems, type PackedItem } from "@/lib/checkout/cart-items"
import { MAX_LINES, MAX_QUANTITY } from "@/lib/website-builder/cart"
import { ORIGIN_METADATA_KEY, cleanHost, cleanOrigin, encodeOrigin } from "@/lib/orders/order-source"

export const runtime = "nodejs"

/**
 * ===========================================================================
 *  PAYING FOR A BASKET ON A CREATOR'S OWN SITE
 * ===========================================================================
 * The single-product checkout is untouched. This is beside it, because a
 * basket is a different shape and rewriting the path every purchase on the
 * platform already goes through, to add a feature only built sites have,
 * is not a trade worth making.
 *
 * ONE SELLER, ESTABLISHED FROM THE DATA. A Stripe destination charge pays
 * ONE connected account, so a basket spanning two sellers cannot be one
 * payment. The browser is not asked whose shop this is: the products are
 * loaded and their `creator_id` has to be the same for all of them, or the
 * request is refused. A cart lives on one creator's site, so this is only
 * ever a guard against something that should not be possible.
 *
 * THE BROWSER DOES NOT SET PRICES. It sends product ids and quantities.
 * Every price is read from the row, every product must be published, and
 * anything the buyer already owns is dropped rather than charged for twice.
 *
 * HOSTED RATHER THAN ELEMENTS. Stripe Checkout takes several line items
 * natively and shows the buyer what they are paying for, line by line. The
 * alternative was a second card form on the platform that would have had to
 * learn baskets. The buyer comes back to the platform to be fulfilled and is
 * sent on to their receipt.
 */

interface IncomingItem {
  productId?: unknown
  variantId?: unknown
  quantity?: unknown
}

/**
 * Where to send a buyer who backs out. The site is on a subdomain or on the
 * creator's own domain, so it cannot be derived from the platform's config,
 * and taking the Origin header at face value would make this an open
 * redirect. It is accepted only when it names the platform itself, or one of
 * THIS creator's own website addresses: their subdomains and their verified
 * domains (lib/checkout/site-hosts.ts, the same list the single-product
 * checkout returns to). Any storelib.com subdomain used to pass, which is
 * every other creator's site too.
 */
async function safeReturnOrigin(origin: string | null, creatorId: string): Promise<string | null> {
  if (!origin) return null
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") return null
  if (url.username || url.password) return null

  const main = getMainDomain()
  if (url.hostname === main) return url.origin

  const own = await siteHostsFor(creatorId)
  if (own.includes(url.hostname.toLowerCase())) return url.origin

  return null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()

  let body: { items?: IncomingItem[]; returnPath?: unknown; origin?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  /* Each call makes a Stripe Checkout Session: counted with the other payment routes. */
  const limited = await rateLimit({
    bucket: "payment",
    subjects: [addressSubject(request)],
    windows: LIMITS.payment,
    message: "Too many checkouts started just now. Wait a few minutes and try again.",
  })
  if (limited) return limited

  const incoming = Array.isArray(body.items) ? body.items.slice(0, MAX_LINES) : []
  if (incoming.length === 0) {
    return NextResponse.json({ error: "Your cart is empty" }, { status: 400 })
  }

  const wanted = new Map<string, { variantId: string | null; quantity: number }>()
  for (const raw of incoming) {
    if (typeof raw?.productId !== "string" || raw.productId === "") continue
    const variantId = typeof raw.variantId === "string" && raw.variantId !== "" ? raw.variantId : null
    const quantity = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(raw.quantity) || 1)))
    wanted.set(`${raw.productId}::${variantId ?? ""}`, { variantId, quantity })
  }
  const productIds = [...new Set([...wanted.keys()].map((k) => k.split("::")[0]))]
  if (productIds.length === 0) {
    return NextResponse.json({ error: "Your cart is empty" }, { status: 400 })
  }

  const { data: products, error: productsError } = await admin
    .from("products")
    .select("id, title, slug, price_cents, pay_what_you_want, pwyw_min_price_cents, thumbnail_url, type, status, creator_id")
    .in("id", productIds)
    .eq("status", "published")

  if (productsError) {
    console.error("[checkout/cart] product read failed:", productsError.message)
    return NextResponse.json({ error: "Could not read the cart" }, { status: 500 })
  }
  if (!products || products.length === 0) {
    return NextResponse.json({ error: "Nothing in the cart is on sale any more" }, { status: 400 })
  }

  const creatorIds = new Set(products.map((p: any) => p.creator_id))
  if (creatorIds.size !== 1) {
    return NextResponse.json({ error: "A cart can only hold one shop's products" }, { status: 400 })
  }
  const creatorId = products[0].creator_id as string

  const { data: creator } = await admin
    .from("creators")
    .select("id, user_id, display_name, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled")
    .eq("id", creatorId)
    .single()

  if (!creator) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 })
  }
  if (
    !creator.stripe_account_id ||
    !String(creator.stripe_account_id).startsWith("acct_") ||
    creator.charges_enabled === false ||
    creator.payouts_enabled === false ||
    creator.stripe_onboarding_status !== "connected"
  ) {
    return NextResponse.json(
      { error: "This shop cannot take payments yet. Please contact the seller." },
      { status: 400 },
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  /* Already owned is dropped rather than charged for. A digital product is
     one entitlement per buyer, so paying twice buys nothing. */
  let owned = new Set<string>()
  if (user) {
    const { data: entitlements } = await admin
      .from("entitlements")
      .select("product_id")
      .eq("buyer_id", user.id)
      .in("product_id", productIds)
    owned = new Set((entitlements ?? []).map((e: any) => e.product_id))
  }

  /* A line's option is the database's, checked against its product and
     priced from itself. The client's variantId used to be kept as sent and
     the line priced at the product's price: the cheapest option paid for
     the dearest one, and an unknown id failed the order's foreign key after
     the money was taken. */
  const variantIds = [...new Set([...wanted.values()].map((w) => w.variantId).filter((v): v is string => !!v))]
  const variantsById = new Map<string, any>()
  if (variantIds.length > 0) {
    const { data: variants } = await admin
      .from("product_variants")
      .select("id, product_id, name, price_cents, pay_what_you_want, pwyw_min_price_cents")
      .in("id", variantIds)
    for (const v of variants ?? []) variantsById.set(v.id, v)
  }

  const byId = new Map(products.map((p: any) => [p.id, p]))
  const lines: Array<{ item: PackedItem; product: any }> = []
  const dropped: string[] = []

  for (const [key, want] of wanted) {
    const productId = key.split("::")[0]
    const product = byId.get(productId)
    if (!product) { dropped.push(productId); continue }
    if (owned.has(productId)) { dropped.push(product.title); continue }

    const variant = want.variantId ? variantsById.get(want.variantId) : null
    if (want.variantId && (!variant || variant.product_id !== productId)) { dropped.push(product.title); continue }
    /* Pay what you want in a basket is its minimum: there is no amount box. */
    const priced = baseFor(variant ?? product, undefined)
    const priceCents = priced.ok ? priced.cents : 0
    /* A free product is a download, not a payment. It has no place in a
       basket that is going to a card form, and Stripe will not take a zero
       line anyway. */
    if (priceCents <= 0) { dropped.push(product.title); continue }

    const quantity = product.type === "digital" ? 1 : want.quantity
    lines.push({ item: { productId, variantId: want.variantId, quantity, priceCents }, product })
  }

  if (lines.length === 0) {
    return NextResponse.json(
      { error: owned.size > 0 ? "You already own everything in this cart" : "Nothing in the cart can be bought right now" },
      { status: 400 },
    )
  }

  const totalCents = lines.reduce((n, l) => n + l.item.priceCents * l.item.quantity, 0)
  if (totalCents < 50) {
    return NextResponse.json({ error: "Minimum payment amount is $0.50" }, { status: 400 })
  }

  const fee = await calculatePlatformFee(totalCents, creatorId, admin)

  const platformOrigin = `https://${getMainDomain()}`
  const siteOrigin = (await safeReturnOrigin(request.headers.get("origin"), creatorId)) ?? platformOrigin
  const returnPath = typeof body.returnPath === "string" && body.returnPath.startsWith("/") ? body.returnPath : "/cart"

  /* A basket is a website's. Which website is the one the request came
     from, checked above as this creator's; the page adds where its visit
     came from, every field checked (lib/orders/order-source). */
  const sent = cleanOrigin(body.origin)
  const site = siteOrigin !== platformOrigin ? cleanHost(new URL(siteOrigin).host) : sent?.site
  const origin = encodeOrigin({ ...sent, surface: "website", site })

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lines.map((l) => ({
        quantity: l.item.quantity,
        price_data: {
          currency: "usd",
          unit_amount: l.item.priceCents,
          product_data: {
            name: String(l.product.title ?? "Product"),
            ...(l.product.thumbnail_url ? { images: [String(l.product.thumbnail_url)] } : {}),
          },
        },
      })),
      customer_email: user?.email ?? undefined,
      payment_intent_data: {
        application_fee_amount: fee.platformFeeCents,
        transfer_data: { destination: creator.stripe_account_id },
      },
      /* Fulfilment happens on the platform, whichever host the shop is on:
         the session cookie, the admin client and the receipt all live there.
         Then the buyer goes back to the website's home page, which the
         completion checks again against this creator's own sites; a basket
         from anywhere else ends on the receipt, as it always did. */
      success_url: `${platformOrigin}/api/checkout/cart/complete?session_id={CHECKOUT_SESSION_ID}${
        siteOrigin !== platformOrigin ? `&return=${encodeURIComponent(`${siteOrigin}/`)}` : ""
      }`,
      cancel_url: `${siteOrigin}${returnPath}`,
      metadata: {
        cart: "1",
        creator_id: creatorId,
        buyer_id: user?.id ?? "",
        platform_fee_cents: String(fee.platformFeeCents),
        plan_used: fee.planId,
        ...(origin ? { [ORIGIN_METADATA_KEY]: origin } : {}),
        ...packItems(lines.map((l) => l.item)),
      },
    })

    return NextResponse.json({
      url: session.url,
      /* Named so the cart can tell the buyer what it left out rather than
         silently charging for less than they asked for. */
      dropped,
    })
  } catch (error: any) {
    console.error("[checkout/cart] session creation failed:", error?.message)
    return NextResponse.json({ error: "Could not start the checkout" }, { status: 500 })
  }
}
