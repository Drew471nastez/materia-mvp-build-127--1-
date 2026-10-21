import { NextResponse, after } from "next/server"
import { sellerStatementName } from "@/lib/payments/statement-name-server"
import { formatStoreMoney } from "@/lib/store/currency"
import { minimumChargeMinor } from "@/lib/store/selling-currency"
import { readStoreCurrency } from "@/lib/store/selling-currency-server"
import type Stripe from "stripe"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { getMainDomain } from "@/lib/url-helpers"
import { allOwned, digitalCartTax, priceSiteCart, siteQuote } from "@/lib/checkout/site-quote-server"
import { packItems } from "@/lib/checkout/cart-items"
import { methodsFrom } from "@/lib/checkout/payment-methods"
import { businessToMetadata, checkBusiness } from "@/lib/checkout/business"
import { METADATA_TOO_LARGE_MESSAGE, fitStripeMetadata } from "@/lib/checkout/stripe-metadata"
import { holdCouponUse, holderForEmail, needsHold, releaseCouponHold } from "@/lib/checkout/coupon-holds"
import { CLAIM_HOLD_SECONDS, SALE_HOLDER_KEY, holdBasket, releaseSales, saleHolderForEmail } from "@/lib/checkout/sales-limit"
import { soldOutMessage } from "@/lib/products/sales-limit"
import { fulfilCartPayment, fulfilFreeCart } from "@/lib/checkout/fulfil-cart-session"
import { basketTitle, fieldPlan, missingField, siteGate, siteThanksHref } from "@/lib/checkout/site-checkout"
import { siteBuyerOfRequest, siteOfRequest, type SiteOfCheckout } from "@/lib/checkout/site-checkout-server"
import { isPickupOptionId } from "@/lib/physical/pickup"
import { detectedCountry, loadCheckoutConfig } from "@/lib/store/settings-server"
import type { CheckoutConfig } from "@/lib/store/checkout-config"
import { checkoutReadyForCreator } from "@/lib/payments/service"
import { BUYER_UNAVAILABLE } from "@/lib/payments/stripe/readiness"
import { accountIsGone, releaseConnectedAccount } from "@/lib/payments/stripe/connect"
import { statementParams } from "@/lib/payments/platform-descriptor"
import { UnsupportedFeeCurrencyError } from "@/lib/billing/fee-calculator"
import { calculatePlatformFeeForCheckout } from "@/lib/billing/platform-fee-server"
import { ORIGIN_METADATA_KEY, SOURCE_METADATA_KEY, cleanHost, cleanOrigin, encodeOrigin, type OrderOrigin } from "@/lib/orders/order-source"
import { attributionForCheckout, attributionToMetadata, recordCheckoutStartAttribution, recordContactAttribution } from "@/lib/attribution/server"
import { recordCheckoutStart } from "@/lib/automations/abandoned"
import { recordCheckoutContactAndWelcome } from "@/lib/contacts/checkout-welcome"
import { contactSourceOfOrder } from "@/lib/contacts/contact-source"
import { collectOrderDeviceInfo } from "@/lib/device-info"
import { timed } from "@/lib/perf/server-timing"
import { checkoutMarket, countryOfRequest } from "@/lib/markets/checkout-market-server"
import { quoteInMarket } from "@/lib/checkout/site-quote-market"
import { convertOrder, lineTaxShares } from "@/lib/markets/checkout-charge"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  THE WEBSITE'S CHECKOUT, SERVED ON THE WEBSITE'S OWN ADDRESS
 * ===========================================================================
 * Every call the checkout page at https://<site host>/checkout makes
 * (app/checkout/site), on that same host. The shop is the host's
 * (lib/checkout/site-checkout-server siteOfRequest): a call that arrives on
 * any host that is not a creator's published website is refused, and a cart
 * of another shop's products is refused under this one (basketDecision's
 * seller guard). The browser sends ids and quantities; every price is the
 * database's.
 *
 *   quote     the lines, the code, the delivery options and the totals, as
 *             the server prices them, asked again whenever one changes
 *   intent    Pay: a PaymentIntent for exactly that total, for Storelib's own
 *             card form (Stripe's Payment Element, never Stripe's page)
 *   confirm   paid: the order, written once (or found written by the
 *             webhook), and the thank you page on the site
 *   free      a code took it to $0: the order, no card
 *   cod       a cart that ships, paid in cash when it arrives, when the
 *             shop takes it (lib/physical/cash-on-delivery.ts): the order,
 *             no card
 *   abandon   the buyer changed the order after Pay: the held stock and the
 *             code's place go back at once
 *   access    "Bought this before? Email me my link": the receipts of this
 *             shop's orders placed with that email, sent to it, and the
 *             same answer whatever the email (lib/checkout/access-link)
 *   forget    the cart was all the signed in customer's already: those lines
 *             leave an imported theme's cart cookie
 *   cart      a quantity changed or a line removed on the checkout: an
 *             imported theme's cart cookie follows, so the site's cart shows
 *             the same order (a built site's cart is in the browser, and the
 *             page changes it there)
 *
 * ALREADY YOURS. A customer signed in to the website proved their email with
 * a code, so what it already owns is left out of every price here (quote,
 * intent, free) and named as theirs (lib/checkout/site-quote-server, owned).
 * A guest's typed email never decides it: that would tell anyone typing an
 * address what its owner bought.
 *
 * TWO WAYS A CART IS PAID, ONE PAGE. A cart of downloads is a basket
 * PaymentIntent (metadata `cart` and `site_basket`, lib/checkout/
 * fulfil-cart-session fulfilCartPayment). A cart with something that ships
 * is a held checkout (lib/physical/checkout-server, `intent: true`), with
 * the address, the delivery and the stock. Either way the charge is a
 * destination charge to the seller's connected account with Storelib's fee,
 * exactly as the Explore checkout's (app/api/checkout/stripe-session), and
 * Settings › Checkout applies (lib/checkout/site-checkout siteGate,
 * fieldPlan): an account on the website first when the store asks, the
 * order then going to that account's address, which its sign in code
 * confirmed.
 */

