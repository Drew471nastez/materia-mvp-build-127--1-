import { NextResponse, after } from "next/server"
import type Stripe from "stripe"
import { recordCheckoutStart } from "@/lib/automations/abandoned"
import { contactSourceOfOrder } from "@/lib/contacts/contact-source"
import { recordCheckoutContactAndWelcome } from "@/lib/contacts/checkout-welcome"
import { stripe } from "@/lib/stripe"
import { getValidatedPlatformStatementDescriptor } from "@/lib/payments/platform-descriptor"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { nanoid } from "nanoid"
import { cookies } from "next/headers"
import { generateReceiptToken } from "@/lib/security"
import { collectOrderDeviceInfo } from "@/lib/device-info"
import { calculatePlatformFee } from "@/lib/billing/fee-calculator"
import { ORIGIN_METADATA_KEY, SOURCE_METADATA_KEY, channelOf, encodeOrigin, orderSourceFromRequest, originOf } from "@/lib/orders/order-source"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { MIN_CHARGE_CENTS, priceOrder } from "@/lib/checkout/pricing"
import { businessToMetadata, checkBusiness } from "@/lib/checkout/business"
import { holdCouponUse, holderForEmail, needsHold, releaseCouponHold } from "@/lib/checkout/coupon-holds"
import { methodsFrom } from "@/lib/checkout/payment-methods"
import { attributionForCheckout, attributionToMetadata, recordCheckoutStartAttribution, recordContactAttribution } from "@/lib/attribution/server"
import { randomUUID } from "node:crypto"
import { checkoutReadyForCreator } from "@/lib/payments/service"

