import { createHash, timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { createAwbForOrder } from "@/lib/shipping/create-awb"

/**
 * ===========================================================================
 *  CREATE THE SHIPMENT FOR A PAID ORDER — the privileged entry point
 * ===========================================================================
 *   POST /api/shipping/create   { "orderId": "<uuid>" }
 *
 * Called from the SERVER — the payment webhook, an admin action, a retry — and
 * never from the buyer's browser. That is the whole point of it being here: if
 * the buyer closes the tab the moment their card clears, the parcel still gets
 * booked, because nothing about booking it depends on a page staying open.
 *
 * All of the interesting logic — the three idempotency guards, the paid check,
 * the address check, the claim/release around the provider call — lives in
 * `lib/shipping/create-awb.ts`, because two other callers need exactly the same
 * behaviour and three copies of a money-spending function would eventually
 * disagree. This file is only the AUTHORISATION for the privileged path: a
 * shared secret for automation, or an admin session for a human.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function keyMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  // Two ways in, both server-side. The shared secret is for the payment webhook
  // and any automation; the admin session is for a human pressing Retry.
  const bySession = await isAdminAuthenticated()
  if (!bySession) {
    const expected = process.env.STORELIB_ADMIN_KEY
    const provided = req.headers.get("x-storelib-admin-key") ?? ""
    if (!expected || !provided || !keyMatches(provided, expected)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
  }

  let body: { orderId?: string; carrierId?: number; serviceId?: number; weightKg?: number } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }
  const orderId = body.orderId
  if (!orderId || !UUID_RE.test(orderId)) {
    return NextResponse.json({ error: "orderId must be a uuid" }, { status: 400 })
  }

  const result = await createAwbForOrder(orderId, {
    carrierId: body.carrierId,
    serviceId: body.serviceId,
    weightKg: body.weightKg,
  })

  if (result.ok) return NextResponse.json(result)

  // A provider refusal is a 200 with ok:false: the request was well-formed and
  // correctly authorised, and the caller (a webhook, usually) should record the
  // outcome rather than treat it as its own failure and retry blindly.
  const status =
    result.code === "not_found"
      ? 404
      : result.code === "not_paid"
        ? 409
        : result.code === "missing_delivery_address" || result.code === "invalid_shipment"
          ? 422
          : result.code === "insufficient_funds"
            ? 402
            : result.code === "db_unavailable" || result.code === "schema_missing"
              ? 503
            : result.code === "save_failed"
              ? 500
              : 200

  return NextResponse.json(result, { status })
}
