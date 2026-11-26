import { websiteInstallCaller } from "@/lib/team/website"
import { NextResponse } from "next/server"
import { fullSnapshot, readSnapshot, type BackupSnapshot } from "@/lib/website-builder/backups"
import { previewBackup } from "@/lib/website-builder/backup-preview"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { addedSince } from "@/lib/website-builder/added-since"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string; backupId: string }> }

/**
 * GET /api/website-builder/themes/[installId]/backups/[backupId]
 *
 * PREVIEW, NOTHING WRITTEN (round 51): what restoring this backup would
 * change in the draft, page by page (lib/website-builder/backup-preview.ts),
 * and (round M) `added`: pages and files made after it, split into what the
 * restore removes and what it keeps unless asked.
 * The owner, or a team member with Website working in the store, as every
 * backup route; the backup is read by its id AND this install, so one
 * website's backup is never read through another. The same read limit as
 * the list.
 */
export async function GET(_req: Request, { params }: Params) {
  const { installId, backupId } = await params
  const c = await websiteInstallCaller(installId)
  if (c.error !== null) return NextResponse.json({ error: c.error }, { status: c.status })

  const limited = await rateLimit({ bucket: "site-backups-read", subjects: [`user:${c.userId}`], windows: LIMITS.siteRead })
  if (limited) return limited

  const { data: backup, error } = await c.supabase
    .from("store_theme_backups")
    .select("id, label, source, created_at, snapshot")
    .eq("id", backupId)
    .eq("install_id", installId)
    .maybeSingle()
  if (error) {
    console.error("[backups/preview] failed", { code: error.code })
    return NextResponse.json({ error: "Could not load that. Try again." }, { status: 500 })
  }
  if (!backup) return NextResponse.json({ error: "Backup not found" }, { status: 404 })

  const stored = backup.snapshot as BackupSnapshot
  if (!stored || typeof stored !== "object" || !Array.isArray(stored.pages)) {
    return NextResponse.json({ error: "This backup cannot be read" }, { status: 422 })
  }
  /* Round 66: a light backup's named files, read back from the blobs (lib/website-builder/backups.ts fullSnapshot). */
  const snapshot = await fullSnapshot(stored).catch(() => null)
  if (!snapshot) return NextResponse.json({ error: "Could not load that. Try again." }, { status: 503 })
  const current = await readSnapshot(c.supabase, installId)
  /* Round M: what was added after the backup, and which of it a restore removes (the AI's, never published) or keeps (lib/website-builder/added-since.ts). */
  const added = await addedSince(createAdminClient(), installId, { created_at: String(backup.created_at), snapshot }).catch(() => ({ remove: [], keep: [] }))
  return NextResponse.json(
    { backup: { id: backup.id, label: backup.label, source: backup.source, created_at: backup.created_at }, preview: previewBackup(snapshot, current), added },
    { headers: { "Cache-Control": "private, no-store" } },
  )
}
