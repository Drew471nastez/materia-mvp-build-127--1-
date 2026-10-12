import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { cachedCatalogOverrides } from "@/lib/integrations/overrides-server"
import { isMarketingProvider, loadMarketing, saveMarketing } from "@/lib/integrations/marketing/sync-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Klaviyo and Omnisend, connected (lib/integrations/marketing/sync-server.ts),
 * for Settings › Integrations. The owner's own store only. Keys go in sealed
 * and come back as their last four characters; every store can connect
 * them, whatever it sells.
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  return physicalJson({ marketing: await loadMarketing(c.db, c.creatorId) })
}

/** { provider, step: "check" | "connect", apiKey, listId, backfill } or { provider, listId } or { provider, step: "lists" } or { provider, disconnect: true }. */
export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  /* A check or a connect asks the provider: a few a minute is plenty, and keeps their limits ours to spend. */
  const limited = await rateLimit({ bucket: "marketing-integration", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 60 }, { limit: 300, seconds: 86400 }] })
  if (limited) return limited
  const body = await readBody(request)
  if (!body || !isMarketingProvider(body.provider)) return physicalJson({ error: "Bad request." }, 400)
  /* Paused or hidden from /admin: it can still be disconnected, never connected. */
  if (body.disconnect !== true) {
    const o = (await cachedCatalogOverrides().catch(() => [])).find((x) => x.id === body.provider)
    if (o && o.availability !== "default") return physicalJson({ error: "This integration is paused on Storelib for now. Try again later." }, 409)
  }
  const saved = await saveMarketing(c.db, c.creatorId, body.provider, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status ?? 400)
  return physicalJson({ marketing: await loadMarketing(c.db, c.creatorId), lists: saved.lists ?? null, account: saved.account ?? null })
}
