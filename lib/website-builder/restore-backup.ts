import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { applySnapshot, takeBackup, type BackupSnapshot } from "@/lib/website-builder/backups"
import { addedSince, askedToRemove, removeAdded, type AddedItem } from "@/lib/website-builder/added-since"

/**
 * ===========================================================================
 *  ONE RESTORE, FOR THE BACKUPS ROUTE AND FOR "UNDO THIS AI JOB" (round M)
 * ===========================================================================
 * The steps the restore route always took, now shared with the AI job's
 * undo so both do exactly the same thing:
 *
 *   1. the backup read by its id AND this install;
 *   2. a safety copy of the draft as it is now, read back to prove it is
 *      there (so the restore itself can be undone from Backups);
 *   3. the backup put back as the draft, all of it or none of it
 *      (./restore-snapshot.ts);
 *   4. NEW: what was added after the backup (./added-since.ts): pages and
 *      ai_ files the AI made and never published are removed, so the site
 *      really is as it was; anything else added since is reported as kept,
 *      and removed only when the person named it (`removeAdded`).
 *
 * `db` is the caller's own client (RLS), as before. `evidence` reads the AI
 * job tables and deletes the added rows: the service role client, used only
 * after the caller proved this install is theirs, filtered by install id.
 */

export type RestoreBackupResult =
  | {
      ok: true
      restored: { id: string; label: string; created_at: string }
      changed: { files: number; pages: number; settings: boolean }
      added: { removed: AddedItem[]; kept: AddedItem[] }
    }
  | { ok: false; status: number; error: string; rolledBack?: boolean }

export async function restoreBackup(
  db: SupabaseClient,
  evidence: SupabaseClient,
  installId: string,
  backupId: string,
  opts: { deadlineAt?: number; removeAdded?: unknown; safetyLabel?: (label: string) => string } = {},
): Promise<RestoreBackupResult> {
  const { data: backup, error: readErr } = await db.from("store_theme_backups").select("id, label, snapshot, created_at").eq("id", backupId).eq("install_id", installId).maybeSingle()
  /* The database's own words go to the log, never to the browser. */
  if (readErr) {
    console.error("[backups/restore] failed", { code: readErr.code })
    return { ok: false, status: 500, error: "Could not load that. Try again." }
  }
  if (!backup) return { ok: false, status: 404, error: "Backup not found" }
  const snapshot = backup.snapshot as BackupSnapshot
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.pages)) return { ok: false, status: 422, error: "This backup cannot be read" }

  /* What was added since, read BEFORE the restore writes (the restore inserts pages the backup has and the draft lacks: those are the backup's, not added). */
  const added = await addedSince(evidence, installId, { created_at: String(backup.created_at), snapshot }).catch(() => ({ remove: [], keep: [] }))

  const safety = await takeBackup(db, installId, {
    label: opts.safetyLabel ? opts.safetyLabel(String(backup.label)) : `Before restoring "${backup.label}"`,
    source: "restore",
    verify: true,
    keep: backup.id,
  })
  if (safety.error) {
    console.error("[backups/restore] safety copy failed", { installId })
    return { ok: false, status: 500, error: /could not be confirmed/.test(safety.error) ? safety.error : "The backup of your current draft could not be saved, so nothing was changed. Try again." }
  }

  const applied = await applySnapshot(db, installId, snapshot, { deadlineAt: opts.deadlineAt })
  if (applied.ok === false) {
    const failed = applied as { error: string; rolledBack: boolean }
    console.error("[backups/restore] not applied", { installId, rolledBack: failed.rolledBack })
    return { ok: false, status: 500, error: failed.error, rolledBack: failed.rolledBack }
  }

  /* The AI's additions go; what the person asked to go as well, too. A failure here leaves them in place and says so: the restore itself stands. */
  const asked = askedToRemove(added, opts.removeAdded)
  const gone = await removeAdded(evidence, installId, [...added.remove, ...asked]).catch(() => ({ removed: [] as AddedItem[], failed: [...added.remove, ...asked] }))
  const removedKeys = new Set(gone.removed.map((i) => `${i.kind}:${i.key}`))
  const kept = [...added.remove, ...added.keep].filter((i) => !removedKeys.has(`${i.kind}:${i.key}`))
  if (gone.failed.length) console.error("[backups/restore] some added pages or files could not be removed", { installId, count: gone.failed.length })

  return {
    ok: true,
    restored: { id: String(backup.id), label: String(backup.label), created_at: String(backup.created_at) },
    changed: { files: applied.files, pages: applied.pages, settings: applied.settings },
    added: { removed: gone.removed, kept },
  }
}
