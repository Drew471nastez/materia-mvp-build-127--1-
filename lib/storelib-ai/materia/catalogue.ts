/**
 * ===========================================================================
 *  THE MATERIA CATALOGUE, AS THE MODEL READS IT
 * ===========================================================================
 * ./catalogue.generated.ts is every Materia section and block, summarised
 * from the theme's own schemas (./build.ts). This is the one place that
 * reads it: indexed once per process (the module is the cache), and written
 * out as compact text inside a character budget, so a prompt pays for what
 * the job needs and nothing more:
 *
 *   sectionDetail     one section in full: its key settings with a select's
 *                     values, its blocks with theirs. For the sections the
 *                     reference template places, and the ones a site has.
 *   catalogueOverview every section that can be added, by what it is for,
 *                     the ones Storelib's templates use most first. Types
 *                     only: read_section_type / read_file gives the rest.
 *   catalogueText     both, details first, cut to the budget at a line.
 *
 * Server only in practice (the generated module is large); pure.
 */
import { MATERIA_CATALOGUE } from "./catalogue.generated"
import { PURPOSES, readKey, type MateriaBlockEntry, type MateriaCatalogue, type MateriaSectionEntry, type MateriaSetting } from "./build"

export type { MateriaBlockEntry, MateriaSectionEntry, MateriaSetting, MateriaTemplateEntry } from "./build"
export { PURPOSES } from "./build"

/** Purposes the catalogue never offers for a page body: the store's own templates, chrome, popups and plumbing. */
const NOT_FOR_PAGES = new Set(["store pages", "popup", "utility", "header and footer", "announcement"])

interface Indexed {
  catalogue: MateriaCatalogue
  byType: Map<string, MateriaSectionEntry>
  byLower: Map<string, MateriaSectionEntry>
}

let indexed: Indexed | null = null

/** The catalogue with its indexes, built on first use and kept for the life of the process. */
export function materiaCatalogue(): Indexed {
  if (indexed) return indexed
  const catalogue = MATERIA_CATALOGUE
  const byType = new Map(catalogue.sections.map((s) => [s.type, s]))
  const byLower = new Map(catalogue.sections.map((s) => [s.type.toLowerCase(), s]))
  indexed = { catalogue, byType, byLower }
  return indexed
}

export function materiaSection(type: string): MateriaSectionEntry | undefined {
  const c = materiaCatalogue()
  return c.byType.get(type) ?? c.byLower.get(type.toLowerCase())
}

export const isMateriaType = (type: string): boolean => !!materiaCatalogue().byType.get(type)

/** Every section type the catalogue knows. */
export function materiaTypes(): string[] {
  return materiaCatalogue().catalogue.sections.map((s) => s.type)
}

/** A section's blocks, as entries. */
export function blocksOf(section: MateriaSectionEntry): MateriaBlockEntry[] {
  const defs = materiaCatalogue().catalogue.blockDefs
  return section.blocks.map((i) => defs[i]).filter(Boolean)
}

/** A section's key settings with a select's values. */
export function keySettingsOf(section: MateriaSectionEntry): MateriaSetting[] {
  return readKey(section.key, section.selects)
}

/** Every setting id the section declares. */
export function settingIdsOf(entry: { ids: string }): Set<string> {
  return new Set(entry.ids.split(" ").filter(Boolean))
}

/** A select's values by its id. */
export function selectOptionsOf(entry: { selects?: string }): Map<string, string[]> {
  return new Map(
    (entry.selects ?? "")
      .split(" ")
      .filter(Boolean)
      .map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1).split("|").filter(Boolean)] as [string, string[]]),
  )
}

const settingText = (s: MateriaSetting) => (s.options?.length ? `${s.id}=${s.options.slice(0, 6).join("|")}` : `${s.id}:${s.type}`)

