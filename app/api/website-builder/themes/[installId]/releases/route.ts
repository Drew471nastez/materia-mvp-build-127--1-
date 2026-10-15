import { NextResponse } from "next/server"
import { readTwice, UNREACHABLE } from "@/lib/website-builder/owned-install"
import { createClient } from "@/lib/supabase/server"
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator, error: creatorReadErr } = await readTwice(() => supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle())
  if (creatorReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: install, error: installReadErr } = await readTwice(() => supabase
    .from("store_theme_installs")
    .select("id, status")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle())
  if (installReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })
  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  const limited = await rateLimit({ bucket: "site-releases-read", subjects: [`user:${user.id}`], windows: LIMITS.siteRead })
  if (limited) return limited

  try {
    return NextResponse.json(await listReleases(createAdminClient(), installId, install.status === "published"))
  } catch (e) {
    console.error("[releases] the list could not be read:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Could not load published versions. Try again." }, { status: 500 })
  }
}
