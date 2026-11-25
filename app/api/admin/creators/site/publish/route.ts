import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { UUID_RE } from "@/lib/admin/platform-metrics"
import { publishBuiltSite, undoBuiltSite } from "@/lib/admin/creator-site/publish"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * ===========================================================================
 *  POST /api/admin/creators/site/publish   { creatorId, installId, action: "publish" | "undo" }
 * ===========================================================================
 * The owner cannot sign in as a creator, so a website Build website made is
 * put live from the admin console (lib/admin/creator-site/publish.ts), with
 * the same steps and cache invalidation as the creator's own Publish.
 *
 *   publish   only a website in this creator's library that Build website
 *             made; the one live before stays in their library, unpublished
 *   undo      the website that was live before it, live again; the built
 *             one stays in the library
 *
 * Both are in the audit log, with the website before and after.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as { creatorId?: unknown; installId?: unknown; action?: unknown } | null
  const creatorId = typeof body?.creatorId === "string" ? body.creatorId : ""
  const installId = typeof body?.installId === "string" ? body.installId : ""
  const action = body?.action === "undo" ? "undo" : body?.action === "publish" ? "publish" : null
  if (!UUID_RE.test(creatorId) || !UUID_RE.test(installId)) return NextResponse.json({ error: "No website has this id." }, { status: 400, headers: NO_STORE })
  if (!action) return NextResponse.json({ error: "Publish or undo?" }, { status: 400, headers: NO_STORE })

  const admin = createAdminClient()
  try {
    if (action === "publish") {
      const done = await publishBuiltSite(admin, creatorId, installId)
      if (done.ok === false) {
        const f = done as { status: number; error: string; code?: string }
        return NextResponse.json(f.code ? { error: f.error, code: f.code } : { error: f.error }, { status: f.status, headers: NO_STORE })
      }
      const recorded = await recordAdminAction(admin, { action: "creator_site_published", targetType: "creator", targetId: creatorId, detail: { install_id: installId, previous_install: done.previous } })
      return NextResponse.json({ ok: true, status: "published", previous: done.previous, recorded, message: "Their live website is now this one. The old one stays in their library." }, { headers: NO_STORE })
    }
    const undone = await undoBuiltSite(admin, creatorId, installId)
    if (undone.ok === false) {
      const f = undone as { status: number; error: string; code?: string }
      return NextResponse.json(f.code ? { error: f.error, code: f.code } : { error: f.error }, { status: f.status, headers: NO_STORE })
    }
    const recorded = await recordAdminAction(admin, { action: "creator_site_publish_undone", targetType: "creator", targetId: creatorId, detail: { install_id: installId, restored_install: undone.restored } })
    return NextResponse.json({ ok: true, restored: undone.restored, recorded, message: "Their earlier website is live again. The built one stays in their library." }, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("creator site publish", e, "Could not publish. Try again.")
  }
}