/** One section in full, on one line: "hero-image1 "Hero Image 1" [hero; in 12 templates]: settings ...; blocks ...". */
export function sectionDetail(type: string): string {
  const s = materiaSection(type)
  if (!s) return ""
  const settings = keySettingsOf(s).map(settingText).join(", ")
  const blocks = blocksOf(s)
    .slice(0, 8)
    .map((b) => {
      const key = readKey(b.key, b.selects).slice(0, 3).map(settingText).join(" ")
      return key ? `${b.type}(${key})` : b.type
    })
    .join(", ")
  const used = s.usedBy.length ? `; in ${s.usedBy.length} template${s.usedBy.length === 1 ? "" : "s"}` : ""
  const made = s.madeFor ? `; made for ${s.madeFor}` : ""
  return `${s.type} "${s.name}" [${s.purpose}${used}${made}]${settings ? `: settings ${settings}` : ""}${blocks ? `; blocks ${blocks}${s.max_blocks ? ` (max ${s.max_blocks})` : ""}` : ""}${s.themeBlocks ? "; takes theme blocks" : ""}`
}

/**
 * Every addable section by what it is for, the ones Storelib's templates use most first. `only` narrows it to
 * the types a site really has (an install's own files); `budget` cuts it at a whole line.
 */
export function catalogueOverview(opts: { only?: ReadonlySet<string>; budget?: number; perPurpose?: number } = {}): string {
  const { catalogue } = materiaCatalogue()
  const per = opts.perPurpose ?? 14
  const lines: string[] = []
  for (const purpose of PURPOSES) {
    if (NOT_FOR_PAGES.has(purpose)) continue
    const list = catalogue.sections
      .filter((s) => s.purpose === purpose && s.addable && (!opts.only || opts.only.has(s.type)))
      .sort((a, b) => b.usedBy.length - a.usedBy.length || a.type.localeCompare(b.type))
    if (!list.length) continue
    const shown = list.slice(0, per).map((s) => (s.madeFor ? `${s.type} (${s.madeFor})` : s.usedBy.length > 1 ? `${s.type} x${s.usedBy.length}` : s.type))
    lines.push(`- ${purpose}: ${shown.join(", ")}${list.length > per ? `, +${list.length - per} more` : ""}`)
  }
  return cut(lines, opts.budget ?? 6_000)
}

/** Whole lines that fit in `budget` characters. */
export function cut(lines: string[], budget: number): string {
  const out: string[] = []
  let used = 0
  for (const l of lines) {
    if (used + l.length + 1 > budget) break
    out.push(l)
    used += l.length + 1
  }
  return out.join("\n")
}

/**
 * The catalogue for one job: the details of `focus` (the reference template's sections, or the site's own) and
 * the overview after them, inside `budget` characters. "xN" is how many of Storelib's templates use a section.
 */
export function catalogueText(opts: { focus?: string[]; only?: ReadonlySet<string>; budget?: number; detailBudget?: number } = {}): string {
  const budget = opts.budget ?? 6_000
  const focus = [...new Set((opts.focus ?? []).map((t) => materiaSection(t)?.type).filter((t): t is string => !!t))]
  const details = cut(focus.map(sectionDetail).filter(Boolean), Math.min(opts.detailBudget ?? Math.round(budget * 0.55), budget))
  const head = `MATERIA SECTIONS (the theme Storelib's templates are built from; xN = used by N templates). Use these types, setting ids and block types exactly as written; read a section (read_file sections/<type>.storelib, read_section_type) for its full controls.`
  const overview = catalogueOverview({ only: opts.only, budget: Math.max(0, budget - details.length - head.length - 40) })
  return [head, details ? `IN DETAIL:\n${details}` : "", overview ? `BY WHAT THEY DO:\n${overview}` : ""].filter(Boolean).join("\n")
}

/** What a placed section is for, in the catalogue's words, or null for a type it does not know. */
export function purposeOfType(type: string): string | null {
  return materiaSection(type)?.purpose ?? null
}
