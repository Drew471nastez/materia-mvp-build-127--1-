import { isStorelibSection, renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import type { RenderedSection } from "@/components/website-builder/sections/storelib-sources"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

/**
 * ===========================================================================
 *  WHAT A PUBLISHED PAGE OWES A .storelib SECTION
 * ===========================================================================
 * A section in this format is not a React component. It is a file, and it
 * becomes markup and a scoped stylesheet only when something renders it —
 * on the server, once, so the visitor's browser never receives the compiler.
 *
 * Every public route that draws a creator's sections therefore owes them
 * this step, and a route that forgets it does not fail loudly: the section
 * renders NOTHING (StorelibSection returns null off the editor, which is the
 * rule for a section that cannot be drawn). Measured before this function
 * existed: 0 characters of HTML on the product page against 3651 on the
 * storefront, for the same section.
 *
 * So the step lives here rather than in a route, and each route calls it.
 * When the next public route appears, the thing it has to remember is one
 * import, and the thing it cannot get subtly wrong is which files to read.
 */
export async function prerenderStorelibSections(
  db: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => { like: (col: string, pattern: string) => PromiseLike<{ data: { path: string; content: string }[] | null }> }
      }
    }
  },
  installId: string,
  sections: SectionInstance[],
  theme: ThemeSettingsValues,
  /**
   * "index", "product", "page.about". A section reads it as `page.template`
   * and `allowed_templates` is written against it, so passing "index" from
   * the product page is not a harmless default, it is a wrong answer.
   */
  template: string,
): Promise<Record<string, RenderedSection>> {
  const prerendered: Record<string, RenderedSection> = {}
  /**
   * An empty page is the only case that can skip the query. Not "no type
   * here is a known .storelib type" — a type the creator wrote themselves
   * is unknown until the files are read, and skipping on that test is how
   * their own sections would go blank again.
   */
  if (sections.length === 0) return prerendered

  /**
   * THE FILES THIS CREATOR SAVED IN THE CODE EDITOR, which are the source
   * for their own section types and the override for the theme's. Without
   * them the live site draws the bundled hero while the editor draws the
   * edited one.
   */
  const { data: savedFiles } = await db
    .from("store_theme_custom_files")
    .select("path, content")
    .eq("install_id", installId)
    .like("path", "%.storelib")
  const sources: Record<string, string> = {}
  for (const row of savedFiles ?? []) sources[row.path] = row.content

  for (const section of sections) {
    if (!isStorelibSection(section.type, sources)) continue
    const out = renderStorelibSection(section, theme, { template }, sources)
    if (out.ok) prerendered[section.id] = { html: out.html, css: out.css }
  }
  return prerendered
}