type Body = Record<string, unknown>

const json = (data: unknown, status = 200, headers?: HeadersInit) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...(headers ?? {}) } })

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : ""
}

/** An imported theme's cart cookie (lib/storelib-theme/compat/site CART_COOKIE), emptied once the whole cart is an order. */
const THEME_CART_COOKIE = "sl_theme_cart"

async function handlePOST(request: Request) {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return json({ error: "Something was missing. Refresh the page and try again." }, 400)
  }
  const admin = createAdminClient()
  const site = await siteOfRequest(admin, request)
  if (!site) return json({ error: "Open the checkout from the shop's website." }, 403)

  switch (body.action) {
    case "quote":
      return quote(request, admin, site, body)
    case "intent":
      return intent(request, admin, site, body)
    case "confirm":
      return confirm(request, admin, site, body)
    case "free":
      return free(request, admin, site, body)
    case "cod":
      return cashOnDelivery(request, admin, site, body)
    /* Both act for the visitor (an email sent, a cart cookie changed): only from this website's own page. */
    case "access":
    case "forget":
    case "cart": {
      const { sameOriginWrite } = await import("@/lib/site-accounts/respond")
      if (!sameOriginWrite(request, (request.headers.get("host") || "").trim().toLowerCase())) return json({ error: "Open the checkout from the shop's website." }, 403)
      return body.action === "access" ? access(request, admin, site, body) : body.action === "cart" ? themeCart(request, site, body) : forget(request, admin, site)
    }
    case "abandon": {
      const { abandonCheckout } = await import("@/lib/physical/checkout-server")
      return json({ ok: await abandonCheckout(admin, { shopId: site.creatorId, clientKey: body.clientKey }) })
    }
    default:
      return json({ error: "Bad request." }, 400)
  }
}

/* ── Pricing ──────────────────────────────────────────────────────────── */

type Admin = ReturnType<typeof createAdminClient>

async function quote(request: Request, admin: Admin, site: SiteOfCheckout, body: Body) {
  const limited = await rateLimit({ bucket: "coupon", subjects: [addressSubject(request)], windows: [{ limit: 120, seconds: 600 }], message: "Too many requests. Wait a moment and try again." })
  if (limited) return limited
  const owner = await siteBuyerOfRequest(admin, request, site.creatorId)
  const [answer, market] = await Promise.all([siteQuote(admin, site.creatorId, body, detectedCountry(request.headers), owner ? { email: owner.email } : null), checkoutMarket(site.creatorId, countryOfRequest(request), admin)])
  if (!answer.ok) return json({ error: answer.error }, answer.status)
  /* In the market's own currency when the checkout charges it, as the pages showed the prices (lib/checkout/site-quote-market). */
  if (market.charge) answer.quote = quoteInMarket(answer.quote, market.charge)
  /* The order's titles and option names in the checkout's language, when it is one of the website's (lib/markets/checkout-quote.ts). */
  if (typeof body.lang === "string" && body.lang) {
    const [{ checkoutLanguage }, { localizeQuote }] = await Promise.all([import("@/lib/markets/checkout-language"), import("@/lib/markets/checkout-quote")])
    const language = await checkoutLanguage(site.creatorId, null, body.lang).catch(() => null)
    if (language?.map) return json(localizeQuote(answer.quote, language.map))
  }
  return json(answer.quote)
}

/* ── Already yours ────────────────────────────────────────────────────── */

/**
 * "Bought this before? Email me my link." The receipts (their downloads) of
 * this shop's orders placed with the email go to that email, on this site's
 * address. The answer never says whether there were any, and the sending
 * happens after it, so neither the words nor the time it takes tell a
 * visitor what somebody else bought (lib/checkout/access-link).
 */
async function access(request: Request, admin: Admin, site: SiteOfCheckout, body: Body) {
  const { ACCESS_SENT, accessLinkLimited, sendAccessLinks } = await import("@/lib/checkout/access-link")
  const email = clean(body.email, 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter the email you bought it with.", field: "email" }, 400)
  const limited = await accessLinkLimited(request, email)
  if (limited) return limited
  const productIds = Array.isArray(body.items) ? (body.items as { productId?: unknown }[]).map((i) => (typeof i?.productId === "string" ? i.productId : "")).filter(Boolean).slice(0, 50) : []
  after(() => sendAccessLinks(admin, { creatorId: site.creatorId, email, productIds, receiptBase: site.origin }).catch(() => undefined))
  return json({ ok: true, message: ACCESS_SENT })
}

/**
 * The cart was nothing but what the signed in customer already owns: those
 * lines leave an imported theme's cart cookie, so the cart stops offering
 * them. Decided again here from the session, never from what the page says.
 */
async function forget(request: Request, admin: Admin, site: SiteOfCheckout) {
  const owner = await siteBuyerOfRequest(admin, request, site.creatorId)
  if (!owner) return json({ ok: false }, 401)
  const { readCartCookie, writeCartCookie } = await import("@/lib/storelib-theme/compat/site")
  const { ownedLines, ownedKey } = await import("@/lib/checkout/owned")
  const cookie = (request.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${THEME_CART_COOKIE}=([^;]*)`))?.[1]
  const theme = readCartCookie(cookie)
  if (theme.cart.length === 0) return json({ ok: true, removed: 0 })
  const ids = [...new Set(theme.cart.map((e) => e.p))]
  const { data: rows } = await admin.from("products").select("id, type, creator_id").in("id", ids)
  const typeOf = new Map(((rows ?? []) as { id: string; type: string; creator_id: string }[]).filter((p) => p.creator_id === site.creatorId).map((p) => [p.id, p.type]))
  const owned = await ownedLines(admin, { provenEmail: owner.email }, theme.cart.map((e) => ({ productId: e.p, variantId: e.v, type: typeOf.get(e.p) ?? "physical" })))
  const kept = theme.cart.filter((e) => !owned.has(ownedKey(e.p, e.v)))
  if (kept.length === theme.cart.length) return json({ ok: true, removed: 0 })
  const secure = site.origin.startsWith("https:") ? "; Secure" : ""
  return NextResponse.json(
    { ok: true, removed: theme.cart.length - kept.length },
    { headers: { "Cache-Control": "no-store", "Set-Cookie": `${THEME_CART_COOKIE}=${writeCartCookie(kept, theme.note, theme.attributes)}; Path=/; Max-Age=1209600; SameSite=Lax; HttpOnly${secure}` } },
  )
}

/**
 * The checkout changed the order (- / +, Remove): an imported theme's cart
 * cookie on this host takes the same quantities, and loses the removed
 * lines. Only lines already in it are changed; nothing is added, and the
 * prices stay the server's at every step.
 */
async function themeCart(request: Request, site: SiteOfCheckout, body: Body) {
  const { readCartCookie, writeCartCookie } = await import("@/lib/storelib-theme/compat/site")
  const { themeCartAfter } = await import("@/lib/checkout/site-checkout")
  const { readItems } = await import("@/lib/physical/checkout-pricing-server")
  const cookie = (request.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${THEME_CART_COOKIE}=([^;]*)`))?.[1]
  const theme = readCartCookie(cookie)
  if (theme.cart.length === 0) return json({ ok: true, changed: false })
  const kept = themeCartAfter(theme.cart, Array.isArray(body.items) ? readItems(body.items) : [])
  const secure = site.origin.startsWith("https:") ? "; Secure" : ""
  return NextResponse.json(
    { ok: true, changed: true },
    { headers: { "Cache-Control": "no-store", "Set-Cookie": `${THEME_CART_COOKIE}=${writeCartCookie(kept, theme.note)}; Path=/; Max-Age=1209600; SameSite=Lax; HttpOnly${secure}` } },
  )
}

