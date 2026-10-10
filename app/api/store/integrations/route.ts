import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { loadTracking, saveTrackerId } from "@/lib/store/tracking-server"
import { recordActivity } from "@/lib/activity/log-server"
import { TRACKERS, type TrackerId } from "@/lib/store/tracking"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Integrations: the analytics and ad pixel IDs on the store's
 * website (lib/store/tracking-server.ts). Every store, the owner alone.
 *
 *   GET                  the IDs saved
 *   PUT  { id, value }   set one (null or "" removes it)
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  return physicalJson(await loadTracking(c.db, c.creatorId))
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const out = await saveTrackerId(c.db, c.creatorId, body.id, body.value)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  const tracker = TRACKERS[body.id as TrackerId]
  if (tracker) await recordActivity(c.db, c, { action: typeof body.value === "string" && body.value.trim() ? "integration.installed" : "integration.removed", subjectType: "integration", subjectId: tracker.id, subjectLabel: tracker.name })
  return physicalJson({ tracking: out.tracking, ready: true })
}
