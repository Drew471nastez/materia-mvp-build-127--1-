/**
 * ===========================================================================
 *  WHAT WAS ADDED AFTER A BACKUP, AND WHICH OF IT THE AI MADE (round M, M1)
 * ===========================================================================
 * A restore puts the backup's settings, pages and code back as the draft and
 * leaves alone anything the backup does not know (./restore-snapshot.ts).
 * That is right for a page the person made later, and wrong after an AI job:
 * the pages and ai_ files the AI added stayed behind, so "undo" left a
 * /pricing page and five section files the site never had.
 *
 * This module finds them, on evidence only:
 *
 *   ADDED AFTER THE BACKUP   a page or file that is not in the backup AND
 *                            whose row was created at or after the backup's
 *                            own time. A row older than the backup that the
 *                            backup lacks (an old backup without code, a row
 *                            with nothing in it then) is never touched.
 *   MADE BY THE AI           a file: an ai_ path (sections|blocks|snippets/
 *                            ai_*.storelib) whose history since the backup
 *                            has versions written by the AI and none by a
 *                            person or an import. A page: an AI job of this
 *                            website said it created it (an ai_site_job_events
 *                            "page" event, action "created", after the backup).
 *   NOT LIVE                 nothing of it was ever published (a file's live
 *                            half is empty, a page has no live sections), so
 *                            removing it changes the draft only, like the
 *                            rest of a restore.
 *
 * All three: removed with the restore. Anything else that was added after
 * the backup is listed with the reason it stays ("person", "live",
 * "unknown"), and is removed only when the person asks for it by name
 * (`removeAdded` in the restore body), and even then never while live.
 *
 * Pure apart from the client it is handed (tests use the journey database).
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export const AI_FILE = /^(sections|blocks|snippets)\/ai_[a-z0-9_-]+\.storelib$/

export type AddedKind = "page" | "file"
/** Why an added thing stays: the person made or changed it, it is live, or there is no evidence either way. */
export type KeptReason = "person" | "live" | "unknown"

export interface AddedItem {
  kind: AddedKind
  /** page_key or file path. */
  key: string
  /** True: removed with the restore. */
  ai: boolean
  live: boolean
  reason: "ai" | KeptReason
}

export interface AddedSince {
  /** Removed with the restore: added by the AI after the backup, never published. */
  remove: AddedItem[]
  /** Added after the backup but not provably the AI's, or live: kept unless the person asks. */
  keep: AddedItem[]
}

export interface BackupForAdded {
  created_at: string
  snapshot: { pages?: { page_key: string }[]; files?: { path: string }[] }
}

const ms = (t: unknown) => (typeof t === "string" ? Date.parse(t) : NaN)
const nonEmpty = (v: unknown) => Array.isArray(v) && v.length > 0