/* ── Who, and what they typed ─────────────────────────────────────────── */

interface Contact {
  email: string
  first: string
  last: string
  optedIn: boolean
  config: CheckoutConfig
  signedIn: boolean
  /** The signed in customer's address, proven by their sign in code: what it owns is not charged again. Null for a guest. */
  ownerEmail: string | null
}

/**
 * Settings › Checkout, the rule (the page draws the same, lib/checkout/site-checkout):
 * an account on the website first when the store asks, and then that
 * account's address; the name as the store asks for it; the news box only
 * when the store shows it.
 */
async function contactOf(request: Request, admin: Admin, site: SiteOfCheckout, body: Body, order: { ships: boolean; pickup: boolean }): Promise<Contact | NextResponse> {
  const config = await loadCheckoutConfig(admin, site.creatorId)
  const buyer = await siteBuyerOfRequest(admin, request, site.creatorId)
  const gate = siteGate(config, buyer)
  if (gate.kind === "sign-in") return json({ error: "Sign in to check out.", code: "account_required" }, 401)
  const email = (gate.lockedEmail ?? clean(body.email, 254)).toLowerCase()
  const first = clean(body.firstName, 60)
  const last = clean(body.lastName, 60)
  /*
    `ships` here is "something physical is in it". The address's own fields
    (company, apartment, and the phone for a delivery) are checked with the
    address, by the held checkout, only when an address is needed
    (lib/physical/checkout-server startCheckout, readAddress with the same
    settings): a physical product handed over in person has none to ask for.
    The phone is a physical order's, asked here whatever way it arrives.
  */
  const plan = fieldPlan(config, { ships: false, physical: order.ships })
  const address = (body.address && typeof body.address === "object" ? body.address : {}) as Record<string, unknown>
  const missing = missingField(plan, { email, first, last, phone: clean(body.phone, 40) || clean(address.phone, 40) })
  /* A wallet brings its own name and email; the card form's are checked here. */
  if (missing === "email") return json({ error: "Enter a valid email address.", field: "email" }, 400)
  if (missing === "name" || missing === "last") return json({ error: missing === "last" ? "Enter your first and last name." : "Enter your name.", field: "name" }, 400)
  /* Settings › Checkout › Customer information: a field the store makes required is required here too, not only on the page. */
  if (missing === "company") return json({ error: "Enter the company name.", field: "company" }, 400)
  if (missing === "phone") return json({ error: (clean(body.phone, 40) || clean(address.phone, 40)) ? "Check the phone number." : order.pickup ? "Enter a phone number for the pickup." : "Enter a phone number for the delivery.", field: "phone" }, 400)
  if (missing === "line2") return json({ error: "Enter the apartment, suite or unit.", field: "line2" }, 400)
  if (body.agreedToTerms !== true) return json({ error: "Agree to the Terms and Conditions to continue." }, 400)
  return { email, first, last, optedIn: config.marketingOptIn && body.emailOptIn === true, config, signedIn: !!buyer, ownerEmail: buyer?.email ?? null }
}

function originFor(site: SiteOfCheckout, body: Body): OrderOrigin {
  const sent = cleanOrigin(body.origin)
  return { ...(sent ?? {}), surface: "website", site: cleanHost(site.host.split(":")[0]) }
}

/* ── Pay ──────────────────────────────────────────────────────────────── */

