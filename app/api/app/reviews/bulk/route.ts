import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller, isUuid } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { BULK_ACTIONS, MAX_BULK, type BulkAction } from "@/lib/reviews/dashboard"
import { moderateMany } from "@/lib/reviews/moderate-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Reviews › Reviews, the selected rows:
 *
 *   POST { ids: [...], action: approve | reject | publish | unpublish | feature | unfeature | delete }
 *        → { changed, deleted, skipped: [{ id, reason }], reviews }
 *
 * Each review gets exactly what the one-review route would give it
 * (lib/reviews/dashboard.ts planModeration). One already where the action
 * puts it, a verified buyer's (never deleted), or one a report hid is left
 * as it is and named with why, so the page can say "12 published, 3 were
 * already". At most MAX_BULK at once, the store's own reviews only. Ratings
 * are counted again once for each product touched.
 */
export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "review-bulk", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 60, seconds: 600 }] })
  if (limited) return limited
  const body = await readBody(request)
  const ids = Array.isArray(body?.ids) ? [...new Set((body?.ids as unknown[]).filter(isUuid).map((s) => s.toLowerCase()))] : []
  const action = String(body?.action ?? "")
  if (!(BULK_ACTIONS as readonly string[]).includes(action) || ids.length === 0) return physicalJson({ error: "Bad request." }, 400)
  if (ids.length > MAX_BULK) return physicalJson({ error: `Choose up to ${MAX_BULK} reviews at a time.` }, 400)
  return physicalJson(await moderateMany(c.db, c.creatorId, ids, action as BulkAction))
}
