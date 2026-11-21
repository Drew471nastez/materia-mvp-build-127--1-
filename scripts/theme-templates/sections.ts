/**
 * One of the theme's sections, alone on a page, the way a creator meets it:
 * added by hand from Add section with its preset (the settings and blocks it
 * starts with), between the template's header and footer, with a plain
 * section right after it. What follows a section is how a broken one is
 * found: markup it leaves open takes the next section inside itself.
 *
 * Used by scripts/audit-theme-sections.ts (every section in Chromium) and by
 * tests/theme-templates-pages.test.ts (every section through the engine).
 */
import { schemaFromStorelib } from "../../lib/website-builder/storelib-schemas"
import type { BlockInstance, SectionSchema } from "../../lib/website-builder/types"
import type { StoredBlock, StoredSection } from "../../lib/storelib-theme/compat/page"
import type { BuiltSite, ImportedTemplate } from "./site"

export const SENTINEL_ID = "after_the_section"
export const SENTINEL_TEXT = "The section after this one"
export const ALONE_ID = "the_section_alone"

/** Every section type the imported theme has a file for. */
export function sectionTypesOf(imported: ImportedTemplate): string[] {
  return Object.keys(imported.files).map((f) => f.match(/^sections\/(.+)\.storelib$/)?.[1]).filter((t): t is string => !!t).sort()
}

/** The editor's schema for a section of the imported theme: what its panel is drawn from. */
export function editorSchemaOf(imported: ImportedTemplate, type: string): { schema: SectionSchema | null; errors: string[] } {
  const path = `sections/${type}.storelib`
  const source = imported.files[path]
  if (source === undefined) return { schema: null, errors: [`${path} is not in the theme`] }
  const r = schemaFromStorelib(source, path)
  return r.ok === true ? { schema: r.schema, errors: [] } : { schema: null, errors: r.errors }
}

const stored = (b: BlockInstance): StoredBlock => ({ id: b.id, type: b.type, settings: { ...b.settings }, ...(b.static ? { static: true } : {}), ...(b.blocks?.length ? { blocks: b.blocks.map(stored) } : {}) })

/** The section as Add section places it: its first preset's settings and blocks. `addable` is false for a section with no preset, which is drawn with its defaults. */
export function sectionAsAdded(imported: ImportedTemplate, type: string, id = ALONE_ID): { section: StoredSection; addable: boolean; schema: SectionSchema | null; errors: string[] } {
  const { schema, errors } = editorSchemaOf(imported, type)
  const preset = schema?.presets?.[0]
  const section: StoredSection = { id, type, settings: { ...(preset?.settings ?? {}) } }
  if (preset?.blocks?.length) section.blocks = preset.blocks.map(stored)
  return { section, addable: !!preset, schema, errors }
}

/** The plain section put after the one looked at: the theme's Custom HTML, saying one line. */
export function sentinelSection(imported: ImportedTemplate): StoredSection {
  const { schema } = editorSchemaOf(imported, "custom-html")
  const field = (schema?.fields ?? []).find((f) => /html/i.test(f.id) && /html|textarea|liquid/.test(String(f.type)))?.id ?? "html_custom"
  return { id: SENTINEL_ID, type: "custom-html", settings: { [field]: `<p data-sentinel>${SENTINEL_TEXT}</p>` } }
}

/** The site's home page as: header, the sections, the sentinel, footer and overlays. */
export function homeWith(built: BuiltSite, sections: StoredSection[]): StoredSection[] {
  const chrome = (built.site.pages.home ?? []).filter((s) => s.group === "header" || s.group === "footer" || s.group === "overlay")
  return [...chrome.filter((s) => s.group === "header"), ...sections, sentinelSection(built.imported), ...chrome.filter((s) => s.group !== "header")]
}

/* Elements a browser closes by itself, or that never have an end tag. */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"])
const SELF_CLOSING = new Set(["p", "li", "dt", "dd", "option", "optgroup", "tr", "td", "th", "thead", "tbody", "tfoot", "colgroup", "caption", "rp", "rt", "html", "head", "body"])

/**
 * The elements a piece of markup opens and does not close, or closes and
 * never opened, read tag by tag as a browser reads it (what is inside a
 * script, a style, a template, a textarea or a comment is not markup, and
 * neither is the drawing inside an <svg>). Empty when the markup is whole.
 */
export function unbalanced(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|textarea|template|noscript|svg|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
  const stack: string[] = []
  const stray: string[] = []
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g
  let m: RegExpExecArray | null
  while ((m = tag.exec(text))) {
    const name = m[2].toLowerCase()
    if (VOID.has(name) || SELF_CLOSING.has(name)) continue
    if (!m[1]) {
      if (!/\/\s*$/.test(m[3])) stack.push(name)
      continue
    }
    const at = stack.lastIndexOf(name)
    if (at < 0) stray.push(`</${name}>`)
    else stack.length = at
  }
  return [...stack.map((n) => `<${n}>`), ...stray]
}

/** One section's own markup out of a drawn page: from its wrapper to the next section's wrapper. */
export function sectionMarkup(html: string, id: string): string | null {
  const start = html.indexOf(`id="shopify-section-${id}"`)
  if (start < 0) return null
  const open = html.lastIndexOf("<", start)
  const next = html.indexOf(`id="shopify-section-`, start + 20)
  const end = next < 0 ? html.length : html.lastIndexOf("<", next)
  return html.slice(open, end)
}