async function intent(request: Request, admin: Admin, site: SiteOfCheckout, body: Body) {
  const owner = await siteBuyerOfRequest(admin, request, site.creatorId)
  const { priced, decision, couponError } = await priceSiteCart(admin, site.creatorId, body, owner ? { email: owner.email } : null)
  /* Everything in it is already the signed in customer's: nothing is charged. */
  if (allOwned(priced)) return json({ error: "You already own this. It's in your downloads.", code: "already_owned" }, 409)
  /* A code the page showed as taken and the server no longer takes is said, never charged without. */
  if (couponError) return json({ error: couponError, field: "code" }, 400)
  const ships = decision.kind === "ships"
  const pickup = ships && isPickupOptionId(body.deliveryOptionId)
  const contact = await contactOf(request, admin, site, body, { ships, pickup })
  if (contact instanceof NextResponse) return contact

  /* A declined card is retried two or three times; a list of stolen cards hundreds. */
  const limited = await rateLimit({
    bucket: "payment",
    subjects: [addressSubject(request), emailSubject(contact.email)],
    windows: LIMITS.payment,
    message: "Too many payment attempts just now. Wait a few minutes and try again.",
  })
  if (limited) return limited

  let business: ReturnType<typeof checkBusiness> | null = null
  if (contact.config.businessInvoices && body.business !== undefined && body.business !== null) {
    business = checkBusiness(body.business)
    if (business.ok === false) return json({ error: business.error, field: business.field }, 400)
  }

  const origin = originFor(site, body)
  const attribution = await attributionForCheckout(admin, { creatorId: site.creatorId, source: "website", origin, sent: body.origin })

  if (ships) return shippedIntent(request, admin, site, body, contact, origin, attribution)

  if (decision.kind === "refuse" || priced.ok === false) return json({ error: decision.kind === "refuse" ? decision.error : "This cart can't be paid for right now." }, decision.kind === "refuse" ? decision.status : 400)
  if (decision.kind === "free") return json({ error: "This order is free. Press Get it free.", free: true }, 409)
  if (decision.kind !== "pay") return json({ error: "Refresh the page and try again." }, 409)
  /*
    WHAT THE CARD IS CHARGED IN. The store's own currency (Settings › Country &
    Currency), read fresh, which every price in the basket is in; or the
    visitor's market's, the one the pages showed them, when Storelib can
    charge it (lib/markets/checkout-market-server): then every line is
    converted exactly as the quote converted it (lib/markets/checkout-charge).
  */
  const market = await checkoutMarket(site.creatorId, countryOfRequest(request), admin)
  const chargeCurrencyUpper = market.chargeCurrency
  const asLines = () => priced.lines.map((l) => ({ unitCents: l.item.priceCents, quantity: l.item.quantity, discountCents: l.item.discountCents }))
  const goodsCents = market.charge ? convertOrder(asLines(), { itemsSubtotalCents: priced.subtotalCents, discountCents: priced.discountCents, shippingCents: 0, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: priced.totalCents }, market.charge).totals.totalCents : priced.totalCents
  if (goodsCents < minimumChargeMinor(chargeCurrencyUpper)) return json({ error: `The smallest card payment is ${formatStoreMoney(minimumChargeMinor(chargeCurrencyUpper), chargeCurrencyUpper)}.` }, 400)

  const { data: creator } = await admin
    .from("creators")
    .select("id, display_name, stripe_account_id, charges_enabled, statement_descriptor")
    .eq("id", site.creatorId)
    .maybeSingle()
  const account = String((creator as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? "")
  /* Storelib's one readiness rule; the buyer is told nothing about the seller's verification. */
  if (!creator || !account.startsWith("acct_") || !(await checkoutReadyForCreator(site.creatorId))) {
    return json({ error: BUYER_UNAVAILABLE, code: "seller_unavailable" }, 409)
  }

  /* A code with a use limit takes its place before a PaymentIntent exists (lib/checkout/coupon-holds). */
  const coupon = priced.coupon
  const holder = needsHold(coupon) ? holderForEmail(contact.email) : null
  if (coupon && holder && !(await holdCouponUse(admin, coupon.id, holder))) return json({ error: "That code has been used up." }, 400)
  /* LIMIT SALES: each limited download's copies held before the PaymentIntent exists, by the buyer's address (lib/checkout/sales-limit). */
  const saleHolder = priced.lines.some((l) => priced.limited.includes(l.item.productId)) ? saleHolderForEmail(contact.email) : null
  let heldCopies: string[] = []
  if (saleHolder) {
    const copies = await holdBasket(admin, priced.lines.map((l) => ({ productId: l.item.productId, quantity: l.item.quantity, title: String(l.product.title ?? "") })), priced.limited, saleHolder)
    if (copies.ok === false) {
      if (holder) await releaseCouponHold(admin, coupon?.id, holder)
      return json({ error: soldOutMessage(copies.title), code: "sold_out" }, 409)
    }
    heldCopies = copies.held
  }

  /*
    SETTINGS › TAXES: the tax the quote showed (lib/checkout/site-quote-server
    digitalCartTax), worked out again here and charged on top unless prices
    include it. Each line's share rides in the metadata (`cart_tax`) for its
    order and the receipt. Storelib's fee stays on the price, never on the tax.
  */
  const tax = await digitalCartTax(admin, site.creatorId, priced, body, detectedCountry(request.headers))
  if (tax.taxCents > 0) tax.lineTaxCents.forEach((t, i) => (priced.lines[i].item.taxCents = t))
  let chargeCents = priced.totalCents + (tax.included ? 0 : tax.taxCents)
  let goodsCharged = priced.totalCents
  let discountCharged = priced.discountCents
  let taxCharged = tax.taxCents
  if (market.charge) {
    /* Each line as its card showed it in the market, its tax share with it: the order rows are written in the currency the card pays. */
    const converted = convertOrder(asLines(), { itemsSubtotalCents: priced.subtotalCents, discountCents: priced.discountCents, shippingCents: 0, shippingDiscountCents: 0, taxCents: tax.taxCents, taxIncluded: tax.included, totalCents: chargeCents }, market.charge)
    const shares = lineTaxShares(converted.lines, converted.totals.taxCents)
    converted.lines.forEach((l, i) => {
      priced.lines[i].item.priceCents = l.unitCents
      priced.lines[i].item.discountCents = l.discountCents
      if (tax.taxCents > 0) priced.lines[i].item.taxCents = shares[i]
    })
    chargeCents = converted.totals.totalCents
    goodsCharged = converted.totals.itemsSubtotalCents - converted.totals.discountCents
    discountCharged = converted.totals.discountCents
    taxCharged = converted.totals.taxCents
  }

  const chargeCurrency = chargeCurrencyUpper.toLowerCase()
  let fee: Awaited<ReturnType<typeof calculatePlatformFeeForCheckout>>
  try {
    fee = await calculatePlatformFeeForCheckout(goodsCharged, site.creatorId, admin, chargeCurrency)
  } catch (e) {
    if (holder) await releaseCouponHold(admin, coupon?.id, holder)
    await releaseSales(admin, heldCopies, saleHolder)
    if (e instanceof UnsupportedFeeCurrencyError) return json({ error: "This currency is not available for checkout yet." }, 400)
    throw e
  }
  const { deviceInfo, geoInfo } = collectOrderDeviceInfo(request)
  const metadata: Record<string, string> = {
    cart: "1",
    site_basket: "1",
    [SOURCE_METADATA_KEY]: "website",
    [ORIGIN_METADATA_KEY]: encodeOrigin(origin),
    creator_id: site.creatorId,
    buyer_id: "",
    buyer_email: contact.email,
    buyer_first_name: contact.first,
    buyer_last_name: contact.last,
    buyer_country: geoInfo.country || "",
    buyer_country_code: geoInfo.countryCode || "",
    buyer_device_type: deviceInfo.deviceType || "",
    buyer_os: deviceInfo.os || "",
    buyer_browser: deviceInfo.browser || "",
    /* The site's own address, for the buyer's receipt link (lib/checkout/fulfil-cart-session). Checked: it is this request's host, a website of this shop. */
    site_origin: site.origin,
    platform_fee_cents: String(fee.platformFeeCents),
    fee_percent: String(fee.feePercent),
    fee_fixed_cents: String(fee.feeFixedCents),
    plan_used: fee.planId,
    pricing_tier: fee.pricingTier ?? "standard",
    fee_rule_version: fee.feeRuleVersion ?? "",
    email_opt_in: contact.optedIn ? "true" : "false",
    agreed_to_terms: "true",
    ...(coupon ? { coupon_id: coupon.id, coupon_code: coupon.code, discount_cents: String(discountCharged), ...(holder ? { coupon_holder: holder } : {}) } : {}),
    ...(tax.taxCents > 0 ? { tax_cents: String(taxCharged), tax_rate_bps: String(tax.rateBps), tax_included: tax.included ? "true" : "false", tax_country: tax.country ?? "", tax_label: tax.label } : {}),
    ...packItems(priced.lines.map((l) => l.item)),
    ...(business?.ok ? businessToMetadata(business.value) : {}),
    ...(saleHolder ? { [SALE_HOLDER_KEY]: saleHolder } : {}),
  }
  /* Stripe's 50 keys, checked once for every key above (lib/checkout/stripe-metadata): never charged without its record. */
  const fitted = fitStripeMetadata(metadata)
  if (!fitted.ok) {
    if (holder) await releaseCouponHold(admin, coupon?.id, holder)
    await releaseSales(admin, heldCopies, saleHolder)
    return json({ error: METADATA_TOO_LARGE_MESSAGE, code: "order_too_large" }, 400)
  }
  for (const key of fitted.dropped) delete metadata[key]
  Object.assign(metadata, attributionToMetadata(attribution, Object.keys(metadata).length))

  const params: Stripe.PaymentIntentCreateParams = {
    amount: chargeCents,
    currency: chargeCurrency,
    payment_method_types: methodsFrom(body.paymentMethods),
    metadata,
    application_fee_amount: fee.platformFeeCents,
    transfer_data: { destination: account },
    ...statementParams({
      account,
      descriptor: (await sellerStatementName(admin, (creator as { id: string }).id)) || (creator as { statement_descriptor?: string | null }).statement_descriptor || (creator as { display_name?: string | null }).display_name || "",
      chargesEnabled: (creator as { charges_enabled?: boolean | null }).charges_enabled ?? null,
    }),
  }
  try {
    let pi: Stripe.PaymentIntent
    try {
      pi = await stripe.paymentIntents.create(params)
    } catch (e) {
      const said = String((e as Error)?.message || "").toLowerCase()
      if (!((params.statement_descriptor_suffix && said.includes("statement_descriptor")) || (params.on_behalf_of && said.includes("on_behalf_of")))) throw e
      delete params.statement_descriptor_suffix
      delete params.on_behalf_of
      pi = await stripe.paymentIntents.create(params)
    }
    const started = pi.id
    const first = priced.lines[0]
    after(() =>
      recordStart(admin, contact, site, {
        paymentIntentId: started,
        productId: first.item.productId,
        variantId: first.item.variantId,
        title: basketTitle(priced.lines.map((l) => String(l.product.title ?? ""))),
        items: priced.lines.map((l) => ({ productId: l.item.productId, variantId: l.item.variantId, quantity: l.item.quantity })),
        origin,
        attribution,
      }),
    )
    return json({ clientSecret: pi.client_secret, paymentIntentId: pi.id, amountCents: pi.amount })
  } catch (error) {
    console.error("[checkout/site] PaymentIntent failed:", error instanceof Error ? error.message : error)
    if (holder) await releaseCouponHold(admin, coupon?.id, holder)
    await releaseSales(admin, heldCopies, saleHolder)
    const e = error as { param?: string; message?: string } | null
    if (/destination/i.test(e?.param ?? "") || /destination|connected account/i.test(e?.message ?? "")) {
      const gone = await stripe.accounts.retrieve(account).then(() => false, (x: unknown) => accountIsGone(x))
      if (gone) {
        await releaseConnectedAccount(site.creatorId, account, "legacy_platform").catch(() => undefined)
        return json({ error: "This shop cannot take payments right now. Nothing was charged." }, 409)
      }
    }
    return json({ error: "The payment could not be started. Nothing was charged. Try again." }, 500)
  }
}

/** A cart that ships: the held checkout, paid in Storelib's form (lib/physical/checkout-server, intent). */
async function shippedIntent(request: Request, admin: Admin, site: SiteOfCheckout, body: Body, contact: Contact, origin: OrderOrigin, attribution: Awaited<ReturnType<typeof attributionForCheckout>>) {
  const { abandonCheckout, startCheckout } = await import("@/lib/physical/checkout-server")
  /* The order changed since the last Pay (the address, the delivery, the code): that checkout lets go of its stock first. */
  if (typeof body.replaces === "string" && body.replaces && body.replaces !== body.clientKey) {
    await abandonCheckout(admin, { shopId: site.creatorId, clientKey: body.replaces }).catch(() => false)
  }
  const name = `${contact.first} ${contact.last}`.trim()
  const address = body.address && typeof body.address === "object" ? { ...(body.address as Record<string, unknown>), name } : body.address
  const started = await startCheckout(admin, {
    /* The visitor's market, as the website's pages were drawn in it: its currency is what the order is charged in. */
    marketCountry: countryOfRequest(request),
    shopId: site.creatorId,
    items: body.items,
    couponCode: body.couponCode,
    email: contact.email,
    name,
    phone: body.phone,
    address,
    deliveryOptionId: body.deliveryOptionId,
    buyerNote: body.buyerNote,
    cartAttributes: body.cartAttributes,
    clientKey: body.clientKey,
    origin,
    attribution,
    buyerId: null,
    buyerSignedIn: contact.signedIn,
    ownerEmail: contact.ownerEmail,
    /* A website account is only ever made by typing back a code sent to its address. */
    buyerEmailConfirmed: contact.signedIn,
    platformOrigin: `https://${getMainDomain()}`,
    backUrl: site.origin,
    config: contact.config,
    emailOptIn: contact.optedIn,
    intent: true,
    paymentMethods: body.paymentMethods,
  })
  if (started.ok === false) return json({ error: started.error, field: started.field ?? null, stock: started.stock ?? null }, started.status)
  /* Nothing to pay after all (a code took it to 0): startCheckout has placed it as a free order. Its thank you page, so Place order is never pressed for it a second time. */
  if (started.free) {
    if (!started.receiptToken) return json({ error: "The order could not be placed. Nothing was charged. Try again." }, 500)
    const { data: co } = await admin.from("commerce_checkouts").select("session_fingerprint").eq("id", started.checkoutId).maybeSingle()
    return NextResponse.json({ free: true, thanks: siteThanksHref(started.receiptToken, { whole: body.wholeCart === true }) }, { headers: afterPaidHeaders(site, (co as { session_fingerprint?: string } | null)?.session_fingerprint ?? null, body.wholeCart === true) })
  }
  if (!started.clientSecret || !started.paymentIntentId) return json({ error: "Could not start the payment. Try again in a moment." }, 500)
  const pi = started.paymentIntentId
  after(async () => {
    const { data: co } = await admin.from("commerce_checkouts").select("lines").eq("id", started.checkoutId).maybeSingle()
    const lines = (Array.isArray(co?.lines) ? (co?.lines as unknown[]) : []) as { product_id: string; variant_id: string | null; title: string; quantity: number }[]
    if (lines.length === 0) return
    await recordStart(admin, contact, site, {
      paymentIntentId: pi,
      productId: lines[0].product_id,
      variantId: lines[0].variant_id,
      title: basketTitle(lines.map((l) => l.title)),
      items: lines.map((l) => ({ productId: l.product_id, variantId: l.variant_id, quantity: l.quantity })),
      origin,
      attribution,
    })
  })
  return json({ clientSecret: started.clientSecret, paymentIntentId: pi, amountCents: null, checkoutKey: body.clientKey })
}

/**
 * The checkout reached Pay: written down after the answer goes back. The
 * start is what a checkout reminder is made from (lib/automations/abandoned,
 * Settings › Checkout › Abandoned checkouts), with the cart's lines and the
 * site's address in `basket` (SQL part 127) so the reminder can bring the
 * buyer back to this same checkout. A ticked news box is a yes whether or
 * not the payment then goes through (lib/contacts/checkout-welcome).
 */
async function recordStart(
  admin: Admin,
  contact: Contact,
  site: SiteOfCheckout,
  s: { paymentIntentId: string; productId: string; variantId: string | null; title: string; items: { productId: string; variantId: string | null; quantity: number }[]; origin: OrderOrigin; attribution: Awaited<ReturnType<typeof attributionForCheckout>> },
) {
  const source = contactSourceOfOrder(s.origin, s.productId)
  if (contact.config.abandonedRecovery) {
    const written = await recordCheckoutStart(admin, {
      creatorId: site.creatorId,
      productId: s.productId,
      variantId: s.variantId,
      productTitle: s.title,
      email: contact.email,
      firstName: contact.first,
      paymentIntentId: s.paymentIntentId,
      optedIn: contact.optedIn,
      source,
    })
    if (written) {
      const { error } = await admin
        .from("checkout_starts")
        .update({ basket: { items: s.items.slice(0, 50), site: site.origin, checkout: "/checkout" } })
        .eq("payment_intent_id", s.paymentIntentId)
      if (error && !/42703|PGRST204/.test(String(error.code ?? ""))) console.warn("[checkout/site] basket not kept on the start:", error.code)
    }
  }
  await recordCheckoutStartAttribution(admin, s.paymentIntentId, s.attribution)
  if (contact.optedIn) {
    await recordCheckoutContactAndWelcome(admin, { creatorId: site.creatorId, email: contact.email, name: `${contact.first} ${contact.last}`.trim(), basis: "ticked", bought: false, source })
    await recordContactAttribution(admin, site.creatorId, contact.email, s.attribution)
  }
}

/* ── Paid ─────────────────────────────────────────────────────────────── */

/** The receipt's guest key on this host (the receipt and its downloads are on the site too), and the theme's cart emptied once it is an order. */
function afterPaidHeaders(site: SiteOfCheckout, fingerprint: string | null, wholeCart: boolean): Headers {
  const h = new Headers({ "Cache-Control": "no-store" })
  const secure = site.origin.startsWith("https:") ? "; Secure" : ""
  if (fingerprint) h.append("Set-Cookie", `materia_session=${encodeURIComponent(fingerprint)}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${secure}`)
  if (wholeCart) h.append("Set-Cookie", `${THEME_CART_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly${secure}`)
  return h
}

async function confirm(request: Request, admin: Admin, site: SiteOfCheckout, body: Body) {
  const paymentIntentId = typeof body.paymentIntentId === "string" ? body.paymentIntentId : ""
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret : ""
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId) || !clientSecret) return json({ error: "Missing payment." }, 400)
  /* Each call asks Stripe: counted with the other payment calls. A paid order is also written by the webhook, so a limited buyer still gets it. */
  const limited = await rateLimit({ bucket: "payment", subjects: [addressSubject(request)], windows: LIMITS.payment, message: "Too many tries just now. Your order is safe: wait a minute and refresh this page." })
  if (limited) return limited
  const platform = `https://${getMainDomain()}`
  const wholeCart = body.wholeCart === true

  const basket = await fulfilCartPayment(admin, paymentIntentId, { baseUrl: platform, request, clientSecret })
  if (basket.ok) {
    if (basket.creatorId !== site.creatorId) return json({ error: "That payment could not be found." }, 404)
    return NextResponse.json({ receiptToken: basket.receiptToken, thanks: siteThanksHref(basket.receiptToken, { whole: wholeCart }), complete: basket.complete }, { headers: afterPaidHeaders(site, basket.sessionFingerprint, wholeCart) })
  }
  if (basket.reason !== "unreadable") return json({ error: basketError(basket.reason) }, basket.status)

  const { completePhysicalIntent } = await import("@/lib/physical/checkout-server")
  const shipped = await completePhysicalIntent(admin, paymentIntentId, platform, clientSecret)
  if (shipped.ok === false) return json({ error: basketError(shipped.reason) }, shipped.status)
  const { data: co } = await admin.from("commerce_checkouts").select("creator_id").eq("id", shipped.checkoutId).maybeSingle()
  if ((co as { creator_id?: string } | null)?.creator_id !== site.creatorId) return json({ error: "That payment could not be found." }, 404)
  return NextResponse.json({ receiptToken: shipped.receiptToken, thanks: siteThanksHref(shipped.receiptToken, { whole: wholeCart }), complete: shipped.complete }, { headers: afterPaidHeaders(site, shipped.sessionFingerprint, wholeCart) })
}

