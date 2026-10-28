import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { liveFollowerCount } from "@/lib/onepage/storelib-blocks-server"
import { REFRESHABLE_NETWORKS, isFollowerNetwork } from "@/lib/onepage/storelib-blocks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The follower block's Refresh (components/onepage/storelib-blocks.tsx): one
 * network's own count, read now. Bluesky answers anyone; YouTube needs the
 * deployment's YOUTUBE_API_KEY, and says so when it has none. Every other
 * network has no public count to read, and is typed by the creator.
 * The signed in owner only, a few a minute.
 */
export async function POST(request: Request) {
  /* The OnePage's own area (round 40): the owner as before, or a team member with OnePage for the store's page. */
  const c = await shopCaller("onepage")
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "onepage-followers", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 60 }, { limit: 200, seconds: 86400 }] })
  if (limited) return limited
  const body = await readBody(request)
  const network = body?.network
  const handle = typeof body?.handle === "string" ? body.handle.trim().slice(0, 200) : ""
  if (!isFollowerNetwork(network) || !handle) return physicalJson({ error: "Add the account first." }, 400)
  if (!REFRESHABLE_NETWORKS.includes(network)) return physicalJson({ error: "This network has no public count. Type it in." }, 400)
  if (network === "youtube" && !process.env.YOUTUBE_API_KEY) return physicalJson({ error: "YouTube counts need a YouTube API key on Storelib. Type it in for now." }, 409)
  const count = await liveFollowerCount(network, handle, 0)
  if (count === null) return physicalJson({ error: network === "bluesky" ? "Bluesky does not know that handle." : "YouTube does not know that channel, or its count is hidden." }, 404)
  return physicalJson({ count, refreshed_at: new Date().toISOString() })
}
