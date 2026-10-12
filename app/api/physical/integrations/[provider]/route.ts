import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { readinessChanged } from "@/lib/physical/readiness-server"
import { loadIntegrations, saveIntegration } from "@/lib/physical/integrations-server"
import { INTEGRATIONS } from "@/lib/integrations/catalog"
import { cachedCatalogOverrides } from "@/lib/integrations/overrides-server"
import { rateLimit } from "@/lib/api/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Connect, update or disconnect one integration. Secrets go in sealed and never come back out. */
export async function PUT(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { provider } = await params
  /* A key save asks the provider (Printful, Printify): a few a minute is plenty, and keeps their limits ours to spend. */
  const limited = await rateLimit({ bucket: "integration-save", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 60 }, { limit: 300, seconds: 86400 }] })
  if (limited) return limited
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  /* Paused or hidden for every store from /admin: it can still be disconnected, never connected (as the pixels' route). */
  if (body.disconnect !== true) {
    const slug = INTEGRATIONS.find((i) => i.kind === "commerce" && i.providerId === provider)?.id
    const o = slug ? (await cachedCatalogOverrides().catch(() => [])).find((x) => x.id === slug) : null
    if (o && o.availability !== "default") return physicalJson({ error: "This integration is paused on Storelib for now. Try again later." }, 409)
  }
  const saved = await saveIntegration(c.db, c.creatorId, provider, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, 400)
  readinessChanged(c)
  return physicalJson({ integrations: await loadIntegrations(c.db, c.creatorId) })
}
