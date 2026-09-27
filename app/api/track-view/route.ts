// app/api/track-view/route.ts
import type { NextRequest } from "next/server"
import { collectFrom, readBody, trackResponse } from "@/lib/analytics/collect-route"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * ONE PAGE VIEW: a page of the creator page, the OnePage or a website was
 * opened, by a full load or a route change inside the page
 * (components/analytics/track-view). Everything about it, which property it
 * is, whether it is a person, a repeat or the creator themselves, is decided
 * in lib/analytics/collect.ts; docs/analytics/events.md is the contract.
 *
 * Always 204, whatever happened, so a robot learns nothing and a page waits
 * for nothing.
 */
export async function POST(req: NextRequest) {
  return trackResponse(await collectFrom(req, "view", await readBody(req), createAdminClient()))
}
