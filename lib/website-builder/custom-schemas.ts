/**
 * ===========================================================================
 *  THE SCHEMAS A PAGE'S OWN SECTION FILES DECLARE
 * ===========================================================================
 * The sanitiser cleans a setting as markup when its section's schema says it
 * holds markup. For the sections the theme ships, the schema is in the
 * bundle. For a section the creator wrote in the code editor, or their copy
 * of one the theme ships, the schema is in their saved file, and nothing
 * used to read it: a creator's own `richtext` setting called `intro` went to
 * the page exactly as it was typed, unless its id happened to be on the
 * sanitiser's short list of known names.
 *
 * This reads just the files a page uses, by path, and answers with the
 * schema each one declares. The files are read only for the types on the
 * page, so a page of built-in sections costs one small query that returns
 * nothing.
 */
import { SECTION_SCHEMAS } from "./section-schemas"
import { schemaFor, themeBlockCatalog } from "./storelib-schemas"
import type { BlockSchema, SchemaField } from "./types"
import type { SchemaLookup } from "./sanitize-sections"
import { fileCols, resolveRefs } from "@/lib/website-builder/theme-file-refs"

type FileRow = { path: string; content?: string | null; draft_content?: string | null; updated_at?: string | null }
type Db = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        in: (col: string, vals: string[]) => PromiseLike<{ data: FileRow[] | null; error?: { message?: string } | null }>
      }
    }
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from(table: string): any }

/*
  ===========================================================================
   A SECTION FILE READ ONCE PER CHANGE, NOT ONCE PER PAGE OPENED (round 67)
  ===========================================================================
  The editor opens every page through the sections route, and on a Materia
  website each one read the page's section files whole only for their
  schemas: 2.93 MB from the database for the home page, again on every
  reopen and every page read ahead. A file's text changes only with its row,
  and every write to a row moves its updated_at (the `stcf_updated_at`
  trigger, ./files-revision.ts), so the text is kept on this server under
  the install, the path, which half was read (draft or live) and that time.
  The times of the install's section files are read beside the page (a few
  kilobytes, sectionFileStamps); a file whose time is the one kept is not
  read again. A file with no time is never kept. Kept only in this server's
  memory, by install, and handed out only after the route's own check that
  the caller may read the install.
*/
const MEMO_CHARS = 32_000_000
const memo = new Map<string, { stamp: string; text: string }>()
let memoChars = 0
const memoKey = (installId: string, path: string, draft: boolean) => `${installId}\n${draft ? "d" : "l"}\n${path}`
function remember(key: string, stamp: string, text: string) {
  const had = memo.get(key)
  if (had) {
    memoChars -= had.text.length
    memo.delete(key)
  }
  memo.set(key, { stamp, text })
  memoChars += text.length
  while (memoChars > MEMO_CHARS && memo.size > 1) {
    const [k, v] = memo.entries().next().value as [string, { stamp: string; text: string }]
    memo.delete(k)
    memoChars -= v.text.length
  }
}
/** For the tests. */
export function forgetSectionFileMemo(): void {
  memo.clear()
  memoChars = 0
}

/**
 * The updated_at of each of an install's section files, by path, without
 * their text. Null when it could not be read: the files are then read as
 * before.
 */
export async function sectionFileStamps(db: AnyDb, installId: string): Promise<Map<string, string | null> | null> {
  try {
    const out = new Map<string, string | null>()
    for (let from = 0; from < 20_000; from += 1000) {
      const r = await db.from("store_theme_custom_files").select("path, updated_at").eq("install_id", installId).like("path", "sections/%.storelib").order("path").range(from, from + 999)
      if (r.error) return null
      const rows = (r.data ?? []) as { path: string; updated_at: string | null }[]
      for (const row of rows) out.set(String(row.path), typeof row.updated_at === "string" && row.updated_at ? row.updated_at : null)
      if (rows.length < 1000) break
    }
    return out
  } catch {
    return null
  }
}

const TYPE = /^[a-z0-9_-]{1,64}$/

/**
 * A lookup for the sanitiser, or undefined when no section on the page has a
 * file of its own. `draft` reads the file the editor shows (its draft when
 * there is one), which is what the builder draws; the published site reads
 * the live half, which is what a visitor gets.
 */