/**
 * POST /api/checkout/stripe-session
 *
 * Makes the PaymentIntent for one product, when the buyer presses Pay (the
 * page draws Stripe's form beforehand, from the amount alone).
 *
 * Body: { productId, variantId?, customPriceCents?, tipCents?, couponCode?,
 *         firstName, lastName, email, emailOptIn?, agreedToTerms,
 *         business?, origin? }
 * Answers { clientSecret, paymentIntentId, amountCents }.
 *
 * The amount is the server's (lib/checkout/pricing.ts): the product or
 * variant from the database, a pay-what-you-want amount at or above its
 * minimum, a whole-cent tip from $0 to $1,000, and a code checked here. The
 * page's own figures are never read. Everything the order will need is put
 * on the PaymentIntent, because the order is made from it
 * (lib/checkout/fulfil-payment.ts), by this buyer's browser or by Stripe's
 * webhook, whichever comes first.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Something was missing. Refresh the page and try again." }, { status: 400 })
  }

  const firstName = clean(body.firstName, 60)
  const lastName = clean(body.lastName, 60)
  const email = clean(body.email, 254).toLowerCase()
  /* A last name is not required: a wallet can bring a single name, and some people have one. */
  if (!firstName) return NextResponse.json({ error: "Enter your name." }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  if (body.agreedToTerms !== true) return NextResponse.json({ error: "Agree to the Terms and Conditions to continue." }, { status: 400 })

  /* A declined card is retried two or three times; a list of stolen cards
     is retried hundreds. This is what makes the second one pointless. */
  const limited = await rateLimit({
    bucket: "payment",
    subjects: [addressSubject(request), emailSubject(email)],
    windows: LIMITS.payment,
    message: "Too many payment attempts just now. Wait a few minutes and try again.",
  })
  if (limited) return limited

  let business: ReturnType<typeof checkBusiness> | null = null
  if (body.business !== undefined && body.business !== null) {
    business = checkBusiness(body.business)
    if (business.ok === false) return NextResponse.json({ error: business.error, field: business.field }, { status: 400 })
  }

  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const priced = await priceOrder(
    admin,
    {
      productId: body.productId,
      variantId: body.variantId,
      customPriceCents: body.customPriceCents,
      tipCents: body.tipCents,
      couponCode: body.couponCode,
    },
    "*, creator:creators(id, user_id, display_name, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled, statement_descriptor)",
  )
  if (priced.ok === false) return NextResponse.json({ error: priced.error }, { status: priced.status })

  const { product, variant, totals, coupon } = priced
  const creator = product.creator as {
    id: string
    user_id: string
    display_name: string | null
    stripe_account_id: string | null
    stripe_onboarding_status: string | null
    charges_enabled: boolean | null
    payouts_enabled: boolean | null
    statement_descriptor: string | null
  } | null
  if (!creator) return NextResponse.json({ error: "This product is not available." }, { status: 404 })

  if (totals.totalCents <= 0) {
    return NextResponse.json({ error: "This order is free. Refresh the page to take it without paying." }, { status: 400 })
  }
  if (totals.totalCents < MIN_CHARGE_CENTS) {
    return NextResponse.json({ error: "The smallest card payment is $0.50. Add a tip or remove the code." }, { status: 400 })
  }

  /*
    WHO TAKES THE MONEY. A creator on Storelib Payments' Airwallex rollout is
    paid through Airwallex (lib/payments), and only once Airwallex says their
    account is ACTIVE and they have a payout account; everyone else through
    Stripe, exactly as before.
  */
  const account = creator.stripe_account_id
  if (!account || !account.startsWith("acct_")) {
    return NextResponse.json({ error: "This seller cannot take payments yet." }, { status: 400 })
  }
  if (!(await checkoutReadyForCreator(creator.id))) {
    return NextResponse.json({ error: "This seller cannot take payments yet. Try again later." }, { status: 400 })
  }

  /* Owning this exact thing already: the same variant, or the product without one. */
  if (user) {
    let owned = admin.from("entitlements").select("id").eq("buyer_id", user.id).eq("product_id", product.id)
    owned = variant ? owned.eq("variant_id", variant.id) : owned.is("variant_id", null)
    const { data } = await owned.limit(1)
    if (data && data.length > 0) return NextResponse.json({ error: "You already own this. It is in your library." }, { status: 400 })
  }

  /* A code with a use limit takes a place under it before a PaymentIntent
     exists, in one statement in the database, so two buyers pressing Pay on
     the last use cannot both pass (lib/checkout/coupon-holds). The place is
     this buyer's address: a second press after a declined card refreshes it. */
  const holder = needsHold(coupon) ? holderForEmail(email) : null
  if (coupon && holder && !(await holdCouponUse(admin, coupon.id, holder))) {
    return NextResponse.json({ error: "That code has been used up." }, { status: 400 })
  }

  const { data: creatorProfile } = await admin.from("profiles").select("display_name").eq("id", creator.user_id).maybeSingle()

  const accessToken = nanoid(32)
  const sessionFingerprint = nanoid(32)
  const receiptToken = generateReceiptToken()
  const { deviceInfo, geoInfo } = collectOrderDeviceInfo(request)

  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
  const isLocalhost = mainDomain.includes("localhost")
  const cookieStore = await cookies()
  cookieStore.set("materia_session", sessionFingerprint, {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    domain: isLocalhost ? undefined : `.${mainDomain}`,
  })

  const fee = await calculatePlatformFee(totals.totalCents, creator.id, admin)

  /* Where the checkout began: the page's account, every field checked, or
     what its address says. Words and hosts only (lib/orders/order-source). */
  const origin = originOf(body.origin, request)
  const channel = channelOf(origin, orderSourceFromRequest(request))
  /* Where the buyer came from, first and last touch, and the property the
     purchase came through, checked for this creator (lib/attribution).
     Read for nothing but that record: never the price or the product. */
  const attribution = await attributionForCheckout(admin, { creatorId: creator.id, source: channel, origin, sent: body.origin })

  /* Built once. The retry below used to rebuild it by hand and left out the
     email opt-in, and a buyer who said no was then subscribed. */
  const metadata: Record<string, string> = {
    [SOURCE_METADATA_KEY]: channel,
    [ORIGIN_METADATA_KEY]: encodeOrigin(origin),
    product_id: product.id,
    product_slug: String(product.slug || "").slice(0, 200),
    product_title: String(product.title || "").slice(0, 480),
    product_type: String(product.type || ""),
    creator_id: creator.id,
    creator_name: String(creatorProfile?.display_name || creator.display_name || "Creator").slice(0, 200),
    buyer_id: user?.id || "",
    buyer_first_name: firstName,
    buyer_last_name: lastName,
    buyer_email: email,
    base_price_cents: String(totals.baseCents),
    discount_cents: String(totals.discountCents),
    coupon_id: coupon?.id || "",
    coupon_code: coupon?.code || "",
    /* Whose place under the code's limit the order turns into its use. */
    ...(holder ? { coupon_holder: holder } : {}),
    tip_cents: String(totals.tipCents),
    access_token: user ? "" : accessToken,
    session_fingerprint: sessionFingerprint,
    receipt_token: receiptToken,
    platform_fee_cents: String(fee.platformFeeCents),
    fee_percent: String(fee.feePercent),
    fee_fixed_cents: String(fee.feeFixedCents),
    plan_used: fee.planId,
    variant_id: variant?.id || "",
    variant_name: String(variant?.name || "").slice(0, 200),
    /* What was paid for the option: a pay-what-you-want option's stored
       price is 0 or its minimum, not the buyer's amount. */
    variant_price_cents: variant ? String(totals.baseCents) : "",
    buyer_country: geoInfo.country || "",
    buyer_country_code: geoInfo.countryCode || "",
    buyer_device_type: deviceInfo.deviceType || "",
    buyer_os: deviceInfo.os || "",
    buyer_browser: deviceInfo.browser || "",
    email_opt_in: body.emailOptIn === true ? "true" : "false",
    agreed_to_terms: "true",
    agreed_at: new Date().toISOString(),
    ...(business?.ok ? businessToMetadata(business.value) : {}),
  }
  /* Last, and only while Stripe's 50 keys allow: the payment never waits on it. */
  Object.assign(metadata, attributionToMetadata(attribution, Object.keys(metadata).length))

  const params: Stripe.PaymentIntentCreateParams = {
    amount: totals.totalCents,
    currency: "usd",
    /* The methods the page's form loaded with, by name (lib/checkout/payment-methods). */
    payment_method_types: methodsFrom(body.paymentMethods),
    metadata,
    application_fee_amount: fee.platformFeeCents,
    transfer_data: { destination: account },
  }

  /* "SELLER NAME" after the platform's own descriptor on the statement.
     Only the suffix: a full `statement_descriptor` is refused for cards. */
  try {
    getValidatedPlatformStatementDescriptor()
    const suffix = (creator.statement_descriptor || creator.display_name || "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 22)
    if (suffix.length >= 2) params.statement_descriptor_suffix = suffix
  } catch {
    /* no platform descriptor configured: Stripe's account default is used */
  }

  try {
    let intent: Stripe.PaymentIntent
    try {
      intent = await stripe.paymentIntents.create(params)
    } catch (e) {
      if (!params.statement_descriptor_suffix || !String((e as Error)?.message || "").toLowerCase().includes("statement_descriptor")) throw e
      delete params.statement_descriptor_suffix
      intent = await stripe.paymentIntents.create(params)
    }
    /* The checkout reached Pay: written down after the answer goes back, so
       the button is not slower for it. The start is what a checkout
       reminder is made from (lib/automations/abandoned), and a ticked box
       is a yes whether or not the payment then goes through
       (lib/contacts/checkout-contact). That yes is joining the list, so it
       starts the creator's welcome here, once; the payment's own record of
       the same tick then finds them subscribed and starts nothing
       (lib/contacts/checkout-welcome). */
    const started = intent.id
    const optedIn = body.emailOptIn === true
    const source = contactSourceOfOrder(origin, product.id)
    after(async () => {
      await recordCheckoutStart(admin, {
        creatorId: creator.id,
        productId: product.id,
        variantId: variant?.id ?? null,
        productTitle: String(product.title || ""),
        email,
        firstName,
        paymentIntentId: started,
        optedIn,
        source,
      })
      await recordCheckoutStartAttribution(admin, started, attribution)
      if (optedIn) {
        await recordCheckoutContactAndWelcome(admin, { creatorId: creator.id, email, name: `${firstName} ${lastName}`.trim(), basis: "ticked", bought: false, source })
        await recordContactAttribution(admin, creator.id, email, attribution)
      }
    })
    return NextResponse.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, amountCents: intent.amount })
  } catch (error) {
    console.error("[stripe-session] PaymentIntent failed:", error instanceof Error ? error.message : error)
    /* Nothing to pay, so no place kept under the code's limit. */
    if (holder) await releaseCouponHold(admin, coupon?.id, holder)
    return NextResponse.json({ error: "The payment could not be started. Nothing was charged. Try again." }, { status: 500 })
  }
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max) : ""
}
