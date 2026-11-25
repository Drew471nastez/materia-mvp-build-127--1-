/**
 * ===========================================================================
 *  PUTTING A BACKUP BACK, ALL OF IT OR NONE OF IT
 * ===========================================================================
 * A restore used to walk the backup's files one at a time: for each file an
 * update, maybe an insert, a version row, a read of the file's history and a
 * delete of its oldest versions. Four or five round trips a file. An
 * imported theme has five hundred files, so a restore was two thousand
 * requests in a row, longer than the function was allowed to run. The
 * platform stopped it part way, with the settings and pages already written
 * and half the code not, and the dialog sat on "Restoring" until the request
 * finally gave up.
 *
 * Now:
 *
 *   1. Everything the restore will touch is read ONCE, as it is now: the
 *      settings row, every page row, every code file. That copy is what a
 *      failure puts back.
 *   2. Only what differs is written. A file the backup has exactly as the
 *      editor shows it is left alone, so most restores write a handful.
 *   3. Files go in a few bulk upserts (by count and by size), then pages,
 *      then settings.
 *   4. Anything that fails, or the clock running short, puts every row that
 *      was written back the way it was read in step 1, and rows the restore
 *      created are removed again. The draft is the old draft or the restored
 *      one, never half of each.
 *   5. Each file restored becomes a version in its history, in bulk, after
 *      the restore has succeeded. A version row is a record of the restore,
 *      not part of it, so it never fails one.
 *
 * Pure apart from the client it is handed: tests/restore-backup.test.ts runs
 * it against an in-memory database, five hundred files included.
 */
import { editorContent } from "@/lib/website-builder/theme-file-drafts"
import { fileCols, ownRowsOnly, resolveRefs } from "@/lib/website-builder/theme-file-refs"

type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface RestorableSnapshot {
  settings: Record<string, unknown>
  pages: { page_key: string; sections: unknown[] }[]
  files?: { path: string; content: string }[]
}

export type RestoreOutcome =
  | { ok: true; files: number; pages: number; settings: boolean }
  | { ok: false; error: string; rolledBack: boolean }

/** Rows per bulk write, and bytes per bulk write: a PostgREST body stays well under its limits. */
export const RESTORE_BATCH_ROWS = 100
export const RESTORE_BATCH_BYTES = 2 * 1024 * 1024

