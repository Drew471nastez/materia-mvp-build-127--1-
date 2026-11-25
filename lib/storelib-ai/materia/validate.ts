/**
 * ===========================================================================
 *  A SECTION TYPE, SETTING OR BLOCK THE THEME DOES NOT HAVE
 * ===========================================================================
 * A model told to build on Materia still writes "hero_image1" for
 * hero-image1, "faq-accordion" for a type that does not exist, a setting it
 * remembers from another theme, or a select value the control never had.
 * The renderer ignores all of those silently: the page looks as if the
 * change worked and nothing happened. So every path checks first, here:
 *
 *   resolveSectionType   the exact type; else the same type written another
 *                        way (case, _ for -, a path or an extension, its
 *                        display name); else one unambiguous near miss.
 *                        Anything else is null: refused, with the closest
 *                        types named so the next try is right.
 *   checkMateriaSections a list of placements checked and REPAIRED where
 *                        the intent is clear (a type written another way, a
 *                        select value in another case), with unknown types
 *                        refused and unknown settings and blocks dropped,
 *                        each said as an issue.
 *   planCitationIssues   the agent's site plan names the Materia section
 *                        each slot is built on as materia:<type>; an
 *                        unknown one is refused, a near miss repaired.
 *
 * Pure.
 */
import { blocksOf, materiaCatalogue, materiaSection, materiaTypes, selectOptionsOf, settingIdsOf, type MateriaSectionEntry } from "./catalogue"

export interface MateriaIssue {
  severity: "error" | "warning"
  code: "materia.unknown_type" | "materia.type_repaired" | "materia.unknown_setting" | "materia.bad_option" | "materia.unknown_block" | "materia.block_repaired"
  message: string
  /** The placement's index in the list checked. */
  index?: number
}

