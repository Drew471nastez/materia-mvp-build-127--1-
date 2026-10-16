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

type FileRow = { path: string; content?: string | null; draft_content?: string | null }
type Db = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        in: (col: string, vals: string[]) => PromiseLike<{ data: FileRow[] | null; error?: { message?: string } | null }>
      }
    }
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
  opts: { draft: boolean } = { draft: false },
): Promise<SchemaLookup | undefined> {
  const types = [...new Set(sections.map((s) => s.type).filter((t) => typeof t === "string" && TYPE.test(t)))]
  if (!installId || types.length === 0) return undefined
  const paths = types.map((t) => `sections/${t}.storelib`)
  let rows: FileRow[] = []
  try {
    const first = await db.from("store_theme_custom_files").select(opts.draft ? "path, content, draft_content" : "path, content").eq("install_id", installId).in("path", paths)
    if (first.error && opts.draft) {
      /* Before the file drafts SQL, there is no draft column: read the live half. */
      const second = await db.from("store_theme_custom_files").select("path, content").eq("install_id", installId).in("path", paths)
      rows = second.data ?? []
    } else {
      rows = first.data ?? []
    }
  } catch {
    return undefined
  }
  const sources: Record<string, string> = {}
  for (const r of rows) {
    const text = opts.draft ? (r.draft_content ?? r.content) : r.content
    if (typeof text === "string" && text.trim() !== "") sources[r.path] = text
  }
  if (Object.keys(sources).length === 0) return undefined
  return (type: string) => schemaFor(type, sources, SECTION_SCHEMAS)
}

/** The same lookup from sources already in hand, as the published site has them. */
export function schemaLookupFrom(sources: Record<string, string> | undefined): SchemaLookup | undefined {
  if (!sources || Object.keys(sources).length === 0) return undefined
  return (type: string) => schemaFor(type, sources, SECTION_SCHEMAS)
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
