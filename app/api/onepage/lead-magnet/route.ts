import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { contactSourceFrom } from "@/lib/contacts/contact-source"
import { fromOfHost } from "@/lib/orders/order-source"
import { signupLooksAutomated, signupName } from "@/lib/onepage/creator-blocks"
import { couponUsable, leadMagnetKind } from "@/lib/onepage/storelib-blocks"
import { addSubscriber, publishedBlock, saveLead } from "@/lib/onepage/signup-server"
import { deliverSignup, pageSignup } from "@/lib/onepage/integrations/deliver-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A LEAD MAGNET'S SIGNUP: A DISCOUNT CODE OR A PLACE ON A WAITLIST
 * (components/onepage/storelib-blocks.tsx). A free download goes through
 * /api/onepage/email-capture, which emails the file.
 *
 * Nothing the visitor sends says what they get. The block is read from the
 * page as it was published (onepages.published_blocks), by its id: its kind,
 * its waitlist's name, and the creator's own code it names. The code is in
 * no page and in no block, only in coupons, and is given here after the
 * address is kept, if it is still on, started, not ended and not used up.
 *
 * Same spam checks and limits as the email signup: a hidden field, the time
 * on screen, and five a minute per address and per email.
 */

const COUNTRY_NAMES: Record<string, string> = { US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia", DE: "Germany", FR: "France", ES: "Spain", IT: "Italy", NL: "Netherlands", BR: "Brazil", MX: "Mexico", IN: "India" }

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Nothing was sent." }, { status: 400 })
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Nothing was sent." }, { status: 400 })
  /* A script: told it worked, nothing written, no code given. */
  if (signupLooksAutomated(body)) return NextResponse.json({ success: true, code: null })

  const onepageId = typeof body.onepage_id === "string" ? body.onepage_id : ""
  const blockId = typeof body.block_id === "string" ? body.block_id.slice(0, 80) : ""
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : ""
  const name = signupName(body.name)
  if (!onepageId || !blockId || !email) return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })

  const limited = await rateLimit({
    bucket: "email-capture",
    subjects: [addressSubject(request), emailSubject(email)],
    windows: LIMITS.subscribe,
    message: "That is a lot of sign-ups at once. Try again in a minute.",
  })
  if (limited) return limited

  const db = createAdminClient()
  const { data: page } = await db.from("onepages").select("id, status, seller_id, creator_id, published_blocks").eq("id", onepageId).eq("status", "published").maybeSingle()
  if (!page) return NextResponse.json({ error: "This page is not published." }, { status: 404 })
  const creatorId: string | null = page.seller_id || page.creator_id || null
  const block = publishedBlock(page.published_blocks, blockId)
  if (!block || block.type !== "lead_magnet" || block.enabled === false) return NextResponse.json({ error: "This form is not on the page any more." }, { status: 404 })
  const data = block.data ?? {}
  const kind = leadMagnetKind(data.kind)
  if (kind === "download") return NextResponse.json({ error: "Use the download form." }, { status: 400 })

  const waitlist = kind === "waitlist" ? (typeof data.waitlist_name === "string" && data.waitlist_name.trim() ? data.waitlist_name.trim().slice(0, 120) : typeof data.title === "string" ? data.title.slice(0, 120) : null) : null

  let referrerHost: string | null = null
  const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null
  try {
    referrerHost = referrer ? new URL(referrer).host : null
  } catch {
    referrerHost = null
  }
  const utm = { source: typeof body.utm_source === "string" ? body.utm_source.slice(0, 120) : null, medium: typeof body.utm_medium === "string" ? body.utm_medium.slice(0, 120) : null, campaign: typeof body.utm_campaign === "string" ? body.utm_campaign.slice(0, 120) : null }
  const leadSource = contactSourceFrom({ request, surface: "onepage", form: "lead_magnet", sent: { from: fromOfHost(referrerHost) ?? undefined, utm_source: utm.source ?? undefined, utm_campaign: utm.campaign ?? undefined } })
  const countryCode = request.headers.get("x-vercel-ip-country")

  const saved = await saveLead(db, {
    onepageId,
    email,
    name,
    blockId,
    referrer,
    utm,
    magnetKind: kind,
    magnetLabel: kind === "waitlist" ? waitlist : typeof data.coupon_label === "string" ? data.coupon_label.slice(0, 120) : null,
    country: { code: countryCode, name: countryCode ? COUNTRY_NAMES[countryCode] ?? countryCode : null },
  })
  if (!saved.ok) return NextResponse.json({ error: "That could not be saved. Try again." }, { status: 500 })

  if (creatorId) {
    await addSubscriber(db, creatorId, { email, name, onepageId, consentText: kind === "waitlist" ? `Joined the waitlist on OnePage${waitlist ? `: ${waitlist}` : ""}` : "Signed up on OnePage for a discount code", source: leadSource, sent: body.origin })
    if (saved.fresh) after(() => deliverSignup(db, creatorId, pageSignup({ email, name, form: "lead_magnet", magnet: kind, detail: kind === "waitlist" ? waitlist : (data.coupon_label as string | undefined) ?? null, blockId, onepageId, pageUrl: request.headers.get("referer") })))
  }

  if (kind === "waitlist") return NextResponse.json({ success: true, code: null })

  /* The code: the creator's own, read now. */
  const couponId = typeof data.coupon_id === "string" ? data.coupon_id : ""
  if (!couponId || !creatorId) return NextResponse.json({ success: true, code: null, ended: true })
  const { data: coupon } = await db.from("coupons").select("code, is_active, starts_at, expires_at, usage_limit, usage_count").eq("id", couponId).eq("creator_id", creatorId).maybeSingle()
  if (!coupon || !couponUsable(coupon)) return NextResponse.json({ success: true, code: null, ended: true })
  return NextResponse.json({ success: true, code: String(coupon.code) })
}
