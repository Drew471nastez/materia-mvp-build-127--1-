import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { physicalApiGate } from "@/lib/physical/gate"
import { connectorFor, handleProviderWebhook, readWebhookToken } from "@/lib/integrations/fulfilment/forward-server"
import { realForwardDeps } from "@/lib/integrations/fulfilment/forward-deps-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  PRINTFUL, PRINTIFY, GELATO AND CJ SAY A PARCEL (OR CJ'S STOCK) MOVED
 * ===========================================================================
 * POST /api/integrations/webhooks/<printful|printify|gelato|cj_dropshipping>/<creator>.<token>
 *
 * Registered with the provider when the seller connects it
 * (lib/integrations/fulfilment/forward-server.ts afterConnect). Three checks
 * before anything moves:
 *
 *   the address   the token is an HMAC only Storelib can make for that
 *                 store and that provider
 *   the body      Printify's X-Pfy-Signature, sha256 HMAC of the raw body
 *                 with the secret made when it was connected (Printful,
 *                 Gelato and CJ's order and stock messages are not signed,
 *                 so they rest on the other two)
 *   the provider  the order is read back from the provider with the
 *                 seller's own key; the body only says which order (or for
 *                 CJ's stock, which variants) to read
 *
 * 2xx when it was handled or is not ours to handle, so the provider stops
 * retrying; 503 when the provider could not be read, so it tries again.
 */
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string; token: string }> }) {
  const off = await physicalApiGate()
  if (off) return off
  const { provider, token } = await params
  if (!connectorFor(provider)) return json({ error: "Not found." }, 404)
  const limited = await rateLimit({ bucket: "provider-webhook", subjects: [addressSubject(request), `provider:${provider}:${token.slice(0, 36)}`], windows: [{ limit: 240, seconds: 60 }, { limit: 20000, seconds: 86400 }] })
  if (limited) return limited
  const creatorId = readWebhookToken(provider, token)
  if (!creatorId) return json({ error: "Not found." }, 404)
  const raw = await request.text().catch(() => "")
  if (!raw || raw.length > 64_000) return json({ error: "Send a JSON body under 64 KB." }, 400)
  const out = await handleProviderWebhook(createAdminClient(), { provider, creatorId, raw, signature: request.headers.get("x-pfy-signature") }, realForwardDeps)
  return json(out.body, out.status)
}
