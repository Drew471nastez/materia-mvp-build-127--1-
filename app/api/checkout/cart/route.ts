import { statementParams } from "@/lib/payments/platform-descriptor"
import { sellerStatementName } from "@/lib/payments/statement-name-server"
import { formatStoreMoney } from "@/lib/store/currency"
import { minimumChargeMinor } from "@/lib/store/selling-currency"
import { readStoreCurrency } from "@/lib/store/selling-currency-server"
import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { priceCart } from "@/lib/checkout/pricing"
import { stripe } from "@/lib/stripe"
import { accountIsGone, releaseConnectedAccount } from "@/lib/payments/stripe/connect"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { UnsupportedFeeCurrencyError } from "@/lib/billing/fee-calculator"
import { calculatePlatformFeeForCheckout } from "@/lib/billing/platform-fee-server"
import { getMainDomain } from "@/lib/url-helpers"
import { physicalCheckoutHref } from "@/lib/physical/cart-link"
import { itemsWithAnswers } from "@/lib/products/personalization"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { siteHostsFor } from "@/lib/checkout/site-hosts"
import { chargeUnits, lineTotalCents, packExtras, packItems } from "@/lib/checkout/cart-items"
import { HELD_SESSION_SECONDS, HOLD_COOKIE, holdCouponUse, holderForEmail, isHolder, needsHold, newHolder, releaseCouponHold } from "@/lib/checkout/coupon-holds"
import { fulfilFreeCart } from "@/lib/checkout/fulfil-cart-session"
import { ORIGIN_METADATA_KEY, cleanHost, cleanOrigin, encodeOrigin } from "@/lib/orders/order-source"
import { attributionForCheckout, attributionToMetadata, type Attribution } from "@/lib/attribution/server"
import { cookies } from "next/headers"
import { checkoutReadyForCreator } from "@/lib/payments/service"
import { BUYER_UNAVAILABLE } from "@/lib/payments/stripe/readiness"
import { timed } from "@/lib/perf/server-timing"
import { basketDecision } from "@/lib/checkout/basket-decision"
import { afterPaidTarget, basketCheckoutHref } from "@/lib/checkout/basket-link"
import { detectedCountry, loadCheckoutConfig, loadStoreName } from "@/lib/store/settings-server"
import { recordCheckoutStart } from "@/lib/automations/abandoned"
import { contactSourceOfOrder } from "@/lib/contacts/contact-source"
import { loadTaxForCheckout } from "@/lib/tax/server"
import { basketTax } from "@/lib/tax/rules"
import { siteCheckoutHref, siteThanksHref } from "@/lib/checkout/site-checkout"
import { servingSiteOrigin } from "@/lib/checkout/site-checkout-server"
import { CLAIM_HOLD_SECONDS, SALE_HOLDER_KEY, holdBasket, releaseSales, saleHolderForEmail } from "@/lib/checkout/sales-limit"
import { soldOutMessage } from "@/lib/products/sales-limit"

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
 * STRIPE CHECKOUT, INSIDE STORELIB'S OWN PAGE. Stripe Checkout takes several
 * line items natively and shows the buyer what they are paying for, line by
 * line. It used to be Stripe's hosted page, with none of the shop on it and
 * no way back to the site but the browser's arrow. Now it is two steps:
 *
 *   the website asks   (no `ui`: the cart page, the cart drawer, an imported
 *                      theme's checkout) everything is checked as before and
 *                      the answer is the address of Storelib's branded
 *                      basket checkout, storelib.com/checkout/cart
 *                      (lib/checkout/basket-link). No Stripe session yet.
 *   that page asks     (`ui: "embedded"`) for the session, which is made here
 *                      as it always was, with `ui_mode: "embedded"`: Stripe's
 *                      form inside the page, under the shop's logo and Back.
 *                      `ui: "hosted"` is the app's shell, where Stripe.js
 *                      cannot run (app/checkout/parts/stripe-loader).
 *
 * The session, its metadata and its fulfilment are the same in every case
 * (checkout.session.completed, lib/checkout/fulfil-cart-session). The buyer
 * comes back to the platform to be fulfilled and is sent on to the site.
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

async function handlePOST(request: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()

  let body: {
    items?: IncomingItem[]
    returnPath?: unknown
    origin?: unknown
    couponCode?: unknown
    buyer?: Record<string, unknown> | null
    /** Asked by the branded basket checkout: "embedded" makes the session for its page, "hosted" Stripe's own page (the app). */
    ui?: unknown
    /** The site page the branded checkout goes back to, checked below as this shop's own. */
    returnUrl?: unknown
    /** The whole cart is being paid for, so the site empties it after (lib/checkout/basket-link). */
    wholeCart?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const ui = body.ui === "embedded" || body.ui === "hosted" ? body.ui : null

  /* A call that makes a Stripe Checkout Session, or writes a free basket: counted with the other payment routes. */
  const limited = ui || body.buyer
    ? await rateLimit({
        bucket: "payment",
        subjects: [addressSubject(request)],
        windows: LIMITS.payment,
        message: "Too many checkouts started just now. Wait a few minutes and try again.",
      })
    : null
  if (limited) return limited

  const {
    data: { user },
  } = await supabase.auth.getUser()

  /* Every price, every line left out, and the code, from the database (lib/checkout/pricing). */
  const handOff = await isPhysicalCommerceEnabled().catch(() => false)
  const priced = await priceCart(admin, { items: body.items, couponCode: body.couponCode, buyerId: user?.id ?? null, handOff })
  if (priced.ok === false) return NextResponse.json({ error: priced.error }, { status: priced.status })
  const { lines, dropped, coupon } = priced

  /* One shop, from the data; something that ships; nothing left to buy; under $0.50 (lib/checkout/basket-decision). */
  const decision = basketDecision(priced, { currency: priced.creatorIds.length === 1 ? (await readStoreCurrency(admin, priced.creatorIds[0])).currency : undefined })
  if (decision.kind === "refuse") {
    return NextResponse.json({ error: decision.error, ...(decision.dropped ? { dropped: decision.dropped } : {}) }, { status: decision.status })
  }
  const creatorId = decision.creatorId

  const [{ data: creator }, storeName] = await Promise.all([
    admin
      .from("creators")
      .select("id, user_id, display_name, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled, statement_descriptor")
      .eq("id", creatorId)
      .single(),
    ui === "embedded" ? loadStoreName(admin, creatorId) : Promise.resolve(null),
  ])

  if (!creator) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 })
  }

  const platformOrigin = `https://${getMainDomain()}`
  /* The branded checkout is on storelib.com, so its request names the site
     page in `returnUrl`; a site's own request comes from the site (Origin).
     Either is taken only when it is one of THIS shop's own addresses. */
  let named: URL | null = null
  try {
    named = typeof body.returnUrl === "string" && body.returnUrl ? new URL(body.returnUrl) : null
  } catch {
    named = null
  }
  const namedOrigin = named ? await safeReturnOrigin(named.origin, creatorId) : null
  const siteOrigin = namedOrigin ?? (await safeReturnOrigin(request.headers.get("origin"), creatorId)) ?? platformOrigin
  const returnPath = namedOrigin && named
    ? `${named.pathname}${named.search}`
    : typeof body.returnPath === "string" && body.returnPath.startsWith("/") && !body.returnPath.startsWith("//") ? body.returnPath : "/cart"

  /*
    SOMETHING IN IT SHIPS. Whichever button sent it here (a theme's own add
    to cart, an imported Shopify theme's checkout, a cart saved before lines
    knew they ship), a shipped product needs an address and a delivery, so
    the whole cart goes on to the physical checkout, which takes digital
    lines beside it. This used to drop the shipped lines and refuse a cart
    of nothing else with "Nothing in the cart can be bought right now".
    Absolute, on storelib.com: an imported Shopify theme answers every
    address on its own site, so a relative /checkout/physical could land on
    the theme's 404. While physical commerce is off nothing is handed over
    (priceCart, handOff) and the shipped lines are dropped, as before it
    existed.
  */
  /* The shop's own PUBLISHED website serves its own checkout there (lib/checkout/site-checkout-server); a preview, an AI site or an old address keeps the platform's. */
  const siteServes = siteOrigin !== platformOrigin && !!(await servingSiteOrigin(admin, creatorId, siteOrigin))

  if (decision.kind === "ships") {
    /* With the buyer's personalization answers for each item (lib/products/personalization itemsWithAnswers): the checkout checks them again. */
    const shipped = itemsWithAnswers(decision.items, body.items)
    /* From the shop's own website: its own checkout, on its own address (app/checkout/site), which asks for the address and the delivery. */
    if (siteServes) {
      return NextResponse.json({ url: siteCheckoutHref({ origin: siteOrigin, items: shipped, back: returnPath, couponCode: typeof body.couponCode === "string" ? body.couponCode : null, wholeCart: true }), ships: true })
    }
    return NextResponse.json({ url: physicalCheckoutHref(creatorId, shipped, `${siteOrigin}${returnPath}`, platformOrigin), ships: true })
  }

  /* A basket is a website's. Which website is the one the request came
     from, checked above as this creator's; the page adds where its visit
     came from, every field checked (lib/orders/order-source). */
  const sent = cleanOrigin(body.origin)
  const site = siteOrigin !== platformOrigin ? cleanHost(new URL(siteOrigin).host) : sent?.site
  const origin = encodeOrigin({ ...sent, surface: "website", site })
  /* A basket is a website's: its touches, checked for this creator, and the
     website as the property (lib/attribution). Never read for a price. */
  const attributionNow = () => attributionForCheckout(admin, { creatorId, source: "website", origin: { ...sent, surface: "website", site }, sent: body.origin })

  const totalCents = priced.totalCents
  /*
    SETTINGS › CHECKOUT, where this route takes the order itself (a free
    basket, or a Stripe page of its own): an account first, and a confirmed
    one, as every other checkout asks (lib/store/checkout-config). The
    addresses it hands back above go to checkouts that ask on their own.
  */
  /* Company invoices (Settings › Checkout, businessInvoice): Stripe's page below asks for a tax number only where the store offers them. */
  let businessInvoice = false
  if ((coupon && totalCents === 0) || ui) {
    const config = await loadCheckoutConfig(admin, creatorId)
    if (config.requireAccount && !user) return NextResponse.json({ error: "Sign in or create an account to check out.", code: "account_required" }, { status: 401 })
    if (config.requireConfirmedEmail && !user?.email_confirmed_at) return NextResponse.json({ error: "Confirm your email address to check out.", code: "email_unconfirmed" }, { status: 403 })
    businessInvoice = config.businessInvoice
  }
  if (coupon && totalCents === 0) return freeBasket(request, { admin, user, body, priced, creatorId, platformOrigin, siteOrigin: siteServes ? siteOrigin : undefined, origin: { ...sent, surface: "website", site }, attribution: await attributionNow() })

  /* Refused by basketDecision already; said again here so nothing under it can reach Stripe. */
  /* The store's own currency (Settings › Country & Currency), read fresh: every price in the cart is in it, and the card is charged in it. */
  const storeCurrency = (await readStoreCurrency(admin, creatorId)).currency
  if (totalCents < minimumChargeMinor(storeCurrency)) return NextResponse.json({ error: `The smallest card payment is ${formatStoreMoney(minimumChargeMinor(storeCurrency), storeCurrency)}.` }, { status: 400 })

  /*
   * Storelib's one readiness rule (lib/payments/stripe/readiness). This used
   * to want charges_enabled true, which a seller in another country than the
   * platform (a transfers-only account) never has. The buyer is told nothing
   * about the seller's verification.
   */
  if (!creator.stripe_account_id || !String(creator.stripe_account_id).startsWith("acct_") || !(await checkoutReadyForCreator(creator.id as string))) {
    return NextResponse.json({ error: BUYER_UNAVAILABLE, code: "seller_unavailable" }, { status: 409 })
  }

  /*
    THE WEBSITE ASKED: the address of Storelib's branded basket checkout,
    with what was checked above carried in it (and checked again there).
    Only the lines that can be bought go on, so the page shows what the
    buyer pays for; what was left out is named here for the cart to say.
  */
  if (!ui) {
    const sentItems = Array.isArray(body.items) ? body.items : []
    const kept = new Set(lines.map((l) => `${l.item.productId}::${l.item.variantId ?? ""}`))
    const items = sentItems
      .map((i) => ({
        productId: typeof i?.productId === "string" ? i.productId : "",
        variantId: typeof i?.variantId === "string" && i.variantId ? i.variantId : null,
        quantity: Math.max(1, Math.floor(Number(i?.quantity)) || 1),
        ...(typeof (i as { customPriceCents?: unknown })?.customPriceCents === "number" ? { customPriceCents: (i as { customPriceCents: number }).customPriceCents } : {}),
      }))
      .filter((i) => kept.has(`${i.productId}::${i.variantId ?? ""}`))
    const touches = body.origin && typeof body.origin === "object" ? (body.origin as { touches?: unknown }).touches : undefined
    /* The shop's own website asked: its own checkout, on its own address (app/checkout/site, lib/checkout/site-checkout). */
    if (siteServes) {
      return NextResponse.json({
        url: siteCheckoutHref({
          origin: siteOrigin,
          items,
          back: returnPath,
          couponCode: coupon?.code ?? null,
          wholeCart: true,
          visit: { from: sent?.from, utm_source: sent?.utm_source, utm_campaign: sent?.utm_campaign, touches: typeof touches === "string" ? touches : null },
        }),
        dropped,
      })
    }
    return NextResponse.json({
      url: basketCheckoutHref({
        base: platformOrigin,
        shopId: creatorId,
        items,
        back: siteOrigin !== platformOrigin ? `${siteOrigin}${returnPath}` : null,
        couponCode: coupon?.code ?? null,
        wholeCart: true,
        origin: { site, from: sent?.from, utm_source: sent?.utm_source, utm_campaign: sent?.utm_campaign, touches: typeof touches === "string" ? touches : null },
      }),
      dropped,
    })
  }

  /*
    SETTINGS › TAXES, for a store that taxes digital products: the same tax
    the branded page showed (app/checkout/cart, lib/tax/rules basketTax), by
    the buyer's country as the request says it, each line at its product's
    own rate there or the region's, after its code. Added on top it is its
    own "Tax" line on Stripe's form; with prices including tax the total
    does not move. Each line's share rides in the metadata (`cart_tax`) for
    its order and the receipt. Storelib's fee stays on the price, never on
    the tax.
  */
  const tax = basketTax(
    await loadTaxForCheckout(admin, creatorId),
    lines.map((l) => ({ productId: l.item.productId, taxableCents: lineTotalCents(l.item) })),
    detectedCountry(request.headers),
  )
  if (tax.taxCents > 0) tax.lineTaxCents.forEach((t, i) => (lines[i].item.taxCents = t))
  const addedTaxCents = tax.included ? 0 : tax.taxCents

  /* A code with a use limit keeps a place under it while this Stripe page is
     open (lib/checkout/coupon-holds), and the page expires before the place
     does. The holder is the buyer, or this browser: coming back from Stripe
     and pressing Check out again refreshes the same place, not a second one. */
  const basketHolder = async () => {
    const jar = await cookies()
    const kept = jar.get(HOLD_COOKIE)?.value
    const made = user ? `u:${user.id}` : kept && isHolder(kept) ? kept : newHolder()
    if (!user && made !== kept) {
      jar.set(HOLD_COOKIE, made, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24, path: "/" })
    }
    return made
  }
  let holder: string | null = null
  if (coupon && needsHold(coupon)) {
    holder = await basketHolder()
    if (!(await holdCouponUse(admin, coupon.id, holder))) {
      return NextResponse.json({ error: "That code has been used up." }, { status: 400 })
    }
  }

  /*
    LIMIT SALES: each download with a sales limit holds its copies while
    this Stripe page is open, in one locked step per product, so two buyers
    paying for the last copy cannot both pass (lib/checkout/sales-limit).
    The holder is the code's: the buyer, or this browser, so Check out again
    refreshes the same copies. The page expires before the hold does.
  */
  const needCopies = lines.some((l) => priced.limited.includes(l.item.productId))
  const saleHolder = needCopies ? holder ?? (await basketHolder()) : null
  let heldCopies: string[] = []
  if (saleHolder) {
    const copies = await holdBasket(admin, lines.map((l) => ({ productId: l.item.productId, quantity: l.item.quantity, title: String(l.product.title ?? "") })), priced.limited, saleHolder)
    if (copies.ok === false) {
      if (holder) await releaseCouponHold(admin, coupon?.id, holder)
      return NextResponse.json({ error: soldOutMessage(copies.title), code: "sold_out" }, { status: 409 })
    }
    heldCopies = copies.held
  }

  const chargeCurrency = storeCurrency.toLowerCase()
  let fee: Awaited<ReturnType<typeof calculatePlatformFeeForCheckout>>
  try {
    fee = await calculatePlatformFeeForCheckout(totalCents, creatorId, admin, chargeCurrency)
  } catch (e) {
    if (e instanceof UnsupportedFeeCurrencyError) {
      return NextResponse.json({ error: "This currency is not available for checkout yet." }, { status: 400 })
    }
    throw e
  }

  /* A line the code took to $0 is not a line Stripe will take; it is still
     in the basket, fulfilled from the metadata, and named on the page. */
  const freeLines = lines.filter((l) => chargeUnits(l.item).length === 0).map((l) => String(l.product.title ?? "Product"))
  const attribution = await attributionNow()

  /* After paying: back to the website's home page, told to empty its cart
     when the whole cart was paid for (lib/checkout/basket-link). */
  const successUrl = `${platformOrigin}/api/checkout/cart/complete?session_id={CHECKOUT_SESSION_ID}${
    siteOrigin !== platformOrigin ? `&return=${encodeURIComponent(afterPaidTarget(siteOrigin, body.wholeCart === true))}` : ""
  }`

  try {
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      /* "I'm purchasing as a business" on Stripe's page: the company's name,
         its tax number and its billing address, which the basket's invoice
         is made out to (lib/checkout/fulfil-cart-session). The single
         product checkout asks the same on its own page. Only where the
         store offers company invoices (Settings › Checkout, businessInvoice). */
      ...(businessInvoice ? { tax_id_collection: { enabled: true } } : {}),
      line_items: [...lines.flatMap((l) =>
        chargeUnits(l.item).map((part) => ({
          quantity: part.quantity,
          price_data: {
            currency: chargeCurrency,
            unit_amount: part.unitCents,
            product_data: {
              name: String(l.product.title ?? "Product"),
              /* What came off the line: a code's, or a bundle's or an upsell's (lib/offers), or both, said as one amount. */
              ...(l.item.discountCents > 0
                ? { description: coupon && priced.offerCents === 0 ? `${formatStoreMoney(l.item.discountCents, storeCurrency)} off with ${coupon.code}` : `${formatStoreMoney(l.item.discountCents, storeCurrency)} off` }
                : {}),
              ...(l.product.thumbnail_url ? { images: [String(l.product.thumbnail_url)] } : {}),
            },
          },
        })),
      ),
      ...(addedTaxCents > 0
        ? [{ quantity: 1, price_data: { currency: chargeCurrency, unit_amount: addedTaxCents, product_data: { name: tax.label } } }]
        : [])],
      ...(freeLines.length > 0 && coupon
        ? { custom_text: { submit: { message: `Also included, free with ${coupon.code}: ${freeLines.join(", ")}`.slice(0, 1000) } } }
        : {}),
      ...(holder || saleHolder ? { expires_at: Math.floor(Date.now() / 1000) + HELD_SESSION_SECONDS } : {}),
      customer_email: user?.email ?? undefined,
      payment_intent_data: {
        application_fee_amount: fee.platformFeeCents,
        transfer_data: { destination: creator.stripe_account_id },
        /* The seller's name on the statement, as on the single product checkout (lib/payments/platform-descriptor). */
        ...statementParams({
          account: String(creator.stripe_account_id),
          descriptor: (await sellerStatementName(admin, creator.id)) || (creator as { statement_descriptor?: string | null }).statement_descriptor || creator.display_name || "",
          chargesEnabled: creator.charges_enabled,
        }),
      },
      /* Fulfilment happens on the platform, whichever host the shop is on:
         the session cookie, the admin client and the receipt all live there.
         Then the buyer goes back to the website's home page, which the
         completion checks again against this creator's own sites; a basket
         from anywhere else ends on the receipt, as it always did. */
      /* Inside Storelib's page, Stripe sends the whole page on to return_url
         once paid, and Back is the page's own (app/checkout/cart). Stripe's
         hosted page, in the app's shell, keeps its own back link. */
      ...(ui === "embedded"
        ? {
            ui_mode: "embedded" as const,
            return_url: successUrl,
            /* The shop's name over Stripe's form, in Storelib's type and button colour, not the platform's name. */
            branding_settings: {
              display_name: (storeName || creator.display_name || "Checkout").slice(0, 100),
              font_family: "inter" as const,
              border_style: "rounded" as const,
              button_color: "#1a1a2e",
            },
          }
        : { success_url: successUrl, cancel_url: `${siteOrigin}${returnPath}` }),
      metadata: {
        cart: "1",
        creator_id: creatorId,
        buyer_id: user?.id ?? "",
        platform_fee_cents: String(fee.platformFeeCents),
        fee_percent: String(fee.feePercent),
        fee_fixed_cents: String(fee.feeFixedCents),
        plan_used: fee.planId,
        pricing_tier: fee.pricingTier ?? "standard",
        fee_rule_version: fee.feeRuleVersion ?? "",
        ...(origin ? { [ORIGIN_METADATA_KEY]: origin } : {}),
        ...(coupon
          ? {
              coupon_id: coupon.id,
              coupon_code: coupon.code,
              /* The code's part alone: the offers' part is in each line's own discount (packItems). */
              discount_cents: String(priced.discountCents - priced.offerCents),
              ...(holder ? { coupon_holder: holder } : {}),
            }
          : {}),
        ...(tax.taxCents > 0
          ? { tax_cents: String(tax.taxCents), tax_rate_bps: String(tax.rateBps), tax_included: tax.included ? "true" : "false", tax_country: tax.country ?? "", tax_label: tax.label }
          : {}),
        ...packItems(lines.map((l) => l.item)),
        /* Whose copies under the products' sales limits the orders take (lib/checkout/sales-limit). */
        ...(saleHolder ? { [SALE_HOLDER_KEY]: saleHolder } : {}),
      },
    }
    /* Which offer saved what on each line, and each line's properties, in the room left (lib/checkout/cart-items packExtras): the order lines keep them. */
    Object.assign(params.metadata!, packExtras(lines.map((l) => l.item), 50 - Object.keys(params.metadata!).length))
    /* Last, and only while Stripe's 50 keys allow. */
    Object.assign(params.metadata!, attributionToMetadata(attribution, Object.keys(params.metadata!).length))
    let session: Stripe.Checkout.Session | null = null
    /* Each refusal below takes away the one part Stripe named and asks again, at most once per part. */
    for (let attempt = 0; attempt < 4 && !session; attempt++) {
      try {
        session = await stripe.checkout.sessions.create(params)
      } catch (e) {
        const message = String((e as Error)?.message || "") + " " + String((e as { param?: string })?.param || "")
        /* The statement's part refused (lib/payments/platform-descriptor): the basket sells with Storelib's own line. */
        if (/statement_descriptor|on_behalf_of/i.test(message) && params.payment_intent_data && (params.payment_intent_data.statement_descriptor_suffix || params.payment_intent_data.on_behalf_of)) {
          delete params.payment_intent_data.statement_descriptor_suffix
          delete params.payment_intent_data.on_behalf_of
        } else if (/branding_settings/i.test(message) && params.branding_settings) {
          /* The shop's name over the form is a nicety: the form opens with the platform's. */
          delete params.branding_settings
        } else if (/tax_id_collection/i.test(message) && params.tax_id_collection) {
          /* A Stripe account that will not take tax number collection still
             sells: the page is made again without the business box. */
          console.error("[checkout/cart] tax ID collection refused, the page opens without it:", (e as { code?: string })?.code ?? "")
          delete params.tax_id_collection
        } else {
          throw e
        }
      }
    }
    if (!session) throw new Error("no session")

    /*
      Settings › Checkout › Abandoned checkouts, for a signed in buyer (Stripe's
      form asks a guest's address only once they pay, so there is none to
      remind): the basket reached Pay, one start per Stripe page, with the way
      back to this basket. Stripe's form has no news box, so nobody ticked one
      here and the sweep reminds nobody from it (only a tick asks for a
      reminder, lib/automations/abandoned); the start is kept for the record.
    */
    if (user?.email) {
      const config = await loadCheckoutConfig(admin, creatorId)
      if (config.abandonedRecovery) {
        await recordCheckoutStart(admin, {
          creatorId,
          productId: lines[0].item.productId,
          variantId: lines[0].item.variantId,
          productTitle: lines.length > 1 ? `${String(lines[0].product.title ?? "Product")} and ${lines.length - 1} more` : String(lines[0].product.title ?? "Product"),
          email: user.email,
          firstName: null,
          paymentIntentId: session.id,
          optedIn: false,
          source: contactSourceOfOrder({ ...sent, surface: "website", site }, lines[0].item.productId),
          returnPath: basketCheckoutHref({
            shopId: creatorId,
            items: lines.map((l) => ({ productId: l.item.productId, variantId: l.item.variantId, quantity: l.item.quantity })),
            back: siteOrigin !== platformOrigin ? `${siteOrigin}${returnPath}` : null,
            couponCode: coupon?.code ?? null,
            wholeCart: body.wholeCart === true,
          }),
        }).catch(() => false)
      }
    }

    return NextResponse.json({
      ...(ui === "embedded" ? { clientSecret: session.client_secret } : { url: session.url }),
      /* Named so the cart can tell the buyer what it left out rather than
         silently charging for less than they asked for. */
      dropped,
    })
  } catch (error: any) {
    console.error("[checkout/cart] session creation failed:", error?.message)
    /* No page, no payment: the place goes back. */
    if (holder) await releaseCouponHold(admin, coupon?.id, holder)
    await releaseSales(admin, heldCopies, saleHolder)
    /*
      A seller still linked to the old Stripe platform: the same narrow test
      the single product checkout uses (app/api/checkout/stripe-session).
      Only a refusal about the destination asks after the account, and only an
      account gone from this platform is let go, which closes this shop's
      checkout and shows its creator Reconnect payments. Nothing was charged.
    */
    const destination = String(creator.stripe_account_id || "")
    if (destination && (/destination/i.test(error?.param ?? "") || /destination|connected account/i.test(error?.message ?? ""))) {
      const gone = await stripe.accounts.retrieve(destination).then(() => false, (e: unknown) => accountIsGone(e))
      if (gone) {
        await releaseConnectedAccount(creator.id, destination, "legacy_platform").catch((e) =>
          console.error("[checkout/cart] release", e instanceof Error ? e.message.slice(0, 160) : "unknown"),
        )
        return NextResponse.json({ error: "This shop cannot take payments right now. Nothing was charged." }, { status: 409 })
      }
    }
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
    /** The shop's own website the cart is on, or the platform. */
    siteOrigin?: string
    origin: Parameters<typeof encodeOrigin>[0]
    attribution: Attribution
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

  /* LIMIT SALES: a free copy is one of the limited run too, held until its order counts it (lib/checkout/sales-limit). */
  const needCopies = c.priced.lines.some((l) => c.priced.limited.includes(l.item.productId))
  const saleHolder = needCopies ? saleHolderForEmail(email) : null
  let heldCopies: string[] = []
  if (saleHolder) {
    const copies = await holdBasket(c.admin, c.priced.lines.map((l) => ({ productId: l.item.productId, quantity: l.item.quantity, title: String(l.product.title ?? "") })), c.priced.limited, saleHolder, CLAIM_HOLD_SECONDS)
    if (copies.ok === false) {
      if (holder) await releaseCouponHold(c.admin, coupon.id, holder)
      return NextResponse.json({ error: soldOutMessage(copies.title), code: "sold_out" }, { status: 409 })
    }
    heldCopies = copies.held
  }

  const written = await fulfilFreeCart(c.admin, {
    saleHolder,
    creatorId: c.creatorId,
    items: c.priced.lines.map((l) => l.item),
    buyerId: c.user?.id ?? null,
    buyerEmail: email,
    buyerFirstName: firstName,
    buyerLastName: lastName || null,
    origin: c.origin,
    attribution: c.attribution,
    couponId: coupon.id,
    couponHolder: holder,
    baseUrl: c.platformOrigin,
    request,
    currency: (await readStoreCurrency(c.admin, c.creatorId)).currency,
  })
  if (written.ok === false) {
    await releaseSales(c.admin, heldCopies, saleHolder)
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
    /* From the shop's own website: the thank you page there (app/checkout/site/thanks). */
    url: c.siteOrigin && c.siteOrigin !== c.platformOrigin ? `${c.siteOrigin}${siteThanksHref(written.receiptToken, { whole: true })}` : `${c.platformOrigin}/receipt/${encodeURIComponent(written.receiptToken)}`,
    free: true,
    dropped: c.priced.dropped,
  })
}

/* Timed for /admin/performance, one request in five (lib/perf/server-timing.ts). */
export const POST = timed("checkout", "/api/checkout/cart", handlePOST)
