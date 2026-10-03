import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadIntegrations, saveIntegration } from "@/lib/physical/integrations-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Connect, update or disconnect one integration. Secrets go in sealed and never come back out. */
export async function PUT(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { provider } = await params
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveIntegration(c.db, c.creatorId, provider, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, 400)
  return physicalJson({ integrations: await loadIntegrations(c.db, c.creatorId) })
}
