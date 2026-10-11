import { after, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, emailSubject, rateLimit } from "@/lib/api/rate-limit"
import { buildMailgunFromHeader, sendMailgunEmail } from "@/lib/mailgun"
import { siteOfRequest } from "@/lib/checkout/site-checkout-server"
import { siteBrand } from "@/lib/site-accounts/site-brand"
import { storeIdentity } from "@/lib/store/identity-server"
import { privateResponse, sameOriginForm } from "@/lib/site-accounts/respond"
import { ORDER_LOOKUP_PATH, readOrderNumber } from "@/lib/physical/order-link"
import { findOrderFor } from "@/lib/physical/order-lookup-server"
import { orderLinkEmail } from "@/lib/physical/email-templates"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  TRACK YOUR ORDER: THE FORM ON A STORE'S WEBSITE
 * ===========================================================================
 * POST from https://<site host>/checkout/track (app/checkout/site/track),
 * on that same host. The store is the host's (siteOfRequest), never one the
 * form names. With an order number and an email, the link to that order is
 * emailed to that email when they are one of this store's orders
 * (lib/physical/order-lookup-server.ts). The answer is the same redirect
 * whether they matched or not, and the search and the email happen after
 * it, so neither the page nor how long it took says whether an order exists.
 *
 * Limited per visitor and per address emailed (lib/api/rate-limit.ts):
 * a few tries in five minutes, ten a day.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function back(origin: string, query: Record<string, string>): NextResponse {
  const to = new URL(ORDER_LOOKUP_PATH, origin)
  for (const [k, v] of Object.entries(query)) if (v) to.searchParams.set(k, v)
  return privateResponse(NextResponse.redirect(to, 303))
}

export async function POST(request: Request) {
  const admin = createAdminClient()
  const site = await siteOfRequest(admin, request)
  if (!site) return privateResponse(NextResponse.json({ error: "Open this from the shop's website." }, { status: 403 }))
  if (!sameOriginForm(request, site.host)) return privateResponse(NextResponse.json({ error: "Not allowed" }, { status: 403 }))

  const form = await request.formData().catch(() => null)
  const email = String(form?.get("email") ?? "").trim().toLowerCase().slice(0, 254)
  const number = readOrderNumber(String(form?.get("number") ?? ""))
  if (!number) return back(site.origin, { error: "number" })
  if (!EMAIL.test(email)) return back(site.origin, { error: "email" })

  const limited =
    (await rateLimit({ bucket: "order-lookup-visitor", subjects: [addressSubject(request)], windows: [{ limit: 5, seconds: 300 }, { limit: 20, seconds: 86400 }] })) ||
    (await rateLimit({ bucket: "order-lookup-email", subjects: [emailSubject(email)], windows: [{ limit: 3, seconds: 300 }, { limit: 10, seconds: 86400 }] }))
  if (limited) return back(site.origin, { error: "limit" })

  after(async () => {
    try {
      const found = await findOrderFor(admin, { creatorId: site.creatorId, email, number })
      if (!found) return
      const [brand, store] = await Promise.all([siteBrand(admin, site.creatorId), storeIdentity(admin, site.creatorId)])
      const mail = orderLinkEmail({
        shopName: brand.name,
        orders: [{ number: found.number, date: found.date, url: `${site.origin}${found.path}`, status: found.status }],
        brand: { logoUrl: brand.logoUrl ?? store.logoUrl, email: store.email, phone: store.phone, websiteUrl: site.origin },
      })
      /* Asked for this minute: transactional, so it leaves at once with no tracking rewriting the link. Anybody can type an email here, so its bounce record is kept (keepBounce). */
      await sendMailgunEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text, from: buildMailgunFromHeader(brand.name), replyTo: brand.replyTo || undefined, tags: ["order-lookup"], transactional: true, keepBounce: true })
    } catch (e) {
      console.error("[order-lookup] failed:", e instanceof Error ? e.message : "unknown")
    }
  })
  return back(site.origin, { sent: "1" })
}
