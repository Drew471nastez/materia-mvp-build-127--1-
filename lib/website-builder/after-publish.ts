import "server-only"

import { fileCols, resolveRefs } from "@/lib/website-builder/theme-file-refs"

/**
 * ===========================================================================
 *  THE WORK AFTER A PUBLISH, IN ORDER AND FROM ONE READ (round 66)
 * ===========================================================================
 * The owner: "make sure publishing is very fast and clean and smooth".
 *
 * Measured in round 65 on the real Materia clothing template (989 files,
 * 28.95 MB): the first publish after adding it moved 174 MB from the
 * database in the work after the answer. The release read every live file,
 * the backup read every file again, the warm and the sitemap drew the site
 * from its rows, and all of it started at the same moment on one database.
 *
 * Now, for one publish:
 *
 *   ONE READ    the settings, the pages and every file (live and draft
 *               halves, a thousand at a time) read once, by the release,
 *               after it has read its count (site-releases-server.ts), and
 *               handed to the backup. Nothing else reads all the files.
 *   IN ORDER    the release first, so the website is pointed at it before
 *               its pages are drawn ahead: those draws then read the
 *               release's files, kept by every server by what they hold,
 *               instead of every row again. The backup and the warm wait
 *               for it, each for at most a stated time, so a release that
 *               is slow or fails holds nothing up for long.
 *   LIGHT       the backup keeps by name (sha256) every file whose text
 *               Storelib already holds (theme_file_blobs, which is never
 *               pruned): see lib/website-builder/backups.ts lightSnapshot.
 *
 * Everything here runs after the answer has gone: the person is told the
 * site is live once it is, and waits on none of it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export interface PublishRows {
  settings: { settings: unknown; draft_settings: unknown } | null
  pages: { page_key: string; sections: unknown; draft_sections: unknown }[]
  /** Null: the files could not be read with their drafts (before RUN_THEME_FILE_DRAFTS.sql); whoever needs them reads them as before. */
  files: { path: string; content: string; draft_content: string | null }[] | null
}

const PAGE = 1000

/** Every file of an install, both halves, every page of a thousand. Throws on a failed read: half a theme is never handed on as the theme. */
async function readFiles(db: Db, installId: string): Promise<PublishRows["files"]> {
  const cols = await fileCols("path, content, draft_content")
  const out: NonNullable<PublishRows["files"]> = []
  for (let from = 0; from < 20_000; from += PAGE) {
    const r = await db.from("store_theme_custom_files").select(cols).eq("install_id", installId).order("path").range(from, from + PAGE - 1)
    if (r.error) {
      if (from === 0 && /draft_content/.test(r.error.message ?? "")) return null
      throw new Error(`theme files: ${r.error.message ?? r.error.code ?? "the read failed"}`)
    }
    const rows = await resolveRefs((r.data ?? []) as { path: string; content: string | null; draft_content?: string | null; blob_sha256?: string | null }[])
    for (const row of rows) out.push({ path: String(row.path), content: typeof row.content === "string" ? row.content : "", draft_content: typeof row.draft_content === "string" ? row.draft_content : null })
    if (rows.length < PAGE) break
  }
  return out
}

/** The settings, the pages and the files of an install, as they are now. Throws when any of them could not be read. */
export async function readPublishRows(db: Db, installId: string): Promise<PublishRows> {
  const [settingsRead, pagesRead, files] = await Promise.all([
    db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle(),
    db.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId),
    readFiles(db, installId),
  ])
  if (settingsRead.error) throw new Error(`settings: ${settingsRead.error.message ?? "the read failed"}`)
  if (pagesRead.error) throw new Error(`pages: ${pagesRead.error.message ?? "the read failed"}`)
  return { settings: (settingsRead.data ?? null) as PublishRows["settings"], pages: (pagesRead.data ?? []) as PublishRows["pages"], files }
}

/** What a visitor is shown, from those rows: the half a release is written from. */
export function liveOf(rows: PublishRows): { settings: unknown; pages: { page_key: string; sections: unknown }[]; files: Record<string, string> } | null {
  if (!rows.files) return null
  const files: Record<string, string> = {}
  for (const f of rows.files) if (f.content !== "") files[f.path] = f.content
  return { settings: rows.settings?.settings ?? null, pages: rows.pages.map((p) => ({ page_key: p.page_key, sections: p.sections })), files }
}

/** How long the warm waits for the release before drawing the pages anyway (from the rows, as before round 66). */
export const WARM_WAITS_FOR_RELEASE_MS = 10_000
/** How long the backup waits for it: the backup is in no hurry, and the route has two minutes (maxDuration). */
export const BACKUP_WAITS_FOR_RELEASE_MS = 45_000

const within = <T>(p: Promise<T>, ms: number, otherwise: T): Promise<T> =>
  new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(otherwise), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(otherwise)
      },
    )
  })

export interface ReleaseSeen {
  /** The release was written and pointed at. */
  pointed: boolean
  /** Every sha256 the release found in theme_file_blobs or wrote there. */
  blobs: string[]
}

/**
 * One publish's follow-up: the shared read (asked at most once, whoever asks
 * first), and the moment the release is done (`releaseDone`, called once,
 * whatever happened).
 */
export function publishFollowUp(db: Db, installId: string) {
  let rows: Promise<PublishRows> | null = null
  let done: (seen: ReleaseSeen) => void = () => {}
  const released = new Promise<ReleaseSeen>((resolve) => {
    done = resolve
  })
  const none: ReleaseSeen = { pointed: false, blobs: [] }
  const shared = (): Promise<PublishRows> => (rows ??= readPublishRows(db, installId))
  /* Methods that never use `this`: each may be handed on alone (read: follow.liveRows). */
  return {
    /** The rows, read once for this publish. */
    rows: shared,
    /** The same rows, or null when they could not be read (each reader then reads for itself, as before). */
    rowsOrNull: async (): Promise<PublishRows | null> => {
      try {
        return await shared()
      } catch {
        return null
      }
    },
    /**
     * For the release: the live half of the rows, read now. Null when the
     * read was already under way before this was asked (the release then
     * reads for itself, so its rows are always read after its count), or
     * could not be done.
     */
    liveRows: async () => {
      if (rows) return null
      try {
        return liveOf(await shared())
      } catch {
        return null
      }
    },
    releaseDone: (seen: ReleaseSeen | null): void => {
      done(seen ?? none)
    },
    /** The release, or nothing after `ms`. */
    waitForRelease: (ms: number): Promise<ReleaseSeen> => {
      return within(released, ms, none)
    },
  }
}
export type PublishFollowUp = ReturnType<typeof publishFollowUp>
