"use client"

/**
 * ===========================================================================
 *  THE EDIT THAT IS ONLY IN MEMORY IS THE ONE THAT DISAPPEARS
 * ===========================================================================
 * The editor autosaves 1.2 seconds after you touch a file, and puts failed
 * saves back in the queue so they are tried again. Both are right, and both
 * assume the tab lives long enough to finish. Two cases where it does not:
 *
 *   - The phone switches apps. iOS may kill the page without ever running
 *     `beforeunload`, so the warning the editor relies on is not a promise.
 *   - The network is gone. The save fails, it is queued for the next attempt,
 *     and the next attempt never happens because the tab is closed.
 *
 * In both, the work only ever existed in React state.
 *
 * So every edit is also written here, on the device, keyed by site. It is a
 * safety net and nothing more: the server is the record, this is what lets a
 * person get back what they typed when the record never heard about it. It is
 * cleared the moment a save lands, so a draft sitting in storage always means
 * something genuinely did not make it.
 *
 * WHY localStorage AND NOT IndexedDB. Only the files that are unsaved are
 * kept, which is one or two at a time, and a synchronous write is what makes
 * this useful in `pagehide` — the one moment an async transaction is not
 * guaranteed to finish. The size guard below is what keeps that honest.
 */

import type { ProjectFiles } from "./types"

const PREFIX = "storelib_site_draft_"

/**
 * Two megabytes, well inside the five most browsers give a whole origin.
 *
 * A draft larger than this is not dropped silently: the caller is told, and
 * the editor says so, because a safety net nobody knows is missing is worse
 * than no safety net.
 */
const MAX_BYTES = 2_000_000

export interface LocalDraft {
  /** The revision the editor held when these files were written. */
  revision: number
  /** ISO, for telling somebody how old the recovered work is. */
  savedAt: string
  /** Only the paths that were unsaved. Never the whole project. */
  files: ProjectFiles
}

function key(siteId: string): string {
  return `${PREFIX}${siteId}`
}

/**
 * Keep the unsaved files for this site.
 *
 * Returns false when the draft could not be kept — quota, a private window,
 * storage disabled — so the caller can say so rather than assume a net that
 * is not there.
 */
export function writeLocalDraft(siteId: string, draft: LocalDraft): boolean {
  if (typeof window === "undefined") return false
  const paths = Object.keys(draft.files)
  if (paths.length === 0) {
    clearLocalDraft(siteId)
    return true
  }
  let payload: string
  try {
    payload = JSON.stringify(draft)
  } catch {
    return false
  }
  if (payload.length > MAX_BYTES) return false
  try {
    window.localStorage.setItem(key(siteId), payload)
    return true
  } catch {
    /* Quota, or a browser that refuses storage. The editor still works; it
       just has no net, and it is told so. */
    return false
  }
}

/** The kept files, or null when there is nothing or it cannot be read. */
export function readLocalDraft(siteId: string): LocalDraft | null {
  if (typeof window === "undefined") return null
  let raw: string | null
  try {
    raw = window.localStorage.getItem(key(siteId))
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return null
    const draft = parsed as Partial<LocalDraft>
    if (typeof draft.revision !== "number") return null
    if (typeof draft.savedAt !== "string") return null
    if (!draft.files || typeof draft.files !== "object" || Array.isArray(draft.files)) return null
    const files: ProjectFiles = {}
    for (const [path, content] of Object.entries(draft.files)) {
      if (typeof content !== "string") return null
      files[path] = content
    }
    if (Object.keys(files).length === 0) return null
    return { revision: draft.revision, savedAt: draft.savedAt, files }
  } catch {
    return null
  }
}

/** Forget it. Called the moment a save lands, and when somebody discards. */
export function clearLocalDraft(siteId: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(key(siteId))
  } catch {}
}

/**
 * Which of the kept files actually differ from what the server just handed us.
 *
 * A draft can be stale in the ordinary way: the save DID land, the tab was
 * closed before the clear, or the same edit arrived from another tab. Offering
 * to restore work that is already in the file is a prompt about nothing, so
 * the editor asks this first and stays quiet when the answer is empty.
 */
export function unsavedIn(draft: LocalDraft, server: ProjectFiles): ProjectFiles {
  const out: ProjectFiles = {}
  for (const [path, content] of Object.entries(draft.files)) {
    if (server[path] !== content) out[path] = content
  }
  return out
}
