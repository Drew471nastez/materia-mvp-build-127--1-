import { websiteInstallCaller } from "@/lib/team/website"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { readPerformance } from "@/lib/website-builder/web-performance-read"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Params = { params: Promise<{ installId: string }> }

/**
 * GET /api/website-builder/themes/[installId]/performance?range=24h|7d|30d|90d
 *
 * Website settings › Performance: how fast the website was for its
 * visitors, and the latest lab tests (lib/website-builder/web-performance-read.ts).
 * The same ownership check Publish makes: signed in, a creator, and this
 * install is theirs; then everything is read with the user's own client, so
 * the tables' policies (part 210) decide what comes back. The service role
 * is only handed to the reader to roll up a finished day of this install.
 *
 * `{ available: false }` until part 210 has run.
 */
export async function GET(request: Request, { params }: Params) {
  const { installId } = await params
  /* The owner, or a team member with Website working in the store (lib/team/website): the site in the URL must be the store's. */
  const site = await websiteInstallCaller<{ id: string; status: string }>(installId, "id, status")
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const { supabase, user, install } = site

  const limited = await rateLimit({ bucket: "site-performance-read", subjects: [`user:${user.id}`], windows: LIMITS.siteRead })
  if (limited) return limited

  try {
    const range = new URL(request.url).searchParams.get("range")
    const answer = await readPerformance({ user: supabase, admin: createAdminClient(), installId: install.id, range })
    return NextResponse.json({ ...answer, live: install.status === "published" }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (e) {
    console.error("[performance] not read:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Could not load visitor speed. Try again." }, { status: 500 })
  }
}
