import { NextResponse } from "next/server"

import { quoteDelivery } from "@/lib/shipping/quote"

/**
 * ===========================================================================
 *  WHAT WILL THE DELIVERY COST? — POST /api/shipping/quote
 * ===========================================================================
 *   { mode: "locker", lockerId: 2210235 }
 *   { mode: "home", county: "Cluj", locality: "Cluj-Napoca" }
 *
 * Answers with a price in the minor unit the card is charged in, so the page
 * can render it next to the option without doing any arithmetic of its own.
 *
 * This is a READ. It books nothing, spends nothing and creates nothing — the
 * provider's price endpoint is explicitly non-mutating. What it does cost is a
 * round trip to the courier, which is why the checkout asks once per choice
 * rather than on every render.
 *
 * The response deliberately carries no account details: a carrier name, a
 * price, and a date. The credential that fetched it never leaves the server.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, code: "bad_request", message: "Cerere invalidă." }, { status: 400 })
  }

  const mode = body.mode === "home" ? "home" : "locker"

  const result = await quoteDelivery({
    mode,
    lockerId: body.lockerId === null || body.lockerId === undefined ? null : Number(body.lockerId),
    county: typeof body.county === "string" ? body.county : null,
    locality: typeof body.locality === "string" ? body.locality : null,
  })

  if (!result.ok) {
    // 200, not an error status. Every one of these is a normal thing for a
    // checkout to hear — the courier is unconfigured, or that locker is on
    // another network — and the page renders each one differently. A 4xx would
    // make them all look like a bug in the request.
    return NextResponse.json({ ok: false, code: result.code, message: result.message })
  }

  return NextResponse.json({
    ok: true,
    mode,
    cents: result.cents,
    carrier: result.carrier,
    estimatedDelivery: result.estimatedDelivery,
  })
}
