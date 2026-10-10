import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { loadTracking, saveTrackerId } from "@/lib/store/tracking-server"

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
  return physicalJson({ tracking: out.tracking, ready: true })
}
