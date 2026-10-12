import { NextResponse } from "next/server"
import { physicalCaller, physicalJson } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { openSecret } from "@/lib/physical/secrets"
import { ProviderError } from "@/lib/integrations/fulfilment/http"
import { gelatoShipmentMethods } from "@/lib/integrations/fulfilment/gelato"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/physical/integrations/gelato/shipment-methods?country=US: Gelato's shipment methods, for the seller to choose the one orders go by. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { provider } = await params
  if (provider !== "gelato") return physicalJson({ error: "Not found." }, 404)
  const limited = await rateLimit({ bucket: "gelato-methods", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 60 }] })
  if (limited) return limited
  const { data: row } = await c.db.from("commerce_integrations").select("status, secret_ciphertext").eq("creator_id", c.creatorId).eq("provider", "gelato").maybeSingle()
  const key = row?.status === "connected" ? openSecret(row.secret_ciphertext) : null
  if (!key) return physicalJson({ error: "Connect Gelato first." }, 400)
  const country = (new URL(request.url).searchParams.get("country") ?? "").toUpperCase()
  try {
    return physicalJson({ methods: await gelatoShipmentMethods(key, /^[A-Z]{2}$/.test(country) ? country : null) })
  } catch (e) {
    return physicalJson({ error: e instanceof ProviderError ? e.message : "Gelato could not be reached. Try again in a moment." }, 502)
  }
}