export async function customSchemaLookup(
  db: Db,
  installId: string,
  sections: { type: string }[],
  /* `stamps`: the install's section files' times (sectionFileStamps), read beside the page; a file kept at its time is not read again (round 67). */
  opts: { draft: boolean; stamps?: Promise<Map<string, string | null> | null> } = { draft: false },
): Promise<SchemaLookup | undefined> {
  const types = [...new Set(sections.map((s) => s.type).filter((t) => typeof t === "string" && TYPE.test(t)))]
  if (!installId || types.length === 0) return undefined
  const paths = types.map((t) => `sections/${t}.storelib`)
  const draft = opts.draft === true
  const stamps = opts.stamps ? await opts.stamps.catch(() => null) : null
  const sources: Record<string, string> = {}
  let toRead = paths
  if (stamps) {
    toRead = []
    for (const path of paths) {
      /* No such file: nothing to read, as the read would have found nothing. */
      if (!stamps.has(path)) continue
      const stamp = stamps.get(path)
      const kept = stamp ? memo.get(memoKey(installId, path, draft)) : undefined
      if (kept && kept.stamp === stamp) {
        if (kept.text.trim() !== "") sources[path] = kept.text
      } else toRead.push(path)
    }
  }
  if (toRead.length > 0) {
    let rows: FileRow[] = []
    try {
      /* With the row's own time when it is to be kept, so what is kept is named by the text it holds. */
      const base = draft ? "path, content, draft_content" : "path, content"
      const first = await db.from("store_theme_custom_files").select(await fileCols(stamps ? `${base}, updated_at` : base)).eq("install_id", installId).in("path", toRead)
      if (first.error && draft) {
        /* Before the file drafts SQL, there is no draft column: read the live half. */
        const second = await db.from("store_theme_custom_files").select("path, content").eq("install_id", installId).in("path", toRead)
        rows = second.data ?? []
      } else {
        rows = await resolveRefs((first.data ?? []) as FileRow[])
      }
    } catch {
      return undefined
    }
    for (const r of rows) {
      const text = draft ? (r.draft_content ?? r.content) : r.content
      if (typeof text !== "string") continue
      if (stamps && typeof r.updated_at === "string" && r.updated_at) remember(memoKey(installId, r.path, draft), r.updated_at, text)
      if (text.trim() !== "") sources[r.path] = text
    }
  }
  if (Object.keys(sources).length === 0) return undefined
  return onceEach(sources)
}

/**
 * Each type's schema read from its file once per lookup (round 65). The
 * sanitiser asks for every section it cleans, and a page cleaned three ways
 * (its sections, its draft, the answer) parsed a megabyte file three times
 * per section of that type. The sources do not change during one lookup.
 */
function onceEach(sources: Record<string, string>): SchemaLookup {
  const seen = new Map<string, ReturnType<SchemaLookup>>()
  return (type: string) => {
    if (seen.has(type)) return seen.get(type)
    const schema = schemaFor(type, sources, SECTION_SCHEMAS)
    seen.set(type, schema)
    return schema
  }
}

/** The same lookup from sources already in hand, as the published site has them. */
export function schemaLookupFrom(sources: Record<string, string> | undefined): SchemaLookup | undefined {
  if (!sources || Object.keys(sources).length === 0) return undefined
  return onceEach(sources)
}

/**
 * WHICH SETTINGS HOLD WORDS, for the translations: a section's own (its
 * saved file's schema, else the theme's), and a block's, from the section's
 * own block types or else the theme's blocks (blocks/<type>.storelib). A
 * heading, text or button block in a Blocks section is a theme block: read
 * from the section's list alone, it was never listed to translate nor laid
 * over. One lookup for what is listed (lib/markets/server.ts siteTexts), the
 * live site (lib/markets/live.ts) and the builder's canvas.
 */
export function textFieldsFrom(sources: Record<string, string> | undefined): { fieldsOf: (type: string) => SchemaField[] | undefined; blockFieldsOf: (sectionType: string, blockType: string) => SchemaField[] | undefined } {
  const lookup = schemaLookupFrom(sources) ?? ((type: string) => SECTION_SCHEMAS[type])
  let catalog: Record<string, BlockSchema> | null = null
  const themeBlocks = () => (catalog ??= themeBlockCatalog(sources))
  return {
    fieldsOf: (type) => lookup(type)?.fields,
    blockFieldsOf: (sectionType, blockType) => lookup(sectionType)?.blocks?.find((b) => b.type === blockType)?.fields ?? themeBlocks()[blockType]?.fields,
  }
}
