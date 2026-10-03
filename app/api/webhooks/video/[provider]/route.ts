import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { applyVideoWebhook } from "@/lib/communities/server/videos"
import { adapterFor, isProviderName } from "@/lib/video/provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "no-store" }
const MAX_BODY = 1024 * 1024

/**
 * POST /api/webhooks/video/<mux | cloudflare | bunny>
 *
 * A video service saying a video is processing, ready or failed. The
 * signature is checked with that service's own secret (lib/video/<name>.ts)
 * before anything is read; a service that is not connected answers 404.
 * Each event is applied once (media_video_events): a second delivery of
 * the same event answers 200 and changes nothing. A write that fails
 * answers 500 so the service sends it again.
 *
 * While communities are switched off this answers 404 like every
 * community route; a video that finished meanwhile is picked up by the
 * video_poll job when they are back on.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { provider } = await params
  if (!isProviderName(provider) || provider === "storage") return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const adapter = adapterFor(provider)
  if (!adapter.connected()) return NextResponse.json({ error: "not_connected" }, { status: 404, headers: noStore })

  const raw = await request.text()
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413, headers: noStore })
  const updates = await adapter.webhook(raw, request.headers, new URL(request.url)).catch((e) => {
    console.error(`[video webhook] ${provider}: ${e instanceof Error ? e.message : "unknown"}`)
    return null
  })
  if (updates === "bad_signature") return NextResponse.json({ error: "bad_signature" }, { status: 401, headers: noStore })
  if (updates === null) return NextResponse.json({ error: "failed" }, { status: 500, headers: noStore })
  try {
    const result = await applyVideoWebhook(admin(), provider, updates)
    return NextResponse.json({ ok: true, ...result }, { headers: noStore })
  } catch (e) {
    console.error(`[video webhook] ${provider}: ${e instanceof Error ? e.message : "unknown"}`)
    return NextResponse.json({ error: "failed" }, { status: 500, headers: noStore })
  }
}