function basketError(reason: string): string {
  if (reason === "unpaid") return "The payment has not completed."
  if (reason === "not_found" || reason === "unreadable") return "That payment could not be found."
  return "Your payment went through. The order is still being saved: refresh this page in a moment. You will not be charged again."
}

/* ── Cash on delivery ─────────────────────────────────────────────────── */

/**
 * The order, written now and paid in cash when it is delivered or picked up.
 * Every rule is the server's (startCheckout with cashOnDelivery, codRefusal):
 * the shop takes cash, everything in the cart ships, nothing is free.
 */
async function cashOnDelivery(request: Request, admin: Admin, site: SiteOfCheckout, body: Body) {
  const owner = await siteBuyerOfRequest(admin, request, site.creatorId)
  const { priced, decision, couponError } = await priceSiteCart(admin, site.creatorId, body, owner ? { email: owner.email } : null)
  if (allOwned(priced)) return json({ error: "You already own this. It's in your downloads.", code: "already_owned" }, 409)
  if (couponError) return json({ error: couponError, field: "code" }, 400)
  if (decision.kind !== "ships") return json({ error: "Cash on delivery is only for things that are delivered or picked up. Pay by card for the rest." }, 400)
  const pickup = isPickupOptionId(body.deliveryOptionId)
  const contact = await contactOf(request, admin, site, body, { ships: true, pickup })
  if (contact instanceof NextResponse) return contact
  /* An order nobody pays for until it arrives: held to the same pace as a card payment. */
  const limited = await rateLimit({
    bucket: "payment",
    subjects: [addressSubject(request), emailSubject(contact.email)],
    windows: LIMITS.payment,
    message: "Too many orders placed just now. Wait a few minutes and try again.",
  })
  if (limited) return limited
  const origin = originFor(site, body)
  const attribution = await attributionForCheckout(admin, { creatorId: site.creatorId, source: "website", origin, sent: body.origin })
  const wholeCart = body.wholeCart === true

  const { abandonCheckout, startCheckout } = await import("@/lib/physical/checkout-server")
  /* A card payment started for an earlier version of this order lets go of its stock first, as Pay does. */
  if (typeof body.replaces === "string" && body.replaces && body.replaces !== body.clientKey) {
    await abandonCheckout(admin, { shopId: site.creatorId, clientKey: body.replaces }).catch(() => false)
  }
  const name = `${contact.first} ${contact.last}`.trim()
  const started = await startCheckout(admin, {
    /* The visitor's market, as the website's pages were drawn in it: its currency is what the order is charged in. */
    marketCountry: countryOfRequest(request),
    shopId: site.creatorId,
    items: body.items,
    couponCode: body.couponCode,
    email: contact.email,
    name,
    phone: body.phone,
    address: body.address && typeof body.address === "object" ? { ...(body.address as Record<string, unknown>), name } : body.address,
    deliveryOptionId: body.deliveryOptionId,
    buyerNote: body.buyerNote,
    cartAttributes: body.cartAttributes,
    clientKey: body.clientKey,
    origin,
    attribution,
    buyerId: null,
    buyerSignedIn: contact.signedIn,
    ownerEmail: contact.ownerEmail,
    buyerEmailConfirmed: contact.signedIn,
    platformOrigin: `https://${getMainDomain()}`,
    backUrl: site.origin,
    config: contact.config,
    emailOptIn: contact.optedIn,
    intent: true,
    cashOnDelivery: true,
  })
  if (started.ok === false) return json({ error: started.error, field: started.field ?? null, stock: started.stock ?? null }, started.status)
  /* Nothing to pay after all (a code took it to 0): startCheckout has placed it as a free order, so its thank you page, never a second order. */
  if ((!started.cod && !started.free) || !started.receiptToken) return json({ error: "The order could not be placed. Nothing was charged. Try again." }, 500)
  const { data: co } = await admin.from("commerce_checkouts").select("session_fingerprint").eq("id", started.checkoutId).maybeSingle()
  return NextResponse.json({ receiptToken: started.receiptToken, thanks: siteThanksHref(started.receiptToken, { whole: wholeCart }) }, { headers: afterPaidHeaders(site, (co as { session_fingerprint?: string } | null)?.session_fingerprint ?? null, wholeCart) })
}

