import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/physical/auth"
import { resolveStorelibBlock } from "@/lib/onepage/storelib-blocks-server"
import { liveDataDeps, withDataBlocks } from "@/lib/onepage/data-blocks-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The editor's preview of a shelf, a posts row or a follower count
 * (components/onepage/storelib-blocks.tsx): the same fill the live page gets
 * on the server (lib/onepage/storelib-blocks-server), for a block that is
 * still a draft. Public, because the preview is the live page's component;
 * it answers only what any visitor of the creator's pages can already see
 * (published products, public communities, public posts), for at most eight
 * blocks, and is limited per address.
 */
const TYPES = new Set(["storelib_shelf", "social_posts", "followers"])
/*
  Round AR: the app blocks whose fill is public too (lib/onepage/data-blocks-server):
  the store's published reviews, a feed's posts, Bandsintown's dates, a
  published product's name and price for Paid access (never its locked
  part), and whether tips can be taken. Not a tracked stat or a store code:
  those are the creator's own and are filled only on their live page.
*/
const APP_PROVIDERS = new Set(["reviews", "rss", "events", "paid", "tips"])
const isAppAsked = (b: { type?: string; data?: { provider?: unknown } }) => b.type === "app" && APP_PROVIDERS.has(String(b.data?.provider ?? ""))

export async function POST(request: Request) {
  const limited = await rateLimit({ bucket: "onepage-blocks-live", subjects: [addressSubject(request)], windows: [{ limit: 60, seconds: 60 }, { limit: 600, seconds: 3600 }] })
  if (limited) return limited
  let body: { seller_id?: unknown; blocks?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 })
  }
  const sellerId = body?.seller_id
  if (!isUuid(sellerId) || !Array.isArray(body.blocks)) return NextResponse.json({ error: "Bad request." }, { status: 400 })
  const asked = body.blocks
    .filter((b): b is { id: string; type: string; data: Record<string, unknown> } => !!b && typeof b === "object" && (TYPES.has((b as { type?: string }).type ?? "") || isAppAsked(b as { type?: string; data?: { provider?: unknown } })) && typeof (b as { id?: unknown }).id === "string")
    .slice(0, 8)
  const db = createAdminClient()
  const blocks = await Promise.all(
    asked.map(async (b) => {
      try {
        const given = { id: b.id, type: b.type, data: b.data && typeof b.data === "object" ? b.data : {} }
        if (b.type === "app") {
          /* A stat's tracked source is never asked here: only the public fills (APP_PROVIDERS), and every locked part taken out. */
          const [filled] = await withDataBlocks(db, await liveDataDeps(db), sellerId, [given])
          return { id: b.id, data: (filled as { data?: Record<string, unknown> }).data ?? null }
        }
        const out = await resolveStorelibBlock(db, sellerId, given)
        return { id: b.id, data: out.data ?? null }
      } catch {
        return { id: b.id, data: null }
      }
    }),
  )
  return NextResponse.json({ blocks }, { headers: { "cache-control": "no-store" } })
}
