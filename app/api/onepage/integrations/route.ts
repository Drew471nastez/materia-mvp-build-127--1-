import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { loadPageIntegrations, savePageIntegration } from "@/lib/onepage/integrations/connect-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Mailchimp, Kit, beehiiv, Zapier, Make, Google Sheets and a webhook of the
 * creator's own, connected to their OnePage's signups
 * (lib/onepage/integrations). The owner's own store only. Keys go in and come
 * back as their last four characters; webhook addresses come back as their
 * host. GET reads them; POST is one step of the card
 * (lib/onepage/integrations/connect-server savePageIntegration).
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  return physicalJson(await loadPageIntegrations(c.db, c.creatorId))
}

export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  /* Each step asks the provider: a few a minute is plenty, and keeps their limits (and a stolen key checker) away. */
  const limited = await rateLimit({ bucket: "onepage-integration", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 60 }, { limit: 300, seconds: 86400 }] })
  if (limited) return limited
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await savePageIntegration(c.db, c.creatorId, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status ?? 400)
  return physicalJson({ ...(await loadPageIntegrations(c.db, c.creatorId)), lists: saved.lists ?? null, tags: saved.tags ?? null, signingSecret: saved.signingSecret ?? null })
}
