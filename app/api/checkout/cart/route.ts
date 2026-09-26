import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { MIN_CHARGE_CENTS, priceCart } from "@/lib/checkout/pricing"
import { stripe } from "@/lib/stripe"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { calculatePlatformFee } from "@/lib/billing/fee-calculator"
import { getMainDomain } from "@/lib/url-helpers"
import { siteHostsFor } from "@/lib/checkout/site-hosts"
import { chargeUnits, packItems } from "@/lib/checkout/cart-items"
import { HELD_SESSION_SECONDS, HOLD_COOKIE, holdCouponUse, holderForEmail, isHolder, needsHold, newHolder, releaseCouponHold } from "@/lib/checkout/coupon-holds"
import { fulfilFreeCart } from "@/lib/checkout/fulfil-cart-session"
import { ORIGIN_METADATA_KEY, cleanHost, cleanOrigin, encodeOrigin } from "@/lib/orders/order-source"
import { cookies } from "next/headers"

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
 * A DISCOUNT CODE is priced here too, per line, by lib/checkout/pricing
 * priceCart: it comes off the lines of its own creator inside its product
 * list, and the total Stripe is asked for is the server's. The code and each
 * line's share go on the session, so the use is counted once when the
 * basket is written (lib/checkout/fulfil-cart-session). A code that takes
 * the whole basket to $0 does not go to Stripe at all: the basket is written
 * here, as the free checkout writes a single product, with the buyer's name
 * and address, which the cart page asks for only then.
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

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max) : ""
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

  let body: { items?: IncomingItem[]; returnPath?: unknown; origin?: unknown; couponCode?: unknown; buyer?: Record<string, unknown> | null }
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  /* Every price, every line left out, and the code, from the database (lib/checkout/pricing). */
  const priced = await priceCart(admin, { items: body.items, couponCode: body.couponCode, buyerId: user?.id ?? null })
  if (priced.ok === false) return NextResponse.json({ error: priced.error }, { status: priced.status })
  const { lines, dropped, coupon } = priced

  if (priced.creatorIds.length !== 1) {
    return NextResponse.json({ error: "A cart can only hold one shop's products" }, { status: 400 })
  }
  const creatorId = priced.creatorIds[0]

  const { data: creator } = await admin
    .from("creators")
    .select("id, user_id, display_name, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled")
    .eq("id", creatorId)
    .single()

  if (!creator) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 })
  }

  if (lines.length === 0) {
    return NextResponse.json(
      { error: priced.ownedAny ? "You already own everything in this cart" : "Nothing in the cart can be bought right now" },
      { status: 400 },
    )
  }

  const platformOrigin = `https://${getMainDomain()}`
  const siteOrigin = (await safeReturnOrigin(request.headers.get("origin"), creatorId)) ?? platformOrigin
  const returnPath = typeof body.returnPath === "string" && body.returnPath.startsWith("/") ? body.returnPath : "/cart"

  /* A basket is a website's. Which website is the one the request came
     from, checked above as this creator's; the page adds where its visit
     came from, every field checked (lib/orders/order-source). */
  const sent = cleanOrigin(body.origin)
  const site = siteOrigin !== platformOrigin ? cleanHost(new URL(siteOrigin).host) : sent?.site
  const origin = encodeOrigin({ ...sent, surface: "website", site })

  const totalCents = priced.totalCents
  if (coupon && totalCents === 0) return freeBasket(request, { admin, user, body, priced, creatorId, platformOrigin, origin: { ...sent, surface: "website", site } })

  if (totalCents < MIN_CHARGE_CENTS) {
    return NextResponse.json(
      { error: coupon ? "The smallest card payment is $0.50. Remove the code or add to the cart." : "Minimum payment amount is $0.50" },
      { status: 400 },
    )
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

  /* A code with a use limit keeps a place under it while this Stripe page is
     open (lib/checkout/coupon-holds), and the page expires before the place
     does. The holder is the buyer, or this browser: coming back from Stripe
     and pressing Check out again refreshes the same place, not a second one. */
  let holder: string | null = null
  if (coupon && needsHold(coupon)) {
    const jar = await cookies()
    const kept = jar.get(HOLD_COOKIE)?.value
    holder = user ? `u:${user.id}` : kept && isHolder(kept) ? kept : newHolder()
    if (!user && holder !== kept) {
      jar.set(HOLD_COOKIE, holder, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24, path: "/" })
    }
    if (!(await holdCouponUse(admin, coupon.id, holder))) {
      return NextResponse.json({ error: "That code has been used up." }, { status: 400 })
    }
  }

  const fee = await calculatePlatformFee(totalCents, creatorId, admin)

  /* A line the code took to $0 is not a line Stripe will take; it is still
     in the basket, fulfilled from the metadata, and named on the page. */
  const freeLines = lines.filter((l) => chargeUnits(l.item).length === 0).map((l) => String(l.product.title ?? "Product"))

  try {
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      /* "I'm purchasing as a business" on Stripe's page: the company's name,
         its tax number and its billing address, which the basket's invoice
         is made out to (lib/checkout/fulfil-cart-session). The single
         product checkout asks the same on its own page. */
      tax_id_collection: { enabled: true },
      line_items: lines.flatMap((l) =>
        chargeUnits(l.item).map((part) => ({
          quantity: part.quantity,
          price_data: {
            currency: "usd",
            unit_amount: part.unitCents,
            product_data: {
              name: String(l.product.title ?? "Product"),
              ...(l.item.discountCents > 0 && coupon
                ? { description: `$${(l.item.discountCents / 100).toFixed(2)} off with ${coupon.code}` }
                : {}),
              ...(l.product.thumbnail_url ? { images: [String(l.product.thumbnail_url)] } : {}),
            },
          },
        })),
      ),
      ...(freeLines.length > 0 && coupon
        ? { custom_text: { submit: { message: `Also included, free with ${coupon.code}: ${freeLines.join(", ")}`.slice(0, 1000) } } }
        : {}),
      ...(holder ? { expires_at: Math.floor(Date.now() / 1000) + HELD_SESSION_SECONDS } : {}),
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
        ...(coupon
          ? {
              coupon_id: coupon.id,
              coupon_code: coupon.code,
              discount_cents: String(priced.discountCents),
              ...(holder ? { coupon_holder: holder } : {}),
            }
          : {}),
        ...packItems(lines.map((l) => l.item)),
      },
    }
    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.create(params)
    } catch (e) {
      /* A Stripe account that will not take tax number collection still
         sells: the page is made again without the business box. */
      if (!/tax_id_collection/i.test(String((e as Error)?.message || ""))) throw e
      console.error("[checkout/cart] tax ID collection refused, the page opens without it:", (e as { code?: string })?.code ?? "")
      delete params.tax_id_collection
      session = await stripe.checkout.sessions.create(params)
    }

    return NextResponse.json({
      url: session.url,
      /* Named so the cart can tell the buyer what it left out rather than
         silently charging for less than they asked for. */
      dropped,
    })
  } catch (error: any) {
    console.error("[checkout/cart] session creation failed:", error?.message)
    /* No page, no payment: the place goes back. */
    if (holder) await releaseCouponHold(admin, coupon?.id, holder)
    return NextResponse.json({ error: "Could not start the checkout" }, { status: 500 })
  }
}

