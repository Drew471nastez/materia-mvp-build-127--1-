import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadIntegrations, saveIntegration } from "@/lib/physical/integrations-server"
import { INTEGRATIONS } from "@/lib/integrations/catalog"
import { cachedCatalogOverrides } from "@/lib/integrations/overrides-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Connect, update or disconnect one integration. Secrets go in sealed and never come back out. */
export async function PUT(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { provider } = await params
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
  return physicalJson({ integrations: await loadIntegrations(c.db, c.creatorId) })
}
