import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPubliclyVisible, publicOnly } from "@/lib/products/visibility"
import { sendLeadMagnetEmail } from "@/lib/email"
import { contactSourceFrom } from "@/lib/contacts/contact-source"
import { fromOfHost } from "@/lib/orders/order-source"
import { v4 as uuidv4 } from "uuid"
import { maskEmail } from "@/lib/privacy/mask-email"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { typedMailAllowed } from "@/lib/api/typed-mail"
import { deliverSignup, pageSignup } from "@/lib/onepage/integrations/deliver-server"
import { baseFor } from "@/lib/checkout/pricing"
import { findPageBlock, pageCreatorId, publishedBlocksOf, visibleNow } from "@/lib/onepage/page-block"
import { leadMagnetKind } from "@/lib/onepage/storelib-blocks"
import { addSubscriber, saveLead } from "@/lib/onepage/signup-server"
import { signupLooksAutomated, signupName } from "@/lib/onepage/creator-blocks"
import { withOwnerStore } from "@/lib/onepage/page-store"

export const runtime = "nodejs"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** How long a download link lasts and how many times it opens (the email says so). */
const LINK_DAYS = 30
const LINK_USES = 10

function getBaseUrl() {
  const envUrl =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  const raw = (envUrl || "").trim()
  if (!raw) return "https://storelib.com"
  const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`
  return withScheme.replace(/\/+$/, "")
}

const text = (value: unknown, max: number): string | null => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null)

/**
 * POST /api/onepage/email-capture
 *   { onepage_id, block_id, email, name?, referrer?, utm_* }
 *   -> { success, downloadLink }: the free download a lead magnet gives
 *
 * The download form of a Lead magnet block (components/onepage/storelib-blocks.tsx).
 *
 * WHAT IS HANDED OVER IS READ FROM THE PAGE, NEVER FROM THE REQUEST. This
 * route used to take the product's id from the body and give its files to
 * anybody whose product was "free" by its base price alone, so a
 * pay-what-you-want product saved at 0, or one with a paid option, was a
 * free download to anybody who sent its id with any page of the same
 * creator, and a page with no seller gave any creator's. Now the block is
 * read from the PUBLISHED page (on, in its schedule, a download magnet), its
 * product is the one it names, it must be on sale and the page creator's
 * own, and free the way Instant checkout's free claim decides it
 * (app/api/checkout/quick-free): no price, not pay what you want above
 * nothing, no paid option.
 *
 * AND THE LEAD IS KEPT BEFORE ANYTHING IS SENT. The email used to go before
 * the lead was written, so a failed write answered an error to a visitor who
 * already had the email, and every retry sent another. The lead is saved
 * first (lib/onepage/signup-server saveLead, which also keeps a page whose
 * database lacks the newer columns), the person goes on the creator's list
 * even when they were already a lead of the page (an RSVP, an earlier
 * signup), and the email is sent after the answer. A link that expired or
 * was used up is renewed rather than sent again dead.
 */
export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Something was missing. Refresh the page and try again." }, { status: 400 })
    }
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Something was missing. Refresh the page and try again." }, { status: 400 })
    /* The same spam check as every signup on the page: a bot is answered as if it worked. */
    if (signupLooksAutomated(body)) return NextResponse.json({ success: true, downloadLink: null })

    const onepageId = typeof body.onepage_id === "string" && UUID.test(body.onepage_id) ? body.onepage_id : null
    const blockId = typeof body.block_id === "string" && body.block_id.length <= 120 ? body.block_id : null
    const normalizedEmail = typeof body.email === "string" ? body.email.toLowerCase().trim() : ""
    if (!onepageId || !blockId || !normalizedEmail) return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    if (!EMAIL.test(normalizedEmail) || normalizedEmail.length > 254) return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    const name = signupName(body.name) || null

    /* Same as the other sign-up forms: counted by address and by the address being signed up. See lib/api/rate-limit.ts. */
    const limited = await rateLimit({
      bucket: "email-capture",
      subjects: [addressSubject(request), emailSubject(normalizedEmail)],
      windows: LIMITS.subscribe,
      message: "That is a lot of sign-ups at once. Try again in a minute.",
    })
    if (limited) return limited

    const db = createAdminClient()
    /* The store is the owner's, never the row's own seller_id, which the owner can write (lib/onepage/page-store). */
    const onepage = await withOwnerStore(
      db,
      (await db.from("onepages").select("id, status, owner_id, seller_id, creator_id, title, published_blocks, draft_blocks").eq("id", onepageId).eq("status", "published").maybeSingle()).data,
    )
    if (!onepage) return NextResponse.json({ error: "OnePage not found" }, { status: 404 })

    /* The block as a visitor sees it: on the published page, switched on, in its schedule, inside groups that are too. */
    const found = findPageBlock(publishedBlocksOf(onepage), blockId)
    const block = found?.block as { type?: unknown; data?: Record<string, unknown> } | undefined
    if (!found || !block || block.type !== "lead_magnet" || !visibleNow(found) || leadMagnetKind(block.data?.kind) !== "download") {
      return NextResponse.json({ error: "This form is not on the page any more." }, { status: 404 })
    }
    const creatorId = pageCreatorId(onepage)
    const productId = typeof block.data?.product_id === "string" && UUID.test(block.data.product_id) ? block.data.product_id : null

    /* The product the block names, on sale and the page creator's own. A page with no creator hands over nothing. */
    let deliverable: { id: string; title: string } | null = null
    if (productId && creatorId) {
      const { data: product } = await publicOnly(
        db
          .from("products")
          .select("id, title, price_cents, pay_what_you_want, pwyw_min_price_cents, slug, status")
          .eq("id", productId)
          .eq("creator_id", creatorId),
      ).maybeSingle()
      if (product && isPubliclyVisible(product)) {
        const base = baseFor(product as { price_cents?: number | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null }, undefined)
        const { data: paidOption } = await db.from("product_variants").select("id").eq("product_id", productId).or("price_cents.gt.0,pay_what_you_want.eq.true").limit(1)
        if (base.ok === false || base.cents > 0 || (Array.isArray(paidOption) && paidOption.length > 0)) {
          return NextResponse.json({ error: "Only free products can be used for email capture" }, { status: 400 })
        }
        deliverable = { id: String(product.id), title: String(product.title || "Your download") }
      }
    }

    /* Where the visit came from is what the page sent, as a host and the utm words. */
    const referrer = text(body.referrer, 500)
    let referrerHost: string | null = null
    try {
      referrerHost = referrer ? new URL(referrer).host : null
    } catch {
      referrerHost = null
    }
    const utm = { source: text(body.utm_source, 120), medium: text(body.utm_medium, 120), campaign: text(body.utm_campaign, 120) }
    const leadSource = contactSourceFrom({ request, surface: "onepage", form: "lead_magnet", sent: { from: fromOfHost(referrerHost) ?? undefined, utm_source: utm.source ?? undefined, utm_campaign: utm.campaign ?? undefined } })
    const country = request.headers.get("x-vercel-ip-country")

    /*
      1. The lead, before anything leaves. An address already on the page is
      not a second row, and its signup is not sent to the creator's tools a
      second time. onepage_leads has no unique key to say so
      (ONEPAGE_PRODUCTION_AUDIT.md, F6), so the page is asked first, as the
      email signup asks it (app/api/onepage/leads).
    */
    const { data: leadRows } = await db.from("onepage_leads").select("id").eq("onepage_id", onepageId).eq("email", normalizedEmail).limit(1)
    const known = Array.isArray(leadRows) && leadRows.length > 0
    const saved = known ? { ok: true as const, fresh: !known } : await saveLead(db, {
      onepageId,
      email: normalizedEmail,
      name,
      blockId,
      referrer,
      utm,
      magnetKind: "download",
      magnetLabel: deliverable ? deliverable.title.slice(0, 120) : null,
      country: { code: country, name: country },
    })
    if (saved.ok === false) return NextResponse.json({ error: "That did not go through. Try again." }, { status: 500 })

    /* 2. The download link: this address's own, renewed when it ran out. */
    let downloadToken: string | null = null
    if (deliverable) {
      const fresh = () => ({ download_token: uuidv4(), download_count: 0, expires_at: new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString() })
      const { data: existing } = await db
        .from("subscriber_digital_products")
        .select("id, download_token, expires_at, download_count, max_downloads")
        .eq("subscriber_email", normalizedEmail)
        .eq("onepage_id", onepageId)
        .eq("product_id", deliverable.id)
        .maybeSingle()
      if (existing) {
        const expired = !existing.expires_at || Date.parse(existing.expires_at) <= Date.now()
        const usedUp = Number(existing.download_count || 0) >= Number(existing.max_downloads || LINK_USES)
        if (!expired && !usedUp && existing.download_token) {
          downloadToken = existing.download_token
        } else {
          const next = fresh()
          const { error } = await db.from("subscriber_digital_products").update({ ...next, max_downloads: LINK_USES, email_error: null }).eq("id", existing.id)
          if (!error) downloadToken = next.download_token
          else console.error("[email-capture] the download link could not be renewed:", error.code ?? "unknown")
        }
      } else {
        const next = fresh()
        const { error } = await db.from("subscriber_digital_products").insert({ subscriber_email: normalizedEmail, onepage_id: onepageId, product_id: deliverable.id, max_downloads: LINK_USES, ...next })
        if (!error) downloadToken = next.download_token
        else console.error("[email-capture] the download record could not be made:", error.code ?? "unknown")
      }
    }
    const downloadLink = downloadToken ? `${getBaseUrl()}/api/onepage/download/${downloadToken}` : null

    /* 3. On the creator's list, even for somebody who was already a lead of this page (an RSVP, an earlier signup). Never throws. */
    if (creatorId) {
      await addSubscriber(db, creatorId, { email: normalizedEmail, name, onepageId, consentText: "Subscribed via OnePage email capture form", source: leadSource, sent: body.origin })
    }

    /* 4. After the answer: the email with the link, what became of it, and the creator's own tools (lib/onepage/integrations). */
    const product = deliverable
    /* Round AY: counted per recipient and per network across every store (lib/api/typed-mail.ts). Over it, the link is still on the page (the answer below); only the email is held back. */
    const mayMail = product && downloadLink ? await typedMailAllowed(request, normalizedEmail) : false
    after(async () => {
      if (product && downloadLink && mayMail) {
        let sellerName = "The Creator"
        try {
          if (creatorId) {
            const { data: creator } = await db.from("creators").select("user_id").eq("id", creatorId).maybeSingle()
            if (creator?.user_id) {
              const { data: profile } = await db.from("profiles").select("display_name, username").eq("id", creator.user_id).maybeSingle()
              sellerName = profile?.display_name || profile?.username || sellerName
            }
          }
        } catch {
          /* The email still goes, signed by "The Creator". */
        }
        const sent = await sendLeadMagnetEmail(db, {
          recipientEmail: normalizedEmail,
          productTitle: product.title,
          productFileUrl: downloadLink,
          creatorId: creatorId ?? undefined,
          onepageId,
          baseUrl: getBaseUrl(),
          customSubject: `Your download is ready - ${product.title}`,
          customHeading: "Your download is ready!",
          customBody: `Thanks for joining ${sellerName}'s list! As promised, here's your free digital download: <strong>${product.title}</strong>. This link expires in ${LINK_DAYS} days and can be used up to ${LINK_USES} times.`,
        }).catch((e: unknown) => ({ success: false, error: e instanceof Error ? e.message : "send failed" }))
        if (sent.success) console.log("[email-capture] Download email sent successfully to:", maskEmail(normalizedEmail))
        else console.error("[email-capture] Download email not sent:", sent.error)
        await db.from("subscriber_digital_products").update({ email_sent: sent.success, email_error: sent.success ? null : "Failed to send after retries" }).eq("download_token", downloadToken)
        /* The lead says what happened to its delivery; a database without these columns keeps the lead as it is. */
        await db
          .from("onepage_leads")
          .update({ delivery_status: sent.success ? "sent" : "failed", digital_product_id: product.id, digital_download_sent: sent.success, digital_download_sent_at: sent.success ? new Date().toISOString() : null })
          .eq("onepage_id", onepageId)
          .eq("email", normalizedEmail)
      }
    })
    /* The creator's own tools (lib/onepage/integrations), after the answer, once per address and page. */
    if (saved.fresh) after(() => deliverSignup(db, creatorId, pageSignup({ email: normalizedEmail, name, form: "lead_magnet", magnet: product ? "download" : null, detail: product?.title ?? null, blockId, onepageId, pageUrl: request.headers.get("referer"), eventId: typeof body.event_id === "string" ? body.event_id : null })))

    return NextResponse.json({ success: true, already: !saved.fresh, downloadLink })
  } catch (error) {
    console.error("Email capture submission error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
