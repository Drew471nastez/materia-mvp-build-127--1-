/**
 * ===========================================================================
 *  A SECTION IS CALLED WHAT ITS CODE SAYS IT IS CALLED
 * ===========================================================================
 * `SectionInstance.name` is a copy of the schema's name, taken at the moment
 * the section was added to the page and never touched again. Nothing in the
 * builder renames an instance — there is no control for it — so that copy has
 * exactly one job: to be right. And it stops being right the moment somebody
 * opens the file and changes the name in its schema.
 *
 * So a section renamed in the code editor kept its old name in the sidebar,
 * on the canvas toolbar, and in the list you reorder. A creator who renamed
 * "Waves" to "Marquee" had a file called one thing and a row called another,
 * with no way to tell which was the section they were about to edit.
 *
 * The schema is the name. The stored copy is the fallback, and only for the
 * case the schema cannot answer: a section whose type has been retired, or a
 * file that has been deleted out from under a page that still uses it. There
 * a stale name is better than a blank row, and better than the raw type.
 */

export interface NamedSchema {
  name?: string | null
  /** A section of an imported Shopify theme. */
  imported?: boolean
}

export function sectionDisplayName(
  section: { type: string; name?: string | null; label?: string | null },
  schemas: Record<string, NamedSchema | undefined> | null | undefined,
): string {
  /* A name the creator gave this section, from the title of its settings, is theirs and comes first. */
  const given = typeof section.label === "string" ? section.label.trim() : ""
  if (given !== "") return given
  /*
    AN IMPORTED THEME NAMES EACH PLACED SECTION ITSELF. Horizon places one
    generic section type many times ("Section"), each with its own name
    ("Hero", "Featured collection"), which is what Shopify's editor lists.
  */
  const placed = typeof section.name === "string" ? section.name.trim() : ""
  if (schemas?.[section.type]?.imported && placed !== "" && !placed.startsWith("t:")) return placed
  const fromCode = schemas?.[section.type]?.name
  if (typeof fromCode === "string" && fromCode.trim() !== "") return fromCode.trim()
  const stored = typeof section.name === "string" ? section.name.trim() : ""
  if (stored !== "") return stored
  /**
   * Last of all, the type. Not pretty, and it is at least the thing you would
   * search the file tree for.
   */
  return section.type
}
