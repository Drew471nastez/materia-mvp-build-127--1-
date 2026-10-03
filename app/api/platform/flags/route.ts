import { NextResponse } from "next/server"

import { communitiesEnabled } from "@/lib/communities/flag"

/**
 * GET /api/platform/flags
 *
 * The platform switches a client component needs, for everybody: they decide
 * whether a nav item or a pill is drawn, never who may read what (every
 * community route checks the switch again on the server). Cached at the edge
 * for 15 seconds, so a switch pressed in /admin shows everywhere within about
 * half a minute.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const communities = await communitiesEnabled()
  return NextResponse.json(
    { communities },
    { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } },
  )
}
