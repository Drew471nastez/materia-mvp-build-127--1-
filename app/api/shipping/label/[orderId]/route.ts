import { NextResponse, type NextRequest } from "next/server"

import { requireVerifiedUser } from "@/lib/auth/current-user"
import { getLabelLink } from "@/lib/eawb"
import { resolveOrderParty } from "@/lib/shipping/order-access"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * ===========================================================================
 *  THE SHIPPING LABEL — streamed, never linked
 * ===========================================================================
 *   GET /api/shipping/label/<uuid>  → application/pdf
 *
 * ---------------------------------------------------------------------------
 * Why the provider's URL is never handed to the browser
 * ---------------------------------------------------------------------------
 * The label link the courier returns is a bearer URL: anyone holding it can
 * fetch the label, and a label carries both parties' names, the delivery point
 * and a barcode that identifies a real parcel. Putting that URL in an href
 * would put it in browser history, in the Referer of anything it links to, and
 * in any screenshot of the network tab — and it would stay valid long after the
 * person who obtained it stopped being a party to the order.
 *
 * So the bytes are fetched server-side and streamed back under OUR authorisation
 * check, which is re-run on every single download. Revoking access is then just
 * ceasing to be the seller, rather than hoping an unguessable URL was not
 * shared.
 *
 * SELLER ONLY. The label exists so the seller can print it and drop the parcel
 * off; the buyer has the tracking number, which is what they actually need, and
 * gets it without the seller's address attached.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Labels are small. A ceiling stops a misbehaving upstream from streaming
 *  unbounded bytes through a serverless function. */
const MAX_LABEL_BYTES = 8 * 1024 * 1024

export async function GET(_req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params
  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ ok: false, code: "bad_order_id" }, { status: 400 })
  }

  const supabase = await createClient()
  const userId = await requireVerifiedUser(supabase)
  if (!userId) return NextResponse.json({ ok: false, code: "auth_required" }, { status: 401 })

  const resolved = await resolveOrderParty(orderId, userId)
  if (!resolved.ok || resolved.party !== "seller" || resolved.schema === "absent") {
    // Every refusal is the same 404: not the seller, no such order, and feature
    // not installed are indistinguishable from outside.
    return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 })
  }

  const order = resolved.order
  if (!order.awb_number) {
    return NextResponse.json({ ok: false, code: "no_awb" }, { status: 409 })
  }

  // The URL stored at creation time can expire. If fetching it fails, ask the
  // provider for a fresh one before giving up, and remember the new one.
  let url = order.shipping_label_url ?? null
  let res = url ? await safeFetch(url) : null

  if (!res || !res.ok) {
    try {
      const fresh = await getLabelLink(order.awb_number)
      if (fresh.url && fresh.url !== url) {
        url = fresh.url
        res = await safeFetch(url)
        if (res?.ok) {
          await createAdminClient()
            .from("orders")
            .update({ shipping_label_url: url })
            .eq("id", orderId)
            .then(undefined, () => undefined)
        }
      }
    } catch {
      // Fall through to the failure response below.
    }
  }

  if (!res || !res.ok || !res.body) {
    // Deliberately does not include the upstream URL or its status text — this
    // reaches a browser, and the point of the route is that the URL stays here.
    console.error("[shipping/label] upstream fetch failed", { orderId, status: res?.status ?? null })
    return NextResponse.json({ ok: false, code: "label_unavailable" }, { status: 502 })
  }

  const declared = Number(res.headers.get("content-length") || 0)
  if (declared > MAX_LABEL_BYTES) {
    return NextResponse.json({ ok: false, code: "label_too_large" }, { status: 502 })
  }

  const type = res.headers.get("content-type") || "application/pdf"
  const isPdf = /pdf/i.test(type)
  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_LABEL_BYTES) {
    return NextResponse.json({ ok: false, code: "label_too_large" }, { status: 502 })
  }

  return new NextResponse(buf, {
    headers: {
      "Content-Type": isPdf ? "application/pdf" : type,
      "Content-Disposition": `inline; filename="AWB-${order.awb_number.replace(/[^\w.-]/g, "")}.${isPdf ? "pdf" : "bin"}"`,
      // A label is per-order and per-person. No shared cache may hold it.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

/** fetch() that returns null instead of throwing, so callers can fall through. */
async function safeFetch(url: string): Promise<Response | null> {
  try {
    // Only ever an absolute https URL from the provider. A relative or
    // non-https value would be a sign the stored column was tampered with.
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return null
    return await fetch(parsed.toString(), { cache: "no-store" })
  } catch {
    return null
  }
}
