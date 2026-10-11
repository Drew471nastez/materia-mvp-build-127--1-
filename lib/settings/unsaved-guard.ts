/**
 * ===========================================================================
 *  SETTINGS: CHANGES THAT AREN'T SAVED YET, AND LEAVING WITH THEM
 * ===========================================================================
 * "Leaving the settings page (or switching tabs, or closing the sheet) with
 * unsaved changes must warn." Settings is several pieces that do not hold
 * each other: the form (components/app/settings-form-new.tsx) holds the
 * profile's fields, the sheet (components/app/settings-sheet.tsx) holds the
 * way out, and a panel may hold a draft of its own. So what is unsaved is
 * kept here, in one place, outside React:
 *
 *   markDirty(id, entry)   a piece says it has changes, and how to save or
 *                          drop them; markDirty(id, null) when it has none
 *   hasUnsaved()           anything at all
 *   requestLeave(go)       every way out asks this first. With nothing
 *                          unsaved it goes at once; otherwise the dialog
 *                          (components/app/settings/leave-guard.tsx) asks
 *                          Save, Discard or Keep editing, and `go` runs only
 *                          after Save or Discard
 *
 * Pure: no DOM, no React, so a test can drive it.
 */

export interface UnsavedEntry {
  /** Saves; resolves true when it worked (the dialog stays up on false, so nothing is lost). */
  save?: () => Promise<boolean>
  /** Puts the fields back as they were. */
  discard: () => void
}

type Asker = (go: () => void) => void

const entries = new Map<string, UnsavedEntry>()
const listeners = new Set<() => void>()
let asker: Asker | null = null

function notify() {
  for (const fn of listeners) fn()
}

export function markDirty(id: string, entry: UnsavedEntry | null): void {
  const had = entries.has(id)
  if (entry) entries.set(id, entry)
  else entries.delete(id)
  if (had !== !!entry) notify()
}

export function hasUnsaved(): boolean {
  return entries.size > 0
}

/** Runs every save there is; true only when all of them worked. */
export async function saveAllUnsaved(): Promise<boolean> {
  let ok = true
  for (const [id, e] of [...entries]) {
    if (!e.save) continue
    const done = await e.save().catch(() => false)
    if (done) entries.delete(id)
    else ok = false
  }
  notify()
  return ok
}

export function discardAllUnsaved(): void {
  for (const e of [...entries.values()]) e.discard()
  entries.clear()
  notify()
}

/** For a hook: called whenever "is anything unsaved" flips. */
export function subscribeUnsaved(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The dialog registers itself as the one that asks. */
export function setLeaveAsker(fn: Asker | null): void {
  asker = fn
}

/**
 * Every way out of Settings, or out of one section into another, calls this.
 * Returns true when it went at once, false when the dialog is asking.
 */
export function requestLeave(go: () => void): boolean {
  if (!hasUnsaved() || !asker) {
    go()
    return true
  }
  asker(go)
  return false
}
