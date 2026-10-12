import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readBody } from "@/lib/analytics/collect-route"
import { recordGaSeen } from "@/lib/store/tracking-server"
import { GA_ID } from "@/lib/store/ga"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GOOGLE TOOK A HIT FROM A STORE'S PAGE. Sent by the store's own Google
 * Analytics tag (lib/store/ga.ts gaSeenJs) at most once a tab, the moment
 * the browser has sent Google a /g/collect request with the store's
 * measurement ID; Settings › Integrations shows it as "Receiving data" with
 * the time. Only the creator and the ID come, nothing about the visitor,
 * and it is kept only when the ID is the one the store saved, at most once
 * a minute a store, whatever is sent (recordGaSeen asks the database at most
 * once a minute a store, so a flood costs one read a minute). Public by design: a visitor has no
 * session. Always 204, so nothing is learned from the answer.
 */
export async function POST(req: NextRequest) {
  const done = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })
  const body = (await readBody(req)) as { creatorId?: unknown; id?: unknown } | null
  if (!body || typeof body.creatorId !== "string" || !UUID.test(body.creatorId) || typeof body.id !== "string" || !GA_ID.test(body.id)) return done
  await recordGaSeen(createAdminClient(), body.creatorId, body.id, "at")
  return done
}
