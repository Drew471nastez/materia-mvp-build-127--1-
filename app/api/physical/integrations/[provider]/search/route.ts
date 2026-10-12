import { NextResponse } from "next/server"
import { physicalCaller, physicalJson } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { ProviderError } from "@/lib/integrations/fulfilment/http"
import { cjSearch, cjVariantsOfProduct } from "@/lib/integrations/fulfilment/cj"
import { credentialFor } from "@/lib/integrations/fulfilment/links-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/physical/integrations/cj_dropshipping/search?q=<SKU or words>
 *     the variants with exactly that SKU, and CJ products matching it
 * GET /api/physical/integrations/cj_dropshipping/search?pid=<CJ product>
 *     that product's variants, to choose one
 *
 * With the seller's own CJ token, for matching in Settings › Integrations. CJ
 * allows about a request a second, so a few searches a minute.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { provider } = await params
  if (provider !== "cj_dropshipping") return physicalJson({ error: "Not found." }, 404)
  const limited = await rateLimit({ bucket: "cj-search", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 60 }, { limit: 1000, seconds: 86400 }] })
  if (limited) return limited
  const { data: row } = await c.db.from("commerce_integrations").select("id, provider, status, config, secret_ciphertext").eq("creator_id", c.creatorId).eq("provider", provider).maybeSingle()
  const cred = row && row.status === "connected" ? credentialFor(c.db, row) : null
  if (!cred) return physicalJson({ error: "Connect CJ Dropshipping first." }, 400)
  const url = new URL(request.url)
  try {
    const pid = url.searchParams.get("pid")
    if (pid) return physicalJson({ variants: await cjVariantsOfProduct(cred, pid), products: [] })
    return physicalJson(await cjSearch(cred, url.searchParams.get("q") ?? ""))
  } catch (e) {
    return physicalJson({ error: e instanceof ProviderError ? e.message : "CJ could not be reached. Try again in a moment." }, 502)
  }
}
