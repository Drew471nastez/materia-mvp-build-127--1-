import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { physicalApiGate } from "@/lib/physical/gate"
import { readWebhookToken } from "@/lib/integrations/fulfilment/forward-server"
import { handleShipNotify } from "@/lib/integrations/shipping/shipstation-server"
import { realShipStationDeps } from "@/lib/integrations/shipping/shipping-deps-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  SHIPSTATION SAYS A LABEL SHIPPED (SHIP_NOTIFY)
 * ===========================================================================
 * POST /api/integrations/shipstation/<creator>.<token>
 *
 * Subscribed when the seller connects ShipStation
 * (lib/integrations/shipping/connect-server.ts). ShipStation does not sign
 * its webhooks, so two checks stand in for a signature before anything
 * moves:
 *
 *   the address   the token is an HMAC only Storelib can make for that
 *                 store and ShipStation
 *   ShipStation   the body only names a resource_url; the shipments are read
 *                 from ssapi.shipstation.com with the seller's own key, and
 *                 a URL on any other host is ignored
 *
 * 2xx when handled or not ours to handle, so ShipStation stops retrying; 503
 * when ShipStation could not be read, so it tries again.
 */
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const off = await physicalApiGate()
  if (off) return off
  const { token } = await params
  const limited = await rateLimit({ bucket: "shipstation-webhook", subjects: [addressSubject(request), `shipstation:${token.slice(0, 36)}`], windows: [{ limit: 120, seconds: 60 }, { limit: 10000, seconds: 86400 }] })
  if (limited) return limited
  const creatorId = readWebhookToken("shipstation", token)
  if (!creatorId) return json({ error: "Not found." }, 404)
  const raw = await request.text().catch(() => "")
  if (!raw || raw.length > 16_000) return json({ error: "Send a JSON body under 16 KB." }, 400)
  const out = await handleShipNotify(createAdminClient(), { creatorId, raw }, realShipStationDeps)
  return json(out.body, out.status)
}
