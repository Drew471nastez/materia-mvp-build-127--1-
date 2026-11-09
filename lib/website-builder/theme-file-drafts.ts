/**
 * ===========================================================================
 *  A SECTION FILE IS A DRAFT UNTIL IT IS PUBLISHED, AND EVERY SAVE IS KEPT
 * ===========================================================================
 * A section's SETTINGS already waited for Publish: they sit in
 * `draft_sections` until somebody puts them live. A section's CODE did not.
 * Saving in the code editor changed the live site that second, so there was
 * no way to work on a section without shipping it, and a storefront could be
 * carrying a half-written one the moment it happened to compile.
 *
 * And nothing was kept: one column held the file, a save overwrote it, and a
 * mistake made at eleven could not be undone at noon. Everything else in the
 * builder has history. The files people actually write had none.
 *
 * So a file has two halves — `content`, which is live, and `draft_content`,
 * which is not — promoted by the same publish that promotes draft_sections,
 * and every save writes a row to `store_theme_file_versions`.
 *
 * UNTIL THE MIGRATION HAS RUN, all of it degrades to what it did before:
 * saving writes `content` directly and no version is recorded. That is worse
 * behaviour, not broken behaviour, and it means shipping this does not depend
 * on somebody having opened the SQL editor first. `MISSING` is how each
 * function tells its caller which world it is in.
 */

/** Postgres says "column does not exist" / "relation does not exist" like this. */
function isMissing(message: string | undefined): boolean {
  if (!message) return false
  return /draft_content|store_theme_file_versions|does not exist|schema cache/i.test(message)
}

type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface FileRow {
  path: string
  content: string
  draft_content?: string | null
  updated_at?: string | null
}

/** What the editor should show: the draft when there is one, else what is live. */
export function editorContent(row: Pick<FileRow, "content" | "draft_content">): string {
  return row.draft_content ?? row.content
}

/**
 * Rows to a path -> source map, the one way. Two rules, and both matter:
 *
 *   • the DRAFT wins where there is one, so the editor and the canvas show
 *     what somebody last saved rather than what was last published;
 *   • a row with NOTHING in either half is not a source and is left out.
 *
 * That second rule is what makes a new file safe. A file created in the code
 * editor has a draft and an empty `content` — "nothing published for this
 * path" — and including it as an empty source would shadow the theme's own
 * file with nothing. Creating `sections/hero.storelib` to work on it would
 * blank the shipped hero.
 *
 * The storefront has its own copy of the second rule and NOT the first, on
 * purpose: a visitor sees `content` and only `content`. See `sectionSources`.
 */
export function sourceMap(
  rows: readonly Pick<FileRow, "path" | "content" | "draft_content">[] | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows ?? []) {
    const source = editorContent(row)
    if (typeof source !== "string" || source.trim() === "") continue
    out[row.path] = source
  }
  return out
}

/** True when this file has been saved and not yet published. */
export function hasUnpublishedEdit(row: Pick<FileRow, "content" | "draft_content">): boolean {
  return typeof row.draft_content === "string" && row.draft_content !== row.content
}

/**
 * Save into the draft half, leaving what is live alone. Falls back to writing
 * `content` when the column is not there yet, which is exactly what saving
 * did before this existed.
 */
export async function saveDraft(
  db: Db,
  installId: string,
  path: string,
  content: string,
): Promise<{ ok: true; row: FileRow; drafts: boolean } | { ok: false; error: string }> {
  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  AN UPSERT CANNOT WRITE ONE HALF OF A ROW THAT DOES NOT EXIST YET
   * ═══════════════════════════════════════════════════════════════════════
   * This used to be a single `upsert({ install_id, path, draft_content })`.
   * On a file that already existed that is right: the draft moves, what is
   * live is untouched. On a file that does NOT exist the upsert becomes an
   * INSERT — with no `content` at all — and `content` is `not null`. So
   * creating a section failed outright with
   *
   *     null value in column "content" ... violates not-null constraint
   *
   * and it failed only AFTER the migration had been run, because before it
   * there was no `draft_content` column and every save took the legacy path
   * below, which does write `content`.
   *
   * Update-then-insert instead of an upsert, so each half is written for the
   * case it is actually for. The extra round trip is paid once, when a file
   * is created, and never on a save.
   */
  const updated = await db
    .from("store_theme_custom_files")
    .update({ draft_content: content })
    .eq("install_id", installId)
    .eq("path", path)
    .select()
    .maybeSingle()

  if (!updated.error && updated.data) return { ok: true, row: updated.data as FileRow, drafts: true }

  if (!updated.error) {
    /**
     * No such row. A brand-new file has a draft and NOTHING LIVE, which is
     * what `content: ""` means here — not "an empty file", but "nothing has
     * been published for this path". Readers of live content skip an empty
     * one (see `sectionSources`), so creating `sections/hero.storelib` to
     * work on it does not blank the shipped hero on the live site until it
     * is published.
     */
    const inserted = await db
      .from("store_theme_custom_files")
      .insert({ install_id: installId, path, content: "", draft_content: content })
      .select()
      .single()
    if (!inserted.error) return { ok: true, row: inserted.data as FileRow, drafts: true }
    /**
     * Somebody else created it between the update and the insert. The row
     * exists now, so the update that failed a moment ago is the right call.
     */
    if (/duplicate key|unique constraint/i.test(inserted.error.message ?? "")) {
      const again = await db
        .from("store_theme_custom_files")
        .update({ draft_content: content })
        .eq("install_id", installId)
        .eq("path", path)
        .select()
        .single()
      if (!again.error) return { ok: true, row: again.data as FileRow, drafts: true }
      return { ok: false, error: again.error.message }
    }
    if (!isMissing(inserted.error.message)) return { ok: false, error: inserted.error.message }
  } else if (!isMissing(updated.error.message)) {
    return { ok: false, error: updated.error.message }
  }

  /**
   * No draft column. The old behaviour: the save is live immediately. Worth
   * saying out loud in the answer so the editor can tell somebody that their
   * save went straight to the site rather than implying it waited.
   */
  const direct = await db
    .from("store_theme_custom_files")
    .upsert({ install_id: installId, path, content }, { onConflict: "install_id,path" })
    .select()
    .single()
  if (direct.error) return { ok: false, error: direct.error.message }
  return { ok: true, row: direct.data as FileRow, drafts: false }
}