/** Postgres says "column does not exist" / "relation does not exist" like this. */
function missing(message: string | undefined): boolean {
  return !!message && /draft_content|does not exist|schema cache/i.test(message)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Rows in groups of at most `rows` and roughly `bytes`, never empty. */
export function batches<T>(list: T[], size: (row: T) => number, rows = RESTORE_BATCH_ROWS, bytes = RESTORE_BATCH_BYTES): T[][] {
  const out: T[][] = []
  let cur: T[] = []
  let used = 0
  for (const row of list) {
    const n = size(row)
    if (cur.length && (cur.length >= rows || used + n > bytes)) {
      out.push(cur)
      cur = []
      used = 0
    }
    cur.push(row)
    used += n
  }
  if (cur.length) out.push(cur)
  return out
}

interface FileBefore {
  path: string
  content: string
  draft_content: string | null
}

export async function restoreSnapshot(
  db: Db,
  installId: string,
  snapshot: RestorableSnapshot,
  opts: { deadlineAt?: number; now?: () => number } = {},
): Promise<RestoreOutcome> {
  const now = opts.now ?? Date.now
  const late = () => typeof opts.deadlineAt === "number" && now() > opts.deadlineAt

  /* ── 1. what is there now ── */
  const settingsRead = await db.from("store_theme_settings").select("id, draft_settings, settings").eq("install_id", installId).maybeSingle()
  if (settingsRead.error) return { ok: false, error: "Could not read your draft. Nothing was changed. Try again.", rolledBack: true }
  const settingsBefore = settingsRead.data as { id: string; draft_settings: unknown; settings: unknown } | null

  const pagesRead = await db.from("store_theme_pages").select("id, page_key, draft_sections, sections").eq("install_id", installId)
  if (pagesRead.error) return { ok: false, error: "Could not read your draft. Nothing was changed. Try again.", rolledBack: true }
  const pagesBefore = new Map<string, { id: string; draft_sections: unknown; sections: unknown }>()
  for (const p of (pagesRead.data ?? []) as { id: string; page_key: string; draft_sections: unknown; sections: unknown }[]) {
    pagesBefore.set(String(p.page_key), p)
  }

  const wanted = (snapshot.files ?? []).filter((f) => f && typeof f.path === "string" && f.path && typeof f.content === "string")
  /* Drafts on files: the normal world. Without the column (before RUN_THEME_FILE_DRAFTS.sql) a file has only what is live. */
  let drafts = true
  const filesBefore = new Map<string, FileBefore>()
  if (wanted.length) {
    let read = await db.from("store_theme_custom_files").select(await fileCols("path, content, draft_content")).eq("install_id", installId)
    if (read.error && missing(read.error.message)) {
      drafts = false
      read = await db.from("store_theme_custom_files").select("path, content").eq("install_id", installId)
    }
    if (read.error) return { ok: false, error: "Could not read your code files. Nothing was changed. Try again.", rolledBack: true }
    /* Round 27: a reference's text, so a rollback writes back what the file said (theme-file-refs.ts). */
    for (const r of await resolveRefs((read.data ?? []) as FileBefore[])) {
      filesBefore.set(String(r.path), { path: String(r.path), content: r.content ?? "", draft_content: drafts ? (r.draft_content ?? null) : null })
    }
  }

  /* ── 2. only what differs ── */
  const fileRows: Record<string, unknown>[] = []
  for (const f of wanted) {
    const before = filesBefore.get(f.path)
    if (before && editorContent(before) === f.content) continue
    if (!drafts) fileRows.push({ install_id: installId, path: f.path, content: f.content })
    else fileRows.push({ install_id: installId, path: f.path, content: before ? before.content : "", draft_content: f.content })
  }
  const pageWrites = snapshot.pages.filter((p) => {
    const before = pagesBefore.get(p.page_key)
    return !before || !same(before.draft_sections ?? before.sections, p.sections)
  })
  const settingsWrite = !settingsBefore || !same(settingsBefore.draft_settings ?? settingsBefore.settings, snapshot.settings)

  /* ── 3. written, and 4. undone on any failure ── */
  const wroteFiles: string[] = []
  const wrotePages: string[] = []
  const insertedPages: string[] = []
  let wroteSettings: "updated" | "inserted" | null = null
  let insertedSettingsId: string | null = null

  const undo = async (): Promise<boolean> => {
    let clean = true
    /* Files: rows that were there get their two halves back; rows this restore made are removed (nothing of theirs was ever live). */
    const back = wroteFiles.map((p) => filesBefore.get(p)).filter((r): r is FileBefore => !!r)
    const made = wroteFiles.filter((p) => !filesBefore.has(p))
    for (const group of batches(back, (r) => r.content.length + (r.draft_content?.length ?? 0))) {
      const rows = group.map((r) => (drafts ? { install_id: installId, path: r.path, content: r.content, draft_content: r.draft_content } : { install_id: installId, path: r.path, content: r.content }))
      const { error } = await db.from("store_theme_custom_files").upsert(rows, { onConflict: "install_id,path" })
      if (error) clean = false
    }
    for (const group of batches(made, () => 1)) {
      let q = db.from("store_theme_custom_files").delete().eq("install_id", installId).in("path", group)
      if (drafts) q = await ownRowsOnly(q.eq("content", ""))
      const { error } = await q
      if (error) clean = false
    }
    for (const key of wrotePages) {
      const before = pagesBefore.get(key)
      if (!before) continue
      const { error } = await db.from("store_theme_pages").update({ draft_sections: before.draft_sections ?? null }).eq("id", before.id)
      if (error) clean = false
    }
    for (const id of insertedPages) {
      const { error } = await db.from("store_theme_pages").delete().eq("id", id).eq("install_id", installId)
      if (error) clean = false
    }
    if (wroteSettings === "updated" && settingsBefore) {
      const { error } = await db.from("store_theme_settings").update({ draft_settings: settingsBefore.draft_settings ?? null }).eq("id", settingsBefore.id)
      if (error) clean = false
    } else if (wroteSettings === "inserted" && insertedSettingsId) {
      const { error } = await db.from("store_theme_settings").delete().eq("id", insertedSettingsId).eq("install_id", installId)
      if (error) clean = false
    }
    return clean
  }

  const fail = async (why: string): Promise<RestoreOutcome> => {
    const clean = await undo()
    return {
      ok: false,
      rolledBack: clean,
      error: clean
        ? `${why} Your draft is as it was before.`
        : `${why} Some of your draft could not be put back by itself. Restore the newest backup, "Before restoring", to get it back.`,
    }
  }

  const TOO_LONG = "The restore took too long and was stopped."
  const NOT_SAVED = "The restore could not be saved."

  try {
    for (const group of batches(fileRows, (r) => String(r.content ?? "").length + String(r.draft_content ?? "").length)) {
      if (late()) return await fail(TOO_LONG)
      const { error } = await db.from("store_theme_custom_files").upsert(group, { onConflict: "install_id,path" })
      if (error) return await fail(NOT_SAVED)
      for (const r of group) wroteFiles.push(String(r.path))
    }

    for (const page of pageWrites) {
      if (late()) return await fail(TOO_LONG)
      const before = pagesBefore.get(page.page_key)
      if (before) {
        const { error } = await db.from("store_theme_pages").update({ draft_sections: page.sections }).eq("id", before.id)
        if (error) return await fail(NOT_SAVED)
        wrotePages.push(page.page_key)
      } else {
        const { data, error } = await db
          .from("store_theme_pages")
          .insert({ install_id: installId, page_key: page.page_key, sections: [], draft_sections: page.sections })
          .select("id")
          .single()
        if (error) return await fail(NOT_SAVED)
        if (data?.id) insertedPages.push(String(data.id))
      }
    }

    if (settingsWrite) {
      if (late()) return await fail(TOO_LONG)
      if (settingsBefore) {
        const { error } = await db.from("store_theme_settings").update({ draft_settings: snapshot.settings }).eq("id", settingsBefore.id)
        if (error) return await fail(NOT_SAVED)
        wroteSettings = "updated"
      } else {
        const { data, error } = await db
          .from("store_theme_settings")
          .insert({ install_id: installId, settings: {}, draft_settings: snapshot.settings })
          .select("id")
          .single()
        if (error) return await fail(NOT_SAVED)
        wroteSettings = "inserted"
        insertedSettingsId = data?.id ? String(data.id) : null
      }
    }
  } catch {
    return await fail(NOT_SAVED)
  }

  /* ── 5. the record: each restored file a version in its history ── */
  if (drafts && fileRows.length) {
    const versions = fileRows.map((r) => ({ install_id: installId, path: r.path, content: r.draft_content, kind: "restore" }))
    for (const group of batches(versions, (r) => String(r.content ?? "").length)) {
      try {
        const { error } = await db.from("store_theme_file_versions").insert(group)
        if (error) break
      } catch {
        break
      }
    }
  }

  return { ok: true, files: fileRows.length, pages: pageWrites.length, settings: settingsWrite }
}
