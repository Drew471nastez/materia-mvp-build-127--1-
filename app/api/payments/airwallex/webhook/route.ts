import { NextResponse } from "next/server"
import { readAirwallexConfig } from "@/lib/payments/airwallex/config"
import { parseAirwallexEvent, verifyAirwallexSignature } from "@/lib/payments/airwallex/webhook"
import { handleAirwallexEvent } from "@/lib/payments/airwallex/events"
import { claimEvent, finishEvent } from "@/lib/payments/store"
import { describe } from "@/lib/payments/service"
import { timed } from "@/lib/perf/server-timing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/payments/airwallex/webhook
 *
 * Airwallex's notification URL. In order:
 *
 *   the RAW body is verified against `x-timestamp` and `x-signature` with
 *   the subscription's secret, before anything parses it. A request that
 *   fails gets a 400 and nothing else: no hint of why.
 *
 *   the event id is claimed in payment_webhook_events. One that already
 *   finished is acknowledged with 200 and not handled again.
 *
 *   it is handled (lib/payments/airwallex/events), which re-reads the
 *   resource from Airwallex rather than trusting the payload.
 *
 *   200 when it is done or not ours; 500 when Airwallex or the database
 *   could not be reached, so Airwallex delivers it again (it retries for
 *   about three days).
 *
 * Nothing here logs the body: account events carry identity data.
 */
async function handlePOST(request: Request) {
  const raw = await request.text()
  const cfg = readAirwallexConfig()
  const secret = cfg.ok ? cfg.config.webhookSecret : null
  const verdict = verifyAirwallexSignature({
    rawBody: raw,
    timestamp: request.headers.get("x-timestamp"),
    signature: request.headers.get("x-signature"),
    secret,
  })
  if (verdict.ok === false) {
    if (verdict.reason === "no_secret") console.error("[airwallex webhook] AIRWALLEX_WEBHOOK_SECRET is not set; refusing every event")
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }

  const event = parseAirwallexEvent(raw)
  if (!event) return NextResponse.json({ error: "invalid" }, { status: 400 })

  let claim: Awaited<ReturnType<typeof claimEvent>>
  try {
    claim = await claimEvent({
      id: event.id,
      name: event.name,
      accountId: event.accountId,
      objectId: typeof event.object?.id === "string" ? event.object.id : null,
      createdAt: event.createdAt,
    })
  } catch (e) {
    console.error("[airwallex webhook] ledger unavailable", describe(e))
    return NextResponse.json({ error: "retry" }, { status: 500 })
  }
  /* Part 76 not run: nothing can be recorded, and nothing is Airwallex's yet. */
  if (claim === "missing") return NextResponse.json({ received: true, recorded: false })
  if (claim === "done") return NextResponse.json({ received: true, duplicate: true })
  /* Another delivery of this event is being handled now: Airwallex sends it again later (lib/payments/store claimEvent). */
  if (claim === "busy") return NextResponse.json({ error: "retry" }, { status: 409 })

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  try {
    const outcome = await handleAirwallexEvent(event, { baseUrl })
    await finishEvent(event.id, outcome, null)
    return NextResponse.json({ received: true })
  } catch (e) {
    const reason = describe(e)
    console.error("[airwallex webhook] handling failed", event.name, reason)
    await finishEvent(event.id, "failed", reason).catch(() => {})
    return NextResponse.json({ error: "retry" }, { status: 500 })
  }
}

/* Timed on the server for /admin/performance (lib/perf/server-timing.ts). */
export const POST = timed("infra", "/api/payments/airwallex/webhook", handlePOST)