/**
 * A new row in the file's history. Never allowed to fail the save that caused
 * it: a record of a save is worth less than the save.
 */
export async function recordVersion(
  db: Db,
  installId: string,
  path: string,
  content: string,
  kind: "save" | "publish" | "restore" = "save",
  /**
   * Who wrote it and in which AI job (SQL part 401 columns). Optional: every
   * existing caller is unchanged, and before part 401 has run the row is
   * written without them rather than not at all.
   */
  meta?: { author?: "creator" | "ai" | "import" | "restore"; jobId?: string },
): Promise<boolean> {
  try {
    const row = { install_id: installId, path, content, kind }
    const extra = { ...(meta?.author ? { author: meta.author } : {}), ...(meta?.jobId ? { job_id: meta.jobId } : {}) }
    let { error } = await db.from("store_theme_file_versions").insert({ ...row, ...extra })
    if (error && Object.keys(extra).length && /author|job_id|does not exist|schema cache/i.test(error.message ?? "")) ({ error } = await db.from("store_theme_file_versions").insert(row))
    if (error) return false
  } catch {
    return false
  }
  /**
   * Fifty per file. Enough to find the version from this morning, bounded so
   * a file somebody saves on every keystroke cannot fill the table.
   */
  try {
    const { data } = await db
      .from("store_theme_file_versions")
      .select("id")
      .eq("install_id", installId)
      .eq("path", path)
      .order("created_at", { ascending: false })
      .range(50, 400)
    const ids = (data ?? []).map((r: { id: string }) => r.id)
    if (ids.length) await db.from("store_theme_file_versions").delete().in("id", ids)
  } catch {
    /* trimming is housekeeping; leaving extra rows is harmless */
  }
  return true
}

export interface FileVersion {
  id: string
  path: string
  content: string
  kind: string
  created_at: string
}

export async function listVersions(db: Db, installId: string, path: string): Promise<FileVersion[]> {
  try {
    const { data, error } = await db
      .from("store_theme_file_versions")
      .select("id, path, content, kind, created_at")
      .eq("install_id", installId)
      .eq("path", path)
      .order("created_at", { ascending: false })
      .limit(50)
    if (error) return []
    return (data ?? []) as FileVersion[]
  } catch {
    return []
  }
}

/**
 * Publish: every file's draft becomes what is live, and the moment is kept as
 * a version of its own so "what went live at 4pm" is answerable.
 *
 * Returns how many files moved. Never throws: a site going live must not
 * depend on this, the same way it does not depend on a backup row.
 */
export async function promoteFileDrafts(db: Db, installId: string): Promise<number> {
  try {
    const { data, error } = await db
      .from("store_theme_custom_files")
      .select("path, content, draft_content")
      .eq("install_id", installId)
      .not("draft_content", "is", null)
    if (error) return 0
    const rows = (data ?? []) as FileRow[]
    let moved = 0
    for (const row of rows) {
      const next = row.draft_content
      if (typeof next !== "string") continue
      const { error: upErr } = await db
        .from("store_theme_custom_files")
        .update({ content: next, draft_content: null })
        .eq("install_id", installId)
        .eq("path", row.path)
      if (upErr) continue
      moved++
      await recordVersion(db, installId, row.path, next, "publish")
    }
    return moved
  } catch {
    return 0
  }
}
