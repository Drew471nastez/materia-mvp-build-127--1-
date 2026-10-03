import { NextResponse } from "next/server"
import { addressSubject, rateLimit, LIMITS } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { exploreCommunities } from "@/lib/communities/server/explore"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/explore/communities?q=&sort=trending|popular|new&cursor=&limit=
 *
 * The next page of /explore/communities, and the communities quick search
 * shows as you type (lib/nav/quick-search.ts). Public, and only what may be
 * found (lib/communities/server/explore.ts). Answers { items, next }.
 * A 404 communities_off while the switch is off.
 */
export async function GET(request: Request) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const url = new URL(request.url)
  const q = url.searchParams.get("q")
  if (q) {
    const limited = await rateLimit({ bucket: "search", subjects: [addressSubject(request)], windows: LIMITS.search, message: "Too many searches just now. Try again in a moment." })
    if (limited) return limited
  }
  const limit = Number(url.searchParams.get("limit") || "") || undefined
  const page = await exploreCommunities({ q, sort: url.searchParams.get("sort"), cursor: url.searchParams.get("cursor"), limit, category: url.searchParams.get("c") })
  return NextResponse.json({ items: page.items, next: page.next }, { headers: { "Cache-Control": q ? "no-store" : "public, s-maxage=30, stale-while-revalidate=120" } })
}
