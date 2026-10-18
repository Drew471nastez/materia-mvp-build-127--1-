import "server-only"

import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

import { editorContent, type FileRow } from "@/lib/website-builder/theme-file-drafts"
import { restoreSnapshot, type RestoreOutcome } from "@/lib/website-builder/restore-snapshot"

/**
 * ===========================================================================
 *  PROJECT BACKUPS
 * ===========================================================================
 *
 * A backup is the whole editable state of one website at one moment: the
 * theme settings and every page's sections, exactly as the editor would show
 * them — the draft where there is one, otherwise what is live. It is taken
 * after Storelib AI finishes a task, when the site is published, from the
 * Backups page by hand, and as a safety copy just before a restore overwrites
 * the draft.
 *
 * TWO RULES KEEP THE TABLE SMALL WITHOUT LOSING ANYTHING SOMEBODY WOULD WANT.
 *
 *   1. An identical state is not stored twice in a row. Publishing the same
 *      draft three times is one backup, not three: the snapshot is hashed and
 *      compared with the newest row's hash before anything is written.
 *
 *   2. The newest KEEP rows survive and the rest are deleted. Thirty is more
 *      than a week of real work and a fraction of a megabyte per website.
 *
 * The caller has already proved it owns the install. The client it passes in
 * decides the rest: the user's client is bound by RLS, the admin client is
 * used by the publish route which already runs as admin.
 */

export const BACKUPS_TO_KEEP = 30

export type BackupSource = "ai" | "publish" | "manual" | "restore"

export interface BackupSnapshot {
  settings: Record<string, unknown>
  pages: { page_key: string; sections: unknown[] }[]
  /**
   * THE CODE, TOO. Every file written in the code editor (a custom section,
   * an edited theme file), as the editor shows it. A backup used to hold the
   * settings and the pages only, so restoring one brought back sections whose
   * code had since changed or gone. Absent in backups taken before this, and
   * a restore of one of those leaves the code as it is.
   */
  files?: { path: string; content: string }[]
}

export interface BackupRow {
  id: string
  install_id: string
  label: string
  source: BackupSource
  created_at: string
}

/** Labels come from prompts and page names; a wall of text is not a label. */
export function backupLabel(raw: string, fallback = "Backup"): string {
  const oneLine = raw.replace(/\s+/g, " ").trim()
  if (!oneLine) return fallback
  return oneLine.length > 90 ? `${oneLine.slice(0, 89).trimEnd()}…` : oneLine
}

/**
 * The state the editor would show right now, which is what somebody means
 * when they say "back this up".
 */
export async function readSnapshot(db: SupabaseClient, installId: string): Promise<BackupSnapshot> {
  const [{ data: settingsRow }, { data: pageRows }] = await Promise.all([
    db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle(),
    db.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId),
  ])

  const settings = (settingsRow?.draft_settings ?? settingsRow?.settings ?? {}) as Record<string, unknown>
  const pages = (pageRows ?? [])
    .map((p) => ({
      page_key: String(p.page_key),
      sections: (p.draft_sections ?? p.sections ?? []) as unknown[],
    }))
    // Stable order, so the same state always hashes the same.
    .sort((a, b) => a.page_key.localeCompare(b.page_key))

  /* Before the code files' table exists, a backup is what it always was. */
  let files: { path: string; content: string }[] | undefined
  try {
    const { data, error } = await db.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId)
    if (!error) {
      files = ((data ?? []) as FileRow[])
        .map((f) => ({ path: String(f.path), content: editorContent(f) }))
        .filter((f) => f.content !== "")
        .sort((a, b) => a.path.localeCompare(b.path))
    }
  } catch {
    files = undefined
  }

  return files && files.length ? { settings, pages, files } : { settings, pages }
}

export function fingerprintOf(snapshot: BackupSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")
}

export async function takeBackup(
  db: SupabaseClient,
  installId: string,
  opts: { label: string; source: BackupSource; verify?: boolean; keep?: string },
): Promise<{ backup: BackupRow | null; skipped: boolean; error: string | null }> {
  const snapshot = await readSnapshot(db, installId)
  const fingerprint = fingerprintOf(snapshot)

  const { data: latest } = await db
    .from("store_theme_backups")
    .select("id, install_id, label, source, created_at, fingerprint")
    .eq("install_id", installId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latest && latest.fingerprint === fingerprint) {
    // Nothing has changed since the last one. Saying so is more useful than
    // a second row that says the same thing.
    const { fingerprint: _f, ...row } = latest
    void _f
    return { backup: row as BackupRow, skipped: true, error: null }
  }

  const { data, error } = await db
    .from("store_theme_backups")
    .insert({
      install_id: installId,
      label: backupLabel(opts.label),
      source: opts.source,
      snapshot,
      fingerprint,
    })
    .select("id, install_id, label, source, created_at")
    .single()

  if (error) return { backup: null, skipped: false, error: error.message }

  /*
    A restore's safety copy is read back before anything is overwritten: the
    row must be there and hold this exact state. A copy that is not provably
    there is no copy, and the restore does not go ahead without one.
  */
  if (opts.verify) {
    const { data: check, error: checkErr } = await db
      .from("store_theme_backups")
      .select("id, fingerprint")
      .eq("id", (data as BackupRow).id)
      .maybeSingle()
    if (checkErr || !check || check.fingerprint !== fingerprint) {
      return { backup: null, skipped: false, error: "The backup of your current draft could not be confirmed, so nothing was changed. Try again." }
    }
  }

  await pruneBackups(db, installId, opts.keep)
  return { backup: data as BackupRow, skipped: false, error: null }
}

/** Keep the newest BACKUPS_TO_KEEP; delete the rest. */
export async function pruneBackups(db: SupabaseClient, installId: string, keep?: string): Promise<void> {
  const { data } = await db
    .from("store_theme_backups")
    .select("id")
    .eq("install_id", installId)
    .order("created_at", { ascending: false })
    .range(BACKUPS_TO_KEEP, BACKUPS_TO_KEEP + 200)
  /* The backup being restored stays in the list it was picked from. */
  const stale = (data ?? []).map((r) => r.id).filter((id) => id !== keep)
  if (stale.length === 0) return
  await db.from("store_theme_backups").delete().in("id", stale)
}

/**
 * Put a snapshot back as the DRAFT. Nothing goes live: publishing is a
 * separate, deliberate step, and a restore that changed a public site by
 * itself would be a restore somebody could not preview first.
 *
 * Pages that exist now but were not in the snapshot are left alone, and so
 * are code files written since. Deleting somebody's page because an older
 * copy did not know about it is the kind of "restore" that loses work.
 *
 * The code goes back as a draft like everything else, and each file restored
 * is a version of its own in that file's history (kind "restore"), so a
 * restore is itself something the code editor can step back from.
 *
 * All or nothing, in a few bulk writes, with every row it wrote put back on
 * a failure: ./restore-snapshot.ts says how and why.
 */
export async function applySnapshot(
  db: SupabaseClient,
  installId: string,
  snapshot: BackupSnapshot,
  opts: { deadlineAt?: number } = {},
): Promise<RestoreOutcome> {
  return restoreSnapshot(db, installId, snapshot, opts)
}
