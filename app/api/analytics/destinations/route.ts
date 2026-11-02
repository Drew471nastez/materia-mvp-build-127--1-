import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { loadDestinations, memberMay, saveDestination } from "@/lib/analytics/destinations/connect-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Analytics › Send to: Google Analytics 4, Meta's Conversions API, PostHog
 * and a webhook (lib/analytics/destinations). GET is each one's status
 * (connected, the last event sent, what waits, the recent errors and
 * deliveries); POST is one step: connect (tried with the tool first), test,
 * or disconnect. Keys go in and come back as their last four characters; a
 * webhook's signing secret comes back once, on the answer that made it.
 * The owner connects and disconnects; a team member with Analytics reads
 * the status and sends a test.
 */
export async function GET() {
  const c = await shopCaller("analytics", { read: true })
  if (c instanceof NextResponse) return c
  return physicalJson({ ...(await loadDestinations(c.db, c.creatorId)), canEdit: c.isOwner !== false })
}

export async function POST(request: Request) {
  const c = await shopCaller("analytics")
  if (c instanceof NextResponse) return c
  /* Each step asks the tool: a few a minute is plenty, and keeps a stolen key checker away. */
  const limited = await rateLimit({ bucket: "analytics-destination", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 60 }, { limit: 300, seconds: 86400 }], message: "Too many tries. Wait a minute." })
  if (limited) return limited
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  if (c.isOwner === false && !memberMay(body)) return physicalJson({ error: "Only the store's owner can connect or disconnect a tool." }, 403)
  const saved = await saveDestination(c.db, c.creatorId, body)
  if (saved.ok === false) return physicalJson({ error: saved.error, field: saved.field ?? null, ...(await loadDestinations(c.db, c.creatorId)) }, saved.status ?? 400)
  return physicalJson({ ...(await loadDestinations(c.db, c.creatorId)), canEdit: c.isOwner !== false, signingSecret: saved.signingSecret ?? null })
}
