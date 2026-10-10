/**
 * ===========================================================================
 *  GET /api/website-builder/themes/[installId]/security
 * ===========================================================================
 * What the publish panel shows under "Security": the problems in the draft
 * that is about to go live (lib/website-builder/security-scan.ts). The DRAFT
 * columns, draft where there is one and live otherwise, because the panel is
 * asking about what Publish will put up, not about what is up now.
 *
 *   200 { issues: [{ kind, page, sectionId, message }], truncated, checked_at }
 *
 * Read only. Signed in, and only for an install that is this creator's, the
 * same as every other route beside it.
 */
import { NextResponse } from "next/server"
import { readTwice, UNREACHABLE } from "@/lib/website-builder/owned-install"
import { createClient } from "@/lib/supabase/server"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { scanSiteSecurity, SECURITY_ISSUE_LIMIT } from "@/lib/website-builder/security-scan"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator, error: creatorReadErr } = await readTwice(() => supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle())
  if (creatorReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  /** RLS decides as well: a theme somebody else owns reads as absent. */
  const { data: install, error: installReadErr } = await readTwice(() => supabase
    .from("store_theme_installs")
    .select("id")
    .eq("id", installId)
    .eq("creator_id", (creator as { id: string }).id)
    .maybeSingle())
  if (installReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })
  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  /* It reads every page of the site, so it is a press rather than a poll: LIMITS.siteAction. */
  const limited = await rateLimit({
    bucket: "site-security-scan",
    subjects: [`user:${user.id}`],
    windows: LIMITS.siteAction,
    message: "Checked a lot in a short time. Wait a minute and check again.",
  })
  if (limited) return limited

  const [{ data: settingsRow, error: settingsErr }, { data: pageRows, error: pagesErr }] = await Promise.all([
    supabase.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle(),
    supabase.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId),
  ])
  /* A check that could not read the site has found nothing, and must not say it found nothing wrong. */
  if (settingsErr || pagesErr) return NextResponse.json({ error: "Could not check the site just now. Try again." }, { status: 500 })

  const found = scanSiteSecurity(
    {
      settings: (settingsRow?.draft_settings ?? settingsRow?.settings ?? {}) as Record<string, unknown>,
      pages: ((pageRows ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]).map((p) => ({
        page_key: String(p.page_key),
        sections: p.draft_sections ?? p.sections ?? [],
      })),
    },
    SECURITY_ISSUE_LIMIT + 1,
  )

  return NextResponse.json({
    issues: found.slice(0, SECURITY_ISSUE_LIMIT),
    truncated: found.length > SECURITY_ISSUE_LIMIT,
    checked_at: new Date().toISOString(),
  })
}