/* ── Free ─────────────────────────────────────────────────────────────── */

async function free(request: Request, admin: Admin, site: SiteOfCheckout, body: Body) {
  const owner = await siteBuyerOfRequest(admin, request, site.creatorId)
  const { priced, decision, couponError } = await priceSiteCart(admin, site.creatorId, body, owner ? { email: owner.email } : null)
  if (allOwned(priced)) return json({ error: "You already own this. It's in your downloads.", code: "already_owned" }, 409)
  if (couponError) return json({ error: couponError, field: "code" }, 400)
  const ships = decision.kind === "ships"
  const pickup = ships && isPickupOptionId(body.deliveryOptionId)
  const contact = await contactOf(request, admin, site, body, { ships, pickup })
  if (contact instanceof NextResponse) return contact
  const limited = await rateLimit({
    bucket: "claim",
    subjects: [addressSubject(request), emailSubject(contact.email)],
    windows: LIMITS.claim,
    message: "That is a lot of orders from one place. Try again in a few minutes.",
  })
  if (limited) return limited
  const origin = originFor(site, body)
  const attribution = await attributionForCheckout(admin, { creatorId: site.creatorId, source: "website", origin, sent: body.origin })
  const wholeCart = body.wholeCart === true

  if (ships) {
    const { startCheckout } = await import("@/lib/physical/checkout-server")
    const name = `${contact.first} ${contact.last}`.trim()
    const started = await startCheckout(admin, {
      /* The visitor's market, as the website's pages were drawn in it: its currency is what the order is charged in. */
      marketCountry: countryOfRequest(request),
      shopId: site.creatorId,
      items: body.items,
      couponCode: body.couponCode,
      email: contact.email,
      name,
      phone: body.phone,
      address: body.address && typeof body.address === "object" ? { ...(body.address as Record<string, unknown>), name } : body.address,
      deliveryOptionId: body.deliveryOptionId,
      buyerNote: body.buyerNote,
      cartAttributes: body.cartAttributes,
      clientKey: body.clientKey,
      origin,
      attribution,
      buyerId: null,
      buyerSignedIn: contact.signedIn,
      ownerEmail: contact.ownerEmail,
      buyerEmailConfirmed: contact.signedIn,
      platformOrigin: `https://${getMainDomain()}`,
      backUrl: site.origin,
      config: contact.config,
      emailOptIn: contact.optedIn,
      intent: true,
    })
    if (started.ok === false) return json({ error: started.error, field: started.field ?? null, stock: started.stock ?? null }, started.status)
    if (!started.free || !started.receiptToken) return json({ error: "This order isn't free any more. Refresh the page." }, 409)
    const { data: co } = await admin.from("commerce_checkouts").select("session_fingerprint").eq("id", started.checkoutId).maybeSingle()
    return NextResponse.json({ receiptToken: started.receiptToken, thanks: siteThanksHref(started.receiptToken, { whole: wholeCart }) }, { headers: afterPaidHeaders(site, (co as { session_fingerprint?: string } | null)?.session_fingerprint ?? null, wholeCart) })
  }

  /* Free by the server's own prices: a code that took it to $0, or products that are free (basketDecision). */
  if (decision.kind !== "free" || priced.ok === false || priced.totalCents !== 0) return json({ error: "This order isn't free any more. Refresh the page." }, 409)
  const coupon = priced.coupon
  const holder = coupon && needsHold(coupon) ? holderForEmail(contact.email) : null
  if (coupon && holder && !(await holdCouponUse(admin, coupon.id, holder))) return json({ error: "That code has been used up." }, 400)
  /* LIMIT SALES: a free copy is one of the limited run too, held until its order counts it (lib/checkout/sales-limit). */
  const saleHolder = priced.lines.some((l) => priced.limited.includes(l.item.productId)) ? saleHolderForEmail(contact.email) : null
  let heldCopies: string[] = []
  if (saleHolder) {
    const copies = await holdBasket(admin, priced.lines.map((l) => ({ productId: l.item.productId, quantity: l.item.quantity, title: String(l.product.title ?? "") })), priced.limited, saleHolder, CLAIM_HOLD_SECONDS)
    if (copies.ok === false) {
      if (holder && coupon) await releaseCouponHold(admin, coupon.id, holder)
      return json({ error: soldOutMessage(copies.title), code: "sold_out" }, 409)
    }
    heldCopies = copies.held
  }
  const written = await fulfilFreeCart(admin, {
    saleHolder,
    creatorId: site.creatorId,
    items: priced.lines.map((l) => l.item),
    buyerId: null,
    buyerEmail: contact.email,
    buyerFirstName: contact.first,
    buyerLastName: contact.last || null,
    origin,
    attribution,
    couponId: coupon?.id ?? null,
    couponHolder: holder,
    baseUrl: `https://${getMainDomain()}`,
    request,
    consent: contact.optedIn ? "ticked" : "none",
    currency: (await readStoreCurrency(admin, site.creatorId)).currency,
  })
  if (written.ok === false) {
    await releaseSales(admin, heldCopies, saleHolder)
    if (holder && coupon) await releaseCouponHold(admin, coupon.id, holder)
    return json({ error: "The order could not be saved. Try again in a moment." }, 500)
  }
  return NextResponse.json({ receiptToken: written.receiptToken, thanks: siteThanksHref(written.receiptToken, { whole: wholeCart }) }, { headers: afterPaidHeaders(site, written.sessionFingerprint, wholeCart) })
}

/* Timed for /admin/performance, one request in five (lib/perf/server-timing.ts). */
export const POST = timed("checkout", "/api/checkout/site", handlePOST)
