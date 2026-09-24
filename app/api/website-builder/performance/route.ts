import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

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
