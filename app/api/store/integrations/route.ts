import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { loadGaStatus, loadTracking, saveTrackerId } from "@/lib/store/tracking-server"
import { recordActivity } from "@/lib/activity/log-server"
import { TRACKERS, type TrackerId } from "@/lib/store/tracking"
import { INTEGRATIONS } from "@/lib/integrations/catalog"
import { cachedCatalogOverrides } from "@/lib/integrations/overrides-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Integrations: the analytics and ad pixel IDs on the store's
 * website (lib/store/tracking-server.ts). Every store, the owner alone.
 *
 *   GET                  the IDs saved, and whether Google Analytics is receiving data
 *   PUT  { id, value }   set one (null or "" removes it)
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const loaded = await loadTracking(c.db, c.creatorId)
  /* Google Analytics: is it receiving data, and when was it last checked (lib/store/tracking-server loadGaStatus). */
  const ga = loaded.tracking.ga4 ? await loadGaStatus(c.db, c.creatorId, loaded.tracking.ga4).catch(() => null) : null
  return physicalJson({ ...loaded, ga })
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  /* Paused or hidden for every store from /admin: it can still be removed, never added. */
  const adding = typeof body.value === "string" && body.value.trim() !== ""
  if (adding) {
    const slug = INTEGRATIONS.find((i) => i.kind === "tracker" && i.trackerId === body.id)?.id
    const o = slug ? (await cachedCatalogOverrides().catch(() => [])).find((x) => x.id === slug) : null
    if (o && o.availability !== "default") return physicalJson({ error: "This integration is paused on Storelib for now. Try again later." }, 409)
  }
  const out = await saveTrackerId(c.db, c.creatorId, body.id, body.value)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  const tracker = TRACKERS[body.id as TrackerId]
  if (tracker) await recordActivity(c.db, c, { action: typeof body.value === "string" && body.value.trim() ? "integration.installed" : "integration.removed", subjectType: "integration", subjectId: tracker.id, subjectLabel: tracker.name })
  return physicalJson({ tracking: out.tracking, ready: true })
}
