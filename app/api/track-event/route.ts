import type { NextRequest } from "next/server"
import { collectFrom, readBody, trackResponse } from "@/lib/analytics/collect-route"
import type { CollectKind } from "@/lib/analytics/collect"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Everything a visitor does on a page that is not opening it: a link out of
 * the page, a link or button to another page of the same site (nav_click),
 * and the steps towards a sale. Judged by the same pipeline as a
 * page view (lib/analytics/collect.ts): a real creator, a product that is
 * theirs, not the creator on their own checkout, not a robot, consent read
 * from the visitor's own record, one step per visit.
 */
const EVENTS = ["buy_click", "checkout_start", "checkout_complete", "download", "link_click", "nav_click"] as const

export async function POST(req: NextRequest) {
  const body = await readBody(req)
  const eventType = (body as { eventType?: unknown } | null)?.eventType
  /* Only the events this route knows; anything else is not recorded. */
  if (typeof eventType !== "string" || !(EVENTS as readonly string[]).includes(eventType)) return trackResponse(null)
  return trackResponse(await collectFrom(req, eventType as CollectKind, body, createAdminClient()))
}
