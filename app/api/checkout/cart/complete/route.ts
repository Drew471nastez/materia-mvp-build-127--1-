import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies } from "next/headers"
import { nanoid } from "nanoid"
import { generateReceiptToken } from "@/lib/security"
import { collectOrderDeviceInfo } from "@/lib/device-info"
import { getMainDomain } from "@/lib/url-helpers"
import { sendOrderEmails } from "@/lib/email"
import { unpackItems, packedTotalCents, apportionFee } from "@/lib/checkout/cart-items"
import { fulfilCartLine, recordCartCustomer, type FulfilContext } from "@/lib/checkout/fulfil-cart-item"

export const runtime = "nodejs"

/**
 * ===========================================================================
 *  A PAID BASKET BECOMES PURCHASES
 * ===========================================================================
 * Stripe sends the buyer back here. The session says what was paid, its
 * metadata says what for, and each line becomes an order and an entitlement
 * the same way a single purchase does.
 *
 * IDEMPOTENT ON THE SESSION. A buyer who refreshes this URL, or comes back
 * to it from their history, must not be given a second set of orders. One
 * read of the orders table for this session id decides that, before
 * anything is written.
 *
 * THE FEE IS SPLIT, NOT REPEATED. The platform's cut was calculated once on
 * the whole basket and taken once by Stripe. Recording it against every line
 * would say the platform took it several times over, which would be wrong in
 * the seller's earnings and in the accounts. It is apportioned by each
 * line's share of the basket, and the rounding goes on the last line so the
 * parts add up to the whole.
 *
 * PARTIAL FULFILMENT IS REPORTED, NOT SWALLOWED. The money has already been
 * taken by the time this runs, so a line that fails to write is logged and
 * the rest still go through. The buyer sees what they got.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("session_id")
  const platform = `https://${getMainDomain()}`

  if (!sessionId) return NextResponse.redirect(`${platform}/explore`)

  const admin = createAdminClient()
  const supabase = await createClient()

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent", "payment_intent.latest_charge"],
    })

    if (session.payment_status !== "paid") {
      return NextResponse.redirect(`${platform}/explore?checkout=unpaid`)
    }

    /* Already done. Straight to what was bought. */
    const { data: already } = await admin
      .from("orders")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .limit(1)

    if (already && already.length > 0) {
      return NextResponse.redirect(`${platform}/receipt/cart/${encodeURIComponent(sessionId)}`)
    }

    const metadata = (session.metadata ?? {}) as Record<string, string>
    const items = unpackItems(metadata)
    const creatorId = metadata.creator_id || ""

    if (items.length === 0 || !creatorId) {
      console.error("[checkout/cart/complete] paid session with no readable basket:", sessionId)
      return NextResponse.redirect(`${platform}/explore?checkout=unreadable`)
    }

    const basketTotal = packedTotalCents(items)
    const paidTotal = session.amount_total ?? basketTotal

    const pi = typeof session.payment_intent === "object" ? (session.payment_intent as any) : null
    const paymentIntentId = pi?.id ?? (typeof session.payment_intent === "string" ? session.payment_intent : null)
    const feeTotal = pi?.application_fee_amount ?? (Number.parseInt(metadata.platform_fee_cents || "0", 10) || 0)

    let paymentMethod = "card"
    let cardBrand: string | null = null
    let cardLast4: string | null = null
    const charge = pi?.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null
    const details = charge?.payment_method_details
    if (details?.card) {
      cardBrand = details.card.brand ?? null
      cardLast4 = details.card.last4 ?? null
    } else if (details?.type) {
      paymentMethod = details.type
    }

    /* The buyer, by id if they were signed in and by email if they were
       not — a guest whose email matches an account still gets their
       downloads in their library. */
    const buyerEmail = (metadata.buyer_email || session.customer_details?.email || "").toLowerCase().trim() || null
    let buyerId = metadata.buyer_id || null
    if (!buyerId) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      buyerId = user?.id ?? null
    }
    if (!buyerId && buyerEmail) {
      const { data: profile } = await admin.from("profiles").select("id").eq("email", buyerEmail).maybeSingle()
      if (profile) buyerId = profile.id
    }

    const name = (session.customer_details?.name ?? "").trim()
    const firstName = name ? name.split(/\s+/)[0] : null
    const lastName = name && name.includes(" ") ? name.slice(name.indexOf(" ") + 1) : null

    const sessionFingerprint = nanoid(32)
    const { deviceInfo, geoInfo } = collectOrderDeviceInfo(request)

    /* The fee, apportioned once for the whole basket rather than worked out
       again per line, so the parts provably sum to what Stripe took. */
    const fees = apportionFee(feeTotal, items.map((i) => i.priceCents * i.quantity))
    let feeIndex = 0
    const feeCentsForLine = () => fees[feeIndex++] ?? 0

    const ctx: FulfilContext = {
      admin,
      sessionId,
      paymentIntentId,
      creatorId,
      buyerId,
      buyerEmail,
      buyerFirstName: firstName,
      buyerLastName: lastName,
      feeCentsForLine,
      receiptTokenFor: () => generateReceiptToken(),
      sessionFingerprint,
      paymentMethod,
      cardBrand,
      cardLast4,
      device: {
        country: geoInfo.country || null,
        countryCode: geoInfo.countryCode || null,
        deviceType: deviceInfo.deviceType || null,
        os: deviceInfo.os || null,
        browser: deviceInfo.browser || null,
      },
    }

    const fulfilled = []
    for (const item of items) {
      const line = await fulfilCartLine(ctx, item)
      if (line) fulfilled.push(line)
    }

    if (fulfilled.length === 0) {
      console.error("[checkout/cart/complete] nothing could be fulfilled for paid session:", sessionId)
      return NextResponse.redirect(`${platform}/explore?checkout=failed`)
    }
    if (fulfilled.length < items.length) {
      console.error(
        `[checkout/cart/complete] ${fulfilled.length} of ${items.length} lines fulfilled for session ${sessionId}`,
      )
    }

    await recordCartCustomer(ctx, paidTotal, fulfilled[0]?.orderId ?? null)

    /* Device recognition, the same cookie a single purchase sets, so a guest
       can reach their downloads again from this browser. */
    const mainDomain = getMainDomain()
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

    /* One email per product, which is what the existing sender knows how to
       write and what a buyer needs: each product's email carries that
       product's download. Failures here do not undo a purchase. */
    if (buyerEmail) {
      const { data: rows } = await admin
        .from("products")
        .select("id, title")
        .in("id", fulfilled.map((f) => f.productId))
      const titles = new Map((rows ?? []).map((r: any) => [r.id, r.title]))

      for (const line of fulfilled) {
        try {
          await sendOrderEmails(admin, {
            orderId: line.orderId,
            buyerEmail,
            buyerFirstName: firstName ?? "",
            buyerLastName: lastName ?? "",
            productTitle: titles.get(line.productId) ?? "Your purchase",
            receiptToken: line.receiptToken,
            creatorId,
            amountCents: line.amountCents,
            feeCents: 0,
            baseUrl: platform,
            variantName: null,
          })
        } catch (err) {
          console.error("[checkout/cart/complete] email failed for order", line.orderId, err)
        }
      }
    }

    return NextResponse.redirect(`${platform}/receipt/cart/${encodeURIComponent(sessionId)}`)
  } catch (error) {
    console.error("[checkout/cart/complete] error:", error)
    return NextResponse.redirect(`${platform}/explore?checkout=error`)
  }
}
