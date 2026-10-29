import { websiteInstallCaller } from "@/lib/team/website"
import { recordTeamAction } from "@/lib/team/areas"
import { NextResponse } from "next/server"
import { applySnapshot, takeBackup, type BackupSnapshot } from "@/lib/website-builder/backups"

type Params = { params: Promise<{ installId: string; backupId: string }> }

/*
  A restore of an imported theme writes hundreds of files. It has the whole
  of what the platform allows, and stops itself well before that: a restore
  the platform cut off would be one nobody could undo cleanly.
*/
export const maxDuration = 300
const STOP_AFTER_MS = 240_000

/* The owner, or a team member with Website working in the store (lib/team/website): the site in the URL must be the store's. */
async function ownInstall(installId: string) {
  const c = await websiteInstallCaller(installId)
  if (c.error !== null) return { error: c.error, status: c.status, supabase: null, who: null }
  return { error: null, status: 200, supabase: c.supabase, who: c }
}

/**
 * POST /api/website-builder/themes/[installId]/backups/[backupId]/restore
 *
 * Puts the backup back as the DRAFT, after taking a safety copy of the draft
 * it is about to replace. So a restore is never a one-way door: the state
 * you had a moment ago is the newest row in the same list. Nothing goes
 * live until the creator publishes.
 */
export async function POST(_req: Request, { params }: Params) {
  const startedAt = Date.now()
  const { installId, backupId } = await params
  const { error, status, supabase, who } = await ownInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  // Scoped to the install as well as the id, so a backup id from one website
  // cannot be restored into another even by its owner.
  const { data: backup, error: readErr } = await supabase
    .from("store_theme_backups")
    .select("id, label, snapshot, created_at")
    .eq("id", backupId)
    .eq("install_id", installId)
    .maybeSingle()

  /* The database's own words go to the log, never to the browser. */
  if (readErr) {
    console.error("[backups/restore] failed", { code: readErr.code })
    return NextResponse.json({ error: "Could not load that. Try again." }, { status: 500 })
  }
  if (!backup) return NextResponse.json({ error: "Backup not found" }, { status: 404 })

  const snapshot = backup.snapshot as BackupSnapshot
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.pages)) {
    return NextResponse.json({ error: "This backup cannot be read" }, { status: 422 })
  }

  /*
    The safety copy first, read back to prove it is there (verify), and the
    backup being restored kept out of the pruning that copy may cause.
  */
  const safety = await takeBackup(supabase, installId, {
    label: `Before restoring "${backup.label}"`,
    source: "restore",
    verify: true,
    keep: backup.id,
  })
  if (safety.error) {
    console.error("[backups/restore] safety copy failed", { installId })
    return NextResponse.json({ error: /could not be confirmed/.test(safety.error) ? safety.error : "The backup of your current draft could not be saved, so nothing was changed. Try again." }, { status: 500 })
  }

  /* All of it or none of it (lib/website-builder/restore-snapshot.ts). */
  const applied = await applySnapshot(supabase, installId, snapshot, { deadlineAt: startedAt + STOP_AFTER_MS })
  if (applied.ok === false) {
    const failed = applied as { error: string; rolledBack: boolean }
    console.error("[backups/restore] not applied", { installId, rolledBack: failed.rolledBack })
    return NextResponse.json({ error: failed.error, rolledBack: failed.rolledBack }, { status: 500 })
  }

  /* A team member's restore is on the record with their name (lib/team/areas). */
  if (who) await recordTeamAction(who, who.userId, "website", "website_restored", { install_id: installId, backup_id: backup.id })

  return NextResponse.json({
    ok: true,
    restored: { id: backup.id, label: backup.label, created_at: backup.created_at },
    changed: { files: applied.files, pages: applied.pages, settings: applied.settings },
  })
}
