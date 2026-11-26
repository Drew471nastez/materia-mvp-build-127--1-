import "server-only"

import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

import { editorContent, type FileRow } from "@/lib/website-builder/theme-file-drafts"
import { restoreSnapshot, type RestoreOutcome } from "@/lib/website-builder/restore-snapshot"
import { BLOBS_TABLE, REF_MIN_CHARS, blobHeld, fileCols, readBlobTexts, refsAdmin, resolveRefs, sha256Text } from "@/lib/website-builder/theme-file-refs"

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
  /**
   * ROUND 66: THE FILES STORELIB ALREADY HOLDS, BY NAME. A file whose text is
   * in theme_file_blobs (every published file is, and every unchanged
   * template file stored as a reference) is kept here as its sha256 only,
   * not its text: a backup of an untouched Materia template was a 31.7 MB
   * row holding 989 files, almost all of them the template's own. The blobs
   * are never deleted (lib/website-builder/site-releases-server.ts, top),
   * and a sha256 names exactly one text, so the file comes back byte for
   * byte. `files` then holds only what Storelib did not have. Read through
   * fullSnapshot, never directly: absent in every backup before this round.
   */
  file_refs?: { path: string; sha256: string }[]
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

  /* Before the code files' table exists, a backup is what it always was. */
  let files: { path: string; content: string | null; draft_content?: string | null }[] | undefined
  try {
    const { data, error } = await db.from("store_theme_custom_files").select(await fileCols("path, content, draft_content")).eq("install_id", installId)
    if (!error) files = await resolveRefs((data ?? []) as unknown as FileRow[])
  } catch {
    files = undefined
  }
  return snapshotOf(settingsRow, (pageRows ?? []) as SnapshotPageRow[], files)
}

type SnapshotPageRow = { page_key: unknown; sections?: unknown; draft_sections?: unknown }

/**
 * The state the editor would show, from rows already read (readSnapshot's
 * own, or the one read a publish shares: lib/website-builder/after-publish.ts).
 * One builder, so the same rows always make the same snapshot and hash.
 */
export function snapshotOf(
  settingsRow: { settings?: unknown; draft_settings?: unknown } | null | undefined,
  pageRows: readonly SnapshotPageRow[],
  fileRows: readonly { path: string; content: string | null; draft_content?: string | null }[] | null | undefined,
): BackupSnapshot {
  const settings = (settingsRow?.draft_settings ?? settingsRow?.settings ?? {}) as Record<string, unknown>
  const pages = pageRows
    .map((p) => ({
      page_key: String(p.page_key),
      sections: (p.draft_sections ?? p.sections ?? []) as unknown[],
    }))
    // Stable order, so the same state always hashes the same.
    .sort((a, b) => a.page_key.localeCompare(b.page_key))
  const files = fileRows
    ? fileRows
        .map((f) => ({ path: String(f.path), content: editorContent({ content: f.content ?? "", draft_content: f.draft_content ?? null }) }))
        .filter((f) => f.content !== "")
        .sort((a, b) => a.path.localeCompare(b.path))
    : undefined
  return files && files.length ? { settings, pages, files } : { settings, pages }
}

const SHA = /^[0-9a-f]{64}$/
const BLOB_ASK = 60

/**
 * The snapshot as it is stored (round 66): each file of REF_MIN_CHARS or
 * more whose text Storelib already holds named by its sha256 in
 * `file_refs`, the rest in `files`. Held means: in `known` (the shas a
 * release just found or wrote), held by this server (it read or wrote them
 * from the table), or found in theme_file_blobs now. Anything that cannot
 * be confirmed stays inline, and when the blobs cannot be asked at all the
 * snapshot is stored whole, as before.
 */
export async function lightSnapshot(snapshot: BackupSnapshot, known: Iterable<string> = []): Promise<BackupSnapshot> {
  const list = snapshot.files ?? []
  if (!list.length || snapshot.file_refs) return snapshot
  const have = new Set(known)
  const shaOf = new Map<string, string>()
  for (const f of list) if (f.content.length >= REF_MIN_CHARS) shaOf.set(f.path, sha256Text(f.content))
  if (!shaOf.size) return snapshot
  const ask = [...new Set(shaOf.values())].filter((s) => !have.has(s) && !blobHeld(s))
  for (const s of shaOf.values()) if (blobHeld(s)) have.add(s)
  if (ask.length) {
    try {
      const db = await refsAdmin()
      for (let i = 0; i < ask.length; i += BLOB_ASK * 4) {
        const answers = await Promise.all(
          Array.from({ length: Math.ceil(Math.min(BLOB_ASK * 4, ask.length - i) / BLOB_ASK) }, (_, k) =>
            db.from(BLOBS_TABLE).select("sha256").in("sha256", ask.slice(i + k * BLOB_ASK, i + (k + 1) * BLOB_ASK)),
          ),
        )
        for (const r of answers as { data: { sha256: string }[] | null; error: unknown }[]) {
          if (r.error) return snapshot
          for (const row of r.data ?? []) have.add(row.sha256)
        }
      }
    } catch {
      return snapshot
    }
  }
  const files: { path: string; content: string }[] = []
  const file_refs: { path: string; sha256: string }[] = []
  for (const f of list) {
    const sha = shaOf.get(f.path)
    if (sha && have.has(sha)) file_refs.push({ path: f.path, sha256: sha })
    else files.push(f)
  }
  if (!file_refs.length) return snapshot
  return { settings: snapshot.settings, pages: snapshot.pages, files, file_refs }
}

/**
 * A stored snapshot with every file's text in `files`, in path order, as
 * readSnapshot makes it: a light backup's named files read back from the
 * blobs, each checked against its sha256. Throws when one cannot be read,
 * so a backup with a file missing is never put back as the backup. A
 * backup without names (every one before round 66) is returned as it is.
 */
export async function fullSnapshot(snapshot: BackupSnapshot): Promise<BackupSnapshot> {
  const refs = Array.isArray(snapshot.file_refs) ? snapshot.file_refs : null
  if (!refs) return snapshot
  for (const r of refs) if (!r || typeof r.path !== "string" || typeof r.sha256 !== "string" || !SHA.test(r.sha256)) throw new Error("backup: a named file cannot be read")
  const texts = refs.length ? await readBlobTexts(await refsAdmin(), refs.map((r) => r.sha256)) : new Map<string, string>()
  const files = [...(snapshot.files ?? []), ...refs.map((r) => ({ path: r.path, content: texts.get(r.sha256)! }))].sort((a, b) => a.path.localeCompare(b.path))
  const { file_refs: _r, ...rest } = snapshot
  void _r
  return files.length ? { ...rest, files } : { settings: rest.settings, pages: rest.pages }
}

export function fingerprintOf(snapshot: BackupSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")
}

export async function takeBackup(
  db: SupabaseClient,
  installId: string,
  opts: { label: string; source: BackupSource; verify?: boolean; keep?: string },
  given: {
    /** The state, already read (a publish's shared read, lib/website-builder/after-publish.ts); else read here. */
    snapshot?: BackupSnapshot
    /** Shas known to be in theme_file_blobs (a release just found or wrote them): not asked again. */
    knownBlobs?: Iterable<string>
  } = {},
): Promise<{ backup: BackupRow | null; skipped: boolean; error: string | null }> {
  const snapshot = given.snapshot ?? (await readSnapshot(db, installId))
  /* Of the whole state, so a light backup and a full one of the same state are the same backup. */
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
      /* Light (round 66): the files Storelib already holds, by name. */
      snapshot: await lightSnapshot(snapshot, given.knownBlobs).catch(() => snapshot),
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
