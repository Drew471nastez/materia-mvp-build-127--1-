import { NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { isTimeZone } from "@/lib/orders/time-zone"
import { websitePerformanceFor } from "@/lib/website-builder/site-performance-read"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * The bar above the website's cover, for another period. The page renders
 * the first period itself; this answers when the creator picks a new one.
 *
 *   ?range=<preset> | ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD, &tz=<zone>
 *
 * The creator comes from the session, never from the request, and the live
 * website from the creator.
 */
export async function GET(request: Request) {
  /* The owner, or a team member with Website working in the store (lib/team/website). */
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const admin = createAdminClient()
  const supabase = site.supabase
  const creator = site.creator

  const url = new URL(request.url)
  const tz = url.searchParams.get("tz")
  const answer = await websitePerformanceFor({
    admin,
    user: supabase,
    creatorId: (creator as { id: string }).id,
    params: url.searchParams,
    timeZone: isTimeZone(tz) ? tz : "UTC",
  })
  return NextResponse.json({ answer }, { headers: { "Cache-Control": "private, no-store" } })
}