/** A type as written, made comparable: lower case, no folder or extension, dashes for spaces and underscores. */
export function normalizeType(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^.*\//, "")
    .replace(/\.(liquid|storelib|json)$/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/** Levenshtein distance, stopped early past `max`. */
export function distance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      best = Math.min(best, cur[j])
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

export type Resolved = { type: string; how: "exact" | "written" | "name" | "close" }

/**
 * The known type `wanted` means, or null. `known` defaults to every Materia section; pass an install's own types
 * to resolve against what that site really has. A near miss counts only when it is the single closest one.
 */
export function resolveSectionType(wanted: string, known: readonly string[] = materiaTypes()): Resolved | null {
  if (typeof wanted !== "string" || !wanted.trim()) return null
  if (known.includes(wanted)) return { type: wanted, how: "exact" }
  const n = normalizeType(wanted)
  if (!n) return null
  const byNorm = known.filter((k) => normalizeType(k) === n)
  if (byNorm.length === 1) return { type: byNorm[0], how: "written" }
  const byName = known.filter((k) => {
    const s = materiaSection(k)
    return !!s && normalizeType(s.name) === n
  })
  if (byName.length === 1) return { type: byName[0], how: "name" }
  /* One letter of plural: "testimonial" is testimonials, not testimonial2. */
  const plural = known.filter((k) => {
    const kn = normalizeType(k)
    return kn === `${n}s` || `${kn}s` === n
  })
  if (plural.length === 1) return { type: plural[0], how: "close" }
  if (n.length < 5) return null
  let best: string[] = []
  let bestD = 3
  for (const k of known) {
    const d = distance(n, normalizeType(k), 2)
    if (d < bestD) {
      bestD = d
      best = [k]
    } else if (d === bestD) best.push(k)
  }
  return best.length === 1 && bestD <= 2 ? { type: best[0], how: "close" } : null
}

/** The `n` known types closest to `wanted`, by shared words then edit distance: what to say when it is refused. */
export function closestTypes(wanted: string, known: readonly string[] = materiaTypes(), n = 3): string[] {
  const w = normalizeType(wanted)
  const parts = new Set(w.split("-").filter((p) => p.length > 2))
  return [...known]
    .map((k) => {
      const kn = normalizeType(k)
      const shared = kn.split("-").filter((p) => parts.has(p)).length
      return { k, score: shared * 10 - distance(w, kn, 12) }
    })
    .sort((a, b) => b.score - a.score || a.k.localeCompare(b.k))
    .slice(0, n)
    .map((x) => x.k)
}

export interface Placement {
  type: string
  settings?: Record<string, unknown>
  blocks?: { type: string; settings?: Record<string, unknown> }[]
}

/** A select value the control has, matched without case or separators; null when it has none like it. */
function optionFor(value: unknown, options: string[]): string | null {
  if (typeof value !== "string") return null
  if (options.includes(value)) return value
  const n = normalizeType(value)
  return options.find((o) => normalizeType(o) === n) ?? null
}

function checkSettings(where: string, given: Record<string, unknown> | undefined, entry: { ids: string; selects?: string }, issues: MateriaIssue[], index: number): Record<string, unknown> {
  const ids = settingIdsOf(entry)
  const selects = selectOptionsOf(entry)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(given ?? {})) {
    if (!ids.has(k)) {
      const near = [...ids].find((id) => normalizeType(id) === normalizeType(k))
      if (near) {
        out[near] = v
        issues.push({ severity: "warning", code: "materia.unknown_setting", message: `${where}: no setting "${k}"; written to "${near}".`, index })
      } else issues.push({ severity: "warning", code: "materia.unknown_setting", message: `${where}: no setting "${k}"; left out.`, index })
      continue
    }
    const options = selects.get(k)
    if (options?.length) {
      const hit = optionFor(v, options)
      if (hit === null) {
        issues.push({ severity: "warning", code: "materia.bad_option", message: `${where}: "${k}" takes ${options.join(", ")}; "${String(v)}" left out (its default stays).`, index })
        continue
      }
      out[k] = hit
      continue
    }
    out[k] = v
  }
  return out
}

/**
 * Placements checked against the Materia catalogue (or `known`, an install's own types). Repaired where the intent
 * is clear, refused (left out, an error) where it is not. `ok` is false when any placement was refused.
 */
export function checkMateriaSections(list: readonly Placement[], opts: { known?: readonly string[] } = {}): { ok: boolean; sections: Placement[]; issues: MateriaIssue[] } {
  const issues: MateriaIssue[] = []
  const sections: Placement[] = []
  const known = opts.known ?? materiaTypes()
  for (const [index, p] of list.entries()) {
    const where = `#${index + 1} ${String(p?.type ?? "")}`
    const r = typeof p?.type === "string" ? resolveSectionType(p.type, known) : null
    if (!r) {
      issues.push({ severity: "error", code: "materia.unknown_type", message: `${where}: Materia has no section "${String(p?.type ?? "")}". Closest: ${closestTypes(String(p?.type ?? ""), known).join(", ")}.`, index })
      continue
    }
    if (r.how !== "exact") issues.push({ severity: "warning", code: "materia.type_repaired", message: `${where}: read as ${r.type}.`, index })
    const entry: MateriaSectionEntry | undefined = materiaSection(r.type)
    if (!entry) {
      sections.push({ ...p, type: r.type })
      continue
    }
    const settings = checkSettings(`${r.type}`, p.settings, entry, issues, index)
    const defs = blocksOf(entry)
    const themeBlocks = entry.themeBlocks ? materiaCatalogue().catalogue.blocks : []
    const blockTypes = [...defs, ...themeBlocks].map((b) => b.type)
    const blocks: NonNullable<Placement["blocks"]> = []
    for (const b of p.blocks ?? []) {
      const br = typeof b?.type === "string" ? resolveSectionType(b.type, blockTypes) : null
      if (!br) {
        issues.push({ severity: "warning", code: "materia.unknown_block", message: `${r.type}: no block type "${String(b?.type ?? "")}" (it takes ${blockTypes.slice(0, 12).join(", ") || "no blocks"}); left out.`, index })
        continue
      }
      if (br.how !== "exact") issues.push({ severity: "warning", code: "materia.block_repaired", message: `${r.type}: block "${b.type}" read as ${br.type}.`, index })
      const def = [...defs, ...themeBlocks].find((d) => d.type === br.type)!
      blocks.push({ type: br.type, settings: checkSettings(`${r.type} block ${br.type}`, b.settings, def, issues, index) })
    }
    sections.push({ type: r.type, ...(p.settings !== undefined ? { settings } : {}), ...(p.blocks !== undefined ? { blocks } : {}) })
  }
  return { ok: !issues.some((i) => i.severity === "error"), sections, issues }
}

/** materia:<type> as the plan writes it. */
const CITATION = /\bmateria:([A-Za-z0-9][A-Za-z0-9_-]*)/g

/**
 * The plan's lines with their Materia citations checked: an unknown type is an error that names the closest ones;
 * a near miss is rewritten in the line. `cited` counts the lines that name a Materia section.
 */
export function planCitationIssues(lines: readonly string[]): { lines: string[]; issues: MateriaIssue[]; cited: number } {
  const issues: MateriaIssue[] = []
  let cited = 0
  const out = lines.map((line, index) => {
    let any = false
    const fixed = line.replace(CITATION, (whole, type: string) => {
      any = true
      const r = resolveSectionType(type)
      if (!r) {
        issues.push({ severity: "error", code: "materia.unknown_type", message: `"${line.slice(0, 80)}": Materia has no section "${type}". Closest: ${closestTypes(type).join(", ")}.`, index })
        return whole
      }
      if (r.how !== "exact") issues.push({ severity: "warning", code: "materia.type_repaired", message: `materia:${type} read as materia:${r.type}.`, index })
      return `materia:${r.type}`
    })
    if (any) cited++
    return fixed
  })
  return { lines: out, issues, cited }
}
