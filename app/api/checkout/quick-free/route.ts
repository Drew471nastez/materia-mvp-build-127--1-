import { NextResponse } from "next/server"
import { productPriceCurrency } from "@/lib/money/product-currency"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { createAdminClient } from "@/lib/supabase/admin"
import { nanoid } from "nanoid"
import { cookies } from "next/headers"
import { generateReceiptToken } from "@/lib/security"
import { sendOrderEmails, triggerEmailFlows } from "@/lib/email"
import { raiseSaleEvents } from "@/lib/orders/sale-events"
import { contactSourceOfOrder } from "@/lib/contacts/contact-source"
import { recordCheckoutContactAndWelcome } from "@/lib/contacts/checkout-welcome"
import { channelOf, orderSourceFromRequest, originOf, tagOrderSource } from "@/lib/orders/order-source"
import { attributionForCheckout, recordContactAttribution, recordOrderAttribution } from "@/lib/attribution/server"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { baseFor } from "@/lib/checkout/pricing"
import { communityAccessAfterEntitlement } from "@/lib/communities/server/payment-hooks"
import { CLAIM_HOLD_SECONDS, holdSale, limitOf, releaseSale, saleHolderForEmail } from "@/lib/checkout/sales-limit"
import { soldOutMessage } from "@/lib/products/sales-limit"
import { timed } from "@/lib/perf/server-timing"
import { loadCheckoutConfig } from "@/lib/store/settings-server"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"
import { claimedOrder, freeClaimToken, isClaimRace, type ClaimedOrder } from "@/lib/checkout/free-claim"

export const runtime = "nodejs"

