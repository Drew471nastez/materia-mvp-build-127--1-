/**
 * storelib_search_components: which sections this site can already use.
 *
 * The first question before writing anything is whether it exists. The site
 * has the built-in library (fifty-odd types across ten categories) and the
 * sections its creator or an agent wrote. This ranks them against what the
 * agent is looking for, by the words in each one's type, name, category,
 * description, block names and setting labels, so "testimonials slider"
 * finds the testimonials section even though neither word is its type.
 *
 * Pure: the schema map is handed in, built per request from this install's
 * own files (lib/website-builder/agent/schemas.ts), so one creator's
 * sections never reach another's search.
 */

import type { SchemaMap } from "@/lib/website-builder/agent/schemas"

export interface ComponentHit {
  type: string
  name: string
  category: string
  description: string
  /** "theme" for the built-in library, "yours" for a section the creator has. */
  origin: "theme" | "yours"
  /** Whether it can be added to a page (headers and footers are structure). */
  addable: boolean
  blocks: string[]
  settings: string[]
  score: number
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1)

/** A plural and its singular are the same search: "testimonials" finds "testimonial". */
const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "")

export function searchComponents(
  schemas: SchemaMap,
  query: string,
  opts: { categories?: Record<string, string>; custom?: Set<string>; addable?: Set<string>; limit?: number; purpose?: (type: string) => string | null } = {},
): ComponentHit[] {
  const wanted = [...new Set(words(query.slice(0, 300)).map(stem))]
  const limit = Math.max(1, Math.min(opts.limit ?? 12, 40))
  const hits: ComponentHit[] = []

  for (const [type, schema] of Object.entries(schemas)) {
    /* Round 26: a Materia section (a site made from a template) is found by what it does (lib/storelib-ai/materia). */
    const purpose = opts.purpose?.(type) ?? null
    const category = schema.category ?? opts.categories?.[type] ?? purpose ?? (opts.custom?.has(type) ? "yours" : "other")
    const blocks = (schema.blocks ?? []).map((b) => b.type)
    const settings = (schema.fields ?? []).map((f) => f.id)
    const strong = new Set([...words(type), ...words(schema.name ?? ""), ...words(category), ...words(purpose ?? "")].map(stem))
    const weak = new Set(
      [
        ...words(schema.description ?? ""),
        ...(schema.blocks ?? []).flatMap((b) => words(`${b.type} ${b.name ?? ""}`)),
        ...(schema.fields ?? []).flatMap((f) => words(f.label ?? "")),
      ].map(stem),
    )
    let score = 0
    /* The type itself, asked for by name, is what was meant. */
    const whole = stem(type.replace(/[-_]+/g, ""))
    if (wanted.some((w) => w === whole)) score += 4
    for (const w of wanted) {
      if (strong.has(w)) score += 3
      else if (weak.has(w)) score += 1
    }
    if (wanted.length && score === 0) continue
    hits.push({
      type,
      name: schema.name ?? type,
      category,
      description: (schema.description ?? "").slice(0, 200),
      origin: opts.custom?.has(type) ? "yours" : "theme",
      addable: opts.addable ? opts.addable.has(type) : type !== "header" && type !== "footer",
      blocks,
      settings: settings.slice(0, 40),
      score,
    })
  }

  return hits.sort((a, b) => b.score - a.score || Number(b.origin === "yours") - Number(a.origin === "yours") || a.type.localeCompare(b.type)).slice(0, limit)
}
