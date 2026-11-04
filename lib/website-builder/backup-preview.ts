/**
 * ===========================================================================
 *  WHAT A RESTORE WOULD CHANGE, BEFORE IT IS DONE
 * ===========================================================================
 * Website settings › Backups & Versions › Preview (round 51). A backup is the
 * website's draft at a moment (lib/website-builder/backups.ts BackupSnapshot):
 * its settings, each page's sections, and the code files. The preview reads
 * one beside the draft as it is now and says, page by page, what Restore
 * would bring back, as restoreSnapshot (lib/website-builder/restore-
 * snapshot.ts) does it: a page of the backup that differs is put back, one
 * that is gone comes back, and a page added since stays as it is (a restore
 * writes the backup's pages and never deletes one). The same for the code:
 * a file of the backup that differs is put back, a file added since stays.
 * Nothing is written.
 *
 * Pure: the route (app/api/website-builder/themes/[installId]/backups/
 * [backupId]) hands it the two snapshots; tests/site-settings-r51.test.ts
 * holds it.
 */

export interface PreviewSnapshot {
  settings: Record<string, unknown>
  pages: { page_key: string; sections: unknown[] }[]
  files?: { path: string; content: string }[]
}

export type PageChange = "same" | "changed" | "comes back" | "stays"

export interface PagePreview {
  key: string
  /** Section count in the backup; for a page added since (it stays), the count it has now. */
  sections: number
  /** The section types in the backup, in order (or the page's now, for one added since). */
  types: string[]
  change: PageChange
}

export interface BackupPreview {
  pages: PagePreview[]
  settingsChanged: number
  filesChanged: number
  /** Restoring would change nothing at all. */
  same: boolean
}

const stable = (v: unknown): string => JSON.stringify(v ?? null)

function typesOf(sections: unknown[]): string[] {
  return sections
    .map((s) => (s && typeof s === "object" && typeof (s as { type?: unknown }).type === "string" ? String((s as { type: string }).type) : ""))
    .filter(Boolean)
}

/** Home first, then the rest by name: the order Pages lists them in. */
function pageOrder(a: string, b: string): number {
  if (a === b) return 0
  if (a === "home") return -1
  if (b === "home") return 1
  return a.localeCompare(b)
}

export function previewBackup(backup: PreviewSnapshot, current: PreviewSnapshot): BackupPreview {
  const before = new Map(backup.pages.map((p) => [p.page_key, p.sections ?? []]))
  const now = new Map(current.pages.map((p) => [p.page_key, p.sections ?? []]))
  const keys = [...new Set([...before.keys(), ...now.keys()])].sort(pageOrder)
  const pages: PagePreview[] = keys.map((key) => {
    const was = before.get(key)
    const is = now.get(key)
    if (was && !is) return { key, sections: was.length, types: typesOf(was), change: "comes back" }
    if (!was && is) return { key, sections: is.length, types: typesOf(is), change: "stays" }
    return { key, sections: was!.length, types: typesOf(was!), change: stable(was) === stable(is) ? "same" : "changed" }
  })

  const settingKeys = new Set([...Object.keys(backup.settings ?? {}), ...Object.keys(current.settings ?? {})])
  let settingsChanged = 0
  for (const k of settingKeys) if (stable(backup.settings?.[k]) !== stable(current.settings?.[k])) settingsChanged++

  /* A backup taken before code was kept (no files) leaves the code as it is; a file added since stays. */
  let filesChanged = 0
  if (backup.files) {
    const is = new Map((current.files ?? []).map((f) => [f.path, f.content]))
    for (const f of backup.files) if (is.get(f.path) !== f.content) filesChanged++
  }

  return { pages, settingsChanged, filesChanged, same: settingsChanged === 0 && filesChanged === 0 && pages.every((p) => p.change === "same" || p.change === "stays") }
}