async function handlePOST(request: Request) {
  try {
    const admin = createAdminClient()
    const body = await request.json()
    const cookieStore = await cookies()

    const { product_id, first_name, last_name, email } = body


    if (!product_id || !first_name || !last_name || !email) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Valid email address is required" }, { status: 400 })
    }

    /* Each claim emails the address it is given. */
    const limited = await rateLimit({
      bucket: "claim",
      subjects: [addressSubject(request), emailSubject(email)],
      windows: LIMITS.claim,
      message: "That is a lot of requests from one place. Try again in a few minutes.",
    })
    if (limited) return limited

    const who = await routeUser({ fresh: true })
    if (who.kind === "unavailable") return authUnavailableResponse()
    const user = who.kind === "user" ? who.user : null

    /*
      THE SAME PRESS SENT AGAIN (round AW, lib/checkout/free-claim): its answer was lost after the order and its
      emails, and the page said to try again. The order that press wrote is the answer, so the buyer is not sent a
      second receipt or entered in the creator's automations twice, and no copy is counted twice. A page that sends no
      attempt id claims as before.
    */
    const claimToken = freeClaimToken(body.attempt_id, { productId: product_id, email: String(email) })
    const claimed = await claimedOrder(admin, claimToken, product_id)
    if (claimed) return claimedAnswer(admin, cookieStore, claimed)

    console.log("[quick-free] User authenticated:", user ? user.id : "guest")

    // Get product with creator info
    const { data: product, error: productError } = await admin
      .from("products")
      .select("*, creator:creators!inner(id, user_id)")
      .eq("id", product_id)
      .eq("status", "published")
      .single()

    if (productError || !product) {
      console.error("[quick-free] Product not found:", productError)
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    /* The currency this product's price is in, for the order's record (lib/money/product-currency). */
    const freeCurrency = productPriceCurrency(product, (await readStoreCurrency(admin, product.creator_id)).currency)
    /* The store's Settings › Checkout: an account first, and a confirmed one, for a free product as for a paid one (lib/store/checkout-config). */
    const creatorOf = (product as { creator?: { id?: string } | null }).creator?.id ?? null
    const checkoutRules = await loadCheckoutConfig(admin, creatorOf)
    if (checkoutRules.requireAccount && !user) return NextResponse.json({ error: "Sign in or create an account to get this.", code: "account_required" }, { status: 401 })
    if (checkoutRules.requireConfirmedEmail && !user?.email_confirmed_at) return NextResponse.json({ error: "Confirm your email address to get this.", code: "email_unconfirmed" }, { status: 403 })
    /* A product that sells a community tier: signed in, approved first when the community asks, never twice (lib/communities/server/join.ts). */
    if ((product as { community_id?: string | null }).community_id) {
      const { checkoutGate } = await import("@/lib/communities/server/join")
      const gate = await checkoutGate(product as { id: string; community_id?: string | null }, user?.id ?? null, admin)
      if (gate.refusal) return NextResponse.json({ error: gate.refusal.error, code: gate.refusal.code, url: gate.refusal.url }, { status: gate.refusal.status })
    }
    /* Free means free: not a pay-what-you-want product (its price is in
       `pwyw_min_price_cents`, with `price_cents` left at 0), and not a
       product with a paid option, whose files an order without a variant
       would have handed over whole. */
    const base = baseFor(product, undefined)
    if (base.ok === false || base.cents > 0) {
      return NextResponse.json({ error: "Quick checkout is only available for free products" }, { status: 400 })
    }
    const { data: paidOption } = await admin
      .from("product_variants")
      .select("id")
      .eq("product_id", product_id)
      .or("price_cents.gt.0,pay_what_you_want.eq.true")
      .limit(1)
    if (paidOption && paidOption.length > 0) {
      return NextResponse.json({ error: "Choose an option on the product page to get this." }, { status: 400 })
    }

    // Check if user already owns product
    if (user) {
      /*
        Any one of them: a buyer with an entitlement for each of two options
        has two rows, and .maybeSingle() answered two rows with an error and
        no data, which read as "does not own it" and wrote a second free
        order.
      */
      const { data: owned } = await admin
        .from("entitlements")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("product_id", product_id)
        .limit(1)
      const existingEntitlement = Array.isArray(owned) ? owned[0] ?? null : null

      if (existingEntitlement) {
        console.log("[quick-free] User already owns this product, fetching assets")
        // Fetch digital assets for user who already owns the product
        const { data: assets } = await admin
          .from("digital_assets")
          .select("id, file_name")
          .eq("product_id", product_id)
          .order("created_at", { ascending: true })

        // Get the most recent order with receipt token for this user/product
        const { data: existingOrder } = await admin
          .from("orders")
          .select("receipt_token")
          .eq("buyer_id", user.id)
          .eq("product_id", product_id)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        return NextResponse.json({
          success: true,
          already_owned: true,
          assets: assets || [],
          receipt_token: existingOrder?.receipt_token || null,
        })
      }
    }

    /* LIMIT SALES: a free copy is one of the limited run too, held in one locked step until its order counts it (lib/checkout/sales-limit). */
    const saleHolder = limitOf(product) !== null ? saleHolderForEmail(String(email)) : null
    if (saleHolder && !(await holdSale(admin, product.id, saleHolder, 1, CLAIM_HOLD_SECONDS))) {
      /* The copy this same press already took: its order is the answer, not "sold out". */
      const late = await claimedOrder(admin, claimToken, product_id)
      if (late) return claimedAnswer(admin, cookieStore, late)
      return NextResponse.json({ error: soldOutMessage(product.title), code: "sold_out" }, { status: 409 })
    }

    // Generate tokens
    const accessToken = nanoid(32)
    const sessionFingerprint = nanoid(32)
    /* This press's own token when the page named it (lib/checkout/free-claim), so a second send of it meets the first at the unique receipt token. */
    const receiptToken = claimToken ?? generateReceiptToken()


    // Get domain for cross-subdomain cookie support
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
    const isLocalhost = mainDomain.includes("localhost")

    // Set session cookie with cross-subdomain support
    cookieStore.set("materia_session", sessionFingerprint, {
      httpOnly: true,
      secure: !isLocalhost,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      domain: isLocalhost ? undefined : `.${mainDomain}`,
    })

    // Create order - try full insert first, fallback to minimal if it fails

    let order = null
    let orderError = null

    const fullOrderData = {
      buyer_id: user?.id || null,
      buyer_first_name: first_name.trim(),
      buyer_last_name: last_name.trim(),
      buyer_email: email.toLowerCase().trim(),
      product_id: product.id,
      amount_cents: 0,
      tip_cents: 0,
      /* The product's own currency (lib/money/product-currency), a free order included: never a default. */
      currency: freeCurrency.toLowerCase(),
      status: "completed",
      provider: "free",
      fee_cents: 0,
      access_token: user ? null : accessToken,
      session_fingerprint: sessionFingerprint,
      receipt_token: receiptToken,
    }

    const result1 = await admin.from("orders").insert(fullOrderData).select().single()
    order = result1.data
    orderError = result1.error

    /* Two sends of the same press at once: the other wrote this order a moment ago. Its order is the answer, and this send's copy goes back. */
    if (orderError && claimToken && isClaimRace(orderError)) {
      const raced = await claimedOrder(admin, claimToken, product.id)
      if (raced) {
        if (saleHolder) await releaseSale(admin, product.id, saleHolder)
        return claimedAnswer(admin, cookieStore, raced)
      }
    }

    // If full insert fails, try with minimal fields only (including required receipt_token)
    if (orderError) {
      console.log("[quick-free] Full insert failed, trying minimal fields:", orderError.message)

      const minimalOrderData: Record<string, any> = {
        product_id: product.id,
        amount_cents: 0,
        currency: freeCurrency.toLowerCase(),
        status: "completed",
        receipt_token: receiptToken,
        buyer_email: email.toLowerCase().trim(),
      }

      if (user?.id) {
        minimalOrderData.buyer_id = user.id
      }

      const result2 = await admin.from("orders").insert(minimalOrderData).select().single()
      order = result2.data
      orderError = result2.error
    }

    /* The order counts the copy now, or there is no order: either way the place goes. */
    if (saleHolder) await releaseSale(admin, product.id, saleHolder)

    if (orderError || !order) {
      console.error("[quick-free] Order creation failed:", orderError)
      return NextResponse.json(
        {
          error: "Failed to create order",
        },
        { status: 500 },
      )
    }

    console.log("[quick-free] ✅ Order created successfully:", order.id)
    /* The OnePage sends where it is and where its visit came from; a page
       that sends nothing is read from its own address (the Referer). */
    const origin = originOf(body.origin, request)
    const channel = channelOf(origin, orderSourceFromRequest(request))
    await tagOrderSource(admin, order.id, channel, origin)
    /* First and last touch and the property, checked for this creator (lib/attribution). */
    const attribution = await attributionForCheckout(admin, { creatorId: product.creator.id, source: channel, origin, sent: body.origin })
    await recordOrderAttribution(admin, order.id, attribution)

    // Upsert customer
    await admin.rpc("upsert_customer", {
      p_creator_id: product.creator.id,
      p_email: email.toLowerCase().trim(),
      p_first_name: first_name.trim(),
      p_last_name: last_name.trim(),
      p_order_amount_cents: 0,
    })

    /* The seller's contact. The download button says, before it is pressed,
       that the seller may send updates (components/onepage/public-onepage),
       which is the basis this door has always used: a new address or a
       customer joins the list. Somebody who unsubscribed is not put back on
       it by a download, which this used to do (lib/contacts/checkout-contact).
       Joining starts the welcome, as the OnePage's own sign up box does
       (lib/contacts/checkout-welcome). */
    const normalizedEmail = email.toLowerCase().trim()
    await recordCheckoutContactAndWelcome(admin, {
      creatorId: product.creator.id,
      email: normalizedEmail,
      name: `${first_name.trim()} ${last_name.trim()}`.trim(),
      orderId: order.id,
      basis: "notice",
      bought: true,
      source: contactSourceOfOrder(origin, product.id),
    })
    await recordContactAttribution(admin, product.creator.id, normalizedEmail, attribution)

    // Create entitlement for logged-in users
    if (user) {
      const { error: entitlementError } = await admin.from("entitlements").insert({
        buyer_id: user.id,
        creator_id: product.creator.id,
        product_id: product.id,
        community_access: product.includes_community || false,
      })

      if (entitlementError) {
        console.error("[quick-free] Entitlement error:", entitlementError)
      } else {
        console.log("[quick-free] ✅ Entitlement created for user:", user.id)
      }
      /* A free product that opens a community lets them in. Never throws (lib/communities/server/payment-hooks). */
      try {
        await communityAccessAfterEntitlement(admin, { userId: user.id, productId: product.id, orderId: order.id, granted: true })
      } catch (e) {
        console.error("[quick-free] community access:", e instanceof Error ? e.message : e)
      }
    }

    // Update sales count and analytics
    await admin.rpc("increment_product_sales", { p_product_id: product_id })
    await admin.from("analytics_events").insert({
      creator_id: product.creator.id,
      product_id: product.id,
      event_type: "purchase",
    })

    // Fetch digital assets
    const { data: assets } = await admin
      .from("digital_assets")
      .select("id, file_name")
      .eq("product_id", product_id)
      .order("created_at", { ascending: true })

    console.log("[quick-free] Found", assets?.length || 0, "digital assets")

    // Send emails immediately and await to ensure they're sent
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"

    console.log("[quick-free] Sending order emails...")

    const emailResults = await sendOrderEmails(admin, {
      orderId: order.id,
      buyerEmail: email.toLowerCase().trim(),
      buyerFirstName: first_name.trim(),
      buyerLastName: last_name.trim(),
      productTitle: product.title,
      receiptToken: receiptToken,
      creatorId: product.creator.id,
      amountCents: 0,
      feeCents: 0,
      baseUrl,
    })

    console.log("[quick-free] Email results:", emailResults)

    /* The notification engine's order and sale (lib/orders/sale-events.ts); a free claim is never the first sale. */
    await raiseSaleEvents(admin, {
      creatorId: product.creator.id,
      purchase: { orderId: order.id, amountCents: 0, lineCount: 1 },
      lines: [{ orderId: order.id, productId: product.id, productTitle: product.title, amountCents: 0, feeCents: 0 }],
      buyerEmail: normalizedEmail,
      correlationId: request.headers.get("x-vercel-id"),
    })

    /* The creator's purchase automations: a free product is a purchase too. */
    try {
      await triggerEmailFlows(admin, {
        triggerType: "purchase",
        creatorId: product.creator.id,
        recipientEmail: normalizedEmail,
        recipientName: first_name.trim() || undefined,
        productTitle: product.title,
        productId: product.id,
        orderId: order.id,
        source: contactSourceOfOrder(origin),
      })
    } catch (flowErr) {
      console.error("[quick-free] Email flow trigger error (non-fatal):", flowErr instanceof Error ? flowErr.message : flowErr)
    }

    console.log("[quick-free] ✅ Quick checkout complete")

    return NextResponse.json({
      success: true,
      order_id: order.id,
      receipt_token: receiptToken,
      assets: assets || [],
      email_sent: emailResults.buyerSuccess,
    })
  } catch (error) {
    console.error("[quick-free] ❌ Checkout error:", error)
    return NextResponse.json(
      {
        error: "Checkout failed",
      },
      { status: 500 },
    )
  }
}

/** The order this same press already wrote (lib/checkout/free-claim), answered as its first send was: its receipt, its files, and this browser's way back to them. */
async function claimedAnswer(admin: ReturnType<typeof createAdminClient>, cookieStore: Awaited<ReturnType<typeof cookies>>, order: ClaimedOrder) {
  if (order.session_fingerprint) {
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
    const isLocalhost = mainDomain.includes("localhost")
    cookieStore.set("materia_session", order.session_fingerprint, {
      httpOnly: true,
      secure: !isLocalhost,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      domain: isLocalhost ? undefined : `.${mainDomain}`,
    })
  }
  const { data: assets } = await admin.from("digital_assets").select("id, file_name").eq("product_id", order.product_id).order("created_at", { ascending: true })
  return NextResponse.json({ success: true, order_id: order.id, receipt_token: order.receipt_token, assets: assets || [], email_sent: true })
}

/* Timed on the server for /admin/performance (lib/perf/server-timing.ts). */
export const POST = timed("checkout", "/api/checkout/quick-free", handlePOST)
