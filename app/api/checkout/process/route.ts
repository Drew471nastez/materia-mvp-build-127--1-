import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { nanoid } from "nanoid"
import { cookies } from "next/headers"
import { generateReceiptToken } from "@/lib/security"
import { sendOrderEmails, triggerEmailFlows } from "@/lib/email"
import { v4 as uuidv4 } from "uuid"
import { channelOf, orderSourceFromRequest, originOf, tagOrderSource } from "@/lib/orders/order-source"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { priceOrder } from "@/lib/checkout/pricing"
import { recordCouponUse } from "@/lib/checkout/coupons"

export const runtime = "nodejs"

/**
 * POST /api/checkout/process
 *
 * The free checkout: a product that costs nothing, a pay-what-you-want one
 * whose minimum is zero, or one a code takes all the way down. Priced by the
 * server exactly as a paid one is (lib/checkout/pricing.ts), and refused
 * unless that price is zero: this route used to add the tip as sent, so a
 * negative tip made a paid product free, and it read `price_cents`, which a
 * pay-what-you-want product leaves at 0 whatever its minimum.
 *
 * Body: { productId, variantId?, customPriceCents?, couponCode?, firstName,
 *         lastName, email, emailOptIn?, agreedToTerms, origin? }
 * Answers { success, receiptToken, orderId, emailSent, redirectUrl }.
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

  /* Each claim emails the address it is given; without a limit this is a
     way to send a creator's product email to anyone, as often as wanted. */
  const limited = await rateLimit({
    bucket: "claim",
    subjects: [addressSubject(request), emailSubject(email)],
    windows: LIMITS.claim,
    message: "That is a lot of orders from one place. Try again in a few minutes.",
  })
  if (limited) return limited

  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const cookieStore = await cookies()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const priced = await priceOrder(
      admin,
      {
        productId: body.productId,
        variantId: body.variantId,
        customPriceCents: body.customPriceCents,
        couponCode: body.couponCode,
      },
      "*, creator:creators!inner(id, user_id)",
    )
    if (priced.ok === false) return NextResponse.json({ error: priced.error }, { status: priced.status })
    const { product, variant, totals, coupon } = priced
    const creator = product.creator as { id: string; user_id: string | null }

    if (totals.totalCents !== 0) {
      return NextResponse.json({ error: "This order has a price. Refresh the page to pay for it." }, { status: 400 })
    }

    /* Owning it already still makes a receipt (for a re-download); only the library row is not doubled. */
    let alreadyOwned = false
    if (user) {
      let owned = admin.from("entitlements").select("id").eq("buyer_id", user.id).eq("product_id", product.id)
      owned = variant ? owned.eq("variant_id", variant.id) : owned.is("variant_id", null)
      const { data } = await owned.limit(1)
      alreadyOwned = !!data && data.length > 0
    }

    const accessToken = nanoid(32)
    const sessionFingerprint = nanoid(32)
    const receiptToken = generateReceiptToken()

    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
    const isLocalhost = mainDomain.includes("localhost")
    cookieStore.set("materia_session", sessionFingerprint, {
      httpOnly: true,
      secure: !isLocalhost,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      domain: isLocalhost ? undefined : `.${mainDomain}`,
    })

    /* The variant goes on the order. Without it an order means "the whole
       product" to the receipt and the downloads, so a free sample variant
       used to unlock every paid variant's files. */
    const variantFields = variant
      ? {
          variant_id: variant.id,
          variant_name: variant.name,
          variant_price_cents: variant.price_cents ?? null,
          variant_currency: "USD",
          variant_snapshot: { id: variant.id, name: variant.name, price_cents: variant.price_cents ?? null },
        }
      : {}

    const fullOrder: Record<string, unknown> = {
      buyer_first_name: firstName,
      buyer_last_name: lastName,
      buyer_email: email,
      product_id: product.id,
      amount_cents: 0,
      tip_cents: 0,
      currency: "usd",
      status: "completed",
      provider: "free",
      fee_cents: 0,
      session_fingerprint: sessionFingerprint,
      receipt_token: receiptToken,
      agreed_to_terms: true,
      agreed_at: new Date().toISOString(),
      ...variantFields,
      ...(user?.id ? { buyer_id: user.id } : { access_token: accessToken }),
    }

    let { data: order, error: orderError } = await admin.from("orders").insert(fullOrder).select().single()
    if (orderError) {
      console.error("[checkout/process] full insert failed:", orderError.code, orderError.message)
      /* The columns every database has, and still the variant. */
      const minimal: Record<string, unknown> = {
        product_id: product.id,
        amount_cents: 0,
        status: "completed",
        receipt_token: receiptToken,
        buyer_email: email,
        ...(variant ? { variant_id: variant.id } : {}),
        ...(user?.id ? { buyer_id: user.id } : {}),
      }
      const second = await admin.from("orders").insert(minimal).select().single()
      order = second.data
      orderError = second.error
    }
    if (orderError || !order) {
      console.error("[checkout/process] order could not be saved:", orderError?.code, orderError?.message)
      return NextResponse.json({ error: "The order could not be saved. Try again in a moment." }, { status: 500 })
    }

    console.log("[checkout/process] Order created successfully:", order.id)
    const origin = originOf(body.origin, request)
    await tagOrderSource(admin, order.id, channelOf(origin, orderSourceFromRequest(request)), origin)

    const step = async (name: string, fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch (e) {
        console.error(`[checkout/process] ${name} failed (non-fatal):`, e instanceof Error ? e.message : e)
      }
    }

    await step("customer", async () => {
      await admin.rpc("upsert_customer", {
        p_creator_id: creator.id,
        p_email: email,
        p_first_name: firstName,
        p_last_name: lastName,
        p_order_amount_cents: 0,
      })
    })

    /* Only a yes is a yes: this defaulted to subscribing. */
    if (body.emailOptIn === true) {
      await step("subscriber", async () => {
        const { data: existing } = await admin.from("subscribers").select("id, status").eq("creator_id", creator.id).eq("email", email).maybeSingle()
        const now = new Date().toISOString()
        if (!existing) {
          await admin.from("subscribers").insert({
            email,
            name: `${firstName} ${lastName}`.trim() || null,
            source: "checkout",
            source_id: order.id,
            creator_id: creator.id,
            status: "subscribed",
            is_active: true,
            subscribed_at: now,
            consent_text: "Subscribed via product checkout (opted in)",
            consent_timestamp: now,
            unsubscribe_token: uuidv4(),
          })
        } else if (existing.status === "unsubscribed") {
          await admin.from("subscribers").update({ status: "subscribed", is_active: true, subscribed_at: now, unsubscribed_at: null }).eq("id", existing.id)
        }
      })
    }

    if (user && !alreadyOwned) {
      await step("entitlement", async () => {
        await admin.from("entitlements").insert({
          buyer_id: user.id,
          creator_id: creator.id,
          product_id: product.id,
          variant_id: variant?.id || null,
          community_access: Boolean(product.includes_community),
        })
      })
    }

    if (coupon) await step("coupon use", () => recordCouponUse(admin, coupon.id))

    await step("sales count", async () => {
      await admin.rpc("increment_product_sales", { p_product_id: product.id })
      await admin.from("analytics_events").insert({ creator_id: creator.id, product_id: product.id, event_type: "purchase" })
    })

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"
    let emailSent = false
    await step("emails", async () => {
      const result = await sendOrderEmails(admin, {
        orderId: order.id,
        buyerEmail: email,
        buyerFirstName: firstName,
        buyerLastName: lastName,
        productTitle: product.title,
        receiptToken,
        creatorId: creator.id,
        amountCents: 0,
        feeCents: 0,
        baseUrl,
        variantName: variant?.name || null,
      })
      emailSent = result.buyerSuccess
    })

    if (creator.user_id) {
      await step("push", async () => {
        const { notifySale } = await import("@/lib/push/notifications")
        await notifySale(creator.user_id as string, { productName: product.title, amountCents: 0, orderId: order.id, productId: product.id })
      })
    }

    await step("email flows", () =>
      triggerEmailFlows(admin, {
        triggerType: "purchase",
        creatorId: creator.id,
        recipientEmail: email,
        recipientName: firstName,
        productTitle: product.title,
        productId: product.id,
        orderId: order.id,
      }),
    )

    return NextResponse.json({
      success: true,
      redirectUrl: `/receipt/${receiptToken}?${emailSent ? "emailSent=1" : "emailFailed=1"}`,
      orderId: order.id,
      receiptToken,
      emailSent,
    })
  } catch (error) {
    console.error("[checkout/process] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "The order could not be finished. Try again in a moment." }, { status: 500 })
  }
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max) : ""
}
