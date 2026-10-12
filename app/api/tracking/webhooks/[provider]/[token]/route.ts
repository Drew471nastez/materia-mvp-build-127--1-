import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { physicalApiGate } from "@/lib/physical/gate"
import { readTrackingWebhookToken, trackingProvider } from "@/lib/physical/tracking/provider"
import { handleTrackingWebhook } from "@/lib/physical/tracking/sync-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A TRACKING AGGREGATOR SAYS A PARCEL MOVED
 * ===========================================================================
 * POST /api/tracking/webhooks/<aftership|17track>/<platform|creator>.<token>
 *
 * Set once in Storelib's own AfterShip or 17TRACK account (the address with
 * "platform"), or by a store in its own account (Settings > Integrations >
 * Courier tracking shows its address). Three checks before anything moves:
 *
 *   the address   the token is an HMAC only Storelib can make, naming whose
 *                 account it is
 *   the body      AfterShip's aftership-hmac-sha256 (base64 HMAC-SHA256 of
 *                 the raw body with the webhook secret), or 17TRACK's sign
 *                 (SHA-256 of the raw body, "/" and the API key)
 *   the provider  the parcel is read back from the aggregator; the body
 *                 only says which number
 *
 * 2xx when handled or not ours, so the aggregator stops retrying; 503 when
 * the aggregator could not be read back, so it tries again. The same
 * delivery twice changes nothing (lib/physical/tracking/sync-server.ts).
 */
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string; token: string }> }) {
  const off = await physicalApiGate()
  if (off) return off
  const { provider, token } = await params
  const p = trackingProvider(provider)
  if (!p) return json({ error: "Not found." }, 404)
  const limited = await rateLimit({ bucket: "tracking-webhook", subjects: [addressSubject(request), `tracking:${p.id}:${token.slice(0, 36)}`], windows: [{ limit: 600, seconds: 60 }, { limit: 50000, seconds: 86400 }] })
  if (limited) return limited
  const owner = readTrackingWebhookToken(p.id, token)
  if (!owner) return json({ error: "Not found." }, 404)
  const raw = await request.text().catch(() => "")
  if (!raw || raw.length > 256_000) return json({ error: "Send a JSON body under 256 KB." }, 400)
  const out = await handleTrackingWebhook(createAdminClient(), { provider: p.id, owner, raw, headers: request.headers })
  return json(out.body, out.status)
}
