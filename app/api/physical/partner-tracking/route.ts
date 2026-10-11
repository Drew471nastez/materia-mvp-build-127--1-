import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { getMainDomain } from "@/lib/url-helpers"
import { physicalApiGate } from "@/lib/physical/gate"
import { sameOriginForm } from "@/lib/site-accounts/respond"
import { PARTNER_PAGE_PREFIX, partnerLinkHolds, partnerShipped, shopWebhookSecret, verifyPartnerLink, webhookSignatureOk } from "@/lib/physical/partner-server"
import { orderNumber } from "@/lib/physical/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A PARTNER REPORTS TRACKING (lib/physical/partner-server.ts)
 * ===========================================================================
 *   JSON, signed    a partner's own system, with the shop's webhook secret:
 *                   { "order_id": "<the order's id from our webhook>",
 *                     "location_id"?: "...", "carrier": "UPS",
 *                     "tracking_number": "1Z...", "tracking_url"?: "https://...",
 *                     "status"?: "shipped" | "in_transit" | "out_for_delivery" | "delivered" | "failed" }
 *                   headers X-Storelib-Timestamp and X-Storelib-Signature
 *                   (v1=HMAC-SHA256 of "<timestamp>.<raw body>"), as Storelib
 *                   signs the order it sent them. Answers JSON.
 *   a form          the page linked from the order email
 *                   (/checkout/physical/partner/<token>), carrying its
 *                   signed token. Answers with a redirect back to it.
 *
 * An order that does not exist and a signature that does not match get the
 * same answer, so the endpoint says nothing about which orders exist.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  /* Physical commerce off (/admin): not found, as every /api/physical route. */
  const off = await physicalApiGate()
  if (off) return off
  const type = (request.headers.get("content-type") || "").toLowerCase()
  return type.startsWith("application/json") ? fromSystem(request) : fromPage(request)
}

async function fromSystem(request: Request) {
  const limited = await rateLimit({ bucket: "partner-webhook", subjects: [addressSubject(request)], windows: [{ limit: 120, seconds: 60 }, { limit: 5000, seconds: 86400 }] })
  if (limited) return limited
  const raw = await request.text().catch(() => "")
  if (!raw || raw.length > 20_000) return json({ error: "Send a JSON body under 20 KB." }, 400)
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: "The body is not JSON." }, 400)
  }
  const orderId = String(body.order_id ?? body.checkout_id ?? "")
  const denied = () => json({ error: "The signature did not match, or there is no such order." }, 401)
  if (!UUID.test(orderId)) return denied()
  const admin = createAdminClient()
  const { data: co } = await admin.from("commerce_checkouts").select("id, creator_id").eq("id", orderId).maybeSingle()
  if (!co?.creator_id) return denied()
  const secret = await shopWebhookSecret(admin, co.creator_id)
  if (!secret || !webhookSignatureOk(secret, request.headers.get("x-storelib-timestamp"), request.headers.get("x-storelib-signature"), raw)) return denied()

  let locationId: string | null = null
  let name = "your fulfilment partner"
  if (typeof body.location_id === "string" && body.location_id) {
    if (!UUID.test(body.location_id)) return json({ error: "location_id is not one of this shop's locations." }, 400)
    const { data: loc } = await admin.from("inventory_locations").select("id, name").eq("id", body.location_id).eq("creator_id", co.creator_id).maybeSingle()
    if (!loc) return json({ error: "location_id is not one of this shop's locations." }, 400)
    locationId = loc.id
    name = loc.name
  }
  const result = await partnerShipped(admin, {
    creatorId: co.creator_id,
    checkoutId: co.id,
    locationId,
    carrier: body.carrier,
    trackingNumber: body.tracking_number,
    trackingUrl: body.tracking_url,
    status: body.status,
    partner: { provider: "custom_webhook", name },
  })
  if (!result.ok) return json({ error: result.error }, result.status)
  return json({ ok: true, result: result.kind, order: { id: result.order.id, number: orderNumber(result.order.id), fulfillment_status: result.order.fulfillmentStatus } })
}

async function fromPage(request: Request) {
  const host = (request.headers.get("host") || "").toLowerCase()
  if (!sameOriginForm(request, host)) return json({ error: "Not allowed" }, 403)
  const form = await request.formData().catch(() => null)
  const token = String(form?.get("token") ?? "")
  const link = verifyPartnerLink(token)
  const page = `https://${getMainDomain()}${PARTNER_PAGE_PREFIX}${encodeURIComponent(token)}`
  const back = (q: string) => NextResponse.redirect(`${page}?${q}`, 303)
  if (!link) return back("error=link")
  const limited = await rateLimit({ bucket: "partner-link", subjects: [addressSubject(request), `partner:${link.c}`], windows: [{ limit: 10, seconds: 600 }, { limit: 40, seconds: 86400 }] })
  if (limited) return back("error=limit")

  const picked = String(form?.get("carrier") ?? "").trim()
  const carrier = picked === "Other" ? String(form?.get("other_carrier") ?? "").trim() : picked
  const number = String(form?.get("tracking_number") ?? "").trim()
  const url = String(form?.get("tracking_url") ?? "").trim()
  if (!number) return back("error=number")
  if (url && !/^https:\/\/[^\s"'<>]+$/.test(url)) return back("error=url")

  const admin = createAdminClient()
  const { data: co } = await admin.from("commerce_checkouts").select("id, creator_id").eq("id", link.c).maybeSingle()
  const { data: loc } = co ? await admin.from("inventory_locations").select("id, name, email, forwarding").eq("id", link.l).eq("creator_id", co.creator_id).maybeSingle() : { data: null }
  /* A link sent to an email the location no longer uses is closed (lib/physical/partner-link.ts partnerLinkVersion). */
  if (!co || !loc || !partnerLinkHolds(link, loc)) return back("error=link")
  const result = await partnerShipped(admin, {
    creatorId: co.creator_id,
    checkoutId: co.id,
    locationId: loc.id,
    carrier: carrier || null,
    trackingNumber: number,
    trackingUrl: url || null,
    partner: { provider: "supplier_email", name: loc.name },
  })
  if (!result.ok) return back(result.error === "Check the tracking number." ? "error=number" : "error=order")
  return back(`done=${result.kind === "unchanged" ? "already" : "1"}`)
}