/**
 * A basket a code took to $0: no payment, so the buyer's name and address
 * come from the cart page (asked for only now), checked and limited as the
 * single product free checkout checks them, and the lines are written here.
 */
async function freeBasket(
  request: Request,
  c: {
    admin: ReturnType<typeof createAdminClient>
    user: { id: string; email?: string | null } | null
    body: { buyer?: Record<string, unknown> | null }
    priced: Extract<Awaited<ReturnType<typeof priceCart>>, { ok: true }>
    creatorId: string
    platformOrigin: string
    origin: Parameters<typeof encodeOrigin>[0]
  },
) {
  const buyer = c.body.buyer && typeof c.body.buyer === "object" ? c.body.buyer : {}
  const firstName = clean(buyer.firstName, 60)
  const lastName = clean(buyer.lastName, 60)
  const email = (clean(buyer.email, 254) || c.user?.email || "").toLowerCase()
  if (!firstName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || buyer.agreedToTerms !== true) {
    return NextResponse.json({ error: "Enter your name and email, and agree to the Terms, to get your free order.", needsDetails: true }, { status: 400 })
  }

  /* Each free basket emails the address it is given, as a free product does. */
  const limited = await rateLimit({
    bucket: "claim",
    subjects: [addressSubject(request), emailSubject(email)],
    windows: LIMITS.claim,
    message: "That is a lot of orders from one place. Try again in a few minutes.",
  })
  if (limited) return limited

  const coupon = c.priced.coupon!
  const holder = needsHold(coupon) ? holderForEmail(email) : null
  if (holder && !(await holdCouponUse(c.admin, coupon.id, holder))) {
    return NextResponse.json({ error: "That code has been used up." }, { status: 400 })
  }

  const written = await fulfilFreeCart(c.admin, {
    creatorId: c.creatorId,
    items: c.priced.lines.map((l) => l.item),
    buyerId: c.user?.id ?? null,
    buyerEmail: email,
    buyerFirstName: firstName,
    buyerLastName: lastName || null,
    origin: c.origin,
    couponId: coupon.id,
    couponHolder: holder,
    baseUrl: c.platformOrigin,
    request,
  })
  if (written.ok === false) {
    if (holder) await releaseCouponHold(c.admin, coupon.id, holder)
    return NextResponse.json({ error: "The order could not be saved. Try again in a moment." }, { status: 500 })
  }

  /* The same cookie a paid basket sets, so a guest reaches the downloads again from this browser. */
  const mainDomain = getMainDomain()
  const isLocalhost = mainDomain.includes("localhost")
  const cookieStore = await cookies()
  cookieStore.set("materia_session", written.sessionFingerprint, {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    domain: isLocalhost ? undefined : `.${mainDomain}`,
  })

  return NextResponse.json({
    url: `${c.platformOrigin}/receipt/${encodeURIComponent(written.receiptToken)}`,
    free: true,
    dropped: c.priced.dropped,
  })
}
