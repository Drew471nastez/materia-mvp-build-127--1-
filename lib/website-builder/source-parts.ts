/**
 * ===========================================================================
 *  AN IMPORTED THEME'S SECTION SOURCES, THE PAGE'S FIRST (round 68)
 * ===========================================================================
 * The owner: "I click edit website ... It truly takes so much to load, and
 * sometimes it tells me that Storelib takes too much to respond."
 *
 * Opening the editor on a Materia website read every section source the
 * theme has before the canvas could draw: 675 files, 22.8 MB, in one answer
 * (files?sources=1), beside the theme's own files (6.8 MB). Measured in
 * tests/editor-open-r68.test.ts over the stand-in database, right after a
 * Publish whose release and backup read the same tables: 19.7 s for that one
 * read at 3 MB/s, past the 15 s the editor waits for it.
 *
 * The page being opened draws from a few of them. So the sources come in
 * two parts:
 *
 *   THE PAGE      files?sources=1&types=<the page's section types>: every
 *                 file that is not a section (layout, snippets, blocks), the
 *                 sections of those types, any section the layout or a
 *                 snippet names with {% section %}, and Storelib's own three
 *                 an imported theme always has. 7.8 MB on Materia's home.
 *   THE REST      files?sources=1&rest=<the same types>: every other section,
 *                 asked once the page is drawn. Add section's library and the
 *                 other pages draw from these.
 *
 * Both are read as the caller, and each is tagged with its own revision
 * (files-revision.ts), so an unchanged part is a 304 next time.
 */
import { NEWSLETTER_SECTION_TYPE, REVIEWS_SECTION_TYPE, REVIEW_WIDGET_SECTION_TYPE } from "@/lib/storelib-theme/compat/native-sections"

/** A section type as a page stores it, and a file name may hold. */
const TYPE = /^[a-z0-9_-]{1,64}$/
/** At most this many types named in one ask: a page with more is read whole. */
export const MAX_PART_TYPES = 200

/** The types a query names (`types=` or `rest=`), each a plain section type; null when none or any is not one. */
export function partTypes(raw: string | null): string[] | null {
  if (raw === null) return null
  const list = [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))]
  if (list.length === 0 || list.length > MAX_PART_TYPES || !list.every((t) => TYPE.test(t))) return null
  return list.sort()
}

/** Storelib's own sections an imported theme always has (storelib-reviews.ts): in the page's part, so a real file of one is never shadowed by the made one. */
export const OWN_SECTION_TYPES = [REVIEWS_SECTION_TYPE, REVIEW_WIDGET_SECTION_TYPE, NEWSLETTER_SECTION_TYPE] as const

/** The paths of the page's part's sections. */
export function partSectionPaths(types: readonly string[]): string[] {
  return [...new Set([...types, ...OWN_SECTION_TYPES])].map((t) => `sections/${t}.storelib`).sort()
}

/** Every section a file names with {% section 'x' %} (not {% sections %}, a group, whose sections are the page's own). */
export function sectionTagNames(files: Record<string, string>): string[] {
  const out = new Set<string>()
  const tag = /\{%-?\s*section\s+["']([a-z0-9_-]{1,64})["']/g
  for (const text of Object.values(files)) {
    if (!text.includes("section")) continue
    for (const m of text.matchAll(tag)) out.add(m[1])
  }
  return [...out].sort()
}

/** The section types a page's list draws: its own and its groups' (header, footer, overlay). */
export function sectionTypesOf(list: readonly { type?: unknown }[] | null | undefined): string[] {
  const out = new Set<string>()
  for (const s of list ?? []) if (typeof s?.type === "string" && TYPE.test(s.type)) out.add(s.type)
  return [...out].sort()
}

/** Whether every section the list draws has its source here: the page can be drawn from these. */
export function sourcesCover(list: readonly { type?: unknown }[] | null | undefined, sources: Record<string, string>): boolean {
  return sectionTypesOf(list).every((t) => sources[`sections/${t}.storelib`] !== undefined || sources[`sections/${t}.liquid`] !== undefined)
}

/** The rest's answer laid under what the editor holds: a file the editor already has (the page's part, or one saved since) is kept as it is. */
export function withRest(held: Record<string, string>, rest: Record<string, string>): Record<string, string> {
  let out = held
  for (const [k, v] of Object.entries(rest)) {
    if (k in held) continue
    if (out === held) out = { ...held }
    out[k] = v
  }
  return out
}
