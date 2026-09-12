/**
 * ===========================================================================
 *  WHAT "ADD SECTION" OFFERS, DERIVED
 * ===========================================================================
 * A section is in the library because `sections/<type>.storelib` exists,
 * compiles, and has at least one preset. Not because a list somewhere names
 * it. Save `sections/logo-cloud.storelib` with a preset and Logo Cloud is
 * there; delete the file and it is gone. Nothing to register.
 *
 * A section with no preset is still a section — it can render, an existing
 * instance of it keeps working — but it is not offered, because there is
 * nothing to add. That is the same rule Shopify uses and it is a useful
 * one: a preset is the author saying "this is ready to be placed".
 *
 * `allowed_templates` / `disabled_templates` are honoured here, not in the
 * Add Section UI, so the rule lives with the section that declares it.
 */
import { createCompileCache } from "./storelib/compile"
import type { CompiledSection, SectionPreset, Template, ThemeError, ThemeFiles } from "./types"

export interface LibraryEntry {
  type: string
  name: string
  category: string
  icon?: string
  description?: string
  presets: SectionPreset[]
  compiled: CompiledSection
}

export interface Library {
  /** Every section that compiled, addable or not. */
  sections: Record<string, CompiledSection>
  /** The ones with a preset, ready to add. */
  addable: LibraryEntry[]
  /** Files that did not compile, with why. They are not in `sections`. */
  errors: { file: string; errors: ThemeError[] }[]
}

const SECTION_PATH = /^sections\/([a-z][a-z0-9_-]*)\.storelib$/

export function sectionTypeFromPath(path: string): string | null {
  return path.match(SECTION_PATH)?.[1] ?? null
}

const shared = createCompileCache()

export function buildLibrary(files: ThemeFiles, cache = shared): Library {
  const sections: Record<string, CompiledSection> = {}
  const addable: LibraryEntry[] = []
  const errors: Library["errors"] = []

  for (const path of Object.keys(files).sort()) {
    const type = sectionTypeFromPath(path)
    if (!type) continue
    // The file name is the type (`sectionTypeFromPath`), and the schema's own
    // `type` line is documentation: a file copied from another one carries
    // the line it came with, and refusing it there only meant a copy could
    // not be saved.
    const r = cache.compile(files[path], { file: path })
    if (r.ok === false) {
      errors.push({ file: path, errors: r.errors })
      continue
    }
    sections[type] = r.value
    const s = r.value.schema
    if (s.presets && s.presets.length) {
      addable.push({
        type,
        name: s.name,
        category: s.category ?? "content",
        icon: s.icon,
        description: s.description,
        presets: s.presets,
        compiled: r.value,
      })
    }
  }
  return { sections, addable, errors }
}

/** May this section be placed on this template? Absent rules mean yes. */
export function allowedOn(compiled: CompiledSection, template: string): boolean {
  const s = compiled.schema
  if (s.allowed_templates) return s.allowed_templates.includes(template)
  if (s.disabled_templates) return !s.disabled_templates.includes(template)
  return true
}

/**
 * Which templates still use a section type. Asked before a file is deleted,
 * so the warning can say "used on home and product" rather than "used".
 */
export function templatesUsing(type: string, templates: Record<string, Template>): string[] {
  const out: string[] = []
  for (const [name, t] of Object.entries(templates)) {
    if (Object.values(t.sections).some((s) => s.type === type)) out.push(name)
  }
  return out.sort()
}
