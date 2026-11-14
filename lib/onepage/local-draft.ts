/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S UNSAVED WORK, KEPT ON THE DEVICE (round AU)
 * ===========================================================================
 * The editor saves when the creator presses Save, and a Save publishes. Until
 * then the work lived only in memory: a reload, a crash, the app killed in the
 * background by iOS or Android, or a Save that failed on a train and was never
 * pressed again, and it was gone. The leave prompt (beforeunload) never runs
 * when an app is killed.
 *
 * Now every unsaved page is written here, a moment after each edit and at
 * once when the app goes to the background, and cleared when a Save lands or
 * undo comes back to the page as it was saved. Opening the editor reads it:
 *
 *   restore  the draft was made on top of the copy the server still holds
 *            (same edit version, lib/onepage/edit-version): it is put back as
 *            an ordinary edit, unsaved, and undo takes it away
 *   ask      the page was saved somewhere else since: the creator chooses
 *            between the saved page and this device's changes
 *   none     no draft, an old or unreadable one, or one equal to the page
 *
 * Only the fields a Save sends are kept (the same list the editor compares to
 * know whether it is saved). The page's id, its published copy and the photo
 * always come from the server. Storage that refuses (a private window, a full
 * quota) is never an error: the editor works as it did.
 */
import type { OnePage, OnePageBlock } from "./types"

/** The fields a Save sends that the creator edits: what a draft carries. */
export const DRAFT_FIELDS = ["title", "bio", "avatar_video_url", "slug", "theme", "settings", "social_links", "draft_blocks", "archived_blocks", "share_image_mode"] as const
type DraftField = (typeof DRAFT_FIELDS)[number]

export type LocalDraft = {
  v: 1
  pageId: string
  /** The server's edit version the edits were made on top of. */
  base: string | null
  /** When it was written, ms since the epoch. */
  at: number
  fields: Partial<Record<DraftField, unknown>>
  /**
   * The page as it was last saved when the draft was written, in the editor's
   * savedFields order (lib/onepage/context). What tells an edit made on this
   * device from a value that was simply older: see withDraft.
   */
  saved?: string | null
}

/** A draft older than this is not offered. */
export const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export type DraftStore = Pick<Storage, "getItem" | "setItem" | "removeItem">

export const draftKey = (pageId: string) => `storelib:onepage-draft:${pageId}`

/** The fields of a page a draft keeps. */
export function draftFieldsOf(page: OnePage, archived: OnePageBlock[]): LocalDraft["fields"] {
  const p = page as unknown as Record<string, unknown>
  const out: LocalDraft["fields"] = {}
  for (const f of DRAFT_FIELDS) {
    if (f === "archived_blocks") out[f] = archived
    else if (p[f] !== undefined) out[f] = p[f]
  }
  return out
}

/** Writes the draft; false when storage refused it. */
export function writeDraft(store: DraftStore | null, draft: LocalDraft): boolean {
  if (!store) return false
  try {
    store.setItem(draftKey(draft.pageId), JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function clearDraft(store: DraftStore | null, pageId: string): void {
  if (!store) return
  try {
    store.removeItem(draftKey(pageId))
  } catch {
    /* Storage refused: nothing was kept to clear. */
  }
}

/** The draft kept for this page, or null when there is none worth offering. */
export function readDraft(store: DraftStore | null, pageId: string, now: number = Date.now()): LocalDraft | null {
  if (!store) return null
  let raw: string | null
  try {
    raw = store.getItem(draftKey(pageId))
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as LocalDraft
    if (!d || d.v !== 1 || d.pageId !== pageId || typeof d.at !== "number" || !d.fields || typeof d.fields !== "object") return null
    if (!Array.isArray(d.fields.draft_blocks)) return null
    if (now - d.at > DRAFT_MAX_AGE_MS) {
      clearDraft(store, pageId)
      return null
    }
    return d
  } catch {
    return null
  }
}

/** Two values compared as the editor's saved check compares them: by their JSON. */
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Whether the draft holds anything the page does not. */
export function draftDiffers(draft: LocalDraft, page: OnePage): boolean {
  const p = page as unknown as Record<string, unknown>
  return DRAFT_FIELDS.some((f) => f in draft.fields && !same(draft.fields[f], f === "archived_blocks" ? p[f] ?? [] : p[f]))
}

/** What opening the editor does with a kept draft. */
export function draftDecision(draft: LocalDraft | null, page: OnePage, serverVersion: string | null): "none" | "restore" | "ask" {
  if (!draft || !draftDiffers(draft, page)) return "none"
  return draft.base !== null && draft.base === serverVersion ? "restore" : "ask"
}

/** savedFields' order (lib/onepage/context): where each field sits in a draft's `saved`. */
const SAVED_ORDER: readonly DraftField[] = ["title", "bio", "avatar_video_url", "slug", "theme", "settings", "social_links", "draft_blocks", "archived_blocks", "share_image_mode"]
/** The fields the save's version check covers: a draft restores them whole (draftDecision only restores on the same version). */
const CHECKED_FIELDS: readonly DraftField[] = ["bio", "theme", "draft_blocks", "archived_blocks"]

/**
 * The page with the draft's fields laid over it: the id, the published copy and the photo stay the server's.
 *
 * ONLY WHAT WAS CHANGED ON THIS DEVICE (the OnePage production audit, S1).
 * The blocks, archive, look and bio come back whole: the draft is restored
 * without asking only when the server still holds the copy it was made on.
 * The name, address, settings, social links, video and share picture are
 * written by other screens too, and that copy says nothing about them, so a
 * draft made before the creator page changed Instagram used to put the old
 * one back. Where the draft knows what it was made against (`saved`), each
 * of them comes back only if it was changed here, settings and social links
 * key by key; the server's newer values stay. An older draft without it is
 * laid over as before.
 */
export function withDraft(page: OnePage, draft: LocalDraft): OnePage {
  const next = { ...page } as unknown as Record<string, unknown>
  let saved: unknown[] | null = null
  try {
    const parsed = typeof draft.saved === "string" ? JSON.parse(draft.saved) : null
    saved = Array.isArray(parsed) ? parsed : null
  } catch {
    saved = null
  }
  for (const f of DRAFT_FIELDS) {
    if (!(f in draft.fields)) continue
    const mine = draft.fields[f]
    if (!saved || CHECKED_FIELDS.includes(f)) {
      next[f] = mine
      continue
    }
    const before = saved[SAVED_ORDER.indexOf(f)]
    if (same(mine, before)) continue
    if ((f === "settings" || f === "social_links") && mine && typeof mine === "object" && !Array.isArray(mine)) {
      const then = (before && typeof before === "object" ? before : {}) as Record<string, unknown>
      const now = mine as Record<string, unknown>
      const merged = { ...((next[f] && typeof next[f] === "object" ? next[f] : {}) as Record<string, unknown>) }
      for (const key of new Set([...Object.keys(now), ...Object.keys(then)])) {
        if (!same(now[key], then[key])) {
          if (now[key] === undefined) delete merged[key]
          else merged[key] = now[key]
        }
      }
      next[f] = merged
      continue
    }
    next[f] = mine
  }
  return next as unknown as OnePage
}

/** The browser's localStorage, or null where it cannot be reached. */
export function deviceStore(): DraftStore | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}
