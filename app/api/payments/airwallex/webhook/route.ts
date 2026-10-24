import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/payments/airwallex/webhook
 *
 * Airwallex is no longer a Storelib payments provider. This address may still
 * be registered as a notification URL in an Airwallex dashboard, so it stays
 * and answers 410 Gone, which tells a sender to stop. Nothing is read or
 * handled; the body is never parsed or logged. One log line says that a
 * delivery came, so the subscription can be deleted at Airwallex.
 */
export async function POST(request: Request) {
  console.warn("[airwallex webhook] delivery to a removed endpoint; answered 410", request.headers.get("x-timestamp") ? "signed" : "unsigned")
  return NextResponse.json({ error: "gone" }, { status: 410 })
}