/** What was added after `backup`, split into what goes with a restore and what stays. Reads only. */
export async function addedSince(db: Db, installId: string, backup: BackupForAdded): Promise<AddedSince> {
  const at = ms(backup.created_at)
  const out: AddedSince = { remove: [], keep: [] }
  if (!Number.isFinite(at)) return out
  const knownPages = new Set((backup.snapshot.pages ?? []).map((p) => String(p.page_key)))
  const knownFiles = new Set((backup.snapshot.files ?? []).map((f) => String(f.path)))

  const [pagesRead, filesRead] = await Promise.all([
    db.from("store_theme_pages").select("page_key, sections, created_at").eq("install_id", installId),
    db.from("store_theme_custom_files").select("path, content, created_at").eq("install_id", installId),
  ])
  const newPages = ((pagesRead.error ? [] : pagesRead.data ?? []) as { page_key: string; sections: unknown; created_at: string }[]).filter((p) => !knownPages.has(String(p.page_key)) && ms(p.created_at) >= at)
  const newFiles = ((filesRead.error ? [] : filesRead.data ?? []) as { path: string; content: string | null; created_at: string }[]).filter((f) => !knownFiles.has(String(f.path)) && ms(f.created_at) >= at)
  if (!newPages.length && !newFiles.length) return out

  /* Files: their history since the backup says who wrote them (store_theme_file_versions.author, SQL part 401). */
  const history = new Map<string, { ai: number; other: number }>()
  let historyKnown = false
  if (newFiles.length) {
    try {
      const { data, error } = await db
        .from("store_theme_file_versions")
        .select("path, author, kind, created_at")
        .eq("install_id", installId)
        .in("path", newFiles.map((f) => f.path))
        .gte("created_at", new Date(at).toISOString())
      if (!error) {
        historyKnown = true
        for (const v of (data ?? []) as { path: string; author: string | null; kind: string | null }[]) {
          const h = history.get(v.path) ?? { ai: 0, other: 0 }
          if (v.author === "ai") h.ai++
          /* A restore's own version row is a record, not a person's edit; a publish is the person's choice to put it live (caught as live). */
          else if (v.author !== "restore" && v.kind !== "restore" && v.kind !== "publish") h.other++
          history.set(v.path, h)
        }
      }
    } catch {
      historyKnown = false
    }
  }
  for (const f of newFiles) {
    const live = typeof f.content === "string" && f.content.trim() !== ""
    const h = history.get(f.path)
    const reason: AddedItem["reason"] = !AI_FILE.test(f.path) ? "person" : !historyKnown || !h ? "unknown" : h.other > 0 ? "person" : h.ai > 0 ? "ai" : "unknown"
    const item: AddedItem = { kind: "file", key: f.path, ai: reason === "ai", live, reason: reason === "ai" && live ? "live" : reason }
    ;(item.reason === "ai" ? out.remove : out.keep).push(item)
  }

  /* Pages: an AI job of this website said it created the page after the backup. */
  const madeByAi = new Set<string>()
  if (newPages.length) {
    try {
      const { data: jobs } = await db.from("ai_site_jobs").select("id").eq("install_id", installId).gte("updated_at", new Date(at).toISOString())
      const ids = ((jobs ?? []) as { id: string }[]).map((j) => j.id)
      if (ids.length) {
        const { data: events } = await db.from("ai_site_job_events").select("payload, created_at").in("job_id", ids).eq("kind", "page").gte("created_at", new Date(at).toISOString())
        for (const e of (events ?? []) as { payload: { page?: unknown; action?: unknown } | null }[]) {
          if (e.payload?.action === "created" && typeof e.payload.page === "string") madeByAi.add(e.payload.page)
        }
      }
    } catch {
      /* no jobs table: no evidence, every page stays */
    }
  }
  for (const p of newPages) {
    const live = nonEmpty(p.sections)
    const ai = madeByAi.has(String(p.page_key))
    const item: AddedItem = { kind: "page", key: String(p.page_key), ai, live, reason: ai ? (live ? "live" : "ai") : "unknown" }
    ;(item.reason === "ai" ? out.remove : out.keep).push(item)
  }
  const order = (a: AddedItem, b: AddedItem) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key)
  out.remove.sort(order)
  out.keep.sort(order)
  return out
}

/**
 * Removes the added things given, as drafts: a file row only while its live
 * half is empty, a page row only while it has no live sections (the delete
 * itself carries the same condition for files, so a publish in between is
 * not undone). Returns what went and what did not.
 */
export async function removeAdded(db: Db, installId: string, items: AddedItem[]): Promise<{ removed: AddedItem[]; failed: AddedItem[] }> {
  const removed: AddedItem[] = []
  const failed: AddedItem[] = []
  for (const it of items) {
    if (it.live) {
      failed.push(it)
      continue
    }
    try {
      if (it.kind === "file") {
        const { error } = await db.from("store_theme_custom_files").delete().eq("install_id", installId).eq("path", it.key).eq("content", "")
        ;(error ? failed : removed).push(it)
      } else {
        const { data: row } = await db.from("store_theme_pages").select("id, sections").eq("install_id", installId).eq("page_key", it.key).maybeSingle()
        if (!row || nonEmpty((row as { sections: unknown }).sections)) {
          ;(row ? failed : removed).push(it)
          continue
        }
        const { error } = await db.from("store_theme_pages").delete().eq("id", (row as { id: string }).id).eq("install_id", installId)
        ;(error ? failed : removed).push(it)
      }
    } catch {
      failed.push(it)
    }
  }
  return { removed, failed }
}

/** The keys the person asked to remove as well, kept to things that were added after the backup and are not live. */
export function askedToRemove(added: AddedSince, asked: unknown): AddedItem[] {
  if (!Array.isArray(asked)) return []
  const want = new Set(asked.filter((k): k is string => typeof k === "string").map((k) => k.slice(0, 200)))
  return added.keep.filter((it) => !it.live && want.has(`${it.kind}:${it.key}`))
}
