/**
 * ===========================================================================
 *  A PAGE'S WORTH OF CREATOR HTML, CLEANED
 * ===========================================================================
 * lib/website-builder/sanitize.ts knows how to clean one value. This knows
 * which values a page holds: it walks a page's sections and their blocks,
 * asks each section's schema which of its settings are HTML, and cleans
 * those.
 *
 * Kept apart from `sanitize.ts` so that file stays a pure function of a
 * string, and so the schema registry, which pulls in every section's JSON,
 * is only loaded where a whole page is being handled.
 */
import { SECTION_SCHEMAS } from "./section-schemas"
import { htmlFieldsOf, sanitizeSettings, type HtmlFieldMap } from "./sanitize"
import type { SectionInstance } from "./types"

const cache = new Map<string, HtmlFieldMap>()

/**
 * Which of a section type's settings hold HTML. A type the registry does not
 * know is a section the creator wrote themselves, and the answer for it is
 * the id list in `sanitize.ts`.
 */
function fieldsFor(type: string): HtmlFieldMap {
  const hit = cache.get(type)
  if (hit) return hit
  const out = htmlFieldsOf(SECTION_SCHEMAS[type]?.fields)
  cache.set(type, out)
  return out
}

function blockFieldsFor(type: string, blockType: string): HtmlFieldMap {
  const key = `${type} ${blockType}`
  const hit = cache.get(key)
  if (hit) return hit
  const block = SECTION_SCHEMAS[type]?.blocks?.find((b) => b.type === blockType)
  const out = htmlFieldsOf(block?.fields)
  cache.set(key, out)
  return out
}

interface LooseSection {
  type: string
  settings?: Record<string, unknown>
  blocks?: { type: string; settings?: Record<string, unknown> }[]
}

/** One section, settings and blocks. The same object back when nothing changed. */
export function sanitizeSection<T extends LooseSection>(section: T): T {
  const settings = sanitizeSettings(section.settings, fieldsFor(section.type))
  let blocks = section.blocks
  if (blocks?.length) {
    let touched = false
    const next = blocks.map((b) => {
      const s = sanitizeSettings(b.settings, blockFieldsFor(section.type, b.type))
      if (s === b.settings) return b
      touched = true
      return { ...b, settings: s }
    })
    if (touched) blocks = next
  }
  if (settings === section.settings && blocks === section.blocks) return section
  return { ...section, settings, ...(blocks ? { blocks } : {}) }
}

/** A page. The same array back when nothing in it changed. */
export function sanitizeSections<T extends SectionInstance>(sections: T[] | null | undefined): T[] {
  if (!Array.isArray(sections)) return []
  let touched = false
  const out = sections.map((s) => {
    const next = sanitizeSection(s as unknown as LooseSection) as unknown as T
    if (next !== (s as unknown)) touched = true
    return next
  })
  return touched ? out : sections
}

/**
 * The theme's own settings. A few of them reach the DOM drawn by the theme
 * rather than by a section.
 */
const THEME_HTML_SETTINGS: HtmlFieldMap = {
  announcement_bar_text: "rich",
  cookie_banner_text: "rich",
  footer_text: "rich",
  tagline: "rich",
}

export function sanitizeThemeSettings<T extends Record<string, unknown>>(settings: T | null | undefined): T {
  if (!settings) return {} as T
  return sanitizeSettings(settings, THEME_HTML_SETTINGS) as T
}
