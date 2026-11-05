import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { recordActivity } from "@/lib/activity/log-server"
import { loadTrackingSettings, saveOwnTrackingAccount } from "@/lib/physical/tracking/accounts-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Integrations › Courier tracking (lib/physical/tracking). The
 * store's owner only, while physical commerce is on.
 *
 *   GET                 whether Storelib follows this store's parcels, with
 *                       which aggregator, how many now, and the store's own
 *                       account if it added one (last four of the key only)
 *   PUT { provider, apiKey, webhookSecret? }   use the store's own AfterShip
 *                       or 17TRACK account; the key is checked first
 *   PUT { remove: true }   back to Storelib's own tracking
 */
export async function GET() {
  const c = await physicalCaller("store", { read: true })
  if (c instanceof NextResponse) return c
  return physicalJson({ tracking: await loadTrackingSettings(c.db, c.creatorId) })
}

export async function PUT(request: Request) {
  const c = await physicalCaller("store", { strict: true })
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "tracking-key", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 10, seconds: 600 }], message: "That is a lot of tries. Wait a few minutes and try again." })
  if (limited) return limited
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const out = await saveOwnTrackingAccount(c.db, c.creatorId, body)
  if (!out.ok) return physicalJson({ error: out.error }, out.status ?? 400)
  await recordActivity(c.db, c, { action: body.remove === true ? "integration.removed" : "integration.installed", subjectType: "integration", subjectId: "courier_tracking", subjectLabel: "Courier tracking" })
  return physicalJson({ tracking: await loadTrackingSettings(c.db, c.creatorId) })
}
