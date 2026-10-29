import { websiteInstallCaller } from "@/lib/team/website"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { listReleases } from "@/lib/website-builder/site-releases-server"

type Params = { params: Promise<{ installId: string }> }

/**
 * GET /api/website-builder/themes/[installId]/releases
 *
 * The website's published versions, newest first, for Backups & Versions
 * (lib/website-builder/site-releases-server.ts listReleases). The same
 * ownership check Publish makes: signed in, a creator, and this install is
 * theirs. The tables are server only, so they are read with the admin
 * client once that is proved. `{ available: false }` until SQL parts 180 and
 * 186 have run, and the list hides itself.
 */
export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  /* The owner, or a team member with Website working in the store (lib/team/website): the site in the URL must be the store's. */
  const site = await websiteInstallCaller<{ id: string; status: string }>(installId, "id, status")
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const { user, install } = site

  const limited = await rateLimit({ bucket: "site-releases-read", subjects: [`user:${user.id}`], windows: LIMITS.siteRead })
  if (limited) return limited

  try {
    return NextResponse.json(await listReleases(createAdminClient(), installId, install.status === "published"))
  } catch (e) {
    console.error("[releases] the list could not be read:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Could not load published versions. Try again." }, { status: 500 })
  }
}
